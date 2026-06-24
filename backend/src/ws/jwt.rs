use anyhow::{Result, anyhow};
use chrono::{Duration, Utc};
use jsonwebtoken::errors::ErrorKind;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};

use crate::{JWT_SECRET, UserIpAgent, ws::models::Claims};

pub fn validate_token(token: &str, ip_agent: &UserIpAgent) -> Result<(Option<String>, Claims)> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(JWT_SECRET.get().unwrap().as_ref()),
        &Validation::default(),
    )
    .map_err(|err| match *err.kind() {
        ErrorKind::ExpiredSignature => anyhow!("JWT Token has expired"),
        _ => anyhow!("Error validating token: {err}"),
    })?;

    let claims = token_data.claims;

    if claims.ip != ip_agent.ip || claims.user_agent != ip_agent.user_agent {
        return Err(anyhow!(
            "IP or User-Agent mismatch. Expected: {}, {}, Got: {}, {}",
            claims.ip,
            claims.user_agent,
            ip_agent.ip,
            ip_agent.user_agent
        ));
    }

    let now = Utc::now().timestamp() as usize;
    let expiry_threshold = claims.exp.saturating_sub(now);

    // If expiry is in <1 day, renew token
    if expiry_threshold < 24 * 3600 {
        let new_token = issue_token(claims.sub.clone(), ip_agent)?;
        return Ok((Some(new_token), claims));
    }

    Ok((None, claims))
}

pub fn issue_token(user_id: String, ip_agent: &UserIpAgent) -> Result<String> {
    let now = Utc::now();
    let exp = now + Duration::days(2);

    let claims = Claims {
        sub: user_id,
        ip: ip_agent.ip.to_string(),
        user_agent: ip_agent.user_agent.to_string(),
        iat: now.timestamp() as usize,
        exp: exp.timestamp() as usize,
    };

    Ok(encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(JWT_SECRET.get().unwrap().as_ref()),
    )?)
}
