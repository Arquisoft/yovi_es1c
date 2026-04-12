CREATE TABLE IF NOT EXISTS matches (
                                       id SERIAL PRIMARY KEY,
                                       user_id INTEGER NOT NULL,
                                       board_size INTEGER NOT NULL,
                                       difficulty TEXT NOT NULL,
                                       status TEXT DEFAULT 'ONGOING',
                                       winner TEXT,
                                       mode TEXT DEFAULT 'BOT',
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