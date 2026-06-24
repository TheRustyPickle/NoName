use anyhow::{Context, Result, anyhow};

use crate::ws::models::{GameEvent, GameInProgress, TetrisData, WsResponse};
use crate::ws::server::{ConnId, Server};
use crate::ws::validator::tetris::tetris_move_valid;

impl Server {
    pub async fn tetris(&mut self, conn_id: ConnId, data: TetrisData) -> Result<()> {
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
                let session = GameInProgress::new_tetris(user_id.clone(), data.timestamp);
                self.game_sessions.insert(conn_id, session);

                self.game_sessions.get(&conn_id).unwrap()
            };

            let last_move = game_session.get_last_tetris();

            let move_valid = tetris_move_valid(&data, &last_move).with_context(|| {
                format!(
                    "Tetris move invalid for user {} {}",
                    user_id,
                    user.sol_wallet.as_deref().unwrap_or("No Sol Wallet")
                )
            });

            if let Err(e) = move_valid {
                let to_convert = if let Some(last_move) = last_move {
                    TetrisData::from_snapshot(&last_move)
                } else {
                    TetrisData::new()
                };

                let to_send = WsResponse::new_tetris(to_convert);
                if let Some(tx) = self.sessions.get(&conn_id) {
                    let _ = tx.send(to_send.json());
                }

                return Err(e);
            }
        }

        let difference_points = data.points - data.prev_points;
        self.increase_point(difference_points, &user, false).await?;

        let (line_points, drop_points) = data.extract_points();

        let mut game_session = self.game_sessions.get_mut(&conn_id).unwrap();

        let snapshot = data.to_tetris_snapshot(
            game_session.get_session_id().to_string(),
            user_id.clone(),
            line_points,
            drop_points,
        );

        game_session.push(GameEvent::Tetris(snapshot));

        Ok(())
    }
}
