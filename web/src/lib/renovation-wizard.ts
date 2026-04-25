import type { BomItem, BuildingInfo, Material } from "@/types";

export type WizardRenovationType = "kitchen" | "bathroom" | "facade" | "roof" | "full_house" | "extension";
export type WizardStepId = "scope" | "house" | "current" | "design" | "review";
export type WizardHouseSize = "compact" | "standard" | "large" | "estate";
export type WizardCurrentState = "modern" | "dated" | "cold" | "unknown";
export type WizardDesignTier = "good" | "better" | "best";
export type WizardEnergyUpgrade = "none" | "insulation" | "windows" | "heating";

export interface WizardOption<T extends string> {
  id: T;
  label: string;
  description: string;
  costHint: string;
}

export interface RenovationWizardState {
  renovationType: WizardRenovationType;
  houseSize: WizardHouseSize;
  currentState: WizardCurrentState;
  designTier: WizardDesignTier;
  energyUpgrade: WizardEnergyUpgrade;
}

export interface WizardBomRow {
  material_id: string;
  quantity: number;
  unit: string;
  note: string;
}

export interface GuidedRenovationPlan {
  name: string;
  description: string;
  sceneJs: string;
  bom: BomItem[];
  bomRows: WizardBomRow[];
  estimatedCost: number;
}

export const WIZARD_SCOPE_OPTIONS: WizardOption<WizardRenovationType>[] = [
  { id: "kitchen", label: "Kitchen", description: "Cabinets, wall finish, floor and lighting-ready surfaces.", costHint: "8-25k EUR" },
  { id: "bathroom", label: "Bathroom", description: "Wet-room shell, waterproofing, floor and ventilation assumptions.", costHint: "10-30k EUR" },
  { id: "facade", label: "Facade", description: "Cladding, insulation layer and exterior paint package.", costHint: "12-45k EUR" },
  { id: "roof", label: "Roof", description: "Roofing sheets, flashing and insulation checks.", costHint: "15-55k EUR" },
  { id: "full_house", label: "Full house", description: "Envelope, interior refresh and phased material plan.", costHint: "40-120k EUR" },
  { id: "extension", label: "Extension", description: "New slab, frame, envelope and handover-ready shell.", costHint: "35-150k EUR" },
];

export const WIZARD_HOUSE_SIZE_OPTIONS: WizardOption<WizardHouseSize>[] = [
  { id: "compact", label: "< 80 m2", description: "Small detached house, cottage or single-room project.", costHint: "0.75x" },
  { id: "standard", label: "80-140 m2", description: "Typical Finnish omakotitalo scope.", costHint: "1.0x" },
  { id: "large", label: "140-220 m2", description: "Large family house or multi-room renovation.", costHint: "1.35x" },
  { id: "estate", label: "220+ m2", description: "Large property with bigger envelope and logistics load.", costHint: "1.7x" },
];

export const WIZARD_CURRENT_STATE_OPTIONS: WizardOption<WizardCurrentState>[] = [
  { id: "modern", label: "Modernized", description: "Updated after 2010; fewer hidden-risk allowances.", costHint: "-8%" },
  { id: "dated", label: "Dated", description: "Typical 1980-2009 condition; standard contingency.", costHint: "Base" },
  { id: "cold", label: "Cold / original", description: "Older envelope, weak insulation or unknown structures.", costHint: "+18%" },
  { id: "unknown", label: "Not sure", description: "Keep risk buffer until inspection or contractor visit.", costHint: "+10%" },
];

export const WIZARD_DESIGN_TIER_OPTIONS: WizardOption<WizardDesignTier>[] = [
  { id: "good", label: "Good", description: "Durable standard materials, tight budget control.", costHint: "1.0x" },
  { id: "better", label: "Better", description: "Improved finish, insulation and longer service life.", costHint: "1.25x" },
  { id: "best", label: "Best", description: "Premium finish, higher comfort and resale story.", costHint: "1.6x" },
];

