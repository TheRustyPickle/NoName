use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::result::Error;
use diesel_async::{AsyncPgConnection, RunQueryDsl};

use crate::schema::referral_rewards;

#[derive(Default, Clone, Insertable, Queryable, Selectable)]
pub struct ReferralReward<'a> {
    referrer_id: &'a str,
    referred_id: &'a str,
    session_id: &'a str,
    points_awarded: i32,
    awarded_at: DateTime<Utc>,
}

impl<'a> ReferralReward<'a> {
    #[must_use]
    pub fn new(
        referrer_id: &'a str,
        referred_id: &'a str,
        session_id: &'a str,
        points_awarded: i32,
    ) -> Self {
        Self {
            referrer_id,
            referred_id,
            session_id,
            points_awarded,
            awarded_at: Utc::now(),
        }
    }

    pub async fn insert(&self, conn: &mut AsyncPgConnection) -> Result<usize, Error> {
        use crate::schema::referral_rewards::dsl::referral_rewards;

        diesel::insert_into(referral_rewards)
            .values(self)
            .execute(conn)
            .await
    }
}
