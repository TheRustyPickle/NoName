use actix_web::web::{self, Data};
use actix_web::{HttpResponse, Responder};
use anyhow::{Context as _, Result};
use chrono::Utc;
use dashmap::DashMap;
use db::models::{Platform, UserSocial};
use diesel_async::AsyncPgConnection;
use diesel_async::pooled_connection::bb8::Pool;
use log::{error, info};
use redis::aio::ConnectionManager;
use reqwest::Client;
use std::collections::HashMap;
use std::sync::Arc;

use crate::auth::{CodeVerifier, DiscordUser, OAuthUrl, TokenResponse};
use crate::ws::get_body_text;
use crate::ws::redis_ops::{USER_KEY, update_user_discord};
use crate::ws::server::{ConnId, Server, ServerInterface};
use crate::{
    DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_FULL, DISCORD_REDIRECT_URI,
};

pub async fn discord_callback(
    query: web::Query<serde_json::Value>,
    verifier_list: Data<Arc<DashMap<String, CodeVerifier>>>,
    conn: Data<Pool<AsyncPgConnection>>,
    redis_conn: Data<ConnectionManager>,
    server: web::Data<Server>,
    handler: Data<ServerInterface>,
) -> impl Responder {
    let Some(code) = query.get("code").and_then(|c| c.as_str()) else {
        return HttpResponse::BadRequest().body(get_body_text("Missing 'code' parameter"));
    };

    let Some(state) = query.get("state").and_then(|s| s.as_str()) else {
        return HttpResponse::BadRequest().body(get_body_text("Missing 'state' parameter"));
    };

    let conn_id;

    {
        let Some(code_verifier) = verifier_list.get(state) else {
            return HttpResponse::BadRequest()
                .body(get_body_text("The link used to log in has expired"));
        };

        conn_id = code_verifier.conn_id;

        let Some(target_user) = server
            .logged_in
            .get(&conn_id)
            .map(|entry| entry.value().user_id.clone())
        else {
            return HttpResponse::BadRequest().body(get_body_text("Connection not found"));
        };

        let discord_profile = fetch_discord_profile(code).await;

        let profile = if let Err(e) = discord_profile {
            error!("Failed to fetch discord profile. Reason: {e}");
            return HttpResponse::BadRequest()
                .body(get_body_text("Failed to fetch discord profile details"));
        } else {
            discord_profile.unwrap()
        };

        info!(
            "Logged in for Discord as {} {} {:?} for {}",
            profile.username, profile.id, profile.global_name, target_user
        );

        let Ok(mut conn) = conn.get().await else {
            return HttpResponse::InternalServerError()
                .body(get_body_text("Internal server error"));
        };

        let user_social = UserSocial::new(
            target_user.clone(),
            Platform::Discord,
            profile.id.clone(),
            profile.username.clone(),
        );

        let Ok(already_used) = user_social.already_used(&mut conn).await else {
            return HttpResponse::InternalServerError()
                .body(get_body_text("Internal server error"));
        };

        if already_used {
            return HttpResponse::Conflict().body(
                "This Discord is already linked with a different account. Please log in with a different Discord account.",
            );
        }

        let result = user_social.insert(&mut conn).await;
        if let Err(e) = result {
            error!("Failed to set discord info for user {target_user}. Reason: {e}");
            return HttpResponse::BadRequest().body(get_body_text("Failed to login with discord"));
        }

        let mut conn = redis_conn.as_ref().clone();

        let user_key = format!("{USER_KEY}:{target_user}");

        if let Err(e) =
            update_user_discord(&mut conn, &user_key, profile.username, profile.id).await
        {
            error!("Failed to update user discord. Reason: {e}");
            return HttpResponse::InternalServerError()
                .body(get_body_text("Internal server error"));
        }
    }

    verifier_list.remove(state);
    handler.me_with_rank_socials(conn_id);

    HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(
            r"
            <!DOCTYPE html>
            <html>
            <head>
                <title>Login Complete</title>
                <script>
                    // Attempt to close the tab
                    window.close();
                </script>
            </head>
            <body>
                <h1>Login successful!</h1>
                <p>You can close this tab now.</p>
            </body>
            </html>
        ",
        )
}

async fn fetch_discord_profile(code: &str) -> Result<DiscordUser> {
    let token_url = "https://discord.com/api/oauth2/token";
    let client = Client::new();

    let params = {
        let mut map = HashMap::new();
        map.insert("client_id", DISCORD_CLIENT_ID.get().unwrap().to_string());
        map.insert(
            "client_secret",
            DISCORD_CLIENT_SECRET.get().unwrap().to_string(),
        );
        map.insert("grant_type", "authorization_code".to_string());
        map.insert("code", code.to_string());
        map.insert(
            "redirect_uri",
            DISCORD_REDIRECT_URI.get().unwrap().to_string(),
        );
        map
    };

    let token_response: TokenResponse = client
        .post(token_url)
        .form(&params)
        .send()
        .await
        .context("Failed to fetch discord token")?
        .json()
        .await
        .context("Failed to parse discord token")?;

    let user_url = "https://discord.com/api/users/@me";

    let user_details: DiscordUser = client
        .get(user_url)
        .bearer_auth(&token_response.access_token)
        .send()
        .await
        .context("Failed to fetch discord user details")?
        .json()
        .await
        .context("Failed to parse discord user details")?;

    Ok(user_details)
}

pub fn generate_discord_oauth2_url(state: &str, conn_id: ConnId) -> OAuthUrl {
    let url = format!("{}&state={state}", DISCORD_REDIRECT_FULL.get().unwrap());

    let now = Utc::now();

    let verifier = CodeVerifier {
        created_on: now,
        lifetime: 10,
        code: String::new(),
        conn_id,
    };

    OAuthUrl {
        url,
        code_verifier: verifier,
    }
}
