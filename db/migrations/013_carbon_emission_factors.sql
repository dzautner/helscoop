-- Migration 013: Carbon emission factors for LCA compliance
--
-- Adds CO₂ emission factor data to materials for embodied carbon
-- calculations per the Finnish Rakentamislaki framework.

-- ---------------------------------------------------------------------------
-- Add co2_factor_kg column to materials table
-- Stores kg CO₂-eq per material unit (e.g. per jm, m², kpl, etc.)
-- ---------------------------------------------------------------------------
ALTER TABLE materials ADD COLUMN IF NOT EXISTS co2_factor_kg NUMERIC;

-- ---------------------------------------------------------------------------
-- Seed realistic emission factors for existing materials
-- Sources: Finnish CO2data.fi, IVL EPD database, generic LCA literature
-- ---------------------------------------------------------------------------

-- Lumber: ~30 kg CO₂-eq per m³ (biogenic carbon roughly neutral, processing only)
-- For sawn timber at ~0.048 m² cross-section per jm → ~1.4 kg/jm
UPDATE materials SET co2_factor_kg = 1.4 WHERE id = 'pine_48x98_c24';
UPDATE materials SET co2_factor_kg = 2.1 WHERE id = 'pine_48x148_c24';

-- Pressure-treated lumber: higher due to CCA/copper treatment
UPDATE materials SET co2_factor_kg = 3.2 WHERE id = 'pressure_treated_48x148';
UPDATE materials SET co2_factor_kg = 5.5 WHERE id = 'pressure_treated_148x148';
UPDATE materials SET co2_factor_kg = 2.8 WHERE id = 'cedar_post_98x98';

-- OSB/panels: ~350 kg CO₂-eq per m³
UPDATE materials SET co2_factor_kg = 3.15 WHERE id = 'osb_9mm';    -- per sheet (~0.009 m³)
UPDATE materials SET co2_factor_kg = 6.30 WHERE id = 'osb_18mm';   -- per sheet (~0.018 m³)
UPDATE materials SET co2_factor_kg = 3.50 WHERE id = 'osb_11mm';   -- per m²

-- Cladding
UPDATE materials SET co2_factor_kg = 1.8 WHERE id = 'exterior_board_yellow'; -- per sheet

-- Roofing: galvanized steel ~2.5 kg CO₂-eq per kg, ~5 kg/m²
UPDATE materials SET co2_factor_kg = 12.5 WHERE id = 'galvanized_roofing';  -- per m²
UPDATE materials SET co2_factor_kg = 3.8 WHERE id = 'galvanized_flashing';  -- per jm

-- Insulation: mineral wool ~1.2 kg CO₂-eq per kg, ~3.6 kg/m² at 100mm
UPDATE materials SET co2_factor_kg = 3.6 WHERE id = 'insulation_100mm';     -- per m²
UPDATE materials SET co2_factor_kg = 5.4 WHERE id = 'mineral_wool_150';     -- per m²

-- Concrete: ~200 kg CO₂-eq per m³
UPDATE materials SET co2_factor_kg = 8.0 WHERE id = 'concrete_block';       -- per kpl (~0.04 m³)
UPDATE materials SET co2_factor_kg = 200.0 WHERE id = 'concrete_c25';       -- per m³

-- Membranes
UPDATE materials SET co2_factor_kg = 0.5 WHERE id = 'vapor_barrier';        -- per m²
UPDATE materials SET co2_factor_kg = 2.1 WHERE id = 'wind_barrier';         -- per m²

-- Gypsum board: ~6.75 kg CO₂-eq per m²
UPDATE materials SET co2_factor_kg = 6.75 WHERE id = 'gypsum_board_13mm';   -- per m²

-- Metal roofing (Ruukki)
UPDATE materials SET co2_factor_kg = 14.0 WHERE id = 'metal_roof_ruukki';   -- per m²

-- Hardware/fasteners: steel-intensive but small quantities
UPDATE materials SET co2_factor_kg = 0.8 WHERE id = 'hardware_cloth';       -- per m²
UPDATE materials SET co2_factor_kg = 0.3 WHERE id = 'hinges_galvanized';    -- per kpl
UPDATE materials SET co2_factor_kg = 0.5 WHERE id = 'joist_hanger';         -- per kpl
UPDATE materials SET co2_factor_kg = 0.02 WHERE id = 'screws_50mm';         -- per kpl (box → per piece)
UPDATE materials SET co2_factor_kg = 0.01 WHERE id = 'wood_screw_5x80';     -- per kpl

-- Finishes: paint ~2-3 kg CO₂-eq per liter
UPDATE materials SET co2_factor_kg = 2.5 WHERE id = 'exterior_paint_red';
UPDATE materials SET co2_factor_kg = 2.5 WHERE id = 'exterior_paint_yellow';
UPDATE materials SET co2_factor_kg = 2.8 WHERE id = 'exterior_paint_gray_door';
UPDATE materials SET co2_factor_kg = 2.5 WHERE id = 'exterior_paint_white';

-- Sand: ~5 kg CO₂-eq per ton, negligible per 25kg bag
UPDATE materials SET co2_factor_kg = 0.13 WHERE id = 'builders_sand';       -- per 25kg bag

-- Plywood
UPDATE materials SET co2_factor_kg = 4.2 WHERE id = 'nest_box_plywood';     -- per sheet

-- Trim
UPDATE materials SET co2_factor_kg = 0.3 WHERE id = 'trim_21x45';           -- per jm
