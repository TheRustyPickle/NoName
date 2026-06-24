use anyhow::anyhow;
use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::result::Error;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use diesel_derive_enum::DbEnum;
use serde::{Deserialize, Serialize};
use ulid::Ulid;

use crate::models::Platform;
use crate::schema::tasks;

#[derive(DbEnum, Debug, Clone, Copy, Serialize, Deserialize, Eq, PartialEq, Hash)]
#[db_enum(existing_type_path = "crate::schema::sql_types::TaskType")]
pub enum TaskType {
    JoinDiscord,
    FollowTwitter,
    JoinTelegram,
    CreateTweet,
    CheckTelegramPost,
    CheckDiscordPost,
    RetweetPost,
    LikeTweet,
}

#[derive(Clone, Insertable, Queryable, Selectable, Identifiable, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub task_type: TaskType,
    pub created_at: DateTime<Utc>,
    pub ends_at: Option<DateTime<Utc>>,
    pub title: String,
    pub description: String,
    pub completion_url: Option<String>,
    pub redirect_url: Option<String>,
    pub platform: Option<Platform>,
    pub platform_id: Option<String>,
    pub platform_username: Option<String>,
    pub reward_point: i32,
}

impl Task {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        task_type: TaskType,
        ends_at: Option<DateTime<Utc>>,
        title: String,
        description: String,
        completion_url: Option<String>,
        platform: Option<Platform>,
        platform_id: Option<String>,
        platform_username: Option<String>,
        reward_point: i32,
        backend_url: &str,
    ) -> anyhow::Result<Self> {
        let id = Ulid::new().to_string();
        let created_at = Utc::now();
        let redirect_url = Task::enforce_rules(
            &id,
            &task_type,
            &completion_url,
            &platform,
            &platform_id,
            &platform_username,
            backend_url,
        )?;

        Ok(Self {
            id,
            task_type,
            created_at,
            ends_at,
            title,
            description,
            completion_url,
            redirect_url,
            platform,
            platform_id,
            platform_username,
            reward_point,
        })
    }

    fn enforce_rules(
        id: &str,
        task_type: &TaskType,
        completion_url: &Option<String>,
        platform: &Option<Platform>,
        platform_id: &Option<String>,
        platform_username: &Option<String>,
        backend_url: &str,
    ) -> anyhow::Result<Option<String>> {
        Task::enforce_platform(task_type, platform, platform_id, platform_username)?;

        match task_type {
            TaskType::JoinDiscord | TaskType::JoinTelegram | TaskType::CheckDiscordPost => {
                if completion_url.is_none() {
                    return Err(anyhow!("{task_type:?} task must have a completion url"));
                }

                Ok(completion_url.clone())
            }
            TaskType::FollowTwitter
            | TaskType::LikeTweet
            | TaskType::CreateTweet
            | TaskType::CheckTelegramPost
            | TaskType::RetweetPost => {
                if completion_url.is_none() {
                    return Err(anyhow!("{task_type:?} task must have a completion url"));
                }

                Ok(Some(format!("{backend_url}/redirect?task_id={id}")))
            }
        }
    }

    fn enforce_platform(
        task_type: &TaskType,
        platform: &Option<Platform>,
        platform_id: &Option<String>,
        platform_username: &Option<String>,
    ) -> anyhow::Result<()> {
        match task_type {
            TaskType::JoinDiscord | TaskType::CheckDiscordPost => {
                if let Some(platform) = platform {
                    if platform != &Platform::Discord {
                        return Err(anyhow!("Join discord task must have the platform Discord"));
                    }

                    if platform_id.is_none() && platform_username.is_none() {
                        return Err(anyhow!(
                            "Join discord task must have a platform id or username"
                        ));
                    }
                } else {
                    return Err(anyhow!("Join discord task must have a platform"));
                }
            }
            TaskType::FollowTwitter
            | TaskType::LikeTweet
            | TaskType::CreateTweet
            | TaskType::RetweetPost => {
                if let Some(platform) = platform {
                    if platform != &Platform::Twitter {
                        return Err(anyhow!("{task_type:?} task must have the platform Twitter"));
                    }
                } else {
                    return Err(anyhow!("{task_type:?} task must have a platform"));
                }
                // No platform ID or username verification because we can't verify this task yet.
            }
            TaskType::JoinTelegram => {
                if let Some(platform) = platform {
                    if platform != &Platform::Telegram {
                        return Err(anyhow!(
                            "Join telegram task must have the platform Telegram"
                        ));
                    }

                    if platform_id.is_none() && platform_username.is_none() {
                        return Err(anyhow!(
                            "Join telegram task must have a platform id or username"
                        ));
                    }

                    if let Some(username) = platform_username
                        && !username.starts_with('@')
                    {
                        return Err(anyhow!("Telegram username must start with @"));
                    }
                } else {
                    return Err(anyhow!("Join telegram task must have a platform"));
                }
            }
            TaskType::CheckTelegramPost => {
                if let Some(platform) = platform {
                    if platform != &Platform::Telegram {
                        return Err(anyhow!(
                            "Check TG Post task must have the platform Telegram"
                        ));
                    }
                } else {
                    return Err(anyhow!("Check TG Post task must have a platform"));
                }
                // Cannot verify thus no enforcing necessary
            }
        }
        Ok(())
    }

    pub async fn insert(self, conn: &mut AsyncPgConnection) -> Result<usize, Error> {
        use crate::schema::tasks::dsl::tasks;

        diesel::insert_into(tasks).values(self).execute(conn).await
    }

    pub async fn get_active(conn: &mut AsyncPgConnection) -> Result<Vec<Self>, Error> {
        use crate::schema::tasks::dsl::{is_active, tasks};

        tasks
            .filter(is_active.eq(true))
            .select(Self::as_select())
            .load(conn)
            .await
    }

    pub async fn set_inactive(t_id: &str, conn: &mut AsyncPgConnection) -> Result<usize, Error> {
        use crate::schema::tasks::dsl::{id, is_active, tasks};

        diesel::update(tasks.filter(id.eq(t_id)))
            .set(is_active.eq(false))
            .execute(conn)
            .await
    }

    pub async fn set_platform_id(
        task_id: &str,
        p_id: &str,
        conn: &mut AsyncPgConnection,
    ) -> Result<Self, Error> {
        use crate::schema::tasks::dsl::{id, platform_id, tasks};

        diesel::update(tasks)
            .filter(id.eq(task_id))
            .set(platform_id.eq(p_id))
            .returning(Self::as_returning())
            .get_result(conn)
            .await
    }

    pub async fn get_task_by_platform(
        p_type: &Platform,
        p_id: &str,
        p_username: &Option<String>,
        conn: &mut AsyncPgConnection,
    ) -> Result<Option<Self>, Error> {
        use crate::schema::tasks::dsl::{
            is_active, platform, platform_id, platform_username, tasks,
        };

        let mut query = tasks
            .filter(platform.eq(Some(p_type)))
            .filter(is_active.eq(true))
            .into_boxed();

        if let Some(username) = p_username {
            query = query.filter(
                platform_id
                    .eq(p_id)
                    .or(platform_username.eq(username.clone())),
            );
        } else {
            query = query.filter(platform_id.eq(p_id));
        }

        query.select(Self::as_select()).first(conn).await.optional()
    }

    pub async fn get_task_by_url(
        url: &str,
        conn: &mut AsyncPgConnection,
    ) -> Result<Option<Self>, Error> {
        use crate::schema::tasks::dsl::{completion_url, is_active, tasks};

        tasks
            .filter(is_active.eq(true))
            .filter(completion_url.eq(url))
            .select(Self::as_select())
            .first(conn)
            .await
            .optional()
    }

    #[must_use]
    pub fn proof_required(&self) -> bool {
        match self.task_type {
            TaskType::JoinDiscord
            | TaskType::JoinTelegram
            | TaskType::FollowTwitter
            | TaskType::LikeTweet
            | TaskType::CheckTelegramPost
            | TaskType::CheckDiscordPost
            | TaskType::RetweetPost => false,
            TaskType::CreateTweet => true,
        }
    }

    #[must_use]
    pub fn json_string(&self) -> String {
        serde_json::to_string(&self).unwrap()
    }

    #[must_use]
    pub fn from_json(json: &str) -> Self {
        serde_json::from_str(json).unwrap()
    }
}
