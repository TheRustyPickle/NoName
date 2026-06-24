use anyhow::{Context, Result};
use chrono::DateTime;
use db::models::User;
use redis::AsyncCommands;
use redis::aio::ConnectionManager;
use std::collections::HashSet;

use crate::ws::models::{UserWithRank, UserWithRankSocials, UserWithSocials};
use crate::ws::redis_ops::{
    ALL_TASKS_KEY, DIRTY_KEY, HSET_DISCORD, HSET_DISCORD_ID, HSET_EVM_WALLET, HSET_JOINED_AT,
    HSET_NAME, HSET_PHOTO, HSET_POINTS, HSET_REFERRAL, HSET_SOL_WALLET, HSET_TELEGRAM,
    HSET_TELEGRAM_ID, HSET_TWITTER, HSET_TWITTER_ID, LEADERBOARD_KEY, MAX_LEADERBOARD_SIZE,
};

pub async fn get_leaderboard_entries(conn: &mut ConnectionManager) -> Result<Vec<String>> {
    Ok(conn
        .zrevrange(LEADERBOARD_KEY, 0, MAX_LEADERBOARD_SIZE - 1)
        .await?)
}

pub async fn get_user_points(conn: &mut ConnectionManager, user_key: &str) -> Result<Option<i32>> {
    let points: Option<i32> = conn.hget(user_key, HSET_POINTS).await?;
    Ok(points)
}

#[allow(clippy::type_complexity)]
pub async fn get_full_user(
    conn: &mut ConnectionManager,
    user_key: &str,
    user_id: &str,
) -> Result<User> {
    let (joined_at, username, sol_wallet, evm_wallet, photo, points, referral): (
        String,
        Option<String>,
        Option<String>,
        Option<String>,
        String,
        i32,
        Option<String>,
    ) = conn
        .hmget(
            user_key,
            &[
                HSET_JOINED_AT,
                HSET_NAME,
                HSET_SOL_WALLET,
                HSET_EVM_WALLET,
                HSET_PHOTO,
                HSET_POINTS,
                HSET_REFERRAL,
            ],
        )
        .await?;

    let joined_at = joined_at
        .parse::<DateTime<chrono::Utc>>()
        .with_context(|| format!("Failed to parse {joined_at} timestamp to DateTime"))?;

    Ok(User::new_full(
        joined_at,
        user_id.to_string(),
        username,
        sol_wallet,
        evm_wallet,
        photo,
        points,
        referral,
    ))
}

pub async fn user_in_leaderboard(
    conn: &mut ConnectionManager,
    user_key: &str,
) -> Result<Option<i32>> {
    Ok(conn.zscore(LEADERBOARD_KEY, user_key).await?)
}

pub async fn is_user_added(conn: &mut ConnectionManager, user_key: &str) -> Result<bool> {
    Ok(conn.exists(user_key).await?)
}

pub async fn delete_user(conn: &mut ConnectionManager, user_key: &str) -> Result<()> {
    let _: () = conn.del(user_key).await.context("Failed to delete user")?;
    Ok(())
}

pub async fn delete_dirty_user(conn: &mut ConnectionManager, user_id: &str) -> Result<()> {
    let _: () = conn
        .srem(DIRTY_KEY, user_id)
        .await
        .context("Failed to remove user id from dirty list")?;
    Ok(())
}

pub async fn set_user_leaderboard_points(
    conn: &mut ConnectionManager,
    user_key: &str,
    points: i32,
) -> Result<()> {
    let _: () = conn.zadd(LEADERBOARD_KEY, user_key, points).await?;
    Ok(())
}

pub async fn increase_user_points_by_with_dirty(
    conn: &mut ConnectionManager,
    user_key: &str,
    user_id: &str,
    points: i32,
) -> Result<i32> {
    let total_points = conn
        .hincr::<_, _, _, i32>(&user_key, HSET_POINTS, points)
        .await?;

    let _: () = conn.sadd(DIRTY_KEY, user_id).await?;
    Ok(total_points)
}

