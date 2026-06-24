use anyhow::{Context as _, Error, Result, anyhow};
use bots::discord::{check_user_in_reactions, user_in_discord};
use bots::telegram::check_user_in_chat;
use db::models::{
    GameSession, MAX_SOCIALS, Platform, Referral, ReferralReward, Task, TaskCompletion, TaskType,
    User, UserSocial, get_user_rank,
};
use diesel_async::AsyncConnection as _;
use log::{error, info};
use rand::{RngExt as _, rng};
use redis::AsyncCommands;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;
use tokio::time::sleep;
use ulid::Ulid;

use crate::TELEGRAM_REDIRECT;
use crate::auth::{generate_discord_oauth2_url, generate_twitter_oauth2_url};
use crate::ws::hash_verifier::verify_hash;
use crate::ws::models::{
    BindWallet, Chain, MiniTask, SocialLinks, TaskCheck, TelegramUser, UserTask, UserWithRank,
    WsResponse,
};
use crate::ws::redis_ops::{
    DISCONNECTED_SUB, USER_KEY, USER_TASK_KEY, convert_to_user_with_rank_socials, get_all_tasks,
    get_full_user, get_task_details, get_user_completed_tasks, get_user_discord_id,
    get_user_points, get_user_socials_status, get_user_telegram_id, mark_task_completed,
    update_task_details, update_user_evm_wallet, update_user_referral_code, update_user_sol_wallet,
    update_user_telegram, update_user_username,
};
use crate::ws::server::{ConnId, Server};
use crate::ws::validator::consts::{
    GAME_BONUS_PERCENTAGE, MAX_USERNAME_LENGTH, MINIMUM_POINTS_FOR_REFERRAL, REFERRAL_BONUS,
};
use crate::ws::{
    extract_ids_from_message_url, generate_referral_code, verify_signature_evm,
    verify_signature_solana,
};

impl Server {
    pub fn connect(&mut self, tx: UnboundedSender<String>) -> ConnId {
        let id: u64 = rng().random();

        self.sessions.insert(id, tx);
        id
    }

    pub async fn disconnect(&mut self, conn_id: ConnId) {
        if let Err(e) = self.commit_to_db(conn_id).await {
            error!("Error a committing session to db. Reason: {:?}", e);
        }

        if let Some((_, user)) = self.logged_in.remove(&conn_id) {
            if let Some(client_num) = self.active_client.get(&user.user_id).map(|v| *v) {
                if client_num == 1 {
                    let _: () = self
                        .redis
                        .publish(DISCONNECTED_SUB, user.user_id.clone())
                        .await
                        .unwrap();
                    self.active_client.remove(&user.user_id);
                    info!(
                        "Session disconnected. User id: {} wallet: {} username: {:?}",
                        user.user_id,
                        user.sol_wallet.as_deref().unwrap_or("No Sol Wallet"),
                        user.username
                    );
                } else {
                    self.active_client
                        .insert(user.user_id.clone(), client_num - 1);
                    info!("Reducing client number for {}", user.user_id);
                }
            } else {
                error!(
                    "User {} not found in active clients. Did the user disconnected too quickly?",
                    user.user_id
                );
            }
        }

        self.two048_queue.remove(&conn_id);
        self.sessions.remove(&conn_id);
        self.subscribed.remove(&conn_id);
    }

    pub async fn get_me(&mut self, conn_id: ConnId) -> Result<WsResponse> {
        let user = self
            .logged_in
            .get(&conn_id)
            .ok_or(anyhow!("{conn_id} not logged in"))?;

        // If user image gets update, the internal struct won't reflect that change. Redis will
        // have the updated image, so we need to fetch it again.
        let user_key = format!("{USER_KEY}:{}", user.user_id);

        let full_user = get_full_user(&mut self.redis, &user_key, &user.user_id).await?;

        Ok(WsResponse::me(full_user))
    }

