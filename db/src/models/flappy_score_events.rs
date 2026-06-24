use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::result::Error;
use diesel_async::{AsyncPgConnection, RunQueryDsl};

use crate::schema::flappy_score_events;

#[derive(Default, Debug, Clone, Insertable, Queryable, Selectable)]
pub struct FlappyScoreEvent {
    session_id: String,
    user_id: String,
    pub timestamp: DateTime<Utc>,
    pub prev_timestamp: DateTime<Utc>,
    pub points: i32,
    pub prev_points: i32,
    pub pipes: i32,
    pub prev_pipes: i32,
}

impl FlappyScoreEvent {
    #[allow(clippy::too_many_arguments)]
    #[must_use]
    pub fn new(
        session_id: String,
        user_id: String,
        timestamp: DateTime<Utc>,
        prev_timestamp: DateTime<Utc>,
        points: i32,
        prev_points: i32,
        pipes: i32,
        prev_pipes: i32,
    ) -> Self {
        Self {
            session_id,
            user_id,
            timestamp,
            prev_timestamp,
            points,
            prev_points,
            pipes,
            prev_pipes,
        }
    }

    pub async fn insert_batch(
        conn: &mut AsyncPgConnection,
        events: Vec<Self>,
    ) -> Result<usize, Error> {
        use crate::schema::flappy_score_events::dsl::flappy_score_events;

        diesel::insert_into(flappy_score_events)
            .values(events)
            .execute(conn)
            .await
    }
}
