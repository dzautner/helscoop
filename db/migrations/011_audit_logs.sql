-- Migration 011: Create audit_logs table for compliance export audit trail
--
-- Provides immutable traceability for every generated artifact (PDF quotes,
-- CSV BOMs, carbon reports, etc.). Each row captures the artifact hash,
-- a frozen snapshot of the inputs, and arbitrary metadata.

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    UUID REFERENCES projects(id) ON DELETE SET NULL,
  action        TEXT NOT NULL,
  artifact_type TEXT,
  artifact_hash TEXT,
  source_snapshot JSONB DEFAULT '{}'::jsonb,
  metadata      JSONB DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by project
CREATE INDEX IF NOT EXISTS idx_audit_logs_project_id ON audit_logs (project_id);

-- Index for fast lookups by user
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs (user_id);

-- Index for chronological listing (admin view)
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);

-- Index for filtering by action type
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);