    pub async fn get_me_with_rank_socials(&mut self, conn_id: ConnId) -> Result<WsResponse> {
        let mut conn = self.pool.get().await?;

        let user = self
            .logged_in
            .get(&conn_id)
            .ok_or(anyhow!("{conn_id} not logged in"))?;

        let user_key = format!("{USER_KEY}:{}", user.user_id);

        // If user image gets update, the internal struct won't reflect that change. Redis will
        // have the updated image, so we need to fetch it again.
        let full_user = get_full_user(&mut self.redis, &user_key, &user.user_id).await?;
        let user_rank = get_user_rank(&mut conn, &user.user_id)
            .await
            .context(anyhow!("Could not get user rank"))?
            .ok_or(anyhow!("The user rank gotten was a None value"))?;

        let ranked_user = UserWithRank {
            user: full_user,
            rank: user_rank,
        };

        let user_with_rank_socials =
            convert_to_user_with_rank_socials(&mut self.redis, &user_key, ranked_user)
                .await
                .context(anyhow!("Could not get user socials"))?;

        Ok(WsResponse::me_with_rank_socials(user_with_rank_socials))
    }

    pub async fn leaderboard_in(&mut self, conn_id: ConnId) -> Result<WsResponse> {
        self.subscribed.insert(conn_id);

        Ok(WsResponse::leaderboard(self.create_leaderboard().await?))
    }

    pub async fn initial_points(&mut self, conn_id: ConnId) -> Result<WsResponse> {
        let user = self
            .logged_in
            .get(&conn_id)
            .ok_or(anyhow!("{conn_id} not logged in"))?;

        let user_key = format!("{USER_KEY}:{}", user.user_id);

        let points = get_user_points(&mut self.redis, &user_key)
            .await?
            .ok_or(anyhow!("No points found for user {}", user.user_id))?;

        Ok(WsResponse::updated_points(points))
    }

    pub async fn commit_to_db(&mut self, conn_id: ConnId) -> Result<()> {
        let mut conn = self.pool.get().await?;
        let (bonus_to, amount) = conn
            .transaction::<(Option<User>, i32), Error, _>(async |conn| {
                let Some(user) = self.logged_in.get(&conn_id) else {
                    return Ok((None, 0));
                };

                if let Some((_, session)) = self.game_sessions.remove(&conn_id) {
                    let session = session
                        .commit_to_db(conn)
                        .await
                        .context("Failed to commit game session")?;

                    if user.referral_code.is_none() {
                        return Ok((None, 0));
                    }

                    let belongs_to = Referral::get_referrer_by_referred_id(conn, &user.user_id)
                        .await
                        .context("Could not get referrer")?;

                    let points_to_award = (session.final_score * GAME_BONUS_PERCENTAGE) / 100;

                    if points_to_award < 1 {
                        return Ok((None, 0));
                    }

                    User::increase_points(conn, &belongs_to.user_id, points_to_award).await?;

                    ReferralReward::new(
                        &belongs_to.user_id,
                        &user.user_id,
                        &session.id,
                        points_to_award,
                    )
                    .insert(conn)
                    .await
                    .context("Could not insert referral reward")?;

                    return Ok((Some(belongs_to), points_to_award));
                }
                Ok((None, 0))
            })
            .await?;

        drop(conn);

        if let Some(user) = bonus_to {
            self.increase_point(amount, &user, true).await?;
        }

        Ok(())
    }

    pub async fn get_user_activity(&mut self, conn_id: ConnId) -> Result<WsResponse> {
        let user = self
            .logged_in
            .get(&conn_id)
            .ok_or(anyhow!("{conn_id} not logged in"))?;

        let mut conn = self.pool.get().await?;

        let sessions = GameSession::get_by_user_id(&user.user_id, &mut conn)
            .await?
            .into_iter()
            .map(Into::into)
            .collect();

        Ok(WsResponse::game_sessions(sessions))
    }

