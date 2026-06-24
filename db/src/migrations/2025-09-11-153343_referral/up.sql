CREATE TABLE referrals (
    referrer_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    referred_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    referred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (referrer_id, referred_id),
    CONSTRAINT unique_referred UNIQUE (referred_id)
);


CREATE TABLE referral_rewards (
    id SERIAL PRIMARY KEY,
    referrer_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    referred_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    session_id TEXT NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    points_awarded INTEGER NOT NULL,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (referred_id, session_id)
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_id);
CREATE INDEX idx_referrals_referrer_date ON referrals(referrer_id, referred_at DESC);
CREATE INDEX idx_referrals_referred_referrer ON referrals(referred_id, referrer_id);

CREATE INDEX idx_rewards_referrer ON referral_rewards(referrer_id);
CREATE INDEX idx_rewards_referred ON referral_rewards(referred_id);
CREATE INDEX idx_rewards_session ON referral_rewards(session_id);
CREATE INDEX idx_rewards_referrer_date ON referral_rewards(referrer_id, awarded_at DESC);
CREATE INDEX idx_rewards_referred_session ON referral_rewards(referred_id, session_id);

