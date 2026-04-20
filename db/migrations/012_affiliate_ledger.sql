-- Migration 012: Affiliate settlement ledger
--
-- Tracks affiliate click-throughs, commission attribution, and payout
-- reporting for material supplier partnerships.

-- ---------------------------------------------------------------------------
-- affiliate_partners — the supplier/affiliate organizations we pay commissions to
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliate_partners (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0000, -- e.g. 0.0500 = 5%
  payment_terms   TEXT NOT NULL DEFAULT 'net30',          -- net30, net60, etc.
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_partners_active
  ON affiliate_partners (active);

-- ---------------------------------------------------------------------------
-- affiliate_clicks — records each user click-through to a supplier product
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  partner_id  UUID REFERENCES affiliate_partners(id) ON DELETE SET NULL,
  click_url   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_user_id
  ON affiliate_clicks (user_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_supplier_id
  ON affiliate_clicks (supplier_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_partner_id
  ON affiliate_clicks (partner_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_created_at
  ON affiliate_clicks (created_at DESC);

-- ---------------------------------------------------------------------------
-- affiliate_commissions — commission entries attributed to clicks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  click_id    UUID NOT NULL REFERENCES affiliate_clicks(id) ON DELETE CASCADE,
  partner_id  UUID NOT NULL REFERENCES affiliate_partners(id) ON DELETE CASCADE,
  order_ref   TEXT NOT NULL,                    -- external order reference
  amount      NUMERIC(12,2) NOT NULL,           -- commission amount
  currency    TEXT NOT NULL DEFAULT 'EUR',
  status      TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'paid', 'reversed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_click_id
  ON affiliate_commissions (click_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_partner_id
  ON affiliate_commissions (partner_id);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_status
  ON affiliate_commissions (status);
CREATE INDEX IF NOT EXISTS idx_affiliate_commissions_created_at
  ON affiliate_commissions (created_at DESC);