    pub async fn update_username(&mut self, conn_id: ConnId, data: String) -> Result<()> {
        if data.len() > MAX_USERNAME_LENGTH {
            return Err(anyhow!(
                "The username {data} exceeds maximum length of {MAX_USERNAME_LENGTH} characters"
            ));
        }

        let mut user = self
            .logged_in
            .get_mut(&conn_id)
            .ok_or(anyhow!("{conn_id} not logged in"))?;

        user.username = Some(data.clone());

        let user_key = format!("{USER_KEY}:{}", user.user_id);

        update_user_username(&mut self.redis, &user_key, data.clone()).await?;

        let mut conn = self.pool.get().await?;

        User::update_username(&mut conn, &user.user_id, data)
            .await
            .context("Failed to update username in the database")?;

        Ok(())
    }

    pub async fn social_links(&mut self, conn_id: ConnId) -> Result<WsResponse> {
        let user = self
            .logged_in
            .get(&conn_id)
            .ok_or(anyhow!("{conn_id} not logged in"))?;

        let user_key = format!("{USER_KEY}:{}", user.user_id);

        let (twitter, discord, telegram) =
            get_user_socials_status(&mut self.redis, &user_key).await?;

        let mut social_links = SocialLinks::new();

        if !twitter {
            let new_state = Ulid::new().to_string();
            let twitter_link = generate_twitter_oauth2_url(&new_state, conn_id);

            self.code_verifiers
                .insert(new_state.clone(), twitter_link.code_verifier);

            social_links.twitter = Some(twitter_link.url);
        }

        if !discord {
            let new_state = Ulid::new().to_string();
            let discord_link = generate_discord_oauth2_url(&new_state, conn_id);

            self.code_verifiers
                .insert(new_state.clone(), discord_link.code_verifier);

            social_links.discord = Some(discord_link.url);
        }

        if !telegram {
            let redirect_link = TELEGRAM_REDIRECT.get().unwrap().to_string();
            social_links.telegram = Some(redirect_link);
        }

        Ok(WsResponse::social_links(social_links))
    }

    pub async fn telegram(&mut self, conn_id: ConnId, tg_user: TelegramUser) -> Result<WsResponse> {
        {
            let user = self
                .logged_in
                .get_mut(&conn_id)
                .ok_or(anyhow!("{conn_id} not logged in"))?;

            if verify_hash(&tg_user).is_err() {
                return Ok(WsResponse::telegram_error(String::from(
                    "Could not verify Telegram login. Please try again",
                )));
            }

            let mut conn = self.pool.get().await?;

            let user_social = UserSocial::new(
                user.user_id.clone(),
                Platform::Telegram,
                tg_user.id.to_string(),
                tg_user.username.clone().unwrap_or(tg_user.id.to_string()),
            );

            let already_used = user_social.already_used(&mut conn).await?;

            if already_used {
                return Ok(WsResponse::telegram_error(String::from(
                    "This Telegram user has already been used. Please use a different Telegram acconut",
                )));
            }

            let user_key = format!("{USER_KEY}:{}", user.user_id);
            update_user_telegram(
                &mut self.redis,
                &user_key,
                tg_user.name_to_use(),
                tg_user.id.to_string(),
            )
            .await?;

            user_social.insert(&mut conn).await?;

            info!(
                "Logged in for Telegram as {:?} {} {} for {}",
                tg_user.username, tg_user.id, tg_user.first_name, user.user_id
            );
        }

        self.get_me_with_rank_socials(conn_id).await
    }

