use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::result::Error;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use diesel_derive_enum::DbEnum;
use serde::{Deserialize, Serialize};

use crate::schema::two048_move_events;

#[derive(DbEnum, Debug, Clone, Copy, Serialize, Deserialize)]
#[db_enum(existing_type_path = "crate::schema::sql_types::Direction")]
pub enum Direction {
    Left,
    Right,
    Up,
    Down,
}

#[derive(Clone, Insertable, Queryable, Selectable)]
pub struct Two048MoveEvent {
    pub session_id: String,
    pub user_id: String,
    pub timestamp: DateTime<Utc>,
    pub prev_timestamp: DateTime<Utc>,
    pub direction: Direction,
    pub points: i32,
    pub prev_points: i32,
    pub highest_number: i32,
    pub prev_highest_number: i32,
}

impl Two048MoveEvent {
    #[allow(clippy::too_many_arguments)]
    #[must_use]
    pub fn new(
        session_id: String,
        user_id: String,
        timestamp: DateTime<Utc>,
        prev_timestamp: DateTime<Utc>,
        direction: Direction,
        points: i32,
        prev_points: i32,
        highest_number: i32,
        prev_highest_number: i32,
    ) -> Self {
        Self {
            session_id,
            user_id,
            timestamp,
            prev_timestamp,
            direction,
            points,
            prev_points,
            highest_number,
            prev_highest_number,
        }
    }

    pub async fn insert_batch(
        conn: &mut AsyncPgConnection,
        events: Vec<Self>,
    ) -> Result<usize, Error> {
        use crate::schema::two048_move_events::dsl::two048_move_events;

        diesel::insert_into(two048_move_events)
            .values(events)
            .execute(conn)
            .await
    }
}
