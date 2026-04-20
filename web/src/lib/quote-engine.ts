/**
 * Quote engine for Helscoop renovation platform.
 * Implements Finnish VAT (25.5%), labour estimation, wastage, and contractor margins.
 */

import type { BomItem, Material } from "@/types";

/* ── Public types ──────────────────────────────────────────── */

export interface QuoteConfig {
  mode: "homeowner" | "contractor";
  /** VAT rate as a decimal, e.g. 0.255 for 25.5% (Finnish standard from Sept 2024) */
  vatRate: number;
  /** Labour rate in EUR per hour, e.g. 45 */
  labourRatePerHour: number;
  /** Wastage as a decimal, e.g. 0.10 for 10% */
  wastagePercent: number;
  /** Applied after VAT in contractor mode only */
  contractorMarginPercent?: number;
}

export interface QuoteLineItem {
  materialId: string;
  materialName: string;
  /** Quantity from the BOM before wastage */
  designQty: number;
  designUnit: string;
  /** Additional quantity added for wastage */
  wastageQty: number;
  /** Material cost including wastage, before VAT */
  materialCost: number;
  labourHours: number;
  labourCost: number;
  /** materialCost + labourCost, before VAT */
  subtotal: number;
  vatAmount: number;
  /** subtotal + vatAmount */
  total: number;
}

export interface Quote {
  lines: QuoteLineItem[];
  materialSubtotal: number;
  labourSubtotal: number;
  wastageTotal: number;
  /** Sum of all subtotals before VAT */
  subtotalExVat: number;
  vatTotal: number;
  grandTotal: number;
  /** Only present in contractor mode */
  contractorMargin?: number;
  config: QuoteConfig;
  generatedAt: string;
}

/* ── Labour hours lookup ───────────────────────────────────── */

/**
 * Labour hours per unit by material category.
 * Categories mirror those used in materials.json and BomPanel.
 */
const LABOUR_HOURS_BY_CATEGORY: Record<string, number> = {
  // Framing / lumber
  sahatavara: 0.5,
  lumber: 0.5,
  // Insulation
  eristys: 0.3,
  insulation: 0.3,
  // Roofing
  katto: 0.4,
  roofing: 0.4,
  // Foundation / concrete
  perustus: 1.0,
  foundation: 1.0,
  // Membrane / vapour barrier
  kalvo: 0.25,
  membrane: 0.25,
  // Fasteners / fixings
  kiinnitys: 0.1,
  fasteners: 0.1,
  // Interior finishes
  "sisä": 0.35,
  interior: 0.35,
};

const DEFAULT_LABOUR_HOURS_PER_UNIT = 0.2;

/** Return labour hours per unit for a given material. */
function getLabourHoursPerUnit(material: Material | null): number {
  if (!material) return DEFAULT_LABOUR_HOURS_PER_UNIT;

  const categoryName = (material.category_name || "").toLowerCase();

  // Check all known aliases
  for (const [key, hours] of Object.entries(LABOUR_HOURS_BY_CATEGORY)) {
    if (categoryName.includes(key)) return hours;
  }

  return DEFAULT_LABOUR_HOURS_PER_UNIT;
}

/* ── Helper ────────────────────────────────────────────────── */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function getMaterialName(material: Material | null, bomItem: BomItem): string {
  if (material) return material.name_en || material.name_fi || material.name;
  return bomItem.material_name || bomItem.material_id;
}

function getUnitPrice(material: Material | null, bomItem: BomItem): number {
  if (bomItem.unit_price != null) return Number(bomItem.unit_price);
  if (material?.pricing && material.pricing.length > 0) {
    const primary = material.pricing.find((p) => p.is_primary) || material.pricing[0];
    return Number(primary.unit_price);
  }
  return 0;
}

function getUnit(material: Material | null, bomItem: BomItem): string {
  if (bomItem.unit) return bomItem.unit;
  if (material?.pricing && material.pricing.length > 0) {
    const primary = material.pricing.find((p) => p.is_primary) || material.pricing[0];
    return primary.unit;
  }
  return "unit";
}

/* ── Core calculation ──────────────────────────────────────── */

/**
 * Calculate a full quote from a BOM and materials catalog.
 *
 * @param bomItems  - The bill of materials (quantity + material_id)
 * @param materials - Full materials catalog (for names, categories, pricing)
 * @param config    - Quote configuration (mode, VAT, labour rate, wastage, margin)
 * @returns         A fully calculated Quote with per-line and aggregate totals
 */
export function calculateQuote(
  bomItems: BomItem[],
  materials: Material[],
  config: QuoteConfig,
): Quote {
  const materialMap = new Map<string, Material>(materials.map((m) => [m.id, m]));

  const lines: QuoteLineItem[] = bomItems.map((item) => {
    const material = materialMap.get(item.material_id) ?? null;
    const designQty = round2(Number(item.quantity) || 0);
    const wastageQty = round2(designQty * config.wastagePercent);
    const totalQty = round2(designQty + wastageQty);

    const unitPrice = getUnitPrice(material, item);
    const materialCost = round2(totalQty * unitPrice);

    const labourHoursPerUnit = getLabourHoursPerUnit(material);
    const labourHours = round2(totalQty * labourHoursPerUnit);
    const labourCost = round2(labourHours * config.labourRatePerHour);

    const subtotal = round2(materialCost + labourCost);
    const vatAmount = round2(subtotal * config.vatRate);
    const total = round2(subtotal + vatAmount);

    return {
      materialId: item.material_id,
      materialName: getMaterialName(material, item),
      designQty,
      designUnit: getUnit(material, item),
      wastageQty,
      materialCost,
      labourHours,
      labourCost,
      subtotal,
      vatAmount,
      total,
    };
  });

  const materialSubtotal = round2(lines.reduce((s, l) => s + l.materialCost, 0));
  const labourSubtotal = round2(lines.reduce((s, l) => s + l.labourCost, 0));
  const wastageTotal = round2(
    lines.reduce((s, l) => {
      // Wastage cost = wastageQty * unitPrice
      const material = materialMap.get(l.materialId) ?? null;
      const unitPrice = material
        ? getUnitPrice(material, bomItems.find((b) => b.material_id === l.materialId)!)
        : 0;
      return s + round2(l.wastageQty * unitPrice);
    }, 0)
  );

  const subtotalExVat = round2(materialSubtotal + labourSubtotal);
  const vatTotal = round2(subtotalExVat * config.vatRate);
  let grandTotal = round2(subtotalExVat + vatTotal);

  let contractorMargin: number | undefined;
  if (config.mode === "contractor" && config.contractorMarginPercent != null) {
    contractorMargin = round2(grandTotal * config.contractorMarginPercent);
    grandTotal = round2(grandTotal + contractorMargin);
  }

  return {
    lines,
    materialSubtotal,
    labourSubtotal,
    wastageTotal,
    subtotalExVat,
    vatTotal,
    grandTotal,
    contractorMargin,
    config,
    generatedAt: new Date().toISOString(),
  };
}

/* ── Default config factory ────────────────────────────────── */

/** Finnish standard defaults: 25.5% VAT (Sept 2024), 45€/h labour, 10% wastage */
export function defaultQuoteConfig(
  mode: "homeowner" | "contractor" = "homeowner",
): QuoteConfig {
  return {
    mode,
    vatRate: 0.255,
    labourRatePerHour: 45,
    wastagePercent: 0.10,
    contractorMarginPercent: mode === "contractor" ? 0.15 : undefined,
  };
}
