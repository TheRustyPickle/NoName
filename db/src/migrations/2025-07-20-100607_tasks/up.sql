CREATE TYPE task_type AS ENUM ('join_discord', 'follow_twitter', 'join_telegram', 'create_tweet', 'check_telegram_post', 'check_discord_post', 'retweet_post', 'like_tweet');

CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    task_type task_type NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    completion_url TEXT,
    redirect_url TEXT,
    platform platform,
    platform_id TEXT,
    platform_username TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    reward_point INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE task_completions (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL,
    points_assigned BOOLEAN NOT NULL,
    proof TEXT,
    UNIQUE (user_id, task_id)
);


CREATE INDEX idx_tasks_platform_id ON tasks(platform_id);

CREATE INDEX idx_tasks_is_active ON tasks(is_active);

CREATE INDEX idx_tasks_ends_at ON tasks(ends_at);

CREATE INDEX idx_task_completions_user_id ON task_completions(user_id);

CREATE INDEX idx_task_completions_task_id ON task_completions(task_id);
