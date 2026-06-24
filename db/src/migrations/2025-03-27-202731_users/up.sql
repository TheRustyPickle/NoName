CREATE TABLE users (
    joined_at TIMESTAMPTZ NOT NULL,
    user_id TEXT PRIMARY KEY,
    username TEXT,
    sol_wallet TEXT UNIQUE,
    evm_wallet TEXT UNIQUE,
    points INTEGER NOT NULL DEFAULT 0,
    photo_url TEXT NOT NULL,
    photo_id TEXT,
    referral_code TEXT UNIQUE
);

CREATE INDEX idx_users_sol_wallet ON users (sol_wallet);
CREATE INDEX idx_users_evm_wallet ON users (evm_wallet);
CREATE INDEX idx_users_id ON users (user_id);
CREATE INDEX idx_referral_code ON users (referral_code);
