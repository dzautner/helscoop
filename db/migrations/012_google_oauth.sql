-- Migration 012: Add Google OAuth support
--
-- Adds google_id and auth_provider columns to the users table to support
-- Google Sign-In as an alternative login method (Issue #502).

-- google_id: the Google account's unique subject identifier (from the ID token "sub" claim)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id TEXT UNIQUE;

-- auth_provider: tracks how the user registered ('local' = email/password, 'google' = Google OAuth)
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'local';

-- Allow password_hash to be NULL for Google-only accounts (they have no local password)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