pub async fn increase_points_if_exists(
    conn: &mut ConnectionManager,
    user_key: &str,
    points: i32,
) -> Result<Option<i32>> {
    let exists: bool = conn.exists(user_key).await?;

    if !exists {
        return Ok(None);
    }

    let total_points = conn
        .hincr::<_, _, _, i32>(&user_key, HSET_POINTS, points)
        .await?;

    Ok(Some(total_points))
}

pub async fn add_user_to_leaderboard(
    conn: &mut ConnectionManager,
    user_key: &str,
    points: i32,
) -> Result<()> {
    let _: () = conn
        .zadd(LEADERBOARD_KEY, user_key, points)
        .await
        .context("Failed to add user to leaderboard")?;

    Ok(())
}

pub async fn add_new_user(
    conn: &mut ConnectionManager,
    user_key: &str,
    user_task_key: &str,
    user_with_socials: UserWithSocials,
    tasks: Vec<String>,
    points: i32,
    referral_code: Option<String>,
) -> Result<()> {
    let user = user_with_socials.user;
    let mut user_details = Vec::new();

    user_details.push((HSET_JOINED_AT, user.joined_at.to_string()));

    if let Some(name) = user.username {
        user_details.push((HSET_NAME, name));
    }

    if let Some(sol_wallet) = user.sol_wallet {
        user_details.push((HSET_SOL_WALLET, sol_wallet));
    }

    if let Some(evm_wallet) = user.evm_wallet {
        user_details.push((HSET_EVM_WALLET, evm_wallet));
    }

    if let Some(twitter) = user_with_socials.twitter {
        user_details.push((HSET_TWITTER, twitter));
        user_details.push((
            HSET_TWITTER_ID,
            user_with_socials.twitter_id.unwrap().clone(),
        ));
    }

    if let Some(discord) = user_with_socials.discord {
        user_details.push((HSET_DISCORD, discord));
        user_details.push((
            HSET_DISCORD_ID,
            user_with_socials.discord_id.unwrap().clone(),
        ));
    }

    if let Some(telegram) = user_with_socials.telegram {
        user_details.push((HSET_TELEGRAM, telegram));
        user_details.push((HSET_TELEGRAM_ID, user_with_socials.telegram_id.unwrap()));
    }

    if let Some(referral) = referral_code {
        user_details.push((HSET_REFERRAL, referral));
    }

    user_details.push((HSET_PHOTO, user.photo_url));
    user_details.push((HSET_POINTS, points.to_string()));

    let _: () = conn
        .hset_multiple(user_key, &user_details)
        .await
        .context("Failed to add new user")?;

    set_user_completed_tasks(conn, user_task_key, tasks).await?;
    Ok(())
}

pub async fn update_user_username(
    conn: &mut ConnectionManager,
    user_key: &str,
    username: String,
) -> Result<()> {
    let _: () = conn
        .hset(user_key, HSET_NAME, username)
        .await
        .context("Failed to update user username")?;

    Ok(())
}

pub async fn update_user_photo(
    conn: &mut ConnectionManager,
    user_key: &str,
    photo: String,
) -> Result<()> {
    let _: () = conn
        .hset(user_key, HSET_PHOTO, photo)
        .await
        .context("Failed to update user photo")?;

    Ok(())
}

pub async fn update_user_twitter(
    conn: &mut ConnectionManager,
    user_key: &str,
    twitter: String,
    twitter_id: String,
) -> Result<()> {
    let _: () = conn
        .hset_multiple(
            user_key,
            &[(HSET_TWITTER, twitter), (HSET_TWITTER_ID, twitter_id)],
        )
        .await
        .context("Failed to update user Twitter info")?;

    Ok(())
}

pub async fn update_user_discord(
    conn: &mut ConnectionManager,
    user_key: &str,
    discord: String,
    discord_id: String,
) -> Result<()> {
    let _: () = conn
        .hset_multiple(
            user_key,
            &[(HSET_DISCORD, discord), (HSET_DISCORD_ID, discord_id)],
        )
        .await
        .context("Failed to update user Discord handle")?;

    Ok(())
}

pub async fn update_user_telegram(
    conn: &mut ConnectionManager,
    user_key: &str,
    telegram: String,
    telegram_id: String,
) -> Result<()> {
    let _: () = conn
        .hset_multiple(
            user_key,
            &[(HSET_TELEGRAM, telegram), (HSET_TELEGRAM_ID, telegram_id)],
        )
        .await
        .context("Failed to update user Telegram handle")?;

    Ok(())
}

