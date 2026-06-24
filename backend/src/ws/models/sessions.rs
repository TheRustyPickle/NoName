use anyhow::Result;
use chrono::{DateTime, Utc};
use db::models::{
    FlappyScoreEvent, GameSession, GameType, SnakeFoodEvent, TetrisSnapshot, Two048MoveEvent,
};
use diesel_async::AsyncPgConnection;
use log::error;

use crate::ws::models::Two048Data;

pub struct GameInProgress {
    session: GameSession,
    snapshots: Vec<GameEvent>,
}

#[derive(Clone, Debug)]
pub enum GameEvent {
    Tetris(TetrisSnapshot),
    Snake(SnakeFoodEvent),
    Two048(Two048Data),
    Flappy(FlappyScoreEvent),
}

impl GameEvent {
    pub fn timestamp(&self) -> DateTime<Utc> {
        match self {
            GameEvent::Tetris(s) => s.timestamp,
            GameEvent::Snake(s) => s.timestamp,
            GameEvent::Two048(s) => s.timestamp,
            GameEvent::Flappy(s) => s.timestamp,
        }
    }

    pub fn points(&self) -> i32 {
        match self {
            GameEvent::Tetris(s) => s.points,
            GameEvent::Snake(s) => s.points,
            GameEvent::Two048(s) => s.points,
            GameEvent::Flappy(s) => s.points,
        }
    }
}

fn filter_events<T, F>(events: Vec<GameEvent>, f: F) -> Vec<T>
where
    F: Fn(GameEvent) -> Option<T>,
{
    events.into_iter().filter_map(f).collect()
}

impl GameInProgress {
    pub fn new_tetris(user_id: String, start_time: DateTime<Utc>) -> Self {
        let session = GameSession::new(user_id, GameType::Tetris, start_time);

        Self {
            session,
            snapshots: Vec::new(),
        }
    }

    pub fn new_snake(user_id: String, start_time: DateTime<Utc>) -> Self {
        let session = GameSession::new(user_id, GameType::Snake, start_time);

        Self {
            session,
            snapshots: Vec::new(),
        }
    }

    pub fn new_two048(user_id: String, start_time: DateTime<Utc>) -> Self {
        let session = GameSession::new(user_id, GameType::Two048, start_time);

        Self {
            session,
            snapshots: Vec::new(),
        }
    }

    pub fn new_flappy(user_id: String, start_time: DateTime<Utc>) -> Self {
        let session = GameSession::new(user_id, GameType::Flappy, start_time);

        Self {
            session,
            snapshots: Vec::new(),
        }
    }

    pub fn push(&mut self, event: GameEvent) {
        if matches!(
            (self.session.game, &event),
            (GameType::Snake, GameEvent::Snake(_))
                | (GameType::Tetris, GameEvent::Tetris(_))
                | (GameType::Two048, GameEvent::Two048(_))
                | (GameType::Flappy, GameEvent::Flappy(_))
        ) {
            self.session.final_score = event.points();
            self.session.end_time = event.timestamp();
            self.snapshots.push(event);
        } else {
            error!(
                "GameInProgress::push called with invalid event. Game type: {:?}, game event type: {:?}",
                self.session.game, event
            );
        }
    }

    pub async fn commit_to_db(self, conn: &mut AsyncPgConnection) -> Result<GameSession> {
        let session = self.session.insert(conn).await?;
        match self.session.game {
            GameType::Tetris => {
                let snapshots = filter_events(self.snapshots, |e| match e {
                    GameEvent::Tetris(s) => Some(s),
                    _ => None,
                });
                TetrisSnapshot::insert_batch(conn, snapshots).await?;
            }
            GameType::Snake => {
                let snapshots = filter_events(self.snapshots, |e| match e {
                    GameEvent::Snake(s) => Some(s),
                    _ => None,
                });
                SnakeFoodEvent::insert_batch(conn, snapshots).await?;
            }
            GameType::Two048 => {
                let snapshots = filter_events(self.snapshots, |e| match e {
                    GameEvent::Two048(s) => Some(s.to_two048_move_event(
                        self.session.id.clone(),
                        self.session.user_id.clone(),
                    )),
                    _ => None,
                });
                Two048MoveEvent::insert_batch(conn, snapshots).await?;
            }
            GameType::Flappy => {
                let snapshots = filter_events(self.snapshots, |e| match e {
                    GameEvent::Flappy(s) => Some(s),
                    _ => None,
                });
                FlappyScoreEvent::insert_batch(conn, snapshots).await?;
            }
        }

        Ok(session)
    }

    pub fn get_session_id(&self) -> &str {
        &self.session.id
    }

    fn get_last_event(&self) -> Option<GameEvent> {
        self.snapshots.last().cloned()
    }

    pub fn get_last_tetris(&self) -> Option<TetrisSnapshot> {
        match self.get_last_event() {
            Some(GameEvent::Tetris(e)) => Some(e),
            None => None,
            other => {
                error!(
                    "Get last tetris was called but the state is not a tetris game. {:?} {other:?}",
                    self.session.game
                );
                None
            }
        }
    }

    pub fn get_last_snake(&self) -> Option<SnakeFoodEvent> {
        match self.get_last_event() {
            Some(GameEvent::Snake(e)) => Some(e),
            None => None,
            other => {
                error!(
                    "Get last snake was called but the state is not a snake game. {:?} {other:?}",
                    self.session.game
                );
                None
            }
        }
    }

    pub fn get_last_two048(&self) -> Option<Two048Data> {
        match self.get_last_event() {
            Some(GameEvent::Two048(e)) => Some(e),
            None => None,
            other => {
                error!(
                    "Get last two048 was called but the state is not a two048 game. {:?} {other:?}",
                    self.session.game
                );
                None
            }
        }
    }

    pub fn get_last_flappy(&self) -> Option<FlappyScoreEvent> {
        match self.get_last_event() {
            Some(GameEvent::Flappy(e)) => Some(e),
            None => None,
            other => {
                error!(
                    "Get last flappy was called but the state is not a flappy game. {:?} {:?}",
                    self.session.game, other
                );
                None
            }
        }
    }
}
