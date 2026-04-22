-- Migration 023: Supplier re-scrape queue marker
--
-- Admin users can flag a supplier whose pricing data needs to be refreshed.
-- The scraper can poll this timestamp and clear it after a successful run.

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS rescrape_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_suppliers_rescrape_requested
  ON suppliers(rescrape_requested_at)
  WHERE rescrape_requested_at IS NOT NULL;