export const WIZARD_ENERGY_OPTIONS: WizardOption<WizardEnergyUpgrade>[] = [
  { id: "none", label: "No energy add-on", description: "Keep scope focused on visible renovation.", costHint: "0 EUR" },
  { id: "insulation", label: "Add insulation", description: "Upgrade envelope while surfaces are open.", costHint: "+4-18k EUR" },
  { id: "windows", label: "Window allowance", description: "Reserve budget for openings and cold-bridge fixes.", costHint: "+6-24k EUR" },
  { id: "heating", label: "Heating readiness", description: "Prepare BOM for heat-pump or radiator work.", costHint: "+5-20k EUR" },
];

export const DEFAULT_RENOVATION_WIZARD_STATE: RenovationWizardState = {
  renovationType: "bathroom",
  houseSize: "standard",
  currentState: "dated",
  designTier: "better",
  energyUpgrade: "none",
};

const AREA_BY_SIZE: Record<WizardHouseSize, number> = {
  compact: 70,
  standard: 120,
  large: 180,
  estate: 260,
};

const SCOPE_AREA_FACTOR: Record<WizardRenovationType, number> = {
  kitchen: 0.18,
  bathroom: 0.12,
  facade: 1.05,
  roof: 0.9,
  full_house: 1.25,
  extension: 0.32,
};

const BASE_RATE: Record<WizardRenovationType, number> = {
  kitchen: 920,
  bathroom: 1450,
  facade: 260,
  roof: 310,
  full_house: 520,
  extension: 1800,
};

const TIER_MULTIPLIER: Record<WizardDesignTier, number> = {
  good: 1,
  better: 1.25,
  best: 1.6,
};

const STATE_MULTIPLIER: Record<WizardCurrentState, number> = {
  modern: 0.92,
  dated: 1,
  cold: 1.18,
  unknown: 1.1,
};

const ENERGY_ALLOWANCE: Record<WizardEnergyUpgrade, number> = {
  none: 0,
  insulation: 8500,
  windows: 12000,
  heating: 9500,
};

const MATERIAL_FALLBACK: Record<string, { name: string; category: string; unitPrice: number }> = {
  pine_48x98_c24: { name: "48x98 Framing timber C24", category: "lumber", unitPrice: 2.6 },
  pine_48x148_c24: { name: "48x148 Floor joist C24", category: "lumber", unitPrice: 4.8 },
  osb_18mm: { name: "OSB 18mm floor board", category: "sheathing", unitPrice: 18 },
  osb_9mm: { name: "OSB 9mm board", category: "sheathing", unitPrice: 10 },
  insulation_100mm: { name: "Mineral wool 100mm", category: "insulation", unitPrice: 8 },
  vapor_barrier: { name: "PE vapor barrier", category: "membrane", unitPrice: 1.5 },
  exterior_board_yellow: { name: "Exterior cladding board", category: "cladding", unitPrice: 3.4 },
  exterior_paint_white: { name: "Exterior paint", category: "finish", unitPrice: 12 },
  galvanized_roofing: { name: "Galvanized roof sheet", category: "roofing", unitPrice: 22 },
  galvanized_flashing: { name: "Galvanized flashing", category: "roofing", unitPrice: 9 },
  trim_21x45: { name: "Interior trim 21x45", category: "trim", unitPrice: 2.2 },
  concrete_block: { name: "Concrete block 200mm", category: "masonry", unitPrice: 4.5 },
};

function scopeArea(state: RenovationWizardState, buildingInfo?: BuildingInfo | null): number {
  const baseArea = Number(buildingInfo?.area_m2 || AREA_BY_SIZE[state.houseSize]);
  return Math.max(8, Math.round(baseArea * SCOPE_AREA_FACTOR[state.renovationType]));
}

export function estimateWizardCost(state: RenovationWizardState, buildingInfo?: BuildingInfo | null): number {
  const area = scopeArea(state, buildingInfo);
  const labourAndMaterials = area * BASE_RATE[state.renovationType] * TIER_MULTIPLIER[state.designTier] * STATE_MULTIPLIER[state.currentState];
  return Math.round((labourAndMaterials + ENERGY_ALLOWANCE[state.energyUpgrade]) / 100) * 100;
}

