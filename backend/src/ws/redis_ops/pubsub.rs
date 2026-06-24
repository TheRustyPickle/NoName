use anyhow::{Context, Result};
use db::models::User;
use log::{error, info};
use redis::{AsyncCommands, PushKind, Value};
use tokio::sync::mpsc::unbounded_channel;
use tokio::time::{Duration, sleep};

use crate::REDIS_URL;
use crate::ws::get_pubsub_conn;
use crate::ws::models::WsResponse;
use crate::ws::redis_ops::{
    DISCONNECTED_SUB, LEADERBOARD_SUB, USER_KEY, delete_dirty_user, delete_user, get_user_points,
    user_in_leaderboard,
};
use crate::ws::server::Server;

impl Server {
    pub async fn subscribe_for_updates(mut self) {
        let (tx, mut rx) = unbounded_channel();
        let mut connection = get_pubsub_conn(REDIS_URL.get().unwrap(), tx).await;

        tokio::spawn(async move {
            loop {
                if let Err(e) = connection.ping::<()>().await {
                    error!("Error pinging redis: {:?}", e);
                }
                sleep(Duration::from_secs(60)).await;
            }
        });

        info!("Started listening for pubsub updates");

        while let Some(push_info) = rx.recv().await {
            match push_info.kind {
                PushKind::Message => {
                    if push_info.data.len() != 2 {
                        error!(
                            "Push data is not a bulk string or does not have 2 values. Push data: {:#?}",
                            push_info.data
                        );
                        continue;
                    }

                    let (Value::BulkString(channel_name), Value::BulkString(other_value)) =
                        (&push_info.data[0], &push_info.data[1])
                    else {
                        error!(
                            "Push data is not a bulk string. Push data: {:#?}",
                            push_info.data
                        );
                        continue;
                    };

                    let result = self.handle_pubsub_message(channel_name, other_value).await;

                    if let Err(e) = result {
                        error!("Error handling pubsub message: {e}");
                    }
                }
                PushKind::Subscribe | PushKind::Unsubscribe => {}
                _ => {
                    info!("Unhandled push info: {:?}", push_info);
                }
            }
        }
    }

    async fn handle_pubsub_message(
        &mut self,
        channel_name: &[u8],
        other_value: &[u8],
    ) -> Result<()> {
        let channel_name =
            String::from_utf8(channel_name.into()).context("Failed to parse byte to string")?;
        let message =
            String::from_utf8(other_value.into()).context("Failed to parse byte to string")?;

        match channel_name.as_ref() {
            LEADERBOARD_SUB => self
                .broadcast_leaderboard_update()
                .await
                .context("Failed to broadcast leaderboard update")?,
            DISCONNECTED_SUB => {
                let user_id = &message;

                self.cleanup_disconnected(user_id)
                    .await
                    .with_context(|| format!("Failed to cleanup disconnected user {user_id}"))?;
            }
            _ => {
                error!("Unexpected channel: {channel_name}");
            }
        }
        Ok(())
    }

    async fn broadcast_leaderboard_update(&mut self) -> Result<()> {
        let resp = WsResponse::leaderboard(self.create_leaderboard().await?);

        for id in self.subscribed.iter() {
            if let Some(tx) = self.sessions.get(&id) {
                let _ = tx.send(resp.clone().json());
            }
        }
        Ok(())
    }

    pub async fn cleanup_disconnected(&mut self, user_id: &str) -> Result<()> {
        let mut conn = self.pool.get().await?;

        let user_key = format!("{USER_KEY}:{user_id}");

        let latest_points = get_user_points(&mut self.redis, &user_key).await?;

        let Some(points) = latest_points else {
            error!("No points found for disconnected user {user_id}");
            delete_dirty_user(&mut self.redis, user_id).await?;
            return Ok(());
        };

        let result = User::set_points(&mut conn, user_id, points).await;

        match result {
            Ok(updated_user) => {
                if updated_user.points != points {
                    // No update = point less than the current. Investigation required if ever
                    // happens but this should not happen
                    error!(
                        "Points mismatch for user {user_id} {:?}: redit points {points}, db points {}",
                        updated_user
                            .sol_wallet
                            .as_deref()
                            .unwrap_or("No Sol Wallet"),
                        updated_user.points
                    );
                }
            }
            Err(e) => {
                error!(
                    "Failed to update dirty user DB. Does the DB have more points than the redis points? \
                    Investigation required. User ID {user_id} Redis points {points}. \
                    Reason {e}"
                );
            }
        }

        delete_dirty_user(&mut self.redis, user_id).await?;

        let exists = user_in_leaderboard(&mut self.redis, &user_key).await?;

        if exists.is_none() {
            delete_user(&mut self.redis, &user_key).await?;
        }

        Ok(())
    }
}
