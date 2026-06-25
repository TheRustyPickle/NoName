use chrono::{DateTime, Utc};
use serde::Deserialize;

use crate::ws::server::ConnId;

pub struct OAuthUrl {
    pub url: String,
    pub code_verifier: CodeVerifier,
}

pub struct CodeVerifier {
    pub created_on: DateTime<Utc>,
    pub lifetime: u8,
    #[allow(dead_code)]
    pub code: String,
    pub conn_id: ConnId,
}

#[derive(Deserialize)]
pub struct DiscordUser {
    pub id: String,
    pub username: String,
    pub global_name: Option<String>,
}

#[derive(Deserialize)]
pub struct TokenResponse {
    pub access_token: String,
}
