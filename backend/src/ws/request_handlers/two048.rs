use anyhow::{Context, Result, anyhow};
use log::error;
use tokio::sync::mpsc::UnboundedReceiver;

use crate::ws::models::{GameEvent, GameInProgress, Two048Data, WsResponse};
use crate::ws::server::{ConnId, Server};
use crate::ws::validator::two048::two048_move_valid;

impl Server {
    async fn two048(&mut self, conn_id: ConnId, data: Two048Data) -> Result<()> {
        let user = self
            .logged_in
            .get(&conn_id)
            .ok_or(anyhow!("{conn_id} not logged in"))?
            .clone();

        let user_id = &user.user_id;

        {
            let game_session = if let Some(session) = self.game_sessions.get(&conn_id) {
                session
            } else {
                let session = GameInProgress::new_two048(user_id.clone(), data.timestamp);
                self.game_sessions.insert(conn_id, session);

                self.game_sessions.get(&conn_id).unwrap()
            };

            let last_move = game_session.get_last_two048();

            let move_valid = two048_move_valid(&data, &last_move).with_context(|| {
                format!(
                    "2048 move invalid for user {} {}.",
                    user_id,
                    user.sol_wallet.as_deref().unwrap_or("No Sol Wallet")
                )
            });

            if let Err(e) = move_valid {
                let to_convert = if let Some(last_move) = last_move {
                    last_move
                } else {
                    Two048Data::new()
                };

                let to_send = WsResponse::new_two048(to_convert);
                if let Some(tx) = self.sessions.get(&conn_id) {
                    let _ = tx.send(to_send.json());
                }

                return Err(e);
            }
        }

        let difference_points = data.points - data.prev_points;

        if difference_points != 0 {
            self.increase_point(difference_points, &user, false).await?;
        }

        let mut game_session = self.game_sessions.get_mut(&conn_id).unwrap();

        game_session.push(GameEvent::Two048(data));

        Ok(())
    }

    pub async fn two048_queue(
        mut self,
        conn_id: ConnId,
        mut receiver: UnboundedReceiver<Two048Data>,
    ) {
        while let Some(data) = receiver.recv().await {
            if let Err(e) = self.two048(conn_id, data).await {
                error!("Error handling 2048 move. Reason: {:?}", e);
            }
        }
    }
}
