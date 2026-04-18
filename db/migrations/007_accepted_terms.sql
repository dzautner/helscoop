-- Track when users accepted Terms of Service and Privacy Policy
ALTER TABLE users ADD COLUMN accepted_terms_at TIMESTAMPTZ;