    pub async fn tasks(&mut self, conn_id: ConnId) -> Result<WsResponse> {
        let user = self
            .logged_in
            .get(&conn_id)
            .ok_or(anyhow!("{conn_id} not logged in"))?;

        let mut all_tasks = get_all_tasks(&mut self.redis).await?;

        all_tasks.sort_by(|a, b| a.0.cmp(&b.0));

        let user_task_key = format!("{USER_TASK_KEY}:{}", user.user_id);

        let user_completed_tasks =
            get_user_completed_tasks(&mut self.redis, &user_task_key).await?;

        let mut task_list = Vec::with_capacity(all_tasks.len());

        for (task_id, task_json) in all_tasks {
            let task = Task::from_json(&task_json);

            let mini_task = MiniTask::from_task(task, conn_id, &self.code_verifiers);
            let completed = user_completed_tasks.contains(&task_id);

            let user_task = UserTask {
                task: mini_task,
                completed,
            };
            task_list.push(user_task);
        }

        Ok(WsResponse::tasks(task_list))
    }

    pub async fn check_task(
        &mut self,
        conn_id: ConnId,
        check_task: TaskCheck,
    ) -> Result<WsResponse> {
        let TaskCheck { task_id, proof } = check_task;

        let Ok(task_details) = get_task_details(&mut self.redis, &task_id).await else {
            return Ok(WsResponse::task_not_completed(String::from(
                "Task not found",
            )));
        };

        let task = Task::from_json(&task_details);

        let proof_required = task.proof_required();

        if proof_required && proof.is_none() {
            return Ok(WsResponse::task_not_completed(String::from(
                "Proof is required for this task. Please fill up the box",
            )));
        }

        let user = self
            .logged_in
            .get(&conn_id)
            .ok_or(anyhow!("{conn_id} not logged in"))?
            .clone();

        let mut conn = self.pool.get().await?;

        let task_completed =
            TaskCompletion::get_task_completion(&mut conn, &user.user_id, &task.id).await?;

        let user_task_key = format!("{USER_TASK_KEY}:{}", user.user_id);

        if let Some(completion) = task_completed {
            let points_assigned = completion.points_assigned;
            if !points_assigned {
                completion.set_points_assigned(proof, &mut conn).await?;

                drop(conn);

                self.increase_point(task.reward_point, &user, false).await?;

                mark_task_completed(&mut self.redis, &user_task_key, &task.id).await?;
            }

            // Some delay to make it look like something was checked
            match task.task_type {
                TaskType::FollowTwitter
                | TaskType::CheckTelegramPost
                | TaskType::CreateTweet
                | TaskType::RetweetPost
                | TaskType::LikeTweet => {
                    sleep(Duration::from_secs(5)).await;
                }
                _ => {}
            }

            return Ok(WsResponse::task_completed(task.id));
        }

        let user_key = format!("{USER_KEY}:{}", user.user_id);

        match task.task_type {
            TaskType::JoinDiscord => {
                let guild_name = &task.platform_username;
                let guild_id = &task.platform_id;

                let Some(user_id) = get_user_discord_id(&mut self.redis, &user_key).await? else {
                    error!("Failed to get user discord id. Should be investigated");
                    return Ok(WsResponse::task_not_completed(String::from(
                        "Internal server error. Please try reloading the site and try again",
                    )));
                };

                let user_id = user_id.parse::<i64>()?;

                let (user_in_discord, guild_id) =
                    user_in_discord(user_id, guild_id, guild_name).await?;

                if let Some(guild_id) = guild_id
                    && task.platform_id.is_none()
                {
                    let updated_task =
                        Task::set_platform_id(&task.id, &guild_id.to_string(), &mut conn).await?;

                    update_task_details(&mut self.redis, &task.id, updated_task.json_string())
                        .await?;
                }

                if user_in_discord {
                    TaskCompletion::new(&user.user_id, &task.id, true, None)
                        .insert(&mut conn)
                        .await?;

                    drop(conn);

                    self.increase_point(task.reward_point, &user, false).await?;
                    mark_task_completed(&mut self.redis, &user_task_key, &task.id).await?;

                    Ok(WsResponse::task_completed(task.id))
                } else {
                    Ok(WsResponse::task_not_completed(String::from(
                        "We could not find you in the Discord guild. Please join the guild and try again",
                    )))
                }
            }
            TaskType::FollowTwitter
            | TaskType::CheckTelegramPost
            | TaskType::CreateTweet
            | TaskType::RetweetPost
            | TaskType::LikeTweet => Ok(WsResponse::task_not_completed(String::from(
                "Task has not been completed yet. Please visit the link and try again",
            ))),
            TaskType::JoinTelegram => {
                let chat_username = &task.platform_username;
                let chat_id = &task.platform_id;

                let Some(user_id) = get_user_telegram_id(&mut self.redis, &user_key).await? else {
                    error!("Failed to get user telegram id. Should be investigated");
                    return Ok(WsResponse::task_not_completed(String::from(
                        "Internal server error. Please try reloading the site and try again",
                    )));
                };

                let user_id = user_id.parse::<i64>()?;

                let (user_in_telegram, chat_id) =
                    check_user_in_chat(user_id, chat_id, chat_username).await?;

                if let Some(chat_id) = chat_id
                    && task.platform_id.is_none()
                {
                    let updated_task =
                        Task::set_platform_id(&task.id, &chat_id.to_string(), &mut conn).await?;
                    update_task_details(&mut self.redis, &task.id, updated_task.json_string())
                        .await?;
                }

                if user_in_telegram {
                    TaskCompletion::new(&user.user_id, &task.id, true, None)
                        .insert(&mut conn)
                        .await?;

                    drop(conn);

                    self.increase_point(task.reward_point, &user, false).await?;
                    mark_task_completed(&mut self.redis, &user_task_key, &task.id).await?;

                    Ok(WsResponse::task_completed(task.id))
                } else {
                    Ok(WsResponse::task_not_completed(String::from(
                        "We could not find you in the Telegram group. Please join the group and try again",
                    )))
                }
            }
            TaskType::CheckDiscordPost => {
                let task_completion_url = task.completion_url.as_ref().unwrap();

                let Some((_guild_id, channel_id, message_id)) =
                    extract_ids_from_message_url(task_completion_url)
                else {
                    error!(
                        "Failed to extract ids from message url {task_completion_url}. Should be investigated"
                    );
                    return Ok(WsResponse::task_not_completed(String::from(
                        "Internal server error. Please try reloading the site and try again",
                    )));
                };

                let Some(user_id) = get_user_discord_id(&mut self.redis, &user_key).await? else {
                    error!("Failed to get user telegram id. Should be investigated");
                    return Ok(WsResponse::task_not_completed(String::from(
                        "Internal server error. Please try reloading the site and try again",
                    )));
                };

                let user_id = user_id.parse::<u64>()?;

                let reaction_given =
                    check_user_in_reactions(user_id, channel_id, message_id).await?;

                if reaction_given {
                    TaskCompletion::new(&user.user_id, &task.id, true, None)
                        .insert(&mut conn)
                        .await?;

                    drop(conn);

                    self.increase_point(task.reward_point, &user, false).await?;
                    mark_task_completed(&mut self.redis, &user_task_key, &task.id).await?;

                    Ok(WsResponse::task_completed(task.id))
                } else {
                    Ok(WsResponse::task_not_completed(String::from(
                        "We could not verify the completion of the task. Make sure to send a reaction to the message and try again",
                    )))
                }
            }
        }
    }

    pub async fn check_referral_status(
        &mut self,
        conn_id: ConnId,
        referral_code: String,
    ) -> Result<Option<WsResponse>> {
        if referral_code.len() != 8 {
            return Ok(Some(WsResponse::bad_referral_code()));
        }

        let mut conn = self.pool.get().await?;

        let (bonus_to, bad_referral) = conn
            .transaction::<(Option<User>, bool), Error, _>(async |conn| {
                let mut user = self
                    .logged_in
                    .get_mut(&conn_id)
                    .ok_or(anyhow!("{conn_id} not logged in"))?;

                let user_key = format!("{USER_KEY}:{}", user.user_id);

                let user_points = get_user_points(&mut self.redis, &user_key).await?;

                if let Some(user_points) = user_points {
                    if user_points < MINIMUM_POINTS_FOR_REFERRAL {
                        return Ok((None, false));
                    }
                } else {
                    error!(
                        "User {} submitted referral code but could not get points",
                        user.user_id
                    );

                    if user.points < MINIMUM_POINTS_FOR_REFERRAL {
                        return Ok((None, false));
                    }
                }

                if user.referral_code.is_some() {
                    return Ok((None, false));
                }

                let social_media_count = UserSocial::get_social_count(conn, &user.user_id).await?;

                if social_media_count != MAX_SOCIALS {
                    return Ok((None, false));
                }

                let Some(belongs_to) = User::get_by_referral_code(conn, &referral_code).await?
                else {
                    return Ok((None, true));
                };

                let new_referral_code = generate_referral_code();

                User::set_referral_code(conn, &user.user_id, &new_referral_code).await?;
                User::increase_points(conn, &belongs_to.user_id, REFERRAL_BONUS).await?;

                Referral::new(belongs_to.user_id.clone(), user.user_id.clone())
                    .insert(conn)
                    .await?;

                update_user_referral_code(&mut self.redis, &user_key, &new_referral_code).await?;

                user.referral_code = Some(new_referral_code);

                Ok((Some(belongs_to), false))
            })
            .await?;

        drop(conn);

        if bad_referral {
            return Ok(Some(WsResponse::bad_referral_code()));
        }

        if let Some(user) = bonus_to {
            self.increase_point(REFERRAL_BONUS, &user, true).await?;
            let response = self.get_me_with_rank_socials(conn_id).await?;

            return Ok(Some(response));
        }

        Ok(None)
    }

