-- Public inspiration gallery metadata and lightweight moderation state.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gallery_status TEXT NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS gallery_like_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gallery_clone_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_gallery_status_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_gallery_status_check
  CHECK (gallery_status IN ('pending', 'approved', 'rejected'));

UPDATE projects
SET published_at = COALESCE(published_at, updated_at, created_at, now())
WHERE is_public = true
  AND published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_public_gallery
  ON projects (published_at DESC, updated_at DESC)
  WHERE is_public = true AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_gallery_status
  ON projects (gallery_status)
  WHERE is_public = true AND deleted_at IS NULL;
