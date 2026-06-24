use anyhow::{Context, Error, Result, anyhow};
use db::models::{Task, TaskCompletion, User, UserSocial};
use diesel_async::AsyncConnection;
use log::{error, info};
use redis::AsyncCommands;

use crate::ws::models::UserWithSocials;
use crate::ws::redis_ops::{
    add_new_user, add_user_to_leaderboard, get_full_user, get_leaderboard_entries,
    increase_points_if_exists, increase_user_points_by_with_dirty, is_user_added, set_all_tasks,
    set_user_leaderboard_points, user_in_leaderboard,
};
use crate::ws::server::Server;

pub const LEADERBOARD_SUB: &str = "leaderboard_updates";
pub const DISCONNECTED_SUB: &str = "DISCONNECTED";

pub const LEADERBOARD_KEY: &str = "leaderboard";
pub const USER_KEY: &str = "user";
pub const DIRTY_KEY: &str = "dirty_users";
pub const USER_TASK_KEY: &str = "user_task";
pub const ALL_TASKS_KEY: &str = "tasks";

pub const MAX_LEADERBOARD_SIZE: isize = 50;

pub const HSET_JOINED_AT: &str = "joined_at";
pub const HSET_SOL_WALLET: &str = "sol_wallet";
pub const HSET_EVM_WALLET: &str = "evm_wallet";
pub const HSET_PHOTO: &str = "photo_url";
pub const HSET_NAME: &str = "username";
pub const HSET_POINTS: &str = "points";
pub const HSET_TWITTER: &str = "twitter";
pub const HSET_DISCORD: &str = "discord";
pub const HSET_TELEGRAM: &str = "telegram";
pub const HSET_TWITTER_ID: &str = "twitter_id";
pub const HSET_DISCORD_ID: &str = "discord_id";
pub const HSET_TELEGRAM_ID: &str = "telegram_id";
pub const HSET_REFERRAL: &str = "referral_code";

impl Server {
    pub async fn initialize(&mut self) {
        self.dirty_user_cleanup().await.unwrap();
        info!("Cleaned up old dirty users");

        let _: () = self.redis.del(LEADERBOARD_KEY).await.unwrap();
        let _: () = self.redis.del(ALL_TASKS_KEY).await.unwrap();
        let keys: Vec<String> = self.redis.keys(format!("{USER_KEY}*")).await.unwrap();

        for key in keys {
            let _: () = self.redis.del(key).await.unwrap();
        }

        let keys: Vec<String> = self.redis.keys(format!("{USER_TASK_KEY}*")).await.unwrap();

        for key in keys {
            let _: () = self.redis.del(key).await.unwrap();
        }

        info!("Old leaderboard data deleted");

        let mut conn = self.pool.get().await.unwrap();
        let leaderboard_data = User::get_leaderboard(&mut conn, MAX_LEADERBOARD_SIZE as i64)
            .await
            .unwrap();

        for user in leaderboard_data {
            let user_key = format!("{USER_KEY}:{}", user.user_id);
            let user_task_key = format!("{USER_TASK_KEY}:{}", user.user_id);

            let user_socials = UserSocial::get_user_socials(&mut conn, &user.user_id)
                .await
                .expect("Failed to get user socials");

            let user_completed_tasks =
                TaskCompletion::get_user_completed_tasks(&mut conn, &user.user_id)
                    .await
                    .unwrap();

            let user_with_socials = UserWithSocials::from_user_social(user.clone(), user_socials);

            add_new_user(
                &mut self.redis,
                &user_key,
                &user_task_key,
                user_with_socials,
                user_completed_tasks,
                user.points,
                user.referral_code,
            )
            .await
            .expect("Failed to add new user");

            add_user_to_leaderboard(&mut self.redis, &user_key, user.points)
                .await
                .expect("Failed to add user to leaderboard");
        }
        info!("Leaderboard data initialized");

        let all_tasks = Task::get_active(&mut conn).await.unwrap();
        let mut task_id_json_list = Vec::with_capacity(all_tasks.len());

        for task in all_tasks {
            let task_id = &task.id;
            let json_string = task.json_string();

            task_id_json_list.push((task_id.clone(), json_string));
        }

        set_all_tasks(&mut self.redis, task_id_json_list)
            .await
            .expect("Failed to set all tasks");

        info!("All tasks initialized");
    }

