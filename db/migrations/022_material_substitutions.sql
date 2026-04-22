-- Smart material substitution mappings for BOM alternatives.
-- These are curated compatibility hints; the API still checks live price/stock.

CREATE TABLE IF NOT EXISTS material_substitutions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  substitute_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  substitution_type TEXT NOT NULL CHECK (
    substitution_type IN ('equivalent', 'alternative', 'upgrade', 'budget')
  ),
  confidence TEXT NOT NULL DEFAULT 'verified' CHECK (
    confidence IN ('verified', 'suggested')
  ),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (material_id, substitute_id),
  CHECK (material_id <> substitute_id)
);

CREATE INDEX IF NOT EXISTS idx_material_substitutions_material
  ON material_substitutions(material_id);

CREATE INDEX IF NOT EXISTS idx_material_substitutions_substitute
  ON material_substitutions(substitute_id);

INSERT INTO material_substitutions
  (material_id, substitute_id, substitution_type, confidence, notes)
VALUES
  ('pine_48x148_c24', 'pressure_treated_48x148', 'upgrade', 'verified',
    'Same nominal dimension; use treated timber where moisture exposure matters.'),
  ('pressure_treated_48x148', 'pine_48x148_c24', 'budget', 'verified',
    'Cheaper dry-location alternative; do not use where treated timber is required.'),
  ('osb_9mm', 'osb_11mm', 'upgrade', 'verified',
    'Slightly thicker OSB panel for sheathing and boarding use cases.'),
  ('osb_18mm', 'nest_box_plywood', 'alternative', 'verified',
    'Plywood alternative for panel work where higher stiffness is useful.'),
  ('insulation_100mm', 'mineral_wool_150', 'upgrade', 'verified',
    'Thicker mineral wool option with better thermal performance where cavity depth allows.'),
  ('galvanized_roofing', 'metal_roof_ruukki', 'upgrade', 'verified',
    'Premium metal roofing alternative from a Finnish roofing supplier.'),
  ('metal_roof_ruukki', 'galvanized_roofing', 'budget', 'verified',
    'Lower-cost galvanized roofing alternative when premium profile is not required.'),
  ('vapor_barrier', 'wind_barrier', 'alternative', 'suggested',
    'Building membrane alternative; confirm wall assembly requirements before swapping.'),
  ('screws_50mm', 'wood_screw_5x80', 'alternative', 'suggested',
    'Wood screw alternative; confirm length and structural requirement before swapping.'),
  ('concrete_block', 'concrete_c25', 'alternative', 'suggested',
    'Concrete alternative for masonry/foundation work; quantities and formwork differ.')
ON CONFLICT (material_id, substitute_id) DO UPDATE SET
  substitution_type = EXCLUDED.substitution_type,
  confidence = EXCLUDED.confidence,
  notes = EXCLUDED.notes;
