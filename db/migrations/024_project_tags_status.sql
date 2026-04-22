ALTER TABLE projects ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'planning';

CREATE INDEX IF NOT EXISTS idx_projects_tags ON projects USING GIN (tags) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status) WHERE deleted_at IS NULL;
