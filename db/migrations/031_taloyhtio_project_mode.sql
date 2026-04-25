-- Migration 031: Taloyhtio project mode
--
-- Adds the minimum project-level metadata needed to plan housing-cooperative
-- renovations without changing the existing omakotitalo project flow.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'omakotitalo',
  ADD COLUMN IF NOT EXISTS unit_count INTEGER,
  ADD COLUMN IF NOT EXISTS business_id TEXT,
  ADD COLUMN IF NOT EXISTS property_manager_name TEXT,
  ADD COLUMN IF NOT EXISTS property_manager_email TEXT,
  ADD COLUMN IF NOT EXISTS property_manager_phone TEXT,
  ADD COLUMN IF NOT EXISTS shareholder_shares JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_project_type_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_project_type_check
  CHECK (project_type IN ('omakotitalo', 'taloyhtio'));

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_unit_count_positive;

ALTER TABLE projects
  ADD CONSTRAINT projects_unit_count_positive
  CHECK (unit_count IS NULL OR unit_count > 0);

CREATE INDEX IF NOT EXISTS idx_projects_project_type
  ON projects (project_type)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN projects.project_type IS
  'Project mode: omakotitalo for single-home projects, taloyhtio for housing-cooperative projects.';
COMMENT ON COLUMN projects.unit_count IS
  'Housing-cooperative unit count used to multiply per-unit BOM costs into building-level totals.';
COMMENT ON COLUMN projects.business_id IS
  'Finnish Y-tunnus for the housing cooperative when project_type is taloyhtio.';
COMMENT ON COLUMN projects.shareholder_shares IS
  'Optional shareholder share table for allocating taloyhtio renovation costs.';
