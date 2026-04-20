-- Migration 010: Extend user roles from (user, admin) to (homeowner, contractor, partner, admin)
--
-- Backwards-compatible: existing 'user' values are migrated to 'homeowner'.
-- The application code also handles 'user' -> 'homeowner' normalisation at runtime
-- for any tokens minted before this migration runs.

-- Step 1: Drop the old CHECK constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Step 2: Migrate existing 'user' rows to 'homeowner'
UPDATE users SET role = 'homeowner' WHERE role = 'user';

-- Step 3: Add the new CHECK constraint with all four roles
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('homeowner', 'contractor', 'partner', 'admin'));

-- Step 4: Update the default
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'homeowner';
