use anyhow::{Result, anyhow};
use hex::encode;
use hmac::{Hmac, KeyInit as _, Mac};
use log::error;
use sha2::{Digest, Sha256};

use crate::TELEGRAM_TOKEN;
use crate::ws::models::TelegramUser;

const MAX_DURATION: i64 = 60 * 60;

pub fn verify_hash(tg_user: &TelegramUser) -> Result<()> {
    let auth_time = tg_user.auth_date;
    let unix_time_now = chrono::Utc::now().timestamp();

    let bot_token = TELEGRAM_TOKEN.get().unwrap().as_bytes();
    let mut data_check_string = String::new();
    let query_hash = &tg_user.hash;

    let parsed_data = tg_user.key_value_map();

    for (index, parsed) in parsed_data.iter().enumerate() {
        data_check_string.push_str(&format!(
            "{}={}{}",
            parsed.0,
            parsed.1,
            if index == parsed_data.len() - 1 {
                ""
            } else {
                "\n"
            }
        ));
    }

    if auth_time < unix_time_now - MAX_DURATION {
        error!(
            "Auth time is too old. Current time: {} Auth Time: {} Difference: {} minutes",
            unix_time_now,
            auth_time,
            (unix_time_now - auth_time) / 60
        );
        return Err(anyhow!("Auth time is too old"));
    }

    let secret_key = Sha256::digest(bot_token);

    let mut imp_hmac = Hmac::<Sha256>::new_from_slice(&secret_key)?;
    imp_hmac.update(data_check_string.as_bytes());
    let imp_result = imp_hmac.finalize().into_bytes();

    let encoded_hash = encode(imp_result);

    if &encoded_hash != query_hash {
        return Err(anyhow!("Hashes do not match"));
    }

    Ok(())
}
