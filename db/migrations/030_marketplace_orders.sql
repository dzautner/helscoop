-- Migration 030: Hosted marketplace checkout orders
--
-- Persists BOM-to-retailer checkout baskets so Helscoop can track
-- order intent, open supplier baskets, and estimate commission revenue.

CREATE TABLE IF NOT EXISTS marketplace_orders (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id                   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id                      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id                  TEXT REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_name                TEXT NOT NULL,
  partner_id                   UUID REFERENCES affiliate_partners(id) ON DELETE SET NULL,
  status                       TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'opened', 'ordered', 'confirmed', 'cancelled')),
  currency                     TEXT NOT NULL DEFAULT 'EUR',
  subtotal                     NUMERIC(12,2) NOT NULL DEFAULT 0,
  estimated_commission_rate    NUMERIC(5,4) NOT NULL DEFAULT 0.1500,
  estimated_commission_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  checkout_url                 TEXT,
  external_order_ref           TEXT,
  metadata_json                JSONB NOT NULL DEFAULT '{}'::jsonb,
  opened_at                    TIMESTAMPTZ,
  ordered_at                   TIMESTAMPTZ,
  confirmed_at                 TIMESTAMPTZ,
  cancelled_at                 TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_orders_project_id
  ON marketplace_orders (project_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_user_id
  ON marketplace_orders (user_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_supplier_id
  ON marketplace_orders (supplier_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_status
  ON marketplace_orders (status);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_created_at
  ON marketplace_orders (created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_order_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES marketplace_orders(id) ON DELETE CASCADE,
  material_id   TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  material_name TEXT NOT NULL,
  quantity      NUMERIC(12,3) NOT NULL,
  unit          TEXT NOT NULL,
  unit_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  link          TEXT,
  stock_level   TEXT NOT NULL DEFAULT 'unknown'
    CHECK (stock_level IN ('in_stock', 'low_stock', 'out_of_stock', 'unknown')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_order_lines_order_id
  ON marketplace_order_lines (order_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_order_lines_material_id
  ON marketplace_order_lines (material_id);
