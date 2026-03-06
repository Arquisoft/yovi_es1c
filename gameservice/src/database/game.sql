CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    board_size INTEGER NOT NULL,
    strategy TEXT,
    difficulty TEXT,
    status TEXT DEFAULT 'ONGOING',
    winner TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS moves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id INTEGER NOT NULL,
    position_yen TEXT NOT NULL,
    player TEXT NOT NULL,
    move_number INTEGER NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
);

CREATE VIEW IF NOT EXISTS user_stats AS
SELECT 
    user_id,
    SUM(CASE WHEN winner = 'USER' THEN 1 ELSE 0 END) as wins,
    SUM(CASE WHEN winner = 'BOT' THEN 1 ELSE 0 END) as losses,
    COUNT(*) as total_games,
    ROUND(
        (SUM(CASE WHEN winner = 'USER' THEN 1 ELSE 0 END) * 100.0) /
        CASE WHEN COUNT(*) = 0 THEN 1 ELSE COUNT(*) END
    ,2) as win_rate
FROM matches
WHERE status = 'FINISHED'
GROUP BY user_id;