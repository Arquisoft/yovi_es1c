CREATE TABLE IF NOT EXISTS users_credentials (
                                                 id            SERIAL PRIMARY KEY,
                                                 username      TEXT UNIQUE NOT NULL,
                                                 password_hash TEXT NOT NULL,
                                                 created_at    TIMESTAMPTZ DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS sessions (
                                        id          TEXT PRIMARY KEY,
                                        user_id     INTEGER NOT NULL REFERENCES users_credentials(id),
    device_id   TEXT NOT NULL,
    device_name TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ
    );

CREATE TABLE IF NOT EXISTS refresh_tokens (
                                              id          SERIAL PRIMARY KEY,
                                              user_id     INTEGER NOT NULL REFERENCES users_credentials(id),
    session_id  TEXT NOT NULL REFERENCES sessions(id),
    token_hash  TEXT NOT NULL UNIQUE,
    family_id   TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_rt_user_id     ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_rt_session_id  ON refresh_tokens(session_id);
CREATE INDEX IF NOT EXISTS idx_rt_family_id   ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_rt_expires_at  ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_sess_user_id   ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sess_device_id ON sessions(device_id);