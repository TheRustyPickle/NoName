use anyhow::Result;
use bots::discord::{DiscordEvent, DiscordJoin, DiscordReaction, start_discord_bot};
use bots::telegram::{TelegramJoin, start_tg_bot};
use db::models::{Platform, Task, TaskCompletion, UserSocial};
use log::{error, info};
use tokio::sync::mpsc::unbounded_channel;

use crate::ws::redis_ops::update_task_details;
use crate::ws::server::Server;
use crate::{DISCORD_TOKEN, TELEGRAM_TOKEN};

impl Server {
    pub async fn handle_tg_join(mut self) {
        let (sender, mut receiver) = unbounded_channel();
        let tg_token = TELEGRAM_TOKEN.get().unwrap();

        tokio::spawn(start_tg_bot(tg_token, sender));

        while let Some(tg_join) = receiver.recv().await {
            let TelegramJoin {
                chat_id,
                user_id,
                chat_username,
            } = tg_join;
            if let Err(e) = self
                .verify_event(
                    chat_id.to_string(),
                    user_id.to_string(),
                    chat_username,
                    Platform::Telegram,
                )
                .await
            {
                error!("Failed to check Telegram join. Reason: {e}");
            }
        }
    }

    pub async fn handle_discord_join(mut self) {
        let (sender, mut receiver) = unbounded_channel();
        let discord_token = DISCORD_TOKEN.get().unwrap();

        tokio::spawn(start_discord_bot(discord_token, sender));

        while let Some(discord_join) = receiver.recv().await {
            match discord_join {
                DiscordEvent::DiscordJoin(discord_join) => {
                    let DiscordJoin {
                        guild_id,
                        user_id,
                        guild_name,
                    } = discord_join;
                    if let Err(e) = self
                        .verify_event(
                            guild_id.to_string(),
                            user_id.to_string(),
                            guild_name,
                            Platform::Discord,
                        )
                        .await
                    {
                        error!("Failed to check Discord join. Reason: {e}");
                    }
                }
                DiscordEvent::DiscordReaction(reaction) => {
                    let DiscordReaction {
                        guild_id,

                        channel_id,
                        message_id,
                        user_id,
                    } = reaction;

                    if let Err(e) = self
                        .verify_discord_reaction(guild_id, channel_id, message_id, user_id)
                        .await
                    {
                        error!("Failed to check Discord reaction. Reason: {e}");
                    }
                }
            }
        }
    }

    async fn verify_event(
        &mut self,
        chat_id: String,
        user_id: String,
        chat_username: Option<String>,
        platform: Platform,
    ) -> Result<()> {
        let mut conn = self.pool.get().await.unwrap();

        let Some(user_social) =
            UserSocial::get_user_by_platform(&platform, &user_id.to_string(), &mut conn).await?
        else {
            info!("No user found that has {platform:?}, user id: {user_id}");
            return Ok(());
        };

        let Some(task) =
            Task::get_task_by_platform(&platform, &chat_id.to_string(), &chat_username, &mut conn)
                .await?
        else {
            info!(
                "No task found that has {platform:?}, chat id: {chat_id}, username: {chat_username:?}"
            );
            return Ok(());
        };

        if task.platform_id.is_none() {
            let updated_task =
                Task::set_platform_id(&task.id, &chat_id.to_string(), &mut conn).await?;

            update_task_details(&mut self.redis, &task.id, updated_task.json_string()).await?;
        }

        let already_complete =
            TaskCompletion::task_already_complete(&mut conn, &user_social.user_id, &task.id)
                .await?;

        if already_complete {
            return Ok(());
        }

        TaskCompletion::new(&user_social.user_id, &task.id, false, None)
            .insert(&mut conn)
            .await?;

        Ok(())
    }

    async fn verify_discord_reaction(
        &mut self,
        guild_id: i64,
        channel_id: i64,
        message_id: i64,
        user_id: i64,
    ) -> Result<()> {
        let mut conn = self.pool.get().await.unwrap();

        let Some(user_social) =
            UserSocial::get_user_by_platform(&Platform::Discord, &user_id.to_string(), &mut conn)
                .await?
        else {
            info!("No user found that has Platform Discord, user id: {user_id}");
            return Ok(());
        };

        let message_url =
            format!("https://discord.com/channels/{guild_id}/{channel_id}/{message_id}");

        let Some(task) = Task::get_task_by_url(&message_url, &mut conn).await? else {
            info!("No task found that has the message url: {message_url}");
            return Ok(());
        };

        if task.platform_id.is_none() {
            let updated_task =
                Task::set_platform_id(&task.id, &guild_id.to_string(), &mut conn).await?;
            update_task_details(&mut self.redis, &task.id, updated_task.json_string()).await?;
        }

        let already_complete =
            TaskCompletion::task_already_complete(&mut conn, &user_social.user_id, &task.id)
                .await?;

        if already_complete {
            return Ok(());
        }

        TaskCompletion::new(&user_social.user_id, &task.id, false, None)
            .insert(&mut conn)
            .await?;

        Ok(())
    }
}
