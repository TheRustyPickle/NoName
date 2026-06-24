use diesel::dsl::exists;
use diesel::prelude::*;
use diesel::result::Error;
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use diesel_derive_enum::DbEnum;
use serde::{Deserialize, Serialize};

use crate::schema::user_socials;

pub const MAX_SOCIALS: i64 = 2;

#[derive(DbEnum, Debug, Clone, Copy, Serialize, Deserialize, Eq, PartialEq, Hash)]
#[db_enum(existing_type_path = "crate::schema::sql_types::Platform")]
pub enum Platform {
    Discord,
    Twitter,
    Telegram,
}

#[derive(Clone, Insertable, Queryable, Selectable, Identifiable, Serialize, Deserialize)]
#[diesel(primary_key(user_id, platform))]
pub struct UserSocial {
    pub user_id: String,
    pub platform: Platform,
    pub platform_user_id: String,
    pub platform_username: String,
}

impl UserSocial {
    #[must_use]
    pub fn new(
        user_id: String,
        platform: Platform,
        platform_user_id: String,
        platform_username: String,
    ) -> Self {
        Self {
            user_id,
            platform,
            platform_user_id,
            platform_username,
        }
    }

    pub async fn get_user_socials(
        conn: &mut AsyncPgConnection,
        u_id: &str,
    ) -> Result<Vec<Self>, Error> {
        use crate::schema::user_socials::dsl::{user_id, user_socials};

        user_socials.filter(user_id.eq(u_id)).load(conn).await
    }

    pub async fn insert(self, conn: &mut AsyncPgConnection) -> Result<usize, Error> {
        use crate::schema::user_socials::dsl::user_socials;

        diesel::insert_into(user_socials)
            .values(self)
            .execute(conn)
            .await
    }

    pub async fn already_used(&self, conn: &mut AsyncPgConnection) -> Result<bool, Error> {
        use crate::schema::user_socials::dsl::{platform, platform_user_id, user_socials};

        let exists_query = diesel::select(exists(
            user_socials
                .filter(platform_user_id.eq(self.platform_user_id.clone()))
                .filter(platform.eq(self.platform)),
        ));

        exists_query.get_result(conn).await
    }

    pub async fn get_user_by_platform(
        p_type: &Platform,
        p_id: &str,
        conn: &mut AsyncPgConnection,
    ) -> Result<Option<Self>, Error> {
        use crate::schema::user_socials::dsl::{platform, platform_user_id, user_socials};

        user_socials
            .filter(platform.eq(p_type))
            .filter(platform_user_id.eq(p_id))
            .select(Self::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn get_social_count(conn: &mut AsyncPgConnection, u_id: &str) -> Result<i64, Error> {
        use crate::schema::user_socials::dsl::{user_id, user_socials};

        user_socials
            .filter(user_id.eq(u_id))
            .count()
            .get_result(conn)
            .await
    }
}
