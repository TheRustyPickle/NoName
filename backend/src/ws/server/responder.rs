use dashmap::{DashMap, DashSet};
use db::models::User;
use diesel_async::AsyncPgConnection;
use diesel_async::pooled_connection::bb8::Pool;
use log::error;
use mpsc::{UnboundedReceiver, UnboundedSender};
use redis::AsyncCommands;
use redis::aio::ConnectionManager;
use std::io;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot};
use tokio::time::{Duration, sleep};

use crate::UserIpAgent;
use crate::auth::CodeVerifier;
use crate::ws::models::{
    BindWallet, Chain, FlappyData, GameInProgress, SnakeData, TaskCheck, TelegramUser, TetrisData,
    Two048Data, WsResponse,
};
use crate::ws::server::ServerInterface;

pub type ConnId = u64;

#[derive(Clone)]
pub struct Server {
    pub sessions: Arc<DashMap<ConnId, UnboundedSender<String>>>,
    pub logged_in: Arc<DashMap<ConnId, User>>,
    pub subscribed: Arc<DashSet<ConnId>>,
    pub pool: Pool<AsyncPgConnection>,
    pub active_client: Arc<DashMap<String, u32>>,
    pub game_sessions: Arc<DashMap<ConnId, GameInProgress>>,
    pub two048_queue: Arc<DashMap<u64, UnboundedSender<Two048Data>>>,
    pub redis: ConnectionManager,
    pub code_verifiers: Arc<DashMap<String, CodeVerifier>>,
}

#[derive(Debug)]
pub struct Command {
    pub conn_id: ConnId,
    pub work: Work,
}

impl Command {
    fn no_check(&self) -> bool {
        matches!(
            self.work,
            Work::Auth {
                public_key: _,
                signature: _,
                chain: _,
                ip_agent: _,
            } | Work::Connect {
                conn_tx: _,
                sender: _,
            } | Work::Disconnect
                | Work::AuthToken {
                    ip_agent: _,
                    token: _
                }
        )
    }
}

#[derive(Debug)]
pub enum Work {
    Connect {
        conn_tx: UnboundedSender<String>,
        sender: oneshot::Sender<ConnId>,
    },
    Disconnect,
    Auth {
        public_key: String,
        signature: String,
        chain: Chain,
        ip_agent: UserIpAgent,
    },
    AuthToken {
        token: String,
        ip_agent: UserIpAgent,
    },
    Me,
    MeWithRankSocials,
    GetActivity,
    Tetris {
        data: TetrisData,
    },
    TetrisEnd,
    Snake {
        data: SnakeData,
    },
    SnakeEnd,
    Two048 {
        data: Two048Data,
    },
    Two048End,
    Flappy {
        data: FlappyData,
    },
    FlappyEnd,
    LeaderboardIn,
    LeaderboardOut,
    InitialPoints,
    UsernameUpdate {
        data: String,
    },
    SocialLinks,
    Telegram {
        data: TelegramUser,
    },
    Tasks,
    CheckTask {
        data: TaskCheck,
    },
    CheckReferralStatus {
        referral_code: String,
    },
    BindWallet {
        data: BindWallet,
    },
}

impl Server {
    pub fn new(
        pool: Pool<AsyncPgConnection>,
        redis: ConnectionManager,
        code_verifiers: Arc<DashMap<String, CodeVerifier>>,
    ) -> (Self, ServerInterface, UnboundedReceiver<Command>) {
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
        (
            Self {
                sessions: Arc::new(DashMap::new()),
                logged_in: Arc::new(DashMap::new()),
                subscribed: Arc::new(DashSet::new()),
                active_client: Arc::new(DashMap::new()),
                game_sessions: Arc::new(DashMap::new()),
                two048_queue: Arc::new(DashMap::new()),
                pool,
                redis,
                code_verifiers,
            },
            ServerInterface { cmd_tx },
            cmd_rx,
        )
    }

    fn ping_redis(&self) {
        let mut self_clone = self.clone();
        tokio::spawn(async move {
            loop {
                if let Err(e) = self_clone.redis.ping::<()>().await {
                    error!("Error pinging redis: {:?}", e);
                }
                sleep(Duration::from_secs(60)).await;
            }
        });
    }

    pub async fn run(mut self, mut cmd_rx: UnboundedReceiver<Command>) -> io::Result<()> {
        let self_clone = self.clone();

        self.ping_redis();
        self.initialize().await;

        tokio::spawn(self_clone.clone().handle_tg_join());
        tokio::spawn(self_clone.clone().handle_discord_join());

        tokio::spawn(self_clone.subscribe_for_updates());

        while let Some(cmd) = cmd_rx.recv().await {
            let self_clone = self.clone();
            tokio::spawn(self_clone.handle_command(cmd));
        }

        Ok(())
    }

