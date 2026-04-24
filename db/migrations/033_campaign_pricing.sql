-- Retailer campaign metadata for seasonal sale pricing.

ALTER TABLE pricing
  ADD COLUMN IF NOT EXISTS regular_unit_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS campaign_label TEXT,
  ADD COLUMN IF NOT EXISTS campaign_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS campaign_detected_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pricing_active_campaigns
  ON pricing(campaign_ends_at)
  WHERE campaign_label IS NOT NULL;