    /// Cleans up the dirty users from the redis data.
    async fn dirty_user_cleanup(&mut self) -> Result<()> {
        let dirty_users: Vec<String> = self.redis.smembers(DIRTY_KEY).await?;

        if !dirty_users.is_empty() {
            let mut conn = self.pool.get().await?;
            for user_id in &dirty_users {
                let redis_key = format!("{USER_KEY}:{user_id}");
                let user_task_key = format!("{USER_TASK_KEY}:{user_id}");

                let latest_points: Option<i32> = self
                    .redis
                    .hget(&redis_key, HSET_POINTS)
                    .await
                    .unwrap_or(None);

                let Some(points) = latest_points else {
                    error!("No points found for user {user_id}");
                    let _: () = self
                        .redis
                        .srem(DIRTY_KEY, user_id)
                        .await
                        .unwrap_or_default();
                    continue;
                };

                let result = User::set_points(&mut conn, user_id, points).await;

                if let Err(err) = result {
                    error!("Error while updating dirty points: {err}, u_id {user_id}");
                    continue;
                }

                let updated_user = result.unwrap();

                if updated_user.points != points {
                    // No update = point less than the current. Investigation required if ever
                    // happens but this should not happen
                    error!(
                        "Points mismatch for user {user_id} {}: redit points {points}, db points {}",
                        updated_user
                            .sol_wallet
                            .as_deref()
                            .unwrap_or("No Sol Wallet"),
                        updated_user.points
                    );
                }

                let _: () = self
                    .redis
                    .srem(DIRTY_KEY, user_id)
                    .await
                    .unwrap_or_default();

                let exists_result = user_in_leaderboard(&mut self.redis, &redis_key).await;

                if let Ok(exists) = exists_result
                    && exists.is_none()
                {
                    let _: () = self.redis.del(redis_key).await.unwrap_or_default();
                    let _: () = self.redis.del(user_task_key).await.unwrap_or_default();
                }
            }
        }
        Ok(())
    }

    /// Creates the leaderboard from the redis data to send to the client.
    pub async fn create_leaderboard(&mut self) -> Result<Vec<User>> {
        let leaderboard_entries = get_leaderboard_entries(&mut self.redis).await?;
        let mut leaderboard = Vec::new();

        for user_key in leaderboard_entries {
            let user_id = user_key
                .strip_prefix(&format!("{USER_KEY}:"))
                .ok_or(anyhow!("Failed to parse user_id from key {user_key}"))?;

            let full_user = get_full_user(&mut self.redis, &user_key, user_id).await?;
            leaderboard.push(full_user);
        }
        Ok(leaderboard)
    }

    /// Trims the leaderboard to the top `MAX_LEADERBOARD_SIZE` users.
    pub async fn trim_leaderboard(&mut self, leaderboard_count: isize) -> Result<()> {
        // Index = 0 user with the lowest score
        // leaderboard_count = old leaderboard size (if any ways added)
        let removed_users: Vec<String> = self
            .redis
            .zrange(LEADERBOARD_KEY, 0, leaderboard_count - MAX_LEADERBOARD_SIZE)
            .await?;

        let _: () = self
            .redis
            .zremrangebyrank(LEADERBOARD_KEY, 0, leaderboard_count - MAX_LEADERBOARD_SIZE)
            .await?;

        for removed_user in removed_users {
            let user_id = removed_user.split_once(&format!("{USER_KEY}:")).unwrap().1;
            if !self.is_user_logged_in(user_id).await {
                let _: () = self.redis.del(&removed_user).await.unwrap_or_default();
            }
        }
        Ok(())
    }

