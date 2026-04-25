-- Supabase/Postgres schema for your chat app
-- Run this in Supabase SQL editor or via psql.

BEGIN;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL UNIQUE,
  email VARCHAR(128) NOT NULL UNIQUE,
  display_name VARCHAR(128) NOT NULL,
  avatar VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
  token VARCHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id BIGSERIAL PRIMARY KEY,
  room_key VARCHAR(64) NOT NULL UNIQUE,
  host_username VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  max_members INTEGER NOT NULL DEFAULT 10
);

CREATE INDEX IF NOT EXISTS rooms_room_key_idx ON rooms(room_key);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(32) PRIMARY KEY,
  room_key VARCHAR(64) NOT NULL,
  sender_username VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NOT NULL,
  avatar VARCHAR(32) NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  type VARCHAR(16) NOT NULL DEFAULT 'text',
  file_url VARCHAR(256),
  timestamp VARCHAR(32) NOT NULL,
  edited BOOLEAN NOT NULL DEFAULT FALSE,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  reactions JSONB NOT NULL DEFAULT '{}'::jsonb,
  reads JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS messages_room_key_idx ON messages(room_key);

-- Friend requests table
CREATE TABLE IF NOT EXISTS friend_requests (
  id BIGSERIAL PRIMARY KEY,
  sender_username VARCHAR(64) NOT NULL,
  receiver_username VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT uq_friend_request_pair UNIQUE (sender_username, receiver_username)
);

CREATE INDEX IF NOT EXISTS friend_requests_sender_idx ON friend_requests(sender_username);
CREATE INDEX IF NOT EXISTS friend_requests_receiver_idx ON friend_requests(receiver_username);
CREATE INDEX IF NOT EXISTS friend_requests_status_idx ON friend_requests(status);

-- Accepted friendships table (store canonical sorted usernames in app layer)
CREATE TABLE IF NOT EXISTS friendships (
  id BIGSERIAL PRIMARY KEY,
  user_a VARCHAR(64) NOT NULL,
  user_b VARCHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_friendship_pair UNIQUE (user_a, user_b)
);

CREATE INDEX IF NOT EXISTS friendships_user_a_idx ON friendships(user_a);
CREATE INDEX IF NOT EXISTS friendships_user_b_idx ON friendships(user_b);

-- Persistent direct messages
CREATE TABLE IF NOT EXISTS direct_messages (
  id BIGSERIAL PRIMARY KEY,
  sender_username VARCHAR(64) NOT NULL,
  receiver_username VARCHAR(64) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS direct_messages_sender_idx ON direct_messages(sender_username);
CREATE INDEX IF NOT EXISTS direct_messages_receiver_idx ON direct_messages(receiver_username);
CREATE INDEX IF NOT EXISTS direct_messages_created_at_idx ON direct_messages(created_at DESC);

-- User notification feed (friend requests + direct message alerts)
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(64) NOT NULL,
  kind VARCHAR(32) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_username_idx ON notifications(username);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(username, is_read);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at DESC);

-- Helper function: upsert user by email
CREATE OR REPLACE FUNCTION upsert_user_by_email(
  p_email VARCHAR,
  p_username VARCHAR,
  p_display_name VARCHAR,
  p_avatar VARCHAR
)
RETURNS users AS $$
  INSERT INTO users (email, username, display_name, avatar)
  VALUES (p_email, p_username, p_display_name, p_avatar)
  ON CONFLICT (email)
  DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    avatar = EXCLUDED.avatar
  RETURNING *;
$$ LANGUAGE sql;

-- Helper function: create room if missing
CREATE OR REPLACE FUNCTION create_room_if_missing(
  p_room_key VARCHAR,
  p_host_username VARCHAR,
  p_max_members INTEGER DEFAULT 10
)
RETURNS rooms AS $$
  INSERT INTO rooms (room_key, host_username, max_members)
  VALUES (p_room_key, p_host_username, GREATEST(1, LEAST(p_max_members, 100)))
  ON CONFLICT (room_key)
  DO UPDATE SET
    host_username = rooms.host_username,
    max_members = rooms.max_members
  RETURNING *;
$$ LANGUAGE sql;

-- Helper function: insert message
CREATE OR REPLACE FUNCTION insert_message(
  p_id VARCHAR,
  p_room_key VARCHAR,
  p_sender_username VARCHAR,
  p_display_name VARCHAR,
  p_avatar VARCHAR,
  p_message TEXT,
  p_type VARCHAR,
  p_file_url VARCHAR,
  p_timestamp VARCHAR
)
RETURNS messages AS $$
  INSERT INTO messages (
    id, room_key, sender_username, display_name, avatar,
    message, type, file_url, timestamp, edited, deleted, reactions, reads
  ) VALUES (
    p_id, p_room_key, p_sender_username, p_display_name, p_avatar,
    COALESCE(p_message, ''), COALESCE(p_type, 'text'), p_file_url, p_timestamp,
    FALSE, FALSE, '{}'::jsonb, '{}'::jsonb
  )
  RETURNING *;
$$ LANGUAGE sql;

COMMIT;