    pub async fn bind_wallet(
        &mut self,
        conn_id: ConnId,
        bind_data: BindWallet,
    ) -> Result<WsResponse> {
        let signature_ok = match bind_data.chain {
            Chain::Solana => {
                verify_signature_solana(&bind_data.address, &bind_data.signature).is_ok()
            }
            Chain::Evm => verify_signature_evm(&bind_data.address, &bind_data.signature).is_ok(),
        };

        if !signature_ok {
            return Ok(WsResponse::bind_failed(String::from(
                "Invalid signature found while binding wallet",
            )));
        }

        let user = self
            .logged_in
            .get(&conn_id)
            .ok_or(anyhow!("{conn_id} not logged in"))?;

        if user.sol_wallet.is_some() && user.evm_wallet.is_some() {
            return Ok(WsResponse::bind_failed(String::from(
                "You have binded both of your wallets already!",
            )));
        }

        let mut conn = self.pool.get().await?;

        let found_user = match bind_data.chain {
            Chain::Solana => User::user_wallet_sol_exists(&mut conn, &bind_data.address).await?,
            Chain::Evm => User::user_wallet_evm_exists(&mut conn, &bind_data.address).await?,
        };

        if found_user {
            return Ok(WsResponse::bind_failed(String::from(
                "This wallet has already been used. Please use a different wallet",
            )));
        }

        let user_key = format!("{USER_KEY}:{}", user.user_id);

        match bind_data.chain {
            Chain::Solana => {
                User::set_sol_wallet(&mut conn, &user.user_id, &bind_data.address).await?;
                update_user_sol_wallet(&mut self.redis, &user_key, &bind_data.address).await?;
            }
            Chain::Evm => {
                User::set_evm_wallet(&mut conn, &user.user_id, &bind_data.address).await?;
                update_user_evm_wallet(&mut self.redis, &user_key, &bind_data.address).await?;
            }
        }

        drop(user);
        drop(conn);

        self.get_me_with_rank_socials(conn_id).await
    }

    pub async fn is_user_logged_in(&self, user_id: &str) -> bool {
        self.active_client.contains_key(user_id)
    }
}