    /// Increase the points of a user and update the leaderboard if necessary and publish
    /// notification.
    pub async fn increase_point(
        &mut self,
        to_add: i32,
        user: &User,
        is_referral: bool,
    ) -> Result<i32> {
        let user_key = format!("{USER_KEY}:{}", user.user_id);

        let total_points = if is_referral {
            increase_points_if_exists(&mut self.redis, &user_key, to_add)
                .await
                .context("Failed to increase points for with referral")?
                .unwrap_or(user.points + to_add)
        } else {
            increase_user_points_by_with_dirty(&mut self.redis, &user_key, &user.user_id, to_add)
                .await
                .context("Failed to increase points with dirty")?
        };

        let leaderboard_count: isize = self.redis.zcard(LEADERBOARD_KEY).await.unwrap_or(0);

        if leaderboard_count > MAX_LEADERBOARD_SIZE {
            self.trim_leaderboard(leaderboard_count)
                .await
                .context("Failed to trim leaderboard")?;
        }

        // Only get the score of the 50th user if there are at least 50 users
        // Get lowest score if leaderboard is full
        let last_score_user = if leaderboard_count >= MAX_LEADERBOARD_SIZE {
            let lowest: Vec<(String, i32)> = self
                .redis
                .zrange_withscores(LEADERBOARD_KEY, 0, 0)
                .await
                .context("Failed to get lowest score")?;

            lowest.first().cloned()
        } else {
            None
        };

        let current_score = user_in_leaderboard(&mut self.redis, &user_key).await?;

        let mut notify_leaderboard = false;

        if let Some(score) = current_score {
            if (score + to_add) != total_points {
                return Err(anyhow!(
                    "Discrepancy in score for user {user_key}: Old Score: {score} + To Add: {to_add} != Total points {total_points}. ATTENTION!"
                ));
            }
            // Already on leaderboard → set the new score
            set_user_leaderboard_points(&mut self.redis, &user_key, total_points).await?;

            notify_leaderboard = true;
        } else {
            // Only add if leaderboard not full or user qualifies
            let qualifies =
                last_score_user.is_none() || total_points > last_score_user.as_ref().unwrap().1;

            if qualifies {
                // Add user to leaderboard
                info!("New qualifying user {user_key} with score {total_points}");

                let user_in_redis = is_user_added(&mut self.redis, &user_key)
                    .await
                    .context("Failed to check if user is in redis")?;

                if !user_in_redis {
                    let user_task_key = format!("{USER_TASK_KEY}:{}", user.user_id);

                    let mut conn = self.pool.get().await.unwrap();
                    conn.transaction::<_, Error, _>(async |conn| {
                        let user_socials = UserSocial::get_user_socials(conn, &user.user_id)
                            .await
                            .context("Failed to get user socials")?;

                        let user_completed_tasks =
                            TaskCompletion::get_user_completed_tasks(conn, &user.user_id)
                                .await
                                .context("Failed to get user completed tasks")?;

                        let user_with_socials =
                            UserWithSocials::from_user_social(user.clone(), user_socials);

                        add_new_user(
                            &mut self.redis,
                            &user_key,
                            &user_task_key,
                            user_with_socials,
                            user_completed_tasks,
                            user.points + to_add,
                            user.referral_code.clone(),
                        )
                        .await
                        .context("Failed to add new user")?;

                        Ok(())
                    })
                    .await?;
                }

                add_user_to_leaderboard(&mut self.redis, &user_key, total_points)
                    .await
                    .context("Failed to add user to leaderboard")?;

                self.trim_leaderboard(leaderboard_count)
                    .await
                    .context("Failed to trim leaderboard")?;
                notify_leaderboard = true;
            }
        }

        if notify_leaderboard {
            let _: () = self
                .redis
                .publish(LEADERBOARD_SUB, "Leaderboard updated")
                .await
                .context("Failed to publish leaderboard update")?;
        }

        Ok(total_points)
    }
}
