use chrono::{DateTime, Utc};
use diesel::prelude::*;
use diesel::result::Error;
use diesel_async::{AsyncPgConnection, RunQueryDsl};

use crate::models::User;
use crate::schema::{referrals, users};

#[derive(Default, Clone, Insertable, Queryable, Selectable)]
pub struct Referral {
    referrer_id: String,
    referred_id: String,
    referred_at: DateTime<Utc>,
}

impl Referral {
    #[must_use]
    pub fn new(referrer_id: String, referred_id: String) -> Self {
        Self {
            referrer_id,
            referred_id,
            referred_at: Utc::now(),
        }
    }

    pub async fn insert(&self, conn: &mut AsyncPgConnection) -> Result<usize, Error> {
        use crate::schema::referrals::dsl::referrals;

        diesel::insert_into(referrals)
            .values(self)
            .execute(conn)
            .await
    }

    pub async fn get_referrer_by_referred_id(
        conn: &mut AsyncPgConnection,
        referred: &str,
    ) -> Result<User, Error> {
        use crate::schema::referrals::dsl::{referrals, referred_id, referrer_id};

        referrals
            .inner_join(users::table.on(users::user_id.eq(referrer_id)))
            .filter(referred_id.eq(referred))
            .select(User::as_select())
            .first(conn)
            .await
    }
}
