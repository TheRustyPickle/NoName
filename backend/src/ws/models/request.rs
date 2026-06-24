use serde::Deserialize;
use serde_json::error::Error;

use crate::ws::models::{
    AuthPayload, BindWallet, FlappyData, SnakeData, TaskCheck, TelegramUser, TetrisData, Two048Data,
};

#[derive(Deserialize)]
#[serde(tag = "type")]
pub enum Request {
    Auth { data: AuthPayload },
    InitialPoints,
    Me,
    MeWithRankSocials,
    GetActivity,
    Tetris { data: TetrisData },
    TetrisEnd,
    Snake { data: SnakeData },
    SnakeEnd,
    Two048 { data: Two048Data },
    Two048End,
    Flappy { data: FlappyData },
    FlappyEnd,
    LeaderboardIn,
    LeaderboardOut,
    UsernameUpdate { data: String },
    SocialLinks,
    Telegram { data: TelegramUser },
    Tasks,
    CheckTask { data: TaskCheck },
    CheckReferral { data: String },
    BindWallet { data: BindWallet },
}

impl Request {
    pub fn from_json(json: &str) -> Result<Self, Error> {
        serde_json::from_str(json)
    }
}