pub async fn convert_to_user_with_rank_socials(
    conn: &mut ConnectionManager,
    user_key: &str,
    user: UserWithRank,
) -> Result<UserWithRankSocials> {
    let (twitter, discord, telegram): (Option<String>, Option<String>, Option<String>) = conn
        .hmget(user_key, &[HSET_TWITTER, HSET_DISCORD, HSET_TELEGRAM])
        .await?;

    Ok(UserWithRankSocials::new(user, twitter, discord, telegram))
}

pub async fn get_user_socials_status(
    conn: &mut ConnectionManager,
    user_key: &str,
) -> Result<(bool, bool, bool)> {
    let (twitter, discord, telegram): (Option<String>, Option<String>, Option<String>) = conn
        .hmget(user_key, &[HSET_TWITTER, HSET_DISCORD, HSET_TELEGRAM])
        .await?;

    Ok((twitter.is_some(), discord.is_some(), telegram.is_some()))
}

pub async fn get_user_completed_tasks(
    conn: &mut ConnectionManager,
    user_key: &str,
) -> Result<HashSet<String>> {
    let members: HashSet<String> = conn.smembers(user_key).await?;
    Ok(members)
}

async fn set_user_completed_tasks(
    conn: &mut ConnectionManager,
    user_key: &str,
    tasks: Vec<String>,
) -> Result<()> {
    if tasks.is_empty() {
        return Ok(());
    }
    let _: () = conn.sadd(user_key, tasks).await?;

    Ok(())
}

pub async fn set_all_tasks(
    conn: &mut ConnectionManager,
    tasks: Vec<(String, String)>,
) -> Result<()> {
    if tasks.is_empty() {
        return Ok(());
    }

    let _: () = conn.hset_multiple(ALL_TASKS_KEY, &tasks).await?;
    Ok(())
}

pub async fn get_all_tasks(conn: &mut ConnectionManager) -> Result<Vec<(String, String)>> {
    let tasks: Vec<(String, String)> = conn.hgetall(ALL_TASKS_KEY).await?;
    Ok(tasks)
}

pub async fn get_task_details(conn: &mut ConnectionManager, task_id: &str) -> Result<String> {
    let task: String = conn.hget(ALL_TASKS_KEY, task_id).await?;
    Ok(task)
}

pub async fn update_task_details(
    conn: &mut ConnectionManager,
    task_id: &str,
    task: String,
) -> Result<()> {
    let _: () = conn.hset(ALL_TASKS_KEY, task_id, task).await?;
    Ok(())
}

pub async fn get_user_telegram_id(
    conn: &mut ConnectionManager,
    user_key: &str,
) -> Result<Option<String>> {
    let telegram: Option<String> = conn.hget(user_key, HSET_TELEGRAM_ID).await?;
    Ok(telegram)
}

pub async fn get_user_discord_id(
    conn: &mut ConnectionManager,
    user_key: &str,
) -> Result<Option<String>> {
    let discord: Option<String> = conn.hget(user_key, HSET_DISCORD_ID).await?;
    Ok(discord)
}

pub async fn mark_task_completed(
    conn: &mut ConnectionManager,
    user_key: &str,
    task_id: &str,
) -> Result<()> {
    let _: () = conn.sadd(user_key, task_id).await?;
    Ok(())
}

pub async fn update_user_referral_code(
    conn: &mut ConnectionManager,
    user_key: &str,
    code: &str,
) -> Result<()> {
    let _: () = conn.hset(user_key, HSET_REFERRAL, code).await?;
    Ok(())
}

pub async fn update_user_sol_wallet(
    conn: &mut ConnectionManager,
    user_key: &str,
    wallet: &str,
) -> Result<()> {
    let _: () = conn.hset(user_key, HSET_SOL_WALLET, wallet).await?;
    Ok(())
}

pub async fn update_user_evm_wallet(
    conn: &mut ConnectionManager,
    user_key: &str,
    wallet: &str,
) -> Result<()> {
    let _: () = conn.hset(user_key, HSET_EVM_WALLET, wallet).await?;
    Ok(())
}
