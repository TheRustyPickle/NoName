use actix_multipart::Multipart;
use actix_web::http::header::{self, HeaderMap};
use actix_web::web::{self, Data};
use actix_web::{Error, HttpRequest, HttpResponse, error};
use anyhow::anyhow;
use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use dashmap::DashMap;
use db::models::{Task, TaskCompletion, TaskType, User};
use diesel_async::AsyncPgConnection;
use diesel_async::pooled_connection::bb8::Pool;
use futures_util::StreamExt;
use log::error;
use redis::aio::ConnectionManager;
use reqwest::Client;
use serde::Deserialize;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;
use tokio::task::spawn;
use tokio::time::sleep;

use crate::auth::CodeVerifier;
use crate::ws::delete_old_photo;
use crate::ws::jwt::validate_token;
use crate::ws::redis_ops::{
    USER_KEY, USER_TASK_KEY, get_task_details, mark_task_completed, update_user_photo,
};
use crate::ws::server::{ConnId, Server, ServerInterface};
use crate::{IMAGEKIT_PRIVATE, UserIpAgent};

const MAX_IMAGE_SIZE: usize = 5 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImageResponse {
    url: String,
    file_id: String,
}

pub async fn upload_avatar(
    mut payload: Multipart,
    req: HttpRequest,
    pool: Data<Pool<AsyncPgConnection>>,
    redis_conn: Data<ConnectionManager>,
) -> Result<HttpResponse, Error> {
    let token = extract_token(req.headers())
        .ok_or_else(|| error::ErrorUnauthorized("Missing or invalid Authorization header"))?;

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
        .split(',')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();

    let ip = if forwarded_ip.is_empty() {
        req.peer_addr()
            .map(|addr| addr.ip().to_string())
            .unwrap_or_default()
    } else {
        forwarded_ip
    };

    let user_ip_agent = UserIpAgent { ip, user_agent };

    let claims = validate_token(&token, &user_ip_agent).map_err(|e| {
        error!("Failed to validate token: {}", e);
        error::ErrorUnauthorized("Invalid or expired token. Please reload the site and try again")
    })?;

    let user_id = claims.1.sub;

    let mut image_bytes = Vec::new();
    let mut filename = format!("{user_id}.jpg");

    while let Some(field) = payload.next().await {
        let content_disposition = field.as_ref().unwrap().content_disposition().cloned();

        let mut field_chunk = field.map_err(error::ErrorInternalServerError)?;

        while let Some(chunk) = field_chunk.next().await {
            image_bytes.extend_from_slice(&chunk?);
            if image_bytes.len() > MAX_IMAGE_SIZE {
                error!("Image too large: {} bytes", image_bytes.len());
                return Ok(HttpResponse::BadRequest().body("Image too large"));
            }
        }

        if let Some(cd) = content_disposition
            && let Some(file) = cd.get_filename()
        {
            let ext = Path::new(file)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if ["jpg", "jpeg", "png", "gif"].contains(&ext.as_str()) {
                filename = format!("{user_id}.{ext}");
            } else {
                error!("Invalid file type: {}", ext);
                return Ok(HttpResponse::BadRequest()
                    .body("Only gif, jpg, png, and jpeg files are allowed"));
            }
        }
    }

    let encoded_image = STANDARD.encode(&image_bytes);
    let private_key = IMAGEKIT_PRIVATE.get().unwrap();
    let form = [
        ("file", encoded_image),
        ("fileName", filename),
        ("isPrivateFile", "false".into()),
    ];

    let res = Client::new()
        .post("https://upload.imagekit.io/api/v1/files/upload")
        .basic_auth(private_key, Some(""))
        .form(&form)
        .send()
        .await;

    if let Err(e) = res {
        error!("Failed to upload image. Reason: {}", e);
        return Err(error::ErrorInternalServerError("Failed to upload image"));
    }

    let resp: ImageResponse = res
        .unwrap()
        .json()
        .await
        .map_err(|_| error::ErrorInternalServerError("Failed to upload image"))?;

    let mut conn = pool.get().await.map_err(|e| {
        error!("Failed to get database connection: {}", e);
        error::ErrorInternalServerError("Database connection error")
    })?;

    let full_user = User::get_user(&mut conn, user_id).await.map_err(|e| {
        error!("Failed to get user: {}", e);
        error::ErrorInternalServerError("User not found")
    })?;

    User::update_photo_url(&mut conn, &resp.url, &resp.file_id, &full_user.user_id)
        .await
        .map_err(|e| {
            error!("Failed to update user photo URL: {}", e);
            error::ErrorInternalServerError("Failed to update user photo URL")
        })?;

    let user_key = format!("{USER_KEY}:{}", full_user.user_id);

    let mut conn = redis_conn.as_ref().clone();

    update_user_photo(&mut conn, &user_key, resp.url.clone())
        .await
        .map_err(|e| {
            error!("Failed to update user photo in Redis: {}", e);
            error::ErrorInternalServerError("Failed to update user photo in Redis")
        })?;

    delete_old_photo(full_user.photo_id).await.map_err(|e| {
        error!("Failed to delete old photo: {}", e);
        error::ErrorInternalServerError("Failed to delete old photo")
    })?;

    Ok(HttpResponse::Ok().json(serde_json::json!({ "url": resp.url })))
}

