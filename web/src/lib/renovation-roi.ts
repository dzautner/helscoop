import type { BomItem, BuildingInfo, Material } from "@/types";
import { calculateQuote, defaultQuoteConfig } from "@/lib/quote-engine";
import { buildHouseholdDeductionRows, calculateHouseholdDeduction } from "@/lib/household-deduction";
import { detectHeatingGrantOpportunity } from "@/lib/heating-grant-context";

export type RenovationCategory =
  | "energy"
  | "roof"
  | "kitchen"
  | "bathroom"
  | "facade"
  | "windows"
  | "outdoor"
  | "general";

export interface RenovationRoiEstimate {
  category: RenovationCategory;
  materialCost: number;
  labourCost: number;
  grossCost: number;
  bestSubsidy: {
    type: "ely" | "household_deduction" | "none";
    amount: number;
    warning: string;
  };
  netCost: number;
  estimatedValueIncrease: number;
  valueRetentionRate: number;
  annualEnergySavings: number;
  paybackYears: number | null;
  roiPercent: number;
  timing: {
    status: "act_now" | "favourable" | "neutral";
    headline: string;
    reasons: string[];
  };
  assumptions: string[];
  summary: string;
}

export const ROI_MARKET_CONFIG_2026 = {
  sourceCheckedAt: "2026-04-21",
  euribor12mPercent: 2.685,
  renovationLoanMarginAssumptionPercent: 1.25,
  electricityPriceAssumptionEurPerKwh: 0.18,
  contractorMarket: "Renovation demand is treated as buyer-favourable while new construction remains weak.",
  bankOfFinlandSourceUrl: "https://www.suomenpankki.fi/en/statistics/data-and-charts/interest-rates/charts/korot_kuviot/euriborkorot_pv_chrt_en/",
} as const;

const CATEGORY_RULES: Record<RenovationCategory, {
  terms: RegExp[];
  valueRetentionRate: number;
  energySavingsPercent: number;
}> = {
  energy: {
    terms: [/heat[\s_-]?pump/i, /l(?:a|ä)mp(?:o|ö)/i, /hvac/i, /maal/i, /ilma[\s_-]?vesi/i, /district/i, /eristys/i, /insulation/i],
    valueRetentionRate: 0.5,
    energySavingsPercent: 0.22,
  },
  roof: {
    terms: [/roof/i, /katto/i, /bitumen/i, /tiili/i, /pelti/i],
    valueRetentionRate: 0.55,
    energySavingsPercent: 0.05,
  },
  kitchen: {
    terms: [/kitchen/i, /keitti(?:o|ö)/i, /cabinet/i, /countertop/i],
    valueRetentionRate: 0.45,
    energySavingsPercent: 0,
  },
  bathroom: {
    terms: [/bath/i, /wc/i, /sauna/i, /wetroom/i, /m(?:a|ä)rk(?:a|ä)tila/i, /waterproof/i],
    valueRetentionRate: 0.5,
    energySavingsPercent: 0,
  },
  facade: {
    terms: [/facade/i, /julkisivu/i, /cladding/i, /siding/i, /panel/i],
    valueRetentionRate: 0.45,
    energySavingsPercent: 0.04,
  },
  windows: {
    terms: [/window/i, /ikkuna/i, /glazing/i, /triple/i],
    valueRetentionRate: 0.4,
    energySavingsPercent: 0.08,
  },
  outdoor: {
    terms: [/deck/i, /terrace/i, /terassi/i, /yard/i, /piha/i],
    valueRetentionRate: 0.25,
    energySavingsPercent: 0,
  },
  general: {
    terms: [],
    valueRetentionRate: 0.32,
    energySavingsPercent: 0,
  },
};

function round(value: number): number {
  return Math.round(value);
}

function materialText(bom: BomItem[], materials: Material[]): string {
  const byId = new Map(materials.map((material) => [material.id, material]));
  return bom.flatMap((item) => {
    const material = byId.get(item.material_id);
    return [
      item.material_id,
      item.material_name,
      item.category_name,
      material?.name,
      material?.name_fi,
      material?.name_en,
      material?.category_name,
      material?.category_name_fi,
      ...(material?.tags ?? []),
    ];
  }).filter(Boolean).join(" ");
}

export function detectRenovationCategory(bom: BomItem[], materials: Material[]): RenovationCategory {
  const haystack = materialText(bom, materials);
  const categories: RenovationCategory[] = ["energy", "roof", "bathroom", "kitchen", "windows", "facade", "outdoor"];
  for (const category of categories) {
    if (CATEGORY_RULES[category].terms.some((term) => term.test(haystack))) return category;
  }
  return "general";
}

function estimateBaselineEnergyCost(buildingInfo?: BuildingInfo | null): number {
  const area = Math.max(80, Math.min(260, Number(buildingInfo?.area_m2 ?? 140)));
  const heatingFactor = /(?:o|ö)ljy|oil|electric|s(?:a|ä)hk/i.test(buildingInfo?.heating ?? "") ? 1.15 : 1;
  return area * 145 * ROI_MARKET_CONFIG_2026.electricityPriceAssumptionEurPerKwh * heatingFactor;
}

