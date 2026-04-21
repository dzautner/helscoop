-- Stock availability metadata for supplier pricing rows.
-- Live scrapers can populate these fields; existing rows default to unknown.

ALTER TABLE pricing
  ADD COLUMN IF NOT EXISTS in_stock BOOLEAN,
  ADD COLUMN IF NOT EXISTS stock_level TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS store_location TEXT,
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;

ALTER TABLE pricing
  DROP CONSTRAINT IF EXISTS pricing_stock_level_check;

ALTER TABLE pricing
  ADD CONSTRAINT pricing_stock_level_check
  CHECK (stock_level IN ('in_stock', 'low_stock', 'out_of_stock', 'unknown'));

CREATE INDEX IF NOT EXISTS idx_pricing_stock_level ON pricing(stock_level);
CREATE INDEX IF NOT EXISTS idx_pricing_last_checked ON pricing(last_checked_at);
