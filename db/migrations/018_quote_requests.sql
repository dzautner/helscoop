-- Homeowner-to-contractor quote requests generated from a project BOM.

CREATE TABLE IF NOT EXISTS quote_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  postcode TEXT NOT NULL,
  work_scope TEXT NOT NULL,
  bom_line_count INTEGER NOT NULL DEFAULT 0,
  estimated_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  partner_channel TEXT NOT NULL DEFAULT 'manual_luotettava_kumppani',
  matched_contractor_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'forwarded', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_project
  ON quote_requests(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quote_requests_user
  ON quote_requests(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quote_requests_postcode
  ON quote_requests(postcode);
