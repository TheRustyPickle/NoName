CREATE TYPE platform AS ENUM ('discord', 'telegram', 'twitter');

CREATE TABLE user_socials (
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    platform platform NOT NULL,
    platform_user_id TEXT NOT NULL,
    platform_username TEXT NOT NULL,
    PRIMARY KEY (user_id, platform),
    UNIQUE (platform, platform_user_id)
);

CREATE INDEX idx_user_socials_user_id ON user_socials (user_id);