fn extract_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get("Authorization")?
        .to_str()
        .ok()?
        .strip_prefix("Bearer ")
        .map(str::to_string)
}

pub async fn task_redirect(
    query: web::Query<serde_json::Value>,
    conn: Data<Pool<AsyncPgConnection>>,
    redis_conn: Data<ConnectionManager>,
    server: Data<Server>,
    handler: Data<ServerInterface>,
    verifier_list: Data<Arc<DashMap<String, CodeVerifier>>>,
) -> Result<HttpResponse, Error> {
    let Some(task_id) = query.get("task_id").and_then(|c| c.as_str()) else {
        return Err(error::ErrorBadRequest("Redirect URL invalid"));
    };

    let Some(state) = query.get("state").and_then(|s| s.as_str()) else {
        return Err(error::ErrorBadRequest("Redirect URL invalid"));
    };

    let Some(code_verifier) = verifier_list.get(state) else {
        return Err(error::ErrorBadRequest(
            "This link has expired. Please go back, reload the page and try again",
        ));
    };

    let conn_id = code_verifier.conn_id;

    let mut redis_conn = redis_conn.as_ref().clone();

    let Ok(task_details) = get_task_details(&mut redis_conn, task_id).await else {
        return Err(error::ErrorBadRequest(
            "The task link has expired. Please go back, reload the page and try again",
        ));
    };

    let task = Task::from_json(&task_details);

    let Some(url) = task.completion_url.clone() else {
        return Err(error::ErrorBadRequest("There is no link to the task"));
    };

    spawn(async move {
        if let Err(e) =
            check_task_completion(conn_id, redis_conn, conn, server, handler, task).await
        {
            error!("Failed to check task completion: {}", e);
        }
    });

    Ok(HttpResponse::Found()
        .append_header((header::LOCATION, url))
        .finish())
}

async fn check_task_completion(
    conn_id: ConnId,
    mut redis_conn: ConnectionManager,
    conn: Data<Pool<AsyncPgConnection>>,
    server: Data<Server>,
    handler: Data<ServerInterface>,
    task: Task,
) -> anyhow::Result<()> {
    let mut mark_as_complete = false;

    match &task.task_type {
        TaskType::JoinDiscord | TaskType::JoinTelegram | TaskType::CheckDiscordPost => {}
        TaskType::FollowTwitter
        | TaskType::LikeTweet
        | TaskType::CreateTweet
        | TaskType::CheckTelegramPost
        | TaskType::RetweetPost => mark_as_complete = true,
    }

    let proof_required = task.proof_required();

    if mark_as_complete {
        let Some(user) = server.logged_in.get(&conn_id) else {
            return Err(anyhow!("{conn_id} not logged in"));
        };
        let mut conn = conn.get().await?;

        let task_completed =
            TaskCompletion::task_already_complete(&mut conn, &user.user_id, &task.id).await?;

        if !task_completed {
            let user_task_key = format!("{USER_TASK_KEY}:{}", user.user_id);
            TaskCompletion::new(&user.user_id, &task.id, !proof_required, None)
                .insert(&mut conn)
                .await?;

            if !proof_required {
                let mut server = server.as_ref().clone();
                server
                    .increase_point(task.reward_point, &user, false)
                    .await?;
                mark_task_completed(&mut redis_conn, &user_task_key, &task.id).await?;
            }

            sleep(Duration::from_secs(5)).await;
            handler.tasks(conn_id);
        }
    }
    Ok(())
}
