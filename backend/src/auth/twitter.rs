use actix_web::web::{self, Data};
use actix_web::{HttpResponse, Responder};
use anyhow::Result;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD;
use chrono::Utc;
use dashmap::DashMap;
use db::models::{Platform, UserSocial};
use diesel_async::AsyncPgConnection;
use diesel_async::pooled_connection::bb8::Pool;
use log::{error, info};
use redis::aio::ConnectionManager;
use reqwest::{Client, header};
use std::sync::Arc;
use url::form_urlencoded;

use crate::auth::{CodeVerifier, OAuthUrl, TokenResponse, TwitterUser};
use crate::ws::get_body_text;
use crate::ws::redis_ops::{USER_KEY, update_user_twitter};
use crate::ws::server::{ConnId, Server, ServerInterface};
use crate::{TWITTER_CLIENT_ID, TWITTER_CLIENT_SECRET, TWITTER_REDIRECT};

pub async fn twitter_callback(
    query: web::Query<serde_json::Value>,
    verifier_list: Data<Arc<DashMap<String, CodeVerifier>>>,
    conn: Data<Pool<AsyncPgConnection>>,
    redis_conn: Data<ConnectionManager>,
    server: Data<Server>,
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

        let twitter_profile = fetch_twitter_profile(code, &code_verifier.code).await;

        let profile = if let Err(e) = twitter_profile {
            error!("Failed to fetch twitter profile. Reason: {e}");
            return HttpResponse::BadRequest()
                .body(get_body_text("Failed to fetch twitter profile details"));
        } else {
            twitter_profile.unwrap()
        };

        info!(
            "Logged in for Twitter as {} {} {} for {}",
            profile.username, profile.id, profile.name, target_user
        );

        let Ok(mut conn) = conn.get().await else {
            return HttpResponse::InternalServerError()
                .body(get_body_text("Internal server error"));
        };

        let user_social = UserSocial::new(
            target_user.clone(),
            Platform::Twitter,
            profile.id.clone(),
            profile.username.clone(),
        );

        let Ok(already_used) = user_social.already_used(&mut conn).await else {
            return HttpResponse::InternalServerError()
                .body(get_body_text("Internal server error"));
        };

        if already_used {
            return HttpResponse::Conflict().body(
                "This Twitter is already linked with a different account. Please log in with a different Twitter account.",
            );
        }

        let result = user_social.insert(&mut conn).await;
        if let Err(e) = result {
            error!("Failed to set twitter info for user {target_user}. Reason: {e}");
            return HttpResponse::BadRequest().body(get_body_text("Failed to login with twitter"));
        }

        let mut conn = redis_conn.as_ref().clone();

        let user_key = format!("{USER_KEY}:{target_user}");

        if let Err(e) =
            update_user_twitter(&mut conn, &user_key, profile.username, profile.id).await
        {
            error!("Failed to update user twitter. Reason: {e}");
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

async fn fetch_twitter_profile(code: &str, code_verifier: &str) -> Result<TwitterUser> {
    let client_id = TWITTER_CLIENT_ID.get().unwrap();
    let client_secret = TWITTER_CLIENT_SECRET.get().unwrap();

    let client = Client::new();

    let credentials = format!("{client_id}:{client_secret}");
    let encoded = STANDARD.encode(credentials);
    let auth_header_value = format!("Basic {encoded}");

    let body = form_urlencoded::Serializer::new(String::new())
        .append_pair("code", code)
        .append_pair("grant_type", "authorization_code")
        .append_pair("redirect_uri", TWITTER_REDIRECT.get().unwrap())
        .append_pair("code_verifier", code_verifier)
        .finish();

    let token_response_raw = client
        .post("https://api.x.com/2/oauth2/token")
        .header(header::AUTHORIZATION, auth_header_value)
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .body(body)
        .send()
        .await?;

    let token_res: TokenResponse = token_response_raw.json().await?;

    let raw_user_res = client
        .get("https://api.twitter.com/2/users/me")
        .bearer_auth(&token_res.access_token)
        .send()
        .await?
        .error_for_status()?
        .json::<serde_json::Value>()
        .await?;

    let user: TwitterUser = serde_json::from_value(raw_user_res["data"].clone())?;

    Ok(user)
}

pub fn generate_twitter_oauth2_url(_state: &str, conn_id: ConnId) -> OAuthUrl {
    let now = Utc::now();

    let verifier = CodeVerifier {
        created_on: now,
        lifetime: 10,
        code: String::new(),
        conn_id,
    };

    OAuthUrl {
        url: String::new(),
        code_verifier: verifier,
    }
}
