-- Contractor-facing share links with 30-day expiry and public comment thread.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS share_token_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS share_token_expires_at TIMESTAMPTZ;

UPDATE projects
SET share_token_created_at = COALESCE(share_token_created_at, updated_at, now()),
    share_token_expires_at = COALESCE(share_token_expires_at, now() + INTERVAL '30 days')
WHERE share_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_share_token_expires
  ON projects(share_token_expires_at)
  WHERE share_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS project_share_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  commenter_name TEXT NOT NULL,
  message TEXT NOT NULL,
  viewer_ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_share_comments_project_created
  ON project_share_comments(project_id, created_at DESC);