    pub async fn handle_command(mut self, command: Command) {
        let conn_id = command.conn_id;

        if !command.no_check()
            && !self.logged_in.contains_key(&conn_id)
            && let Some(tx) = self.sessions.get(&conn_id)
        {
            let _ = tx.send(WsResponse::not_logged_in().json());
            return;
        }

        let work_string = format!("{:?}", command.work);

        log::info!("Handling work: {}", work_string);

        let response = match command.work {
            Work::Connect { conn_tx, sender } => {
                let conn_id = self.connect(conn_tx);
                let _ = sender.send(conn_id);
                None
            }
            Work::Disconnect => {
                self.disconnect(conn_id).await;
                None
            }
            Work::Auth {
                public_key,
                signature,
                chain,
                ip_agent,
            } => Some(
                self.start_connection(conn_id, public_key, signature, chain, ip_agent)
                    .await,
            ),
            Work::AuthToken { token, ip_agent } => {
                Some(self.start_connection_token(conn_id, token, ip_agent).await)
            }
            Work::Me => Some(self.get_me(conn_id).await),
            Work::MeWithRankSocials => Some(self.get_me_with_rank_socials(conn_id).await),
            Work::GetActivity => Some(self.get_user_activity(conn_id).await),
            Work::Tetris { data } => {
                if let Err(e) = self.tetris(conn_id, data).await {
                    error!("Error handling tetris move. Reason: {:?}", e);
                }
                None
            }
            Work::TetrisEnd => {
                if let Err(e) = self.commit_to_db(conn_id).await {
                    error!("Error committing tetris session to db. Reason: {:?}", e);
                }
                None
            }
            Work::Snake { data } => {
                if let Err(e) = self.snake(conn_id, data).await {
                    error!("Error handling snake move. Reason: {:?}", e);
                }
                None
            }
            Work::SnakeEnd => {
                if let Err(e) = self.commit_to_db(conn_id).await {
                    error!("Error committing snake session to db. Reason: {:?}", e);
                }
                None
            }
            Work::Two048 { data } => {
                if let Some(sender) = self.two048_queue.get(&conn_id) {
                    sender.send(data).unwrap();
                } else {
                    let (sender, receiver) = mpsc::unbounded_channel();
                    self.two048_queue.insert(conn_id, sender.clone());
                    let self_clone = self.clone();
                    tokio::spawn(self_clone.two048_queue(conn_id, receiver));
                    sender.send(data).unwrap();
                }
                None
            }
            Work::Two048End => {
                if let Err(e) = self.commit_to_db(conn_id).await {
                    error!("Error committing 2048 session to db. Reason: {:?}", e);
                }
                self.two048_queue.remove(&conn_id);

                None
            }
            Work::Flappy { data } => {
                if let Err(e) = self.flappy(conn_id, data).await {
                    error!("Error handling flappy move. Reason: {:?}", e);
                }
                None
            }
            Work::FlappyEnd => {
                if let Err(e) = self.commit_to_db(conn_id).await {
                    error!("Error committing Flappy session to db. Reason: {:?}", e);
                }
                None
            }
            Work::LeaderboardIn => Some(self.leaderboard_in(conn_id).await),
            Work::LeaderboardOut => {
                self.subscribed.remove(&conn_id);
                None
            }
            Work::InitialPoints => Some(self.initial_points(conn_id).await),
            Work::UsernameUpdate { data } => {
                if let Err(e) = self.update_username(conn_id, data).await {
                    error!("Error updating username. Reason: {:?}", e);
                }
                None
            }
            Work::SocialLinks => Some(self.social_links(conn_id).await),
            Work::Telegram { data } => Some(self.telegram(conn_id, data).await),
            Work::Tasks => Some(self.tasks(conn_id).await),
            Work::CheckTask { data } => {
                let result = self.check_task(conn_id, data).await;
                if let Err(e) = result {
                    error!("Error checking task. Reason: {:?}", e);

                    Some(Ok(WsResponse::task_not_completed(
                        "We could not verify the task. Please try again and follow the steps"
                            .to_string(),
                    )))
                } else {
                    Some(result)
                }
            }
            Work::CheckReferralStatus { referral_code } => {
                let result = self.check_referral_status(conn_id, referral_code).await;

                match result {
                    Ok(Some(response)) => Some(Ok(response)),
                    Ok(None) => None,
                    Err(e) => {
                        error!("Error checking referral status. Reason: {:?}", e);
                        None
                    }
                }
            }
            Work::BindWallet { data } => Some(self.bind_wallet(conn_id, data).await),
        };

        if let Some(response) = response {
            let to_send = match response {
                Ok(response) => response.json(),
                Err(err) => {
                    error!("Error while handling command {}: {err}", work_string);
                    WsResponse::internal_error().json()
                }
            };

            if let Some(tx) = self.sessions.get(&conn_id)
                && let Err(e) = tx.send(to_send)
            {
                error!("Error sending response to client. Reason: {:?}", e);
            }
        }
    }
}
