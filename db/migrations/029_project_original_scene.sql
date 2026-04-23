-- Preserve the first saved scene so homeowners can compare current vs planned renovation states.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS original_scene_js TEXT;

UPDATE projects
SET original_scene_js = scene_js
WHERE original_scene_js IS NULL
  AND scene_js IS NOT NULL;

COMMENT ON COLUMN projects.original_scene_js IS
  'Baseline scene_js captured when the project is created for before/after renovation comparison.';
