use tokio::sync::{mpsc::UnboundedSender, oneshot};

use crate::UserIpAgent;
use crate::ws::models::{BindWallet, Chain, TaskCheck, TelegramUser};
use crate::ws::{
    models::{FlappyData, SnakeData, TetrisData, Two048Data},
    server::{Command, ConnId, Work},
};

#[derive(Clone)]
pub struct ServerInterface {
    pub cmd_tx: UnboundedSender<Command>,
}

impl ServerInterface {
    pub async fn connect(&self, conn_tx: UnboundedSender<String>) -> ConnId {
        let (sender, receiver) = oneshot::channel();

        let command = Command {
            conn_id: 0,
            work: Work::Connect { conn_tx, sender },
        };
        self.cmd_tx.send(command).unwrap();

        receiver.await.unwrap()
    }

    pub fn disconnect(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::Disconnect,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn auth(
        &self,
        conn_id: ConnId,
        public_key: String,
        signature: String,
        chain: Chain,
        ip_agent: UserIpAgent,
    ) {
        let command = Command {
            conn_id,
            work: Work::Auth {
                public_key,
                signature,
                chain,
                ip_agent,
            },
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn auth_token(&self, conn_id: ConnId, token: String, ip_agent: UserIpAgent) {
        let command = Command {
            conn_id,
            work: Work::AuthToken { token, ip_agent },
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn leaderboard_in(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::LeaderboardIn,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn leaderboard_out(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::LeaderboardOut,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn initial_points(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::InitialPoints,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn tetris(&self, conn_id: ConnId, data: TetrisData) {
        let command = Command {
            conn_id,
            work: Work::Tetris { data },
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn tetris_end(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::TetrisEnd,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn snake(&self, conn_id: ConnId, data: SnakeData) {
        let command = Command {
            conn_id,
            work: Work::Snake { data },
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn snake_end(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::SnakeEnd,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn two048(&self, conn_id: ConnId, data: Two048Data) {
        let command = Command {
            conn_id,
            work: Work::Two048 { data },
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn two048_end(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::Two048End,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn flappy(&self, conn_id: ConnId, data: FlappyData) {
        let command = Command {
            conn_id,
            work: Work::Flappy { data },
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn flappy_end(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::FlappyEnd,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn me(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::Me,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn me_with_rank_socials(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::MeWithRankSocials,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn get_activity(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::GetActivity,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn username_update(&self, conn_id: ConnId, data: String) {
        let command = Command {
            conn_id,
            work: Work::UsernameUpdate { data },
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn social_links(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::SocialLinks,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn telegram(&self, conn_id: ConnId, data: TelegramUser) {
        let command = Command {
            conn_id,
            work: Work::Telegram { data },
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn tasks(&self, conn_id: ConnId) {
        let command = Command {
            conn_id,
            work: Work::Tasks,
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn check_task(&self, conn_id: ConnId, data: TaskCheck) {
        let command = Command {
            conn_id,
            work: Work::CheckTask { data },
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn check_referral_status(&self, conn_id: ConnId, referral_code: String) {
        let command = Command {
            conn_id,
            work: Work::CheckReferralStatus { referral_code },
        };
        self.cmd_tx.send(command).unwrap();
    }

    pub fn bind_wallet(&self, conn_id: ConnId, data: BindWallet) {
        let command = Command {
            conn_id,
            work: Work::BindWallet { data },
        };
        self.cmd_tx.send(command).unwrap();
    }
}
