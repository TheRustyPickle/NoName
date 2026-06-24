use chrono::{DateTime, Utc};
use dashmap::DashMap;
use db::models::{
    Direction, FlappyScoreEvent, GameSession, GameType, Platform, SnakeFoodEvent, Task, TaskType,
    TetrisSnapshot, Two048MoveEvent, User, UserSocial,
};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, sync::Arc};
use ulid::Ulid;

use crate::BACKEND_URL;
use crate::auth::CodeVerifier;
use crate::ws::server::ConnId;
use crate::ws::validator::consts::{DEFAULT_BOARD, POINTS_PER_LINE};

#[derive(Deserialize, Serialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub ip: String,
    pub user_agent: String,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Serialize, Clone)]
pub struct UserWithRank {
    #[serde(flatten)]
    pub user: User,
    pub rank: i64,
}

#[derive(Serialize, Clone)]
pub struct UserWithRankSocials {
    #[serde(flatten)]
    pub user: UserWithRank,
    twitter: Option<String>,
    discord: Option<String>,
    telegram: Option<String>,
}

impl UserWithRankSocials {
    pub fn new(
        user: UserWithRank,
        twitter: Option<String>,
        discord: Option<String>,
        telegram: Option<String>,
    ) -> Self {
        Self {
            user,
            twitter,
            discord,
            telegram,
        }
    }
}

#[derive(Clone)]
pub struct UserWithSocials {
    pub user: User,
    pub twitter: Option<String>,
    pub twitter_id: Option<String>,
    pub discord: Option<String>,
    pub discord_id: Option<String>,
    pub telegram: Option<String>,
    pub telegram_id: Option<String>,
}

impl UserWithSocials {
    pub fn new(
        user: User,
        twitter: Option<String>,
        twitter_id: Option<String>,
        discord: Option<String>,
        discord_id: Option<String>,
        telegram: Option<String>,
        telegram_id: Option<String>,
    ) -> Self {
        Self {
            user,
            twitter,
            twitter_id,
            discord,
            discord_id,
            telegram,
            telegram_id,
        }
    }

