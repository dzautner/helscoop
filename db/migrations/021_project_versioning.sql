-- Project version history and lightweight branch alternatives.

CREATE TABLE IF NOT EXISTS project_branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  forked_from_version_id UUID,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_branches_default
  ON project_branches(project_id)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_project_branches_project
  ON project_branches(project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS project_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES project_branches(id) ON DELETE SET NULL,
  parent_version_id UUID REFERENCES project_versions(id) ON DELETE SET NULL,
  restored_from_version_id UUID REFERENCES project_versions(id) ON DELETE SET NULL,
  name TEXT,
  description TEXT,
  event_type TEXT NOT NULL DEFAULT 'auto' CHECK (event_type IN ('auto', 'named', 'restore', 'branch')),
  snapshot JSONB NOT NULL,
  delta JSONB NOT NULL DEFAULT '{}'::jsonb,
  thumbnail_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'project_branches_forked_from_version_fk'
  ) THEN
    ALTER TABLE project_branches
      ADD CONSTRAINT project_branches_forked_from_version_fk
      FOREIGN KEY (forked_from_version_id)
      REFERENCES project_versions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_versions_project_created
  ON project_versions(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_versions_branch_created
  ON project_versions(branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_versions_named
  ON project_versions(project_id, created_at DESC)
  WHERE name IS NOT NULL;
