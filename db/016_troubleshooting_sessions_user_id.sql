-- Migration 016: Add user_id to troubleshooting_sessions for cross-user privacy
-- Depends on: 002_hackathon_slice.sql, 004_auth.sql

ALTER TABLE troubleshooting_sessions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
CREATE INDEX IF NOT EXISTS idx_ts_sessions_user ON troubleshooting_sessions (user_id);
