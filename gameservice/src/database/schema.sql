CREATE TABLE IF NOT EXISTS matches (
                                       id SERIAL PRIMARY KEY,
                                       user_id INTEGER NOT NULL,
                                       board_size INTEGER NOT NULL,
                                       difficulty TEXT NOT NULL,
                                       status TEXT DEFAULT 'ONGOING',
                                       winner TEXT,
                                       mode TEXT DEFAULT 'BOT',
                                       rules JSONB NOT NULL DEFAULT '{"pieRule":{"enabled":false},"honey":{"enabled":false,"blockedCells":[]}}'::jsonb,
                                       created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE TABLE IF NOT EXISTS moves (
                                     id SERIAL PRIMARY KEY,
                                     match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    position_yen TEXT NOT NULL,
    player TEXT NOT NULL,
    move_number INTEGER NOT NULL,
    "timestamp" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

CREATE INDEX IF NOT EXISTS idx_matches_user_id ON matches(user_id);
CREATE INDEX IF NOT EXISTS idx_moves_match_id ON moves(match_id);

CREATE OR REPLACE VIEW user_stats AS
SELECT
    user_id,
    COUNT(*) FILTER (WHERE winner = 'USER')  AS wins,
    COUNT(*) FILTER (WHERE winner = 'BOT')   AS losses,
    COUNT(*)                                  AS total_games,
    ROUND(
            COUNT(*) FILTER (WHERE winner = 'USER') * 100.0
        / NULLIF(COUNT(*), 0),
            2) AS win_rate
FROM matches
WHERE status = 'FINISHED'
GROUP BY user_id;

-- Player ELO rankings.
-- Initial rating: 1200 (standard ELO baseline).
-- Expected range: ~800 (beginner) to ~2400 (expert).
CREATE TABLE IF NOT EXISTS player_rankings (
    user_id        INTEGER     PRIMARY KEY,
    username       TEXT,
    elo_rating     INTEGER     NOT NULL DEFAULT 1200,
    games_played   INTEGER     NOT NULL DEFAULT 0,
    peak_rating    INTEGER     NOT NULL DEFAULT 1200,
    last_updated   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE player_rankings ADD COLUMN IF NOT EXISTS username TEXT;

-- Audit log of every rating change (per finished, ranked match).
CREATE TABLE IF NOT EXISTS ranking_history (
    id             SERIAL      PRIMARY KEY,
    user_id        INTEGER     NOT NULL,
    match_id       INTEGER     NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    rating_before  INTEGER     NOT NULL,
    rating_after   INTEGER     NOT NULL,
    delta          INTEGER     NOT NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rankings_elo        ON player_rankings (elo_rating DESC);
CREATE INDEX IF NOT EXISTS idx_rankings_user_id    ON player_rankings (user_id);
CREATE INDEX IF NOT EXISTS idx_history_user_id     ON ranking_history (user_id);
CREATE INDEX IF NOT EXISTS idx_history_match_id    ON ranking_history (match_id);

-- Backfill: ensure every user with at least one match has a ranking row.
-- Idempotent: ON CONFLICT keeps existing ratings untouched.
INSERT INTO player_rankings (user_id, elo_rating, games_played, peak_rating)
SELECT DISTINCT user_id, 1200, 0, 1200
FROM matches
ON CONFLICT (user_id) DO NOTHING;
