-- Per-project household deduction calculator preference.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS household_deduction_joint BOOLEAN NOT NULL DEFAULT false;
