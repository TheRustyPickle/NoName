mod auth;
mod endpoints;
mod ws;

use actix_cors::Cors;
use actix_web::web::ServiceConfig;
use actix_web::{App, Error, HttpRequest, HttpResponse, HttpServer, Scope, http, web};
use dashmap::DashMap;
use db::{get_connection, get_redis_connection};
use log::LevelFilter;
use std::env::var;
use std::sync::{Arc, OnceLock};
use tokio::task::{spawn, spawn_local};
use web::{Data, Payload, resource};

use crate::auth::{clean_up_verifier_code, discord_callback, twitter_callback};
use crate::endpoints::{task_redirect, upload_avatar};
use crate::ws::server::{Server, ServerInterface, handler};

pub static JWT_SECRET: OnceLock<String> = OnceLock::new();
pub static REDIS_URL: OnceLock<String> = OnceLock::new();

pub static IMAGEKIT_PUBLIC: OnceLock<String> = OnceLock::new();
pub static IMAGEKIT_PRIVATE: OnceLock<String> = OnceLock::new();
pub static IMAGEKIT_URL: OnceLock<String> = OnceLock::new();

pub static TWITTER_REDIRECT: OnceLock<String> = OnceLock::new();
pub static TWITTER_CLIENT_ID: OnceLock<String> = OnceLock::new();
pub static TWITTER_CLIENT_SECRET: OnceLock<String> = OnceLock::new();

pub static DISCORD_CLIENT_ID: OnceLock<String> = OnceLock::new();
pub static DISCORD_CLIENT_SECRET: OnceLock<String> = OnceLock::new();
pub static DISCORD_REDIRECT_URI: OnceLock<String> = OnceLock::new();
pub static DISCORD_REDIRECT_FULL: OnceLock<String> = OnceLock::new();
pub static DISCORD_TOKEN: OnceLock<String> = OnceLock::new();

pub static TELEGRAM_REDIRECT: OnceLock<String> = OnceLock::new();
pub static TELEGRAM_TOKEN: OnceLock<String> = OnceLock::new();

pub static BACKEND_URL: OnceLock<String> = OnceLock::new();

#[derive(Clone, Debug)]
pub struct UserIpAgent {
    pub ip: String,
    pub user_agent: String,
}

async fn start_ws(
    req: HttpRequest,
    stream: Payload,
    handler: Data<ServerInterface>,
) -> Result<HttpResponse, Error> {
    let (response, session, msg_stream) = actix_ws::handle(&req, stream)?;

    let ip_local = req
        .peer_addr()
        .map_or_else(|| "unknown".to_string(), |addr| addr.ip().to_string());

    let user_agent = req
        .headers()
        .get("user-agent")
        .map(|v| v.to_str().unwrap_or_default())
        .unwrap_or_default()
        .to_string();

    let forwarded_ip = req
        .headers()
        .get("X-Forwarded-For")
        .map(|v| v.to_str().unwrap_or_default())
        .unwrap_or_default()
        .to_string();

    let ip = if forwarded_ip.is_empty() {
        ip_local
    } else {
        forwarded_ip
    };

    let user_ip_agent = UserIpAgent { ip, user_agent };

    spawn_local(handler::handle_ws(
        (**handler).clone(),
        session,
        msg_stream,
        user_ip_agent,
    ));
    Ok(response)
}

