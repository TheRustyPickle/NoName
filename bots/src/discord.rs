use anyhow::{Result, anyhow};
use log::{error, info};
use serenity::async_trait;
use serenity::model::prelude::*;
use serenity::prelude::*;
use std::sync::OnceLock;
use tokio::sync::mpsc::UnboundedSender;

static DISCORD_CONTEXT: OnceLock<Context> = OnceLock::new();

struct Comm;

impl TypeMapKey for Comm {
    type Value = UnboundedSender<DiscordEvent>;
}

pub enum DiscordEvent {
    DiscordJoin(DiscordJoin),
    DiscordReaction(DiscordReaction),
}

pub struct DiscordJoin {
    pub guild_id: i64,
    pub user_id: i64,
    pub guild_name: Option<String>,
}

pub struct DiscordReaction {
    pub guild_id: i64,
    pub channel_id: i64,
    pub message_id: i64,
    pub user_id: i64,
}

pub async fn start_discord_bot(token: &str, sender: UnboundedSender<DiscordEvent>) {
    let intents = GatewayIntents::GUILD_MEMBERS | GatewayIntents::GUILD_MESSAGE_REACTIONS;

    let mut client = Client::builder(token, intents)
        .event_handler(Handler)
        .await
        .unwrap();

    {
        let mut data = client.data.write().await;
        data.insert::<Comm>(sender);
    };

    client.start().await.unwrap();
}

struct Handler;

#[async_trait]
impl EventHandler for Handler {
    async fn ready(&self, ctx: Context, ready: Ready) {
        DISCORD_CONTEXT.set(ctx).unwrap();
        info!("Discord bot {} is online", ready.user.name);
    }

    async fn guild_member_addition(&self, ctx: Context, new_member: Member) {
        let guild_id = new_member.guild_id.get() as i64;
        let user_id = new_member.user.id.get() as i64;
        let mut guild_name = new_member.guild_id.name(&ctx);

        if guild_name.is_none()
            && let Ok(guild) = ctx.http.get_guild(new_member.guild_id).await
        {
            guild_name = Some(guild.name);
        }

        let discord_join = DiscordJoin {
            guild_id,
            user_id,
            guild_name,
        };

        let to_send = DiscordEvent::DiscordJoin(discord_join);

        let sender = ctx.data.read().await.get::<Comm>().unwrap().clone();
        sender.send(to_send).unwrap();
    }

    async fn reaction_add(&self, ctx: Context, reaction: Reaction) {
        let Some(guild_id) = reaction.guild_id else {
            info!("Guild id on reaction was none. Was it in a DM? Details: {reaction:#?}");
            return;
        };

        let Some(user_id) = reaction.user_id else {
            info!("User id on reaction was none. Details: {reaction:#?}");
            return;
        };

        let g_id = guild_id.get() as i64;
        let u_id = user_id.get() as i64;
        let channel_id = reaction.channel_id.get() as i64;
        let message_id = reaction.message_id.get() as i64;

        let message_reaction = DiscordReaction {
            guild_id: g_id,
            channel_id,
            message_id,
            user_id: u_id,
        };

        let to_send = DiscordEvent::DiscordReaction(message_reaction);

        let sender = ctx.data.read().await.get::<Comm>().unwrap().clone();
        sender.send(to_send).unwrap();
    }
}

pub async fn user_in_discord(
    user_id: i64,
    guild_id_string: &Option<String>,
    guild_name: &Option<String>,
) -> Result<(bool, Option<i64>)> {
    let ctx = DISCORD_CONTEXT.get().unwrap();

    let guild_id = if let Some(id) = guild_id_string {
        id.parse::<u64>()?
    } else if let Some(guild) = guild_name {
        if let Some(info) = get_target_guild(ctx, guild).await {
            info.id.get()
        } else {
            return Err(anyhow!("Guild {} not found", guild));
        }
    } else {
        return Err(anyhow!("Either guild_id or guild_name must be provided"));
    };

    let guild_id = GuildId::new(guild_id);
    let user_id = UserId::new(user_id as u64);

    let result = ctx.http().get_member(guild_id, user_id).await;

    let send_guild_id = guild_id_string.is_none();

    if let Err(e) = result.as_ref() {
        error!(
            "Failed to verify user {user_id} in guild {guild_id_string:?} {guild_name:?}. Reason: {e}"
        );
    }

    if send_guild_id {
        Ok((result.is_ok(), Some(guild_id.get() as i64)))
    } else {
        Ok((result.is_ok(), None))
    }
}

async fn get_target_guild(ctx: &Context, target_guild: &str) -> Option<GuildInfo> {
    let guild_list = ctx.http().get_guilds(None, Some(100)).await;

    if guild_list.is_err() {
        return None;
    }

    let guilds = guild_list.unwrap();

    for guild in guilds {
        if guild.name == target_guild {
            return Some(guild);
        }
    }
    None
}

pub async fn check_user_in_reactions(
    user_id: u64,
    channel_id: u64,
    message_id: u64,
) -> Result<bool> {
    let ctx = DISCORD_CONTEXT.get().unwrap();

    let ch_id = ChannelId::new(channel_id);
    let m_id = MessageId::new(message_id);

    let message = ctx.http.get_message(ch_id, m_id).await?;

    for reaction in message.reactions {
        let emoji = &reaction.reaction_type;
        let users = get_all_reaction_users(ctx, ch_id, m_id, emoji).await?;

        for user in users {
            if user.id.get() == user_id {
                return Ok(true);
            }
        }
    }

    Ok(false)
}

async fn get_all_reaction_users(
    ctx: &Context,
    channel_id: ChannelId,
    message_id: MessageId,
    reaction_type: &ReactionType,
) -> Result<Vec<User>> {
    let mut users = Vec::new();
    let mut after: Option<UserId> = None;

    loop {
        let batch = ctx
            .http
            .get_reaction_users(
                channel_id,
                message_id,
                reaction_type,
                100,
                after.map(serenity::all::UserId::get),
            )
            .await?;

        if batch.is_empty() {
            break;
        }

        after = batch.last().map(|u| u.id);
        users.extend(batch);
    }

    Ok(users)
}
