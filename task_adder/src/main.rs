use db::get_connection;
use db::models::{Platform, Task, TaskType};

#[tokio::main]
async fn main() {
    dotenvy::from_filename("local.env").unwrap();

    let db_url = std::env::var("DATABASE_URL").unwrap();
    let backend_url = std::env::var("BACKEND_URL").unwrap();

    let pool = get_connection(&db_url).await;

    let task_1 = Task::new(
        TaskType::JoinDiscord,
        None,
        "Join Discord".to_string(),
        "Join our discord to complete the task".to_string(),
        Some("https://discord.gg/ChRjSuCK".to_string()),
        Some(Platform::Discord),
        None,
        Some("Server Template".to_string()),
        100,
        &backend_url,
    )
    .unwrap();
    let task_2 = Task::new(
        TaskType::FollowTwitter,
        None,
        "Follow Twitter".to_string(),
        "Follow our twitter to complete the task".to_string(),
        Some("https://twitter.com/".to_string()),
        Some(Platform::Twitter),
        None,
        None,
        300,
        &backend_url,
    )
    .unwrap();
    let task_3 = Task::new(
        TaskType::JoinTelegram,
        None,
        "Join Telegram".to_string(),
        "Join the Telegram group to complete the task".to_string(),
        Some("https://t.me/tasktestg".to_string()),
        Some(Platform::Telegram),
        None,
        Some("@tasktestg".to_string()),
        500,
        &backend_url,
    )
    .unwrap();

    let task_4 = Task::new(
        TaskType::CreateTweet,
        None,
        "Send a comment to the post".to_string(),
        "Comment on the post with some text".to_string(),
        Some("https://x.com/modenetwork/status/1934963335486689771".to_string()),
        Some(Platform::Twitter),
        None,
        None,
        600,
        &backend_url,
    )
    .unwrap();

    let task_5 = Task::new(
        TaskType::LikeTweet,
        None,
        "Like this tweet".to_string(),
        "Like the given tweet".to_string(),
        Some("https://x.com/modenetwork/status/1934963335486689771".to_string()),
        Some(Platform::Twitter),
        None,
        None,
        800,
        &backend_url,
    )
    .unwrap();
    let task_6 = Task::new(
        TaskType::RetweetPost,
        None,
        "Retweet the post".to_string(),
        "Retweet the given post".to_string(),
        Some("https://x.com/modenetwork/status/1934963335486689771".to_string()),
        Some(Platform::Twitter),
        None,
        None,
        900,
        &backend_url,
    )
    .unwrap();
    let task_7 = Task::new(
        TaskType::CheckTelegramPost,
        None,
        "Check the telegram post".to_string(),
        "Check the given post".to_string(),
        Some("https://t.me/tasktestg/5".to_string()),
        Some(Platform::Telegram),
        None,
        None,
        1000,
        &backend_url,
    )
    .unwrap();
    let task_8 = Task::new(
        TaskType::CheckDiscordPost,
        None,
        "Check and react to the given discord post".to_string(),
        "Check and react to the given discord post".to_string(),
        Some("https://discord.com/channels/1146449209206247528/1146449210359689369/1397957269475426344".to_string()),
        Some(Platform::Discord),
        None,
        Some("Server Template".to_string()),
        1200,
        &backend_url,
    )
    .unwrap();
    let mut conn = pool.get().await.unwrap();

    // let _ = task_1.insert(&mut conn).await;
    // let _ = task_2.insert(&mut conn).await;
    // let _ = task_3.insert(&mut conn).await;
    // let _ = task_4.insert(&mut conn).await;
    // let _ = task_5.insert(&mut conn).await;
    // let _ = task_6.insert(&mut conn).await;
    // let _ = task_7.insert(&mut conn).await;
    // let _ = task_8.insert(&mut conn).await;
}
