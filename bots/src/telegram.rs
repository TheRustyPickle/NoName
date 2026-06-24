use anyhow::{Result, anyhow};
use log::{error, info};
use std::sync::OnceLock;
use teloxide::adaptors::DefaultParseMode;
use teloxide::prelude::*;
use teloxide::types::ParseMode;
use tokio::sync::mpsc::UnboundedSender;

type Bot = DefaultParseMode<teloxide::Bot>;

static TG_BOT: OnceLock<Bot> = OnceLock::new();
static TG_SENDER: OnceLock<UnboundedSender<TelegramJoin>> = OnceLock::new();

pub struct TelegramJoin {
    pub chat_id: i64,
    pub user_id: i64,
    pub chat_username: Option<String>,
}

pub async fn start_tg_bot(token: &str, sender: UnboundedSender<TelegramJoin>) {
    info!("Starting Telegram bot");

    let bot = teloxide::Bot::new(token).parse_mode(ParseMode::Html);

    TG_BOT
        .set(bot.clone())
        .expect("TG_BOT must be set only once");

    TG_SENDER
        .set(sender)
        .expect("TG_SENDER must be set only once");

    let handler = dptree::entry()
        .branch(
            Update::filter_chat_member().branch(
                dptree::filter(|m: ChatMemberUpdated| {
                    m.old_chat_member.is_left() && m.new_chat_member.is_present()
                })
                .endpoint(new_chat_member),
            ),
        )
        .endpoint(ignore_update);

    Dispatcher::builder(bot, handler).build().dispatch().await;
}

async fn new_chat_member(_bot: Bot, chat_member: ChatMemberUpdated) -> ResponseResult<()> {
    let chat_id = chat_member.chat.id.0;
    let user_id = chat_member.new_chat_member.user.id.0 as i64;
    let mut chat_username = chat_member.chat.username().map(str::to_string);

    if let Some(chat) = chat_username {
        chat_username = Some(format!("@{chat}"));
    }

    let tg_join = TelegramJoin {
        chat_id,
        user_id,
        chat_username,
    };

    let sender = TG_SENDER.get().unwrap();
    sender.send(tg_join).unwrap();

    Ok(())
}

async fn ignore_update() -> ResponseResult<()> {
    Ok(())
}

pub async fn check_user_in_chat(
    user_id: i64,
    chat_id: &Option<String>,
    chat_username: &Option<String>,
) -> Result<(bool, Option<i64>)> {
    let bot = TG_BOT.get().unwrap();

    let user_id = UserId(user_id as u64);

    let mut gotten_chat_id = None;

    let result = if let Some(chat_id) = chat_id {
        let chat_id = chat_id.parse::<i64>()?;

        gotten_chat_id = Some(chat_id);

        let chat_id = ChatId(chat_id);
        bot.get_chat_member(chat_id, user_id).await
    } else if let Some(username) = chat_username {
        bot.get_chat_member(username.to_string(), user_id).await
    } else {
        return Err(anyhow!("Either chat_id or chat_username must be provided"));
    };

    if let Err(e) = result {
        error!("Failed to get chat member: {e}");
        Ok((false, gotten_chat_id))
    } else {
        Ok((true, gotten_chat_id))
    }
}
