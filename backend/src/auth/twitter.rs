use chrono::Utc;

use crate::auth::{CodeVerifier, OAuthUrl};
use crate::ws::server::ConnId;

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