#[tokio::main]
async fn main() -> std::io::Result<()> {
    dotenvy::dotenv().ok();

    pretty_env_logger::formatted_timed_builder()
        .format_timestamp_millis()
        .filter_level(LevelFilter::Info)
        .filter_module("tracing::span", LevelFilter::Off)
        .filter_module("serenity", LevelFilter::Off)
        .init();

    let database_url = var("DATABASE_URL").expect("DATABASE_URL must be set");

    let jwt_secret = var("JWT_SECRET").expect("JWT_SECRET must be set");

    let redis_url = var("REDIS_URL").expect("REDIS_URL must be set");

    let imagekit_public = var("IMAGEKIT_PUBLIC").expect("IMAGEKIT_PUBLIC must be set");

    let imagekit_private = var("IMAGEKIT_PRIVATE").expect("IMAGEKIT_PRIVATE must be set");

    let imagekit_url = var("IMAGEKIT_URL").expect("IMAGEKIT_URL must be set");

    let twitter_redirect = var("TWITTER_REDIRECT").expect("TWITTER_REDIRECT must be set");

    let twitter_client_id = var("TWITTER_CLIENT_ID").expect("TWITTER_CLIENT_ID must be set");

    let twitter_client_secret =
        var("TWITTER_CLIENT_SECRET").expect("TWITTER_CLIENT_SECRET must be set");

    let discord_client_id = var("DISCORD_CLIENT_ID").expect("DISCORD_CLIENT_ID must be set");

    let discord_client_secret =
        var("DISCORD_CLIENT_SECRET").expect("DISCORD_CLIENT_SECRET must be set");

    let discord_redirect_full = var("DISCORD_REDIRECT_FULL").expect("DISCORD_REDIRECT must be set");

    let discord_redirect_uri = var("DISCORD_REDIRECT_URI").expect("DISCORD_REDIRECT must be set");

    let telegram_redirect = var("TELEGRAM_REDIRECT").expect("TELEGRAM_REDIRECT must be set");

    let telegram_token = var("TELEGRAM_TOKEN").expect("TELEGRAM_TOKEN must be set");

    let discord_token = var("DISCORD_TOKEN").expect("DISCORD_TOKEN must be set");

    let backend_url = var("BACKEND_URL").expect("BACKEND_URL must be set");

    JWT_SECRET
        .set(jwt_secret)
        .expect("JWT_SECRET must be set only once");

    REDIS_URL
        .set(redis_url.clone())
        .expect("REDIS_URL must be set only once");

    IMAGEKIT_PUBLIC
        .set(imagekit_public)
        .expect("IMAGEKIT_PUBLIC must be set only once");

    IMAGEKIT_PRIVATE
        .set(imagekit_private)
        .expect("IMAGEKIT_PRIVATE must be set only once");

    IMAGEKIT_URL
        .set(imagekit_url)
        .expect("IMAGEKIT_URL must be set only once");

    TWITTER_CLIENT_ID
        .set(twitter_client_id)
        .expect("TWITTER_CLIENT_ID must be set only once");

    TWITTER_CLIENT_SECRET
        .set(twitter_client_secret)
        .expect("TWITTER_CLIENT_SECRET must be set only once");

    TWITTER_REDIRECT
        .set(twitter_redirect)
        .expect("TWITTER_REDIRECT must be set only once");

    DISCORD_CLIENT_ID
        .set(discord_client_id)
        .expect("DISCORD_CLIENT_ID must be set only once");

    DISCORD_CLIENT_SECRET
        .set(discord_client_secret)
        .expect("DISCORD_CLIENT_SECRET must be set only once");

    DISCORD_REDIRECT_FULL
        .set(discord_redirect_full)
        .expect("DISCORD_REDIRECT_FULL must be set only once");

    DISCORD_REDIRECT_URI
        .set(discord_redirect_uri)
        .expect("DISCORD_REDIRECT_URI must be set only once");

    TELEGRAM_REDIRECT
        .set(telegram_redirect)
        .expect("TELEGRAM_REDIRECT must be set only once");

    TELEGRAM_TOKEN
        .set(telegram_token)
        .expect("TELEGRAM_TOKEN must be set only once");

    BACKEND_URL
        .set(backend_url)
        .expect("BACKEND_URL must be set only once");

    DISCORD_TOKEN
        .set(discord_token)
        .expect("DISCORD_TOKEN must be set only once");

    let verifier_list = Arc::new(DashMap::new());

    spawn(clean_up_verifier_code(verifier_list.clone()));

    let pool = get_connection(&database_url).await;
    let redis_conn = get_redis_connection(&redis_url).await;

    let (server, handler, cmd_rx) =
        Server::new(pool.clone(), redis_conn.clone(), verifier_list.clone());
    let server_clone = server.clone();

    spawn(server.run(cmd_rx));

    let handler_clone = handler.clone();
    let config = |cfg: &mut ServiceConfig| {
        let cors_conf = Cors::default()
            .allowed_origin_fn(|origin, _req_head| {
                matches!(
                    origin.to_str(),
                    Ok("http://localhost:3000"
                        | "https://origil.netlify.app"
                        | "http://127.0.0.1:3000")
                )
            })
            .allowed_methods(vec!["GET", "POST", "DELETE", "OPTIONS"])
            .allowed_headers(vec![
                http::header::AUTHORIZATION,
                http::header::CONTENT_TYPE,
            ])
            .supports_credentials()
            .max_age(3600);

        cfg.app_data(Data::new(handler_clone))
            .app_data(Data::new(server_clone))
            .app_data(Data::new(verifier_list))
            .app_data(Data::new(pool))
            .app_data(Data::new(redis_conn))
            .service(resource("/").route(web::get().to(start_ws)))
            .service(resource("/auth/twitter").route(web::get().to(twitter_callback)))
            .service(resource("/auth/discord").route(web::get().to(discord_callback)))
            .service(resource("/redirect").route(web::get().to(task_redirect)))
            .service(Scope::new("").wrap(cors_conf).service(upload_avatar));
    };

    HttpServer::new(move || App::new().configure(config.clone()))
        .bind(("127.0.0.1", 8000))?
        .run()
        .await
}
