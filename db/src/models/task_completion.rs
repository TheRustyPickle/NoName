use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::result::Error;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::Serialize;

use crate::schema::task_completions;

#[derive(Clone, Insertable, Queryable, Selectable, Serialize)]
pub struct TaskCompletion {
    user_id: String,
    task_id: String,
    completed_at: DateTime<Utc>,
    pub points_assigned: bool,
    proof: Option<String>,
}

impl TaskCompletion {
    #[must_use]
    pub fn new(user_id: &str, task_id: &str, points_assigned: bool, proof: Option<String>) -> Self {
        TaskCompletion {
            user_id: user_id.to_string(),
            task_id: task_id.to_string(),
            completed_at: Utc::now(),
            points_assigned,
            proof,
        }
    }

    pub async fn insert(self, conn: &mut AsyncPgConnection) -> Result<usize, Error> {
        use crate::schema::task_completions::dsl::task_completions;

        diesel::insert_into(task_completions)
            .values(self)
            .execute(conn)
            .await
    }

    pub async fn get_user_completed_tasks(
        conn: &mut AsyncPgConnection,
        u_id: &str,
    ) -> Result<Vec<String>, Error> {
        use crate::schema::task_completions::dsl::{
            points_assigned, task_completions, task_id, user_id,
        };
        let results = task_completions
            .filter(user_id.eq(u_id))
            .filter(points_assigned.eq(true))
            .select(task_id)
            .load::<String>(conn)
            .await?;

        Ok(results)
    }

    pub async fn task_already_complete(
        conn: &mut AsyncPgConnection,
        u_id: &str,
        t_id: &str,
    ) -> Result<bool, Error> {
        use crate::schema::task_completions::dsl::{task_completions, task_id, user_id};

        let count: i64 = task_completions
            .filter(user_id.eq(u_id))
            .filter(task_id.eq(t_id))
            .count()
            .get_result(conn)
            .await?;

        Ok(count > 0)
    }

    pub async fn get_task_completion(
        conn: &mut AsyncPgConnection,
        u_id: &str,
        t_id: &str,
    ) -> Result<Option<Self>, Error> {
        use crate::schema::task_completions::dsl::{task_completions, task_id, user_id};

        task_completions
            .filter(user_id.eq(u_id))
            .filter(task_id.eq(t_id))
            .select(Self::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn set_points_assigned(
        self,
        p_data: Option<String>,
        conn: &mut AsyncPgConnection,
    ) -> Result<usize, Error> {
        use crate::schema::task_completions::dsl::{
            points_assigned, proof, task_completions, task_id, user_id,
        };

        diesel::update(task_completions)
            .filter(user_id.eq(self.user_id))
            .filter(task_id.eq(self.task_id))
            .set((points_assigned.eq(true), proof.eq(p_data)))
            .execute(conn)
            .await
    }
}
