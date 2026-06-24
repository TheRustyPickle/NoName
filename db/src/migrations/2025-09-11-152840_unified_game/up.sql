CREATE TYPE game_type AS ENUM ('snake', 'tetris', 'flappy', 'two048');

CREATE TABLE game_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    game game_type NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    final_score INTEGER NOT NULL
);


CREATE TABLE flappy_score_events (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    prev_timestamp TIMESTAMPTZ NOT NULL,
    points INTEGER NOT NULL,
    prev_points INTEGER NOT NULL,
    pipes INTEGER NOT NULL,
    prev_pipes INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES game_sessions (id) ON DELETE CASCADE
);


CREATE TYPE direction AS ENUM ('up', 'down', 'left', 'right');

CREATE TABLE two048_move_events (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    prev_timestamp TIMESTAMPTZ NOT NULL,
    direction direction NOT NULL,
    points INTEGER NOT NULL,
    prev_points INTEGER NOT NULL,
    highest_number INTEGER NOT NULL,
    prev_highest_number INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES game_sessions (id) ON DELETE CASCADE
);


CREATE TABLE tetris_snapshots (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    prev_timestamp TIMESTAMPTZ NOT NULL,
    points INTEGER NOT NULL,
    prev_points INTEGER NOT NULL,
    lines INTEGER NOT NULL,
    prev_lines INTEGER NOT NULL,
    level INTEGER NOT NULL,
    prev_level INTEGER NOT NULL,
    line_points INTEGER NOT NULL,
    drop_points INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES game_sessions (id) ON DELETE CASCADE
);


CREATE TABLE snake_food_events (
    id SERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    prev_timestamp TIMESTAMPTZ NOT NULL,
    points INTEGER NOT NULL,
    prev_points INTEGER NOT NULL,
    level INTEGER NOT NULL,
    prev_level INTEGER NOT NULL,
    length INTEGER NOT NULL,
    prev_length INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES game_sessions (id) ON DELETE CASCADE
);



CREATE INDEX idx_game_sessions_user_id ON game_sessions (user_id);
CREATE INDEX idx_game_sessions_user_end_time ON game_sessions (user_id, end_time DESC);

CREATE INDEX idx_snake_events_session_id ON snake_food_events (session_id);
CREATE INDEX idx_snake_events_user_id ON snake_food_events (user_id);
CREATE INDEX idx_snake_events_user_session ON snake_food_events (user_id, session_id);

CREATE INDEX idx_tetris_snapshots_session_id ON tetris_snapshots (session_id);
CREATE INDEX idx_tetris_snapshots_user_id ON tetris_snapshots (user_id);
CREATE INDEX idx_tetris_snapshots_user_session ON tetris_snapshots (user_id, session_id);

CREATE INDEX idx_flappy_events_session_id ON flappy_score_events (session_id);
CREATE INDEX idx_flappy_events_user_id ON flappy_score_events (user_id);
CREATE INDEX idx_flappy_events_user_session ON flappy_score_events (user_id, session_id);

CREATE INDEX idx_two048_events_session_id ON two048_move_events (session_id);
CREATE INDEX idx_two048_events_user_id ON two048_move_events (user_id);
CREATE INDEX idx_two048_events_user_session ON two048_move_events (user_id, session_id);
