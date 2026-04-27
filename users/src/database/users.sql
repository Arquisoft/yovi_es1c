CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
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
    FOREIGN KEY (sender_user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    CONSTRAINT different_users CHECK (sender_user_id <> recipient_user_id),
    CONSTRAINT unique_request_direction UNIQUE (sender_user_id, recipient_user_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_sender
ON friend_requests (sender_user_id);

CREATE INDEX IF NOT EXISTS idx_friend_requests_recipient
ON friend_requests (recipient_user_id);

CREATE INDEX IF NOT EXISTS idx_friend_requests_status
ON friend_requests (status);

CREATE TABLE IF NOT EXISTS chat_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_low_id INTEGER NOT NULL,
    user_high_id INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_low_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    FOREIGN KEY (user_high_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    CONSTRAINT different_users CHECK (user_low_id <> user_high_id),
    CONSTRAINT ordered_users CHECK (user_low_id < user_high_id),
    CONSTRAINT unique_conversation UNIQUE (user_low_id, user_high_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_low
ON chat_conversations (user_low_id);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_user_high
ON chat_conversations (user_high_id);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_user_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_user_id) REFERENCES user_profiles(user_id) ON DELETE CASCADE,
    CONSTRAINT non_empty_text CHECK (length(trim(text)) > 0),
    CONSTRAINT max_text_length CHECK (length(text) <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created
ON chat_messages (conversation_id, created_at DESC);
