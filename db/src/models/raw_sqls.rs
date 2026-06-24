use diesel::deserialize::QueryableByName;
use diesel::prelude::*;
use diesel::result::Error;
use diesel::sql_types::{BigInt, Text};
use diesel_async::{AsyncPgConnection, RunQueryDsl};

#[derive(QueryableByName)]
struct UserRank {
    #[diesel(sql_type = BigInt)]
    rank: i64,
}

pub async fn get_user_rank(
    conn: &mut AsyncPgConnection,
    target_user_id: &str,
) -> Result<Option<i64>, Error> {
    let sql = r"
        WITH ranked_users AS (
            SELECT user_id, ROW_NUMBER() OVER (ORDER BY points DESC) AS rank
            FROM users
        )
        SELECT rank FROM ranked_users WHERE user_id = $1
    ";

    let result: Option<UserRank> = diesel::sql_query(sql)
        .bind::<Text, _>(target_user_id)
        .get_result(conn)
        .await
        .optional()?;

    Ok(result.map(|r| r.rank))
}
