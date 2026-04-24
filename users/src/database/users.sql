CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY ,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    email TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
);