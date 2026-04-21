/**
 * Energy class calculator for Finnish buildings.
 *
 * Estimates a building's energy class (A-G) based on Finnish energy
 * performance certificate standards (energiatodistus). Classes are
 * defined in terms of kWh/m2/year for small residential buildings
 * (< 120 m2, "pientalot"). The thresholds come from the Finnish
 * Ministry of the Environment decree on energy certificates.
 *
 * The calculator:
 *   1. Estimates the "before" class from building year and heating type.
 *   2. Estimates the "after" class by applying savings from BOM upgrades
 *      (insulation, windows, heat pumps).
 *   3. Returns the energy improvement as a percentage.
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/630
 */

// ---------------------------------------------------------------------------
// Energy class thresholds (kWh/m2/year) -- small residential buildings
// ---------------------------------------------------------------------------
export const ENERGY_CLASS_THRESHOLDS: { class: string; maxKwhM2: number }[] = [
  { class: "A", maxKwhM2: 75 },
  { class: "B", maxKwhM2: 100 },
  { class: "C", maxKwhM2: 130 },
  { class: "D", maxKwhM2: 160 },
  { class: "E", maxKwhM2: 190 },
  { class: "F", maxKwhM2: 240 },
  // G is everything above 240
];

/**
 * Classify an energy consumption value (kWh/m2/year) into a letter class.
 */
export function classifyEnergy(kwhPerM2: number): string {
  for (const threshold of ENERGY_CLASS_THRESHOLDS) {
    if (kwhPerM2 <= threshold.maxKwhM2) return threshold.class;
  }
  return "G";
}

// ---------------------------------------------------------------------------
// Baseline energy estimation from building characteristics
// ---------------------------------------------------------------------------

/** Rough energy consumption estimate (kWh/m2/year) by decade of construction. */
const ERA_ENERGY: Record<string, number> = {
  "pre-1960": 280,
  "1960s": 250,
  "1970s": 220,
  "1980s": 190,
  "1990s": 160,
  "2000s": 130,
  "2010s": 100,
  "2020s": 80,
};

function eraKey(year: number): string {
  if (year < 1960) return "pre-1960";
  if (year < 1970) return "1960s";
  if (year < 1980) return "1970s";
  if (year < 1990) return "1980s";
  if (year < 2000) return "1990s";
  if (year < 2010) return "2000s";
  if (year < 2020) return "2010s";
  return "2020s";
}

/** Heating type multiplier -- district heating and heat pumps are more efficient. */
const HEATING_MULTIPLIER: Record<string, number> = {
  kaukolampo: 0.85,
  maalampopumppu: 0.65,
  sahko: 1.0,
  oljy: 1.15,
  puu: 1.05,
};

export function estimateBaselineEnergy(
  yearBuilt: number,
  heatingType?: string,
): number {
  const base = ERA_ENERGY[eraKey(yearBuilt)] ?? 200;
  const multiplier = heatingType
    ? HEATING_MULTIPLIER[heatingType] ?? 1.0
    : 1.0;
  return Math.round(base * multiplier);
}

// ---------------------------------------------------------------------------
// Improvement estimation from BOM upgrades
// ---------------------------------------------------------------------------

/**
 * Material IDs (or substrings) that indicate energy-improving upgrades,
 * along with their estimated percentage reduction contribution.
 */
const UPGRADE_SAVINGS: { pattern: string; savingsPercent: number }[] = [
  { pattern: "insulation", savingsPercent: 15 },
  { pattern: "eriste", savingsPercent: 15 },
  { pattern: "mineraalivilla", savingsPercent: 12 },
  { pattern: "window", savingsPercent: 10 },
  { pattern: "ikkuna", savingsPercent: 10 },
  { pattern: "heat_pump", savingsPercent: 25 },
  { pattern: "lampopumppu", savingsPercent: 25 },
  { pattern: "maalampopumppu", savingsPercent: 25 },
  { pattern: "ilp", savingsPercent: 15 },
  { pattern: "solar", savingsPercent: 8 },
  { pattern: "aurinko", savingsPercent: 8 },
  { pattern: "led", savingsPercent: 3 },
  { pattern: "door", savingsPercent: 3 },
  { pattern: "ovi", savingsPercent: 3 },
];

/**
 * Estimate the total energy savings percentage from BOM material IDs.
 * Multiple upgrades stack but are capped at 60% total reduction.
 */
export function estimateSavingsFromBom(
  bomMaterialIds: string[],
): number {
  const seen = new Set<string>();
  let totalSavings = 0;

  for (const materialId of bomMaterialIds) {
    const lower = materialId.toLowerCase();
    for (const upgrade of UPGRADE_SAVINGS) {
      if (!seen.has(upgrade.pattern) && lower.includes(upgrade.pattern)) {
        seen.add(upgrade.pattern);
        totalSavings += upgrade.savingsPercent;
      }
    }
  }

  // Cap at 60% -- full renovation rarely achieves more
  return Math.min(totalSavings, 60);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildingInfo {
  year_built?: number;
  heating?: string;
  area_m2?: number;
  type?: string;
}

export interface BomItem {
  material_id: string;
  quantity: number;
  unit: string;
}

export interface EnergyClassResult {
  before: string;
  after: string;
  savingsPercent: number;
  kwhBefore: number;
  kwhAfter: number;
}

/**
 * Calculate energy class before and after renovation.
 *
 * @param buildingInfo - Building metadata (year, heating type, etc.)
 * @param bom - Bill of materials with material IDs for upgrade detection
 * @returns Energy classes before/after and savings percentage
 */
export function calculateEnergyClass(
  buildingInfo: BuildingInfo,
  bom: BomItem[],
): EnergyClassResult {
  const yearBuilt = buildingInfo.year_built ?? 1980;
  const heating = buildingInfo.heating;

  const kwhBefore = estimateBaselineEnergy(yearBuilt, heating);
  const classBefore = classifyEnergy(kwhBefore);

  const materialIds = bom.map((item) => item.material_id);
  const savingsPercent = estimateSavingsFromBom(materialIds);

  const kwhAfter = Math.round(kwhBefore * (1 - savingsPercent / 100));
  const classAfter = classifyEnergy(kwhAfter);

  return {
    before: classBefore,
    after: classAfter,
    savingsPercent,
    kwhBefore,
    kwhAfter,
  };
}
