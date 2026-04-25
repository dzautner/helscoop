-- Migration 016: OAuth provider accounts for Google and Apple sign-in.
--
-- Keeps provider identities separate from users so one Helscoop account can
-- be linked to both Google and Apple by verified email.

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS user_oauth_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'apple')),
  provider_user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT false,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_oauth_providers_user_id
  ON user_oauth_providers(user_id);

CREATE INDEX IF NOT EXISTS idx_user_oauth_providers_email
  ON user_oauth_providers(lower(email));

INSERT INTO user_oauth_providers (
  user_id,
  provider,
  provider_user_id,
  email,
  email_verified,
  display_name,
  created_at,
  updated_at
)
SELECT id, 'google', google_id, email, email_verified, name, now(), now()
FROM users
WHERE google_id IS NOT NULL
ON CONFLICT (provider, provider_user_id) DO NOTHING;
