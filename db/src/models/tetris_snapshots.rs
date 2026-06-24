use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::result::Error;
use diesel_async::{AsyncPgConnection, RunQueryDsl};

use crate::schema::tetris_snapshots;

#[derive(Default, Debug, Clone, Insertable, Queryable, Selectable)]
pub struct TetrisSnapshot {
    session_id: String,
    user_id: String,
    pub timestamp: DateTime<Utc>,
    pub prev_timestamp: DateTime<Utc>,
    pub points: i32,
    pub prev_points: i32,
    pub lines: i32,
    pub prev_lines: i32,
    pub level: i32,
    pub prev_level: i32,
    line_points: i32,
    drop_points: i32,
}

impl TetrisSnapshot {
    #[allow(clippy::too_many_arguments)]
    #[must_use]
    pub fn new(
        session_id: String,
        user_id: String,
        timestamp: DateTime<Utc>,
        prev_timestamp: DateTime<Utc>,
        points: i32,
        prev_points: i32,
        lines: i32,
        prev_lines: i32,
        level: i32,
        prev_level: i32,
        line_points: i32,
        drop_points: i32,
    ) -> Self {
        Self {
            session_id,
            user_id,
            timestamp,
            prev_timestamp,
            points,
            prev_points,
            lines,
            prev_lines,
            level,
            prev_level,
            line_points,
            drop_points,
        }
    }

    pub async fn insert_batch(
        conn: &mut AsyncPgConnection,
        snapshots: Vec<Self>,
    ) -> Result<usize, Error> {
        use crate::schema::tetris_snapshots::dsl::tetris_snapshots;

        diesel::insert_into(tetris_snapshots)
            .values(snapshots)
            .execute(conn)
            .await
    }
}
