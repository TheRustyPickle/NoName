use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::result::Error;
use diesel_async::{AsyncPgConnection, RunQueryDsl};

use crate::schema::snake_food_events;

#[derive(Default, Debug, Clone, Insertable, Queryable, Selectable)]
pub struct SnakeFoodEvent {
    session_id: String,
    user_id: String,
    pub timestamp: DateTime<Utc>,
    pub prev_timestamp: DateTime<Utc>,
    pub points: i32,
    pub prev_points: i32,
    pub length: i32,
    pub prev_length: i32,
    pub level: i32,
    pub prev_level: i32,
}

impl SnakeFoodEvent {
    #[allow(clippy::too_many_arguments)]
    #[must_use]
    pub fn new(
        session_id: String,
        user_id: String,
        timestamp: DateTime<Utc>,
        prev_timestamp: DateTime<Utc>,
        points: i32,
        prev_points: i32,
        length: i32,
        prev_length: i32,
        level: i32,
        prev_level: i32,
    ) -> Self {
        Self {
            session_id,
            user_id,
            timestamp,
            prev_timestamp,
            points,
            prev_points,
            length,
            prev_length,
            level,
            prev_level,
        }
    }

    pub async fn insert_batch(
        conn: &mut AsyncPgConnection,
        events: Vec<Self>,
    ) -> Result<usize, Error> {
        use crate::schema::snake_food_events::dsl::snake_food_events;

        diesel::insert_into(snake_food_events)
            .values(events)
            .execute(conn)
            .await
    }
}