function rowsForScope(state: RenovationWizardState, buildingInfo?: BuildingInfo | null): WizardBomRow[] {
  const area = scopeArea(state, buildingInfo);
  const frameLm = Math.max(20, Math.round(area * 2.8));
  const surfaceM2 = Math.max(12, Math.round(area * 1.15));
  const envelopeM2 = Math.max(30, Math.round(area));

  const rows: WizardBomRow[] = [];
  if (state.renovationType === "extension") {
    rows.push({ material_id: "concrete_block", quantity: Math.round(area * 2.2), unit: "kpl", note: "Foundation allowance" });
    rows.push({ material_id: "pine_48x98_c24", quantity: frameLm, unit: "jm", note: "Wall frame" });
    rows.push({ material_id: "pine_48x148_c24", quantity: Math.round(area * 1.3), unit: "jm", note: "Floor and roof framing" });
  }
  if (state.renovationType === "roof" || state.renovationType === "extension" || state.renovationType === "full_house") {
    rows.push({ material_id: "galvanized_roofing", quantity: envelopeM2, unit: "m2", note: "Roof sheet allowance" });
    rows.push({ material_id: "galvanized_flashing", quantity: Math.round(Math.sqrt(envelopeM2) * 5), unit: "jm", note: "Edges and penetrations" });
  }
  if (state.renovationType === "facade" || state.renovationType === "extension" || state.renovationType === "full_house") {
    rows.push({ material_id: "exterior_board_yellow", quantity: envelopeM2, unit: "jm", note: "Exterior cladding" });
    rows.push({ material_id: "exterior_paint_white", quantity: Math.ceil(envelopeM2 / 8), unit: "l", note: "Exterior finish" });
  }
  if (state.renovationType === "kitchen" || state.renovationType === "bathroom" || state.renovationType === "full_house") {
    rows.push({ material_id: "osb_18mm", quantity: surfaceM2, unit: "m2", note: "Floor and backing board" });
    rows.push({ material_id: "trim_21x45", quantity: Math.round(Math.sqrt(area) * 8), unit: "jm", note: "Finish trim" });
  }
  if (state.renovationType === "bathroom") {
    rows.push({ material_id: "vapor_barrier", quantity: surfaceM2, unit: "m2", note: "Wet-room membrane proxy" });
  }
  if (state.energyUpgrade === "insulation" || state.renovationType === "facade" || state.renovationType === "extension") {
    rows.push({ material_id: "insulation_100mm", quantity: envelopeM2, unit: "m2", note: "Envelope insulation" });
  }
  if (state.energyUpgrade === "windows") {
    rows.push({ material_id: "osb_9mm", quantity: Math.max(6, Math.round(area / 10)), unit: "m2", note: "Opening repair allowance" });
  }
  if (state.energyUpgrade === "heating") {
    rows.push({ material_id: "vapor_barrier", quantity: Math.max(10, Math.round(area / 3)), unit: "m2", note: "Heating route protection allowance" });
  }
  return rows;
}

function materialFor(id: string, materials: Material[]): Material | undefined {
  return materials.find((material) => material.id === id);
}

export function hydrateWizardBomRows(rows: WizardBomRow[], materials: Material[] = []): BomItem[] {
  return rows.map((row) => {
    const material = materialFor(row.material_id, materials);
    const primary = material?.pricing?.find((price) => price.is_primary) ?? material?.pricing?.[0];
    const fallback = MATERIAL_FALLBACK[row.material_id] ?? { name: row.material_id, category: "wizard", unitPrice: 0 };
    const unitPrice = Number(primary?.unit_price ?? fallback.unitPrice ?? 0);
    return {
      material_id: row.material_id,
      material_name: material?.name_en || material?.name_fi || material?.name || fallback.name,
      category_name: material?.category_name || fallback.category,
      image_url: material?.image_url,
      quantity: row.quantity,
      unit: row.unit || material?.design_unit || primary?.unit || "kpl",
      unit_price: unitPrice,
      total: unitPrice * row.quantity,
      supplier: primary?.supplier_name,
      link: primary?.link,
      in_stock: primary?.in_stock,
      stock_level: primary?.stock_level ?? "unknown",
      store_location: primary?.store_location,
      stock_last_checked_at: primary?.last_checked_at,
      note: row.note,
      manual_override: true,
    };
  });
}

