-- Persist project-level photo overlays for before/after visual alignment.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS photo_overlay JSONB;
