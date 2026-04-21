-- Stock status tracking per material per supplier per store location.
-- Enables real-time stock availability indicators in the BOM view.
-- Related issue: https://github.com/dzautner/helscoop/issues/333

CREATE TABLE stock_status (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  stock_level TEXT NOT NULL DEFAULT 'unknown'
    CHECK (stock_level IN ('in_stock', 'low_stock', 'out_of_stock', 'unknown')),
  store_location TEXT,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(material_id, supplier_id, store_location)
);

CREATE INDEX idx_stock_status_material ON stock_status(material_id);
CREATE INDEX idx_stock_status_supplier ON stock_status(supplier_id);

-- ============================================================
-- Seed sample stock data for existing materials
-- ============================================================

-- K-Rauta Helsinki (Konala)
INSERT INTO stock_status (material_id, supplier_id, stock_level, store_location) VALUES
  ('pine_48x98_c24',      'k-rauta', 'in_stock',     'Helsinki Konala'),
  ('pine_48x148_c24',     'k-rauta', 'in_stock',     'Helsinki Konala'),
  ('osb_9mm',             'k-rauta', 'in_stock',     'Helsinki Konala'),
  ('osb_18mm',            'k-rauta', 'low_stock',    'Helsinki Konala'),
  ('insulation_100mm',    'k-rauta', 'in_stock',     'Helsinki Konala'),
  ('galvanized_roofing',  'k-rauta', 'in_stock',     'Helsinki Konala'),
  ('concrete_block',      'k-rauta', 'in_stock',     'Helsinki Konala'),
  ('screws_50mm',         'k-rauta', 'in_stock',     'Helsinki Konala'),
  ('vapor_barrier',       'k-rauta', 'in_stock',     'Helsinki Konala'),
  ('exterior_paint_red',  'k-rauta', 'low_stock',    'Helsinki Konala');

-- K-Rauta Espoo (Lommila)
INSERT INTO stock_status (material_id, supplier_id, stock_level, store_location) VALUES
  ('pine_48x98_c24',      'k-rauta', 'in_stock',     'Espoo Lommila'),
  ('pine_48x148_c24',     'k-rauta', 'low_stock',    'Espoo Lommila'),
  ('osb_9mm',             'k-rauta', 'out_of_stock', 'Espoo Lommila'),
  ('osb_18mm',            'k-rauta', 'in_stock',     'Espoo Lommila'),
  ('insulation_100mm',    'k-rauta', 'in_stock',     'Espoo Lommila'),
  ('galvanized_roofing',  'k-rauta', 'low_stock',    'Espoo Lommila'),
  ('concrete_block',      'k-rauta', 'out_of_stock', 'Espoo Lommila'),
  ('screws_50mm',         'k-rauta', 'in_stock',     'Espoo Lommila');

-- Sarokas (online / warehouse)
INSERT INTO stock_status (material_id, supplier_id, stock_level, store_location) VALUES
  ('pine_48x98_c24',      'sarokas', 'in_stock',     'Verkkokauppa'),
  ('pine_48x148_c24',     'sarokas', 'in_stock',     'Verkkokauppa'),
  ('osb_9mm',             'sarokas', 'in_stock',     'Verkkokauppa'),
  ('osb_18mm',            'sarokas', 'in_stock',     'Verkkokauppa'),
  ('insulation_100mm',    'sarokas', 'low_stock',    'Verkkokauppa'),
  ('galvanized_roofing',  'sarokas', 'in_stock',     'Verkkokauppa'),
  ('concrete_block',      'sarokas', 'in_stock',     'Verkkokauppa'),
  ('screws_50mm',         'sarokas', 'in_stock',     'Verkkokauppa'),
  ('hardware_cloth',      'sarokas', 'in_stock',     'Verkkokauppa');
