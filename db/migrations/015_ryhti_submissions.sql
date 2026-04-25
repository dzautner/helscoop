-- Ryhti permit package metadata and submission tracking.
--
-- Ryhti live submission requires official integration credentials. Helscoop
-- still needs to persist the homeowner-supplied permit metadata and create a
-- trackable pre-submission package for authority handoff.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS permit_metadata JSONB NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS ryhti_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'live')),
  status TEXT NOT NULL CHECK (status IN (
    'draft',
    'ready_for_authority',
    'submitted',
    'accepted',
    'rejected',
    'failed'
  )),
  permit_identifier TEXT,
  ryhti_tracking_id TEXT,
  validation JSONB NOT NULL DEFAULT '[]',
  payload JSONB NOT NULL,
  response JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ryhti_submissions_project
  ON ryhti_submissions(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ryhti_submissions_status
  ON ryhti_submissions(status);
