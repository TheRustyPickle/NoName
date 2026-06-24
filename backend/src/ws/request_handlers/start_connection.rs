use anyhow::{Context, Result};
use db::models::{TaskCompletion, User, UserSocial};
use log::info;

use crate::UserIpAgent;
use crate::ws::jwt::{issue_token, validate_token};
use crate::ws::models::{Chain, UserWithSocials, WsResponse};
use crate::ws::redis_ops::{USER_KEY, USER_TASK_KEY, add_new_user, get_user_points};
use crate::ws::server::Server;
use crate::ws::{random_photo_url, verify_signature_evm, verify_signature_solana};

pub type ConnId = u64;

impl Server {
    pub async fn start_connection(
        &mut self,
        conn_id: ConnId,
        public_key: String,
        signature: String,
        chain: Chain,
        ip_agent: UserIpAgent,
    ) -> Result<WsResponse> {
        let signature_ok = match chain {
            Chain::Solana => verify_signature_solana(&public_key, &signature).is_ok(),
            Chain::Evm => verify_signature_evm(&public_key, &signature).is_ok(),
        };

        if !signature_ok {
            info!("Signature verification failed for conn_id: {conn_id} wallet: {public_key}");
            return Ok(WsResponse::invalid_sign());
        }

        let photo_url = random_photo_url(&public_key);

        let user = {
            let mut conn = self.pool.get().await?;
            match chain {
                Chain::Solana => {
                    User::new(None, Some(public_key), None, photo_url)
                        .insert_sol(&mut conn)
                        .await?
                }
                Chain::Evm => {
                    User::new(None, None, Some(public_key), photo_url)
                        .insert_evm(&mut conn)
                        .await?
                }
            }
        };

        let new_token = issue_token(user.user_id.clone(), &ip_agent)?;

        self.finish_connection(conn_id, user, Some(new_token)).await
    }

    pub async fn start_connection_token(
        &mut self,
        conn_id: ConnId,
        token: String,
        ip_agent: UserIpAgent,
    ) -> Result<WsResponse> {
        let result = validate_token(&token, &ip_agent);

        if let Err(err) = result {
            info!("Token validation failed for conn_id: {conn_id} with error: {err}");
            return Ok(WsResponse::invalid_jwt());
        }

        let (new_token, claims) = result.unwrap();

        let user_id = claims.sub;

        let mut conn = self.pool.get().await?;
        let user = User::get_user(&mut conn, user_id)
            .await
            .context("Failed to get user by solana wallet")?;

        drop(conn);

        self.finish_connection(conn_id, user, new_token).await
    }

    async fn finish_connection(
        &mut self,
        conn_id: ConnId,
        user: User,
        new_token: Option<String>,
    ) -> Result<WsResponse> {
        let mut conn = self.pool.get().await?;

        let user_socials = UserSocial::get_user_socials(&mut conn, &user.user_id)
            .await
            .context("Failed to get user socials")?;

        let user_completed_tasks =
            TaskCompletion::get_user_completed_tasks(&mut conn, &user.user_id)
                .await
                .context("Failed to get completed tasks")?;

        info!(
            "Logged in successfully with wallet: {:?} user id: {}",
            user.sol_wallet, user.user_id
        );

        let user_key = format!("{USER_KEY}:{}", user.user_id);
        let user_task_key = format!("{USER_TASK_KEY}:{}", user.user_id);

        let already = get_user_points(&mut self.redis, &user_key)
            .await
            .unwrap_or(None);

        let mut points_to_set = user.points;

        match already {
            Some(score) => {
                // Somehow db points is bigger than the redis, so redis is updated to the db
                // points
                if score < user.points {
                    info!(
                        "Redis points {} behind DB points: {}, updating for {}",
                        score, user.points, user.user_id
                    );
                } else if score > user.points {
                    // Redis point is bigger, meaning the user is dirty, most likely
                    points_to_set = score;
                }
            }
            None if user.points > 0 => {
                info!(
                    "Redis key missing, setting DB points: {} for {}.",
                    user.points, user.user_id
                );
            }
            None => {
                points_to_set = 0;
            }
        }

        let user_with_socials = UserWithSocials::from_user_social(user.clone(), user_socials);

        add_new_user(
            &mut self.redis,
            &user_key,
            &user_task_key,
            user_with_socials,
            user_completed_tasks,
            points_to_set,
            user.referral_code.clone(),
        )
        .await
        .context("Failed to add new user to redis")?;

        let user_id = user.user_id.clone();
        self.logged_in.insert(conn_id, user.clone());
        let mut client_num = self.active_client.entry(user_id.clone()).or_insert(0);

        *client_num += 1;

        if *client_num > 1 {
            info!(
                "Total clients for user {} {:?}: {}. ",
                user_id, user.sol_wallet, *client_num
            );
        }

        Ok(WsResponse::connection_started(new_token))
    }
}
