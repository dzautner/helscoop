-- Persist a generated before/after social preview for public share links.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS share_preview JSONB;

COMMENT ON COLUMN projects.share_preview IS
  'Client-generated public before/after preview images and display metadata for share links.';
