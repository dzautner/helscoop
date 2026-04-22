-- Credit-based AI usage pricing.
-- Credits are separate from subscription plan tiers: non-AI features can stay
-- free while AI features consume a prepaid balance.

ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_tier TEXT DEFAULT 'free';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_plan_tier_check;
ALTER TABLE users ADD CONSTRAINT users_plan_tier_check
  CHECK (plan_tier IN ('free', 'pro', 'enterprise'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS credit_balance INTEGER NOT NULL DEFAULT 0;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_credit_balance_nonnegative;
ALTER TABLE users ADD CONSTRAINT users_credit_balance_nonnegative
  CHECK (credit_balance >= 0);

CREATE TABLE IF NOT EXISTS ai_message_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_message_log_user_created
  ON ai_message_log(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('grant', 'deduct', 'purchase', 'adjustment')),
  feature TEXT,
  balance_after INTEGER NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created
  ON credit_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_transactions_feature
  ON credit_transactions(feature);

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_stripe_session
  ON credit_transactions ((metadata->>'stripeSessionId'))
  WHERE type = 'purchase' AND metadata ? 'stripeSessionId';

CREATE TABLE IF NOT EXISTS plan_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  set_by UUID REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plan_overrides_user_feature
  ON plan_overrides(user_id, feature);
