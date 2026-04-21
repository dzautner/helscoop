-- Lightweight project activity notifications.
-- Tracks shared-link views privately and stores email digest preferences.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_unsubscribe_token TEXT UNIQUE DEFAULT (gen_random_uuid()::text),
  ADD COLUMN IF NOT EXISTS last_activity_digest_at TIMESTAMPTZ;

UPDATE users
SET email_unsubscribe_token = gen_random_uuid()::text
WHERE email_unsubscribe_token IS NULL;

ALTER TABLE pricing
  ADD COLUMN IF NOT EXISTS previous_unit_price NUMERIC(10,2);

CREATE TABLE IF NOT EXISTS project_views (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  viewer_ip_hash TEXT NOT NULL,
  referrer TEXT
);

CREATE INDEX IF NOT EXISTS idx_project_views_project_viewed
  ON project_views(project_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_views_dedupe
  ON project_views(project_id, viewer_ip_hash, viewed_at DESC);
