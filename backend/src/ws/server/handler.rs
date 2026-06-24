use actix_ws::{AggregatedMessage, MessageStream, Session};
use futures_util::StreamExt;
use log::{error, info};
use std::pin::pin;
use std::time::{Duration, Instant};
use tokio::select;
use tokio::sync::mpsc;
use tokio::time::interval;

use crate::UserIpAgent;
use crate::ws::models::{AuthPayload, Request};
use crate::ws::server::{ConnId, ServerInterface};

/// How often heartbeat pings are sent
const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(5);

/// How long before lack of client response causes a timeout
const CLIENT_TIMEOUT: Duration = Duration::from_secs(10);

struct ConnectionGuard<'a> {
    interface: &'a ServerInterface,
    conn_id: ConnId,
}

impl Drop for ConnectionGuard<'_> {
    fn drop(&mut self) {
        self.interface.disconnect(self.conn_id);
    }
}

pub async fn handle_ws(
    interface: ServerInterface,
    mut session: Session,
    msg_stream: MessageStream,
    ip_agent: UserIpAgent,
) {
    let mut last_heartbeat = Instant::now();
    let mut interval = interval(HEARTBEAT_INTERVAL);

    let (conn_tx, mut conn_rx) = mpsc::unbounded_channel();

    let conn_id = interface.connect(conn_tx).await;
    let _guard = ConnectionGuard {
        interface: &interface,
        conn_id,
    };

    let msg_stream = msg_stream
        .max_frame_size(128 * 1024)
        .aggregate_continuations()
        .max_continuation_size(2 * 1024 * 1024);

    let mut msg_stream = pin!(msg_stream);

    let close_reason = loop {
        let tick = pin!(interval.tick());
        let msg_rx = pin!(conn_rx.recv());

        select! {
            // An incoming message from the client
            Some(Ok(msg)) = msg_stream.next() => {
                match msg {
                    AggregatedMessage::Ping(bytes) => {
                        last_heartbeat = Instant::now();
                        if session.pong(&bytes).await.is_err() {
                            break None;
                        }
                    }

                    AggregatedMessage::Pong(_) => {
                        last_heartbeat = Instant::now();
                    }

                    AggregatedMessage::Text(text) => {
                        process_text_msg(&interface, &text, conn_id, &ip_agent);
                    }

                    AggregatedMessage::Binary(_bin) => {
                        log::warn!("unexpected binary message");
                    }

                    AggregatedMessage::Close(reason) => {
                        break reason;
                    }
                }
            }

            // An internal message to be sent to the client
            Some(chat_msg) = msg_rx => {
                if session.text(chat_msg).await.is_err() {
                    break None;
                }
            }

            _ = tick => {
                if Instant::now().duration_since(last_heartbeat) > CLIENT_TIMEOUT {
                    info!(
                        "Client has not sent heartbeat in over {:?}; disconnecting",
                        CLIENT_TIMEOUT
                    );
                    break None;
                }

                // If sending a ping fails, the connection is dead.
                if session.ping(b"").await.is_err() {
                    break None;
                }
            }

            // The client's stream closed or had an error
            else => {
                // This branch is taken if msg_stream.next() returns None (clean close)
                // or Some(Err(_)) (unclean close), or if conn_rx closes.
                // In all cases, we should terminate the connection.
                break None;
            }
        }
    };

    // Attempt to close the connection gracefully.
    // The `_guard` will call `handler.disconnect` automatically when the function ends,
    // so we don't need to call it manually here.
    let _ = session.close(close_reason).await;
}

fn process_text_msg(
    interface: &ServerInterface,
    text: &str,
    conn_id: ConnId,
    ip_agent: &UserIpAgent,
) {
    let Ok(request) = Request::from_json(text) else {
        error!("{text} from {conn_id} is not a valid command");
        return;
    };

    match request {
        Request::Auth { data } => match data {
            AuthPayload::Signed {
                public_key,
                signature,
                chain,
            } => {
                interface.auth(conn_id, public_key, signature, chain, ip_agent.clone());
            }
            AuthPayload::Token { token } => {
                interface.auth_token(conn_id, token, ip_agent.clone());
            }
        },
        Request::InitialPoints => {
            interface.initial_points(conn_id);
        }
        Request::Me => {
            interface.me(conn_id);
        }
        Request::MeWithRankSocials => {
            interface.me_with_rank_socials(conn_id);
        }
        Request::GetActivity => {
            interface.get_activity(conn_id);
        }
        Request::Tetris { data } => {
            interface.tetris(conn_id, data);
        }
        Request::TetrisEnd => {
            interface.tetris_end(conn_id);
        }
        Request::Snake { data } => {
            interface.snake(conn_id, data);
        }
        Request::SnakeEnd => {
            interface.snake_end(conn_id);
        }
        Request::Two048 { data } => {
            interface.two048(conn_id, data);
        }
        Request::Two048End => {
            interface.two048_end(conn_id);
        }
        Request::Flappy { data } => {
            interface.flappy(conn_id, data);
        }
        Request::FlappyEnd => {
            interface.flappy_end(conn_id);
        }
        Request::LeaderboardIn => {
            interface.leaderboard_in(conn_id);
        }
        Request::LeaderboardOut => {
            interface.leaderboard_out(conn_id);
        }
        Request::UsernameUpdate { data } => {
            interface.username_update(conn_id, data);
        }
        Request::SocialLinks => {
            interface.social_links(conn_id);
        }
        Request::Telegram { data } => {
            interface.telegram(conn_id, data);
        }
        Request::Tasks => {
            interface.tasks(conn_id);
        }
        Request::CheckTask { data } => {
            interface.check_task(conn_id, data);
        }
        Request::CheckReferral { data } => interface.check_referral_status(conn_id, data),
        Request::BindWallet { data } => interface.bind_wallet(conn_id, data),
    }
}
