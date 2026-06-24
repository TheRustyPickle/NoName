use chrono::{Duration, Utc};
use dashmap::DashMap;
use log::info;
use std::sync::Arc;

use crate::auth::CodeVerifier;
use crate::ws::sleep_remaining_time;

pub async fn clean_up_verifier_code(list: Arc<DashMap<String, CodeVerifier>>) {
    info!("Starting verifier code cleanup task");

    loop {
        sleep_remaining_time().await;

        let now = Utc::now();
        let mut to_be_removed = Vec::new();
        {
            for item in list.iter() {
                let timing = item.value().created_on;
                let lifetime = item.value().lifetime;
                if now > timing + Duration::minutes(lifetime.into()) {
                    to_be_removed.push(item.key().to_string());
                }
            }
        }

        if to_be_removed.is_empty() {
            continue;
        }

        for item in to_be_removed {
            list.remove(&item);
        }
    }
}
