use chrono::{DateTime, Utc};
use diesel::dsl::exists;
use diesel::result::Error;
use diesel::{prelude::*, select};
use diesel_async::{AsyncPgConnection, RunQueryDsl};
use serde::Serialize;
use ulid::Ulid;

use crate::schema::users;

#[derive(Default, Clone, Insertable, Queryable, Selectable, Identifiable, Serialize)]
#[diesel(primary_key(user_id))]
pub struct User {
    pub joined_at: DateTime<Utc>,
    pub user_id: String,
    pub username: Option<String>,
    pub sol_wallet: Option<String>,
    pub evm_wallet: Option<String>,
    pub photo_url: String,
    pub photo_id: Option<String>,
    pub points: i32,
    pub referral_code: Option<String>,
}

impl User {
    #[must_use]
    pub fn new(
        username: Option<String>,
        sol_wallet: Option<String>,
        evm_wallet: Option<String>,
        photo_url: String,
    ) -> Self {
        let user_id = Ulid::new().to_string();
        let joined_at = Utc::now();

        Self {
            joined_at,
            user_id,
            username,
            sol_wallet,
            evm_wallet,
            photo_url,
            photo_id: None,
            points: 0,
            referral_code: None,
        }
    }

    #[must_use]
    #[allow(clippy::too_many_arguments)]
    pub fn new_full(
        joined_at: DateTime<Utc>,
        user_id: String,
        username: Option<String>,
        sol_wallet: Option<String>,
        evm_wallet: Option<String>,
        photo_url: String,
        points: i32,
        referral_code: Option<String>,
    ) -> Self {
        Self {
            joined_at,
            user_id,
            username,
            sol_wallet,
            evm_wallet,
            photo_url,
            photo_id: None,
            points,
            referral_code,
        }
    }

    pub async fn get_user(conn: &mut AsyncPgConnection, u_id: String) -> Result<Self, Error> {
        use crate::schema::users::dsl::{user_id, users};

        users
            .filter(user_id.eq(u_id))
            .select(Self::as_select())
            .first(conn)
            .await
    }

    pub async fn user_wallet_sol_exists(
        conn: &mut AsyncPgConnection,
        wallet: &str,
    ) -> Result<bool, Error> {
        use crate::schema::users::dsl::{sol_wallet, users};

        let exists = select(exists(users.filter(sol_wallet.eq(wallet))))
            .get_result(conn)
            .await?;

        Ok(exists)
    }
    pub async fn user_wallet_evm_exists(
        conn: &mut AsyncPgConnection,
        wallet: &str,
    ) -> Result<bool, Error> {
        use crate::schema::users::dsl::{evm_wallet, users};

        let exists = select(exists(users.filter(evm_wallet.eq(wallet))))
            .get_result(conn)
            .await?;

        Ok(exists)
    }

    pub async fn insert_sol(self, conn: &mut AsyncPgConnection) -> Result<Self, Error> {
        use crate::schema::users::dsl::{sol_wallet, users};

        diesel::insert_into(users)
            .values(self.clone())
            .on_conflict(sol_wallet)
            .do_update()
            .set((sol_wallet.eq(self.sol_wallet),))
            .returning(Self::as_returning())
            .get_result(conn)
            .await
    }

    pub async fn insert_evm(self, conn: &mut AsyncPgConnection) -> Result<Self, Error> {
        use crate::schema::users::dsl::{evm_wallet, users};

        diesel::insert_into(users)
            .values(self.clone())
            .on_conflict(evm_wallet)
            .do_update()
            .set((evm_wallet.eq(self.evm_wallet),))
            .returning(Self::as_returning())
            .get_result(conn)
            .await
    }

    pub async fn insert_or_update(self, conn: &mut AsyncPgConnection) -> Result<Self, Error> {
        use crate::schema::users::dsl::{photo_url, user_id, username, users};

        diesel::insert_into(users)
            .values(self.clone())
            .on_conflict(user_id)
            .do_update()
            .set((username.eq(self.username), photo_url.eq(self.photo_url)))
            .returning(Self::as_returning())
            .get_result(conn)
            .await
    }

    pub async fn update_username(
        conn: &mut AsyncPgConnection,
        u_id: &str,
        new_username: String,
    ) -> Result<usize, Error> {
        use crate::schema::users::dsl::{user_id, username, users};

        diesel::update(users.filter(user_id.eq(u_id)))
            .set(username.eq(new_username))
            .execute(conn)
            .await
    }

    pub async fn update_photo_url(
        conn: &mut AsyncPgConnection,
        p_url: &str,
        p_id: &str,
        u_id: &str,
    ) -> Result<usize, Error> {
        use crate::schema::users::dsl::{photo_id, photo_url, user_id, users};

        diesel::update(users.filter(user_id.eq(u_id)))
            .set((photo_url.eq(p_url), (photo_id.eq(p_id))))
            .execute(conn)
            .await
    }

    pub async fn increase_points(
        conn: &mut AsyncPgConnection,
        u_id: &str,
        to_add: i32,
    ) -> Result<Self, Error> {
        use crate::schema::users::dsl::{points, user_id, users};

        diesel::update(users.filter(user_id.eq(u_id)))
            .set(points.eq(points + to_add))
            .returning(Self::as_returning())
            .get_result(conn)
            .await
    }

    pub async fn set_points(
        conn: &mut AsyncPgConnection,
        u_id: &str,
        new_points: i32,
    ) -> Result<Self, Error> {
        use crate::schema::users::dsl::{points, user_id, users};

        diesel::update(users.filter(user_id.eq(u_id)))
            .set(points.eq(new_points))
            .returning(Self::as_returning())
            .get_result(conn)
            .await
    }

    pub async fn get_leaderboard(
        conn: &mut AsyncPgConnection,
        limit: i64,
    ) -> Result<Vec<Self>, Error> {
        use crate::schema::users::dsl::{points, users};

        users
            .filter(points.gt(0))
            .order(points.desc())
            .limit(limit)
            .select(Self::as_select())
            .load(conn)
            .await
    }

    pub async fn set_referral_code(
        conn: &mut AsyncPgConnection,
        u_id: &str,
        code: &str,
    ) -> Result<usize, Error> {
        use crate::schema::users::dsl::{referral_code, user_id, users};

        diesel::update(users.filter(user_id.eq(u_id)))
            .set(referral_code.eq(code))
            .execute(conn)
            .await
    }

    pub async fn get_by_referral_code(
        conn: &mut AsyncPgConnection,
        code: &str,
    ) -> Result<Option<Self>, Error> {
        use crate::schema::users::dsl::{referral_code, users};

        users
            .filter(referral_code.eq(code))
            .select(Self::as_select())
            .first(conn)
            .await
            .optional()
    }

    pub async fn set_sol_wallet(
        conn: &mut AsyncPgConnection,
        u_id: &str,
        wallet: &str,
    ) -> Result<usize, Error> {
        use crate::schema::users::dsl::{sol_wallet, user_id, users};

        diesel::update(users.filter(user_id.eq(u_id)))
            .set(sol_wallet.eq(wallet))
            .execute(conn)
            .await
    }

    pub async fn set_evm_wallet(
        conn: &mut AsyncPgConnection,
        u_id: &str,
        wallet: &str,
    ) -> Result<usize, Error> {
        use crate::schema::users::dsl::{evm_wallet, user_id, users};

        diesel::update(users.filter(user_id.eq(u_id)))
            .set(evm_wallet.eq(wallet))
            .execute(conn)
            .await
    }
}
