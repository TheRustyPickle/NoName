use db::models::User;
use serde::Serialize;

use crate::ws::models::{
    FlappyData, PartialGameSession, SnakeData, SocialLinks, TetrisData, Two048Data, UserTask,
    UserWithRankSocials,
};

#[derive(Serialize, Clone)]
pub struct WsResponse {
    pub status: Status,
    pub response: Option<Response>,
    pub error: Option<ErrorResponse>,
}

#[derive(Serialize, Clone)]
pub enum Status {
    Success,
    Error,
}

#[derive(Serialize, Clone)]
#[serde(tag = "type")]
pub enum Response {
    ConnectionStarted {
        data: Option<String>,
    },
    UpdatedPoints {
        points: i32,
    },
    Me {
        data: User,
    },
    #[serde(rename = "Me")]
    MeWithRankSocials {
        data: UserWithRankSocials,
    },
    GameSessions {
        data: Vec<PartialGameSession>,
    },
    Leaderboard {
        data: Vec<User>,
    },
    NewTetris {
        data: TetrisData,
    },
    NewSnake {
        data: SnakeData,
    },
    NewTwo048 {
        data: Two048Data,
    },
    NewFlappy {
        data: FlappyData,
    },
    SocialLinks {
        data: SocialLinks,
    },
    Tasks {
        data: Vec<UserTask>,
    },
    TaskCompleted {
        data: String,
    },
}

#[derive(Serialize, Clone)]
#[serde(tag = "type")]
pub enum ErrorResponse {
    InvalidSign,
    InvalidJWT,
    InternalError,
    NotLoggedIn,
    TelegramError { data: String },
    TaskNotCompleted { data: String },
    BadReferralCode,
    BindFailed { data: String },
}

impl WsResponse {
    pub fn success(response: Response) -> Self {
        Self {
            status: Status::Success,
            response: Some(response),
            error: None,
        }
    }

    pub fn error(error: ErrorResponse) -> Self {
        Self {
            status: Status::Error,
            response: None,
            error: Some(error),
        }
    }
    pub fn connection_started(data: Option<String>) -> Self {
        Self::success(Response::ConnectionStarted { data })
    }

    pub fn updated_points(points: i32) -> Self {
        Self::success(Response::UpdatedPoints { points })
    }

    pub fn me(data: User) -> Self {
        Self::success(Response::Me { data })
    }

    pub fn me_with_rank_socials(data: UserWithRankSocials) -> Self {
        Self::success(Response::MeWithRankSocials { data })
    }

    pub fn leaderboard(data: Vec<User>) -> Self {
        Self::success(Response::Leaderboard { data })
    }

    pub fn game_sessions(data: Vec<PartialGameSession>) -> Self {
        Self::success(Response::GameSessions { data })
    }

    pub fn new_tetris(data: TetrisData) -> Self {
        Self::success(Response::NewTetris { data })
    }

    pub fn new_flappy(data: FlappyData) -> Self {
        Self::success(Response::NewFlappy { data })
    }

    pub fn new_snake(data: SnakeData) -> Self {
        Self::success(Response::NewSnake { data })
    }

    pub fn new_two048(data: Two048Data) -> Self {
        Self::success(Response::NewTwo048 { data })
    }

    pub fn social_links(data: SocialLinks) -> Self {
        Self::success(Response::SocialLinks { data })
    }

    pub fn tasks(data: Vec<UserTask>) -> Self {
        Self::success(Response::Tasks { data })
    }

    pub fn task_completed(data: String) -> Self {
        Self::success(Response::TaskCompleted { data })
    }

    pub fn invalid_sign() -> Self {
        Self::error(ErrorResponse::InvalidSign)
    }

    pub fn internal_error() -> Self {
        Self::error(ErrorResponse::InternalError)
    }

    pub fn not_logged_in() -> Self {
        Self::error(ErrorResponse::NotLoggedIn)
    }

    pub fn invalid_jwt() -> Self {
        Self::error(ErrorResponse::InvalidJWT)
    }

    pub fn telegram_error(data: String) -> Self {
        Self::error(ErrorResponse::TelegramError { data })
    }

    pub fn task_not_completed(data: String) -> Self {
        Self::error(ErrorResponse::TaskNotCompleted { data })
    }

    pub fn bad_referral_code() -> Self {
        Self::error(ErrorResponse::BadReferralCode)
    }

    pub fn bind_failed(data: String) -> Self {
        Self::error(ErrorResponse::BindFailed { data })
    }

    #[must_use]
    pub fn json(&self) -> String {
        serde_json::to_string(self).unwrap()
    }
}
