use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::result::Error;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use diesel_derive_enum::DbEnum;
use serde::Serialize;
use std::str::FromStr;
use ulid::Ulid;

use crate::schema::game_sessions;

#[derive(DbEnum, Debug, Clone, Copy, Serialize)]
#[db_enum(existing_type_path = "crate::schema::sql_types::GameType")]
pub enum GameType {
    Snake,
    Tetris,
    Flappy,
    Two048,
}

impl FromStr for GameType {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "tetris" => Ok(GameType::Tetris),
            "snake" => Ok(GameType::Snake),
            "2048" | "two048" => Ok(GameType::Two048),
            "flappy" => Ok(GameType::Flappy),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, Insertable, Queryable, Selectable)]
pub struct GameSession {
    pub id: String,
    pub user_id: String,
    pub game: GameType,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub final_score: i32,
}

impl GameSession {
    #[must_use]
    pub fn new(user_id: String, game: GameType, start_time: DateTime<Utc>) -> Self {
        let id = Ulid::new().to_string();
        Self {
            id,
            user_id,
            game,
            start_time,
            end_time: start_time,
            final_score: 0,
        }
    }

    pub async fn insert(&self, conn: &mut AsyncPgConnection) -> Result<Self, Error> {
        use crate::schema::game_sessions::dsl::game_sessions;

        diesel::insert_into(game_sessions)
            .values(self)
            .returning(Self::as_returning())
            .get_result(conn)
            .await
    }

    pub async fn get_by_user_id(
        id: &str,
        conn: &mut AsyncPgConnection,
    ) -> Result<Vec<Self>, Error> {
        use crate::schema::game_sessions::dsl::{end_time, game_sessions, user_id};

        game_sessions
            .filter(user_id.eq(id))
            .order_by(end_time.desc())
            .limit(20)
            .get_results(conn)
            .await
    }
}
