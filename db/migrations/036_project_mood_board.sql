ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS mood_board JSONB NOT NULL DEFAULT '{"items":[]}'::jsonb;

COMMENT ON COLUMN projects.mood_board IS
  'Free-form homeowner mood board: material, photo, color, and note cards used during visual renovation planning.';
