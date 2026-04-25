CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY ,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT,
    email TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS friend_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_user_id INTEGER NOT NULL,
    recipient_user_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_user_id) REFERENCES user_profiles(user_id),
    FOREIGN KEY (recipient_user_id) REFERENCES user_profiles(user_id),
    CONSTRAINT different_users CHECK (sender_user_id <> recipient_user_id),
    CONSTRAINT unique_request_direction UNIQUE (sender_user_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_sender
ON friend_requests (sender_user_id);

CREATE INDEX IF NOT EXISTS idx_friend_requests_recipient
ON friend_requests (recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_friend_requests_status
ON friend_requests (status);
