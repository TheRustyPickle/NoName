use alloy_core::primitives::{Address, Signature as SignatureAlloy};
use anyhow::{Result, anyhow};
use chrono::{Timelike, Utc};
use db::get_redis_pubsub;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use rand::RngExt as _;
use rand::distr::Alphanumeric;
use redis::PushInfo;
use redis::aio::ConnectionManager;
use reqwest::Client;
use std::{str, time::Duration};
use tokio::{sync::mpsc::UnboundedSender, time::sleep};

use crate::IMAGEKIT_PRIVATE;
use crate::ws::redis_ops::{DISCONNECTED_SUB, LEADERBOARD_SUB};

pub fn verify_signature_solana(public_key: &str, signature: &str) -> Result<()> {
    let message = craft_sign_message(public_key);

    let pubkey_bytes_vec = bs58::decode(public_key).into_vec()?;

    let pubkey_bytes = pubkey_bytes_vec
        .try_into()
        .map_err(|_| anyhow!("Failed to convert public key bytes"))?;

    let signature_bytes_vec = bs58::decode(signature)
        .into_vec()
        .map_err(|_| anyhow!("Failed to decode signature from base58"))?;

    let signature_bytes = signature_bytes_vec
        .try_into()
        .map_err(|_| anyhow!("Failed to convert signature bytes"))?;

    let signature = Signature::from_bytes(&signature_bytes);

    let verifying_key = VerifyingKey::from_bytes(&pubkey_bytes)?;

    verifying_key.verify(message.as_bytes(), &signature)?;

    Ok(())
}

pub fn verify_signature_evm(public_key: &str, signature: &str) -> Result<()> {
    let message = craft_sign_message(public_key);

    let signer = Address::parse_checksummed(public_key, None);

    let address = if let Ok(a) = signer {
        a
    } else {
        let addr_bytes = hex::decode(public_key.trim_start_matches("0x"))?;

        if addr_bytes.len() != 20 {
            return Err(anyhow!("address must be 20 bytes"));
        }
        let mut arr = [0u8; 20];
        arr.copy_from_slice(&addr_bytes);
        Address::new(arr)
    };

    let sig_bytes = hex::decode(signature.trim_start_matches("0x"))?;
    let signature = SignatureAlloy::try_from(sig_bytes.as_slice())?;

    let recovered = signature.recover_address_from_msg(message.as_bytes())?;

    if address != recovered {
        return Err(anyhow!("Invalid signature"));
    }

    Ok(())
}

pub async fn get_pubsub_conn(
    redis_url: &str,
    sender: UnboundedSender<PushInfo>,
) -> ConnectionManager {
    let mut pubsub = get_redis_pubsub(redis_url, sender).await;

    pubsub
        .subscribe(&[DISCONNECTED_SUB, LEADERBOARD_SUB])
        .await
        .expect("Failed to subscribe to Redis pubsub channels");
    pubsub
}

pub fn random_photo_url(seed: &str) -> String {
    format!("https://api.dicebear.com/9.x/identicon/png?seed={seed}")
}

pub async fn delete_old_photo(old_id: Option<String>) -> Result<()> {
    let Some(photo_id) = old_id else {
        return Ok(());
    };

    let client = Client::new();
    let url = format!("https://api.imagekit.io/v1/files/{photo_id}");

    let private_key = IMAGEKIT_PRIVATE.get().unwrap();

    let res = client
        .delete(&url)
        .basic_auth(private_key, Some(""))
        .send()
        .await?;

    if res.status().is_success() {
        Ok(())
    } else {
        Err(anyhow!("Failed to delete old photo: {}", res.status()))
    }
}

pub async fn sleep_remaining_time() {
    let now = Utc::now();
    let seconds_remaining = u64::from(60 - now.second());
    sleep(Duration::from_secs(seconds_remaining)).await;
}

pub fn get_body_text(initial: &str) -> String {
    format!(
        "{initial}. Please go back to the website and reload the page. If it persists, please try again after 24 hours"
    )
}

pub fn extract_ids_from_message_url(message_url: &str) -> Option<(u64, u64, u64)> {
    let path = message_url.strip_prefix("https://discord.com/channels/")?;
    let mut id_chunks = path.split('/');

    let guild_id = id_chunks.next()?.parse::<u64>().ok()?;
    let channel_id = id_chunks.next()?.parse::<u64>().ok()?;
    let message_id = id_chunks.next()?.parse::<u64>().ok()?;

    Some((guild_id, channel_id, message_id))
}

pub fn generate_referral_code() -> String {
    rand::rng()
        .sample_iter(&Alphanumeric)
        .take(8)
        .map(char::from)
        .collect::<String>()
        .to_uppercase()
}

pub fn craft_sign_message(key: &str) -> String {
    format!("Welcome to Origil. Sign this message to continue. Signing with: {key}")
}