function estimateElyGrant(bom: BomItem[], materials: Material[], buildingInfo?: BuildingInfo | null): number {
  const opportunity = detectHeatingGrantOpportunity({ bom, materials, buildingInfo });
  if (!opportunity.fossilSourceHeating || !opportunity.detectedTargetHeating) return 0;
  return opportunity.detectedTargetHeating === "district_heat" ||
    opportunity.detectedTargetHeating === "ground_source_heat_pump" ||
    opportunity.detectedTargetHeating === "air_water_heat_pump"
    ? 4000
    : 2500;
}

export function estimateRenovationRoi(
  bom: BomItem[],
  materials: Material[],
  buildingInfo?: BuildingInfo | null,
  options: { coupleMode?: boolean } = {},
): RenovationRoiEstimate | null {
  if (bom.length === 0) return null;

  const quote = calculateQuote(bom, materials, defaultQuoteConfig("homeowner"));
  const deduction = calculateHouseholdDeduction(buildHouseholdDeductionRows(quote), {
    coupleMode: options.coupleMode,
  });
  const elyGrant = estimateElyGrant(bom, materials, buildingInfo);
  const category = detectRenovationCategory(bom, materials);
  const rule = CATEGORY_RULES[category];
  const householdCredit = deduction.credit;
  const bestSubsidy =
    elyGrant > householdCredit
      ? {
          type: "ely" as const,
          amount: elyGrant,
          warning: "ELY and household deduction cannot be combined for the same work.",
        }
      : householdCredit > 0
        ? {
            type: "household_deduction" as const,
            amount: householdCredit,
            warning: elyGrant > 0
              ? "Household deduction beats ELY on this estimate; do not claim both for the same work."
              : "Confirm contractor prepayment-register status before relying on the deduction.",
          }
        : {
            type: "none" as const,
            amount: 0,
            warning: "No automatic subsidy offset detected from current BOM and building data.",
          };

  const grossCost = quote.grandTotal;
  const netCost = Math.max(0, grossCost - bestSubsidy.amount);
  const estimatedValueIncrease = round(grossCost * rule.valueRetentionRate);
  const annualEnergySavings = round(estimateBaselineEnergyCost(buildingInfo) * rule.energySavingsPercent);
  const paybackYears = annualEnergySavings > 0 ? Math.round((netCost / annualEnergySavings) * 10) / 10 : null;
  const valuePlusTenYearSavings = estimatedValueIncrease + annualEnergySavings * 10;
  const roiPercent = netCost > 0 ? Math.round(((valuePlusTenYearSavings - netCost) / netCost) * 100) : 0;

  const reasons: string[] = [];
  if (ROI_MARKET_CONFIG_2026.euribor12mPercent < 3) {
    reasons.push(`12-month Euribor config is ${ROI_MARKET_CONFIG_2026.euribor12mPercent.toFixed(2)}%, below the 3% caution threshold.`);
  }
  reasons.push(`Contractor market assumption: ${ROI_MARKET_CONFIG_2026.contractorMarket}`);
  if (elyGrant > 0) {
    reasons.push("Energy grant deadline pressure favours acting before the 2026 application cutoff.");
  }
  if ((buildingInfo?.year_built ?? 2026) <= 1990) {
    reasons.push("Older detached-house stock has higher deferred-maintenance risk.");
  }
  if (reasons.length === 0) {
    reasons.push("No urgent subsidy or ageing-building signal detected.");
  }

  const timingStatus = elyGrant > 0 ? "act_now" : ROI_MARKET_CONFIG_2026.euribor12mPercent < 3 ? "favourable" : "neutral";
  const timing = {
    status: timingStatus,
    headline: timingStatus === "act_now"
      ? "Act before subsidy deadlines"
      : timingStatus === "favourable"
        ? "Market timing is favourable"
        : "Timing is neutral",
    reasons,
  } satisfies RenovationRoiEstimate["timing"];

  const assumptions = [
    `Property value impact uses a ${Math.round(rule.valueRetentionRate * 100)}% retained-value heuristic for ${category} renovations.`,
    `Energy payback uses ${ROI_MARKET_CONFIG_2026.electricityPriceAssumptionEurPerKwh.toFixed(2)} EUR/kWh as a planning assumption.`,
    `Market config checked ${ROI_MARKET_CONFIG_2026.sourceCheckedAt}; replace with live bank/energy data before giving financing advice.`,
  ];

  return {
    category,
    materialCost: round(quote.materialSubtotal * (1 + quote.config.vatRate)),
    labourCost: round(quote.labourSubtotal * (1 + quote.config.vatRate)),
    grossCost: round(grossCost),
    bestSubsidy: {
      ...bestSubsidy,
      amount: round(bestSubsidy.amount),
    },
    netCost: round(netCost),
    estimatedValueIncrease,
    valueRetentionRate: rule.valueRetentionRate,
    annualEnergySavings,
    paybackYears,
    roiPercent,
    timing,
    assumptions,
    summary: `Cost ${round(grossCost)} EUR including ${round(quote.materialSubtotal * (1 + quote.config.vatRate))} EUR materials and ${round(quote.labourSubtotal * (1 + quote.config.vatRate))} EUR labour, best subsidy ${round(bestSubsidy.amount)} EUR (${bestSubsidy.type}), net ${round(netCost)} EUR, estimated value impact ${estimatedValueIncrease} EUR, 10-year ROI ${roiPercent}%. Timing: ${timing.headline}.`,
  };
}