export function buildWizardScene(state: RenovationWizardState): string {
  const scale = state.houseSize === "compact" ? 0.85 : state.houseSize === "large" ? 1.25 : state.houseSize === "estate" ? 1.55 : 1;
  const width = state.renovationType === "bathroom" ? 3.2 : state.renovationType === "kitchen" ? 4.6 : 7 * scale;
  const depth = state.renovationType === "bathroom" ? 2.4 : state.renovationType === "kitchen" ? 3.2 : 5 * scale;
  const height = state.renovationType === "extension" ? 3.1 : 2.7;
  const roofHeight = state.renovationType === "roof" || state.renovationType === "full_house" || state.renovationType === "extension" ? 0.55 : 0.18;
  const facadeMaterial = state.renovationType === "roof" ? "galvanized_roofing" : "exterior_board_yellow";
  const interiorMaterial = state.designTier === "best" ? "trim_21x45" : "osb_18mm";

  return `// Helscoop guided renovation wizard
// Scope: ${state.renovationType}, tier: ${state.designTier}, energy: ${state.energyUpgrade}

const floor = box(${width.toFixed(2)}, 0.18, ${depth.toFixed(2)});
const backWall = translate(box(${width.toFixed(2)}, ${height.toFixed(2)}, 0.16), 0, ${(height / 2 + 0.09).toFixed(2)}, ${(-depth / 2).toFixed(2)});
const leftWall = translate(box(0.16, ${height.toFixed(2)}, ${depth.toFixed(2)}), ${(-width / 2).toFixed(2)}, ${(height / 2 + 0.09).toFixed(2)}, 0);
const rightWall = translate(box(0.16, ${height.toFixed(2)}, ${depth.toFixed(2)}), ${(width / 2).toFixed(2)}, ${(height / 2 + 0.09).toFixed(2)}, 0);
const roof = translate(box(${(width + 0.45).toFixed(2)}, ${roofHeight.toFixed(2)}, ${(depth + 0.45).toFixed(2)}), 0, ${(height + 0.45).toFixed(2)}, 0);
const feature = translate(box(${Math.max(0.8, width * 0.28).toFixed(2)}, 0.12, ${Math.max(0.8, depth * 0.28).toFixed(2)}), 0, 0.32, 0);

scene.add(floor, { material: "concrete_block", color: [0.58, 0.58, 0.55] });
scene.add(backWall, { material: "${state.renovationType === "bathroom" ? "vapor_barrier" : facadeMaterial}", color: [0.82, 0.72, 0.55] });
scene.add(leftWall, { material: "${interiorMaterial}", color: [0.86, 0.80, 0.68] });
scene.add(rightWall, { material: "${interiorMaterial}", color: [0.86, 0.80, 0.68] });
scene.add(roof, { material: "${state.renovationType === "roof" ? "galvanized_roofing" : "exterior_board_yellow"}", color: [0.45, 0.50, 0.48] });
scene.add(feature, { material: "${state.energyUpgrade === "insulation" ? "insulation_100mm" : interiorMaterial}", color: [0.95, 0.82, 0.48] });
`;
}

export function buildGuidedRenovationPlan(
  state: RenovationWizardState,
  materials: Material[] = [],
  buildingInfo?: BuildingInfo | null,
): GuidedRenovationPlan {
  const typeLabel = WIZARD_SCOPE_OPTIONS.find((option) => option.id === state.renovationType)?.label ?? "Renovation";
  const tierLabel = WIZARD_DESIGN_TIER_OPTIONS.find((option) => option.id === state.designTier)?.label ?? state.designTier;
  const rows = rowsForScope(state, buildingInfo);
  const bom = hydrateWizardBomRows(rows, materials);
  const estimatedCost = estimateWizardCost(state, buildingInfo);

  return {
    name: `${typeLabel} renovation plan`,
    description: `${tierLabel} guided ${typeLabel.toLowerCase()} plan generated from the Helscoop renovation wizard. Estimated budget ${estimatedCost.toLocaleString("en-GB")} EUR.`,
    sceneJs: buildWizardScene(state),
    bom,
    bomRows: rows,
    estimatedCost,
  };
}