    pub fn from_user_social(user: User, user_socials: Vec<UserSocial>) -> Self {
        let mut twitter = None;
        let mut discord = None;
        let mut telegram = None;
        let mut twitter_id = None;
        let mut discord_id = None;
        let mut telegram_id = None;

        for social in user_socials {
            match social.platform {
                Platform::Twitter => {
                    twitter = Some(social.platform_username);
                    twitter_id = Some(social.platform_user_id);
                }
                Platform::Discord => {
                    discord = Some(social.platform_username);
                    discord_id = Some(social.platform_user_id);
                }
                Platform::Telegram => {
                    telegram = Some(social.platform_username);
                    telegram_id = Some(social.platform_user_id);
                }
            }
        }

        UserWithSocials::new(
            user.clone(),
            twitter,
            twitter_id,
            discord,
            discord_id,
            telegram,
            telegram_id,
        )
    }
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct TetrisData {
    pub timestamp: DateTime<Utc>,
    pub prev_timestamp: DateTime<Utc>,
    pub points: i32,
    pub prev_points: i32,
    pub lines: i32,
    pub prev_lines: i32,
    pub level: i32,
    pub prev_level: i32,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct SnakeData {
    pub timestamp: DateTime<Utc>,
    pub prev_timestamp: DateTime<Utc>,
    pub points: i32,
    pub prev_points: i32,
    pub length: i32,
    pub prev_length: i32,
    pub level: i32,
    pub prev_level: i32,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct Two048Data {
    pub timestamp: DateTime<Utc>,
    pub prev_timestamp: DateTime<Utc>,
    pub board: Vec<Vec<i32>>,
    pub prev_board: Vec<Vec<i32>>,
    pub direction: Direction,
    pub points: i32,
    pub prev_points: i32,
    pub highest_number: i32,
    pub prev_highest_number: i32,
}

#[derive(Deserialize, Serialize, Clone, Debug)]
pub struct FlappyData {
    pub timestamp: DateTime<Utc>,
    pub prev_timestamp: DateTime<Utc>,
    pub points: i32,
    pub prev_points: i32,
    pub pipes: i32,
    pub prev_pipes: i32,
}

#[derive(Serialize, Clone)]
pub struct PartialGameSession {
    pub game_type: GameType,
    pub start_time: DateTime<Utc>,
    pub end_time: DateTime<Utc>,
    pub final_score: i32,
}

impl From<GameSession> for PartialGameSession {
    fn from(entry: GameSession) -> Self {
        PartialGameSession {
            game_type: entry.game,
            start_time: entry.start_time,
            end_time: entry.end_time,
            final_score: entry.final_score,
        }
    }
}

impl TetrisData {
    pub fn to_tetris_snapshot(
        &self,
        session_id: String,
        user_id: String,
        line_points: i32,
        drop_points: i32,
    ) -> TetrisSnapshot {
        TetrisSnapshot::new(
            session_id,
            user_id,
            self.timestamp,
            self.prev_timestamp,
            self.points,
            self.prev_points,
            self.lines,
            self.prev_lines,
            self.level,
            self.prev_level,
            line_points,
            drop_points,
        )
    }

    pub fn new() -> Self {
        let now = Utc::now();
        Self {
            timestamp: now,
            prev_timestamp: now,
            points: 0,
            lines: 0,
            level: 1,
            prev_points: 0,
            prev_lines: 0,
            prev_level: 1,
        }
    }

    pub fn from_snapshot(snapshot: &TetrisSnapshot) -> Self {
        Self {
            timestamp: snapshot.timestamp,
            prev_timestamp: snapshot.prev_timestamp,
            points: snapshot.points,
            prev_points: snapshot.prev_points,
            lines: snapshot.lines,
            prev_lines: snapshot.prev_lines,
            level: snapshot.level,
            prev_level: snapshot.prev_level,
        }
    }

    pub fn extract_points(&self) -> (i32, i32) {
        let lines_cleared = self.lines - self.prev_lines;
        let total_points_gained = self.points - self.prev_points;

        let level = if self.prev_level == self.level {
            self.level
        } else {
            self.prev_level
        };

        if lines_cleared > 0 {
            let points_index = std::cmp::min(lines_cleared as usize, POINTS_PER_LINE.len() - 1);
            let line_points = POINTS_PER_LINE[points_index] * level;
            let drop_points = total_points_gained - line_points;
            (line_points, drop_points)
        } else {
            (0, total_points_gained)
        }
    }
}

impl SnakeData {
    pub fn to_snake_event(&self, session_id: String, user_id: String) -> SnakeFoodEvent {
        SnakeFoodEvent::new(
            session_id,
            user_id,
            self.timestamp,
            self.prev_timestamp,
            self.points,
            self.prev_points,
            self.length,
            self.prev_length,
            self.level,
            self.prev_level,
        )
    }

    pub fn new() -> Self {
        let now = Utc::now();
        Self {
            timestamp: now,
            prev_timestamp: now,
            points: 0,
            prev_points: 0,
            length: 1,
            prev_length: 1,
            level: 1,
            prev_level: 1,
        }
    }

    pub fn from_food_event(event: &SnakeFoodEvent) -> Self {
        SnakeData {
            timestamp: event.timestamp,
            prev_timestamp: event.prev_timestamp,
            points: event.points,
            prev_points: event.prev_points,
            length: event.length,
            prev_length: event.prev_length,
            level: event.level,
            prev_level: event.prev_level,
        }
    }
}

impl Two048Data {
    pub fn new() -> Self {
        let board: Vec<Vec<i32>> = DEFAULT_BOARD.iter().map(|row| row.to_vec()).collect();
        let now = Utc::now();
        Self {
            timestamp: now,
            prev_timestamp: now,
            board: board.clone(),
            prev_board: board,
            direction: Direction::Up,
            highest_number: 0,
            prev_highest_number: 0,
            points: 0,
            prev_points: 0,
        }
    }
    pub fn to_two048_move_event(&self, session_id: String, user_id: String) -> Two048MoveEvent {
        Two048MoveEvent::new(
            session_id,
            user_id,
            self.timestamp,
            self.prev_timestamp,
            self.direction,
            self.points,
            self.prev_points,
            self.highest_number,
            self.prev_highest_number,
        )
    }
}

impl FlappyData {
    pub fn new() -> Self {
        let now = Utc::now();
        Self {
            timestamp: now,
            prev_timestamp: now,
            points: 0,
            prev_points: 0,
            pipes: 0,
            prev_pipes: 0,
        }
    }

    pub fn to_flappy_score_event(&self, session_id: String, user_id: String) -> FlappyScoreEvent {
        FlappyScoreEvent::new(
            session_id,
            user_id,
            self.timestamp,
            self.prev_timestamp,
            self.points,
            self.prev_points,
            self.pipes,
            self.prev_pipes,
        )
    }

    pub fn from_flappy_score_event(event: &FlappyScoreEvent) -> Self {
        Self {
            timestamp: event.timestamp,
            prev_timestamp: event.prev_timestamp,
            points: event.points,
            prev_points: event.prev_points,
            pipes: event.pipes,
            prev_pipes: event.prev_pipes,
        }
    }
}

#[derive(Deserialize)]
#[serde(untagged)]
pub enum AuthPayload {
    Signed {
        public_key: String,
        signature: String,
        chain: Chain,
    },
    Token {
        token: String,
    },
}

#[derive(Deserialize, Debug, Clone, Copy)]
pub enum Chain {
    Solana,
    Evm,
}

#[derive(Clone, Serialize)]
pub struct SocialLinks {
    pub discord: Option<String>,
    pub telegram: Option<String>,
    pub twitter: Option<String>,
}

impl SocialLinks {
    pub fn new() -> Self {
        Self {
            discord: None,
            telegram: None,
            twitter: None,
        }
    }
}

#[derive(Clone, Deserialize, Debug)]
pub struct TelegramUser {
    pub id: i64,
    pub first_name: String,
    pub last_name: Option<String>,
    pub username: Option<String>,
    pub photo_url: Option<String>,
    pub auth_date: i64,
    pub hash: String,
}

impl TelegramUser {
    pub fn key_value_map(&self) -> BTreeMap<String, String> {
        let mut map = BTreeMap::new();
        map.insert("id".to_string(), self.id.to_string());
        map.insert("first_name".to_string(), self.first_name.clone());

        if let Some(last_name) = &self.last_name {
            map.insert("last_name".to_string(), last_name.to_string());
        }

        if let Some(username) = &self.username {
            map.insert("username".to_string(), username.to_string());
        }

        if let Some(photo_url) = &self.photo_url {
            map.insert("photo_url".to_string(), photo_url.to_string());
        }

        map.insert("auth_date".to_string(), self.auth_date.to_string());
        map
    }

    pub fn name_to_use(&self) -> String {
        if let Some(username) = &self.username {
            username.to_string()
        } else {
            format!("{} {}", self.first_name, self.last_name.as_ref().unwrap())
                .trim()
                .to_string()
        }
    }
}

#[derive(Serialize, Clone)]
pub struct UserTask {
    #[serde(flatten)]
    pub task: MiniTask,
    pub completed: bool,
}

#[derive(Serialize, Clone)]
pub struct MiniTask {
    pub id: String,
    pub task_type: TaskType,
    created_at: DateTime<Utc>,
    ends_at: Option<DateTime<Utc>>,
    title: String,
    description: String,
    redirect_url: Option<String>,
    platform: Option<Platform>,
    reward_point: i32,
    proof_required: bool,
}

impl MiniTask {
    pub fn from_task(
        mut task: Task,
        conn_id: ConnId,
        code_list: &Arc<DashMap<String, CodeVerifier>>,
    ) -> Self {
        if let Some(url) = &task.redirect_url
            && url.contains(BACKEND_URL.get().unwrap())
        {
            let ulid = Ulid::new().to_string();
            let code_verifier = CodeVerifier {
                created_on: Utc::now(),
                lifetime: 60,
                code: String::new(),
                conn_id,
            };

            code_list.insert(ulid.clone(), code_verifier);

            task.redirect_url = Some(format!("{url}&state={ulid}"));
        }
        let proof_required = task.proof_required();

        Self {
            id: task.id,
            task_type: task.task_type,
            created_at: task.created_at,
            ends_at: task.ends_at,
            title: task.title,
            description: task.description,
            redirect_url: task.redirect_url,
            platform: task.platform,
            reward_point: task.reward_point,
            proof_required,
        }
    }
}

#[derive(Deserialize, Clone, Debug)]
pub struct TaskCheck {
    pub task_id: String,
    pub proof: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct BindWallet {
    pub chain: Chain,
    pub address: String,
    pub signature: String,
}
