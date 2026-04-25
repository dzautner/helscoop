-- Scene parameter presets per project (budget/standard/premium configurations).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS param_presets JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN projects.param_presets IS
  'Array of {name, values} objects for saved scene parameter configurations';
