import { describe, it, expect, vi } from "vitest";
import type { BomItem, Material, BuildingInfo } from "@/types";

vi.mock("@/lib/quote-engine", () => ({
  calculateQuote: vi.fn((_bom: unknown[], _materials: unknown[], _config: unknown) => ({
    materialSubtotal: 1000,
    labourSubtotal: 800,
    grandTotal: 2250,
    config: { vatRate: 0.255 },
    lines: [],
  })),
  defaultQuoteConfig: vi.fn(() => ({ vatRate: 0.255 })),
}));

vi.mock("@/lib/household-deduction", () => ({
  buildHouseholdDeductionRows: vi.fn(() => []),
  calculateHouseholdDeduction: vi.fn(() => ({ credit: 200, rows: [], eligible: true })),
}));

vi.mock("@/lib/heating-grant-context", () => ({
  detectHeatingGrantOpportunity: vi.fn(() => ({
    fossilSourceHeating: false,
    detectedTargetHeating: null,
  })),
}));

import {
  detectRenovationCategory,
  estimateRenovationRoi,
  ROI_MARKET_CONFIG_2026,
} from "@/lib/renovation-roi";

const baseMaterial: Material = {
  id: "m1",
  name: "Pine Board 22x100",
  name_fi: "Mäntylankku 22x100",
  name_en: "Pine Board 22x100",
  category_name: "lumber",
  category_name_fi: "Sahatavara",
  image_url: null,
  pricing: [
    { unit_price: 5, unit: "jm", supplier_name: "K-Rauta", is_primary: true },
  ],
  thermal_conductivity: 0.13,
  thermal_thickness: null,
  fire_rating: null,
  tags: ["wood", "pine"],
  visual_albedo: null,
};

const roofMaterial: Material = {
  ...baseMaterial,
  id: "m2",
  name: "Roof Tiles",
  name_fi: "Kattotiili",
  category_name: "roofing",
  tags: ["katto", "tiili"],
};

const insulationMaterial: Material = {
  ...baseMaterial,
  id: "m3",
  name: "Insulation 100mm",
  name_fi: "Eristys 100mm",
  category_name: "insulation",
  tags: ["insulation", "eristys"],
};

const windowMaterial: Material = {
  ...baseMaterial,
  id: "m4",
  name: "Triple glazing window",
  name_fi: "Ikkuna 3-lasi",
  category_name: "windows",
  tags: ["window", "ikkuna"],
};

const bomItem: BomItem = { material_id: "m1", quantity: 20, unit: "jm" };

describe("ROI_MARKET_CONFIG_2026", () => {
  it("has expected Euribor rate", () => {
    expect(ROI_MARKET_CONFIG_2026.euribor12mPercent).toBe(2.685);
  });

  it("has expected electricity price", () => {
    expect(ROI_MARKET_CONFIG_2026.electricityPriceAssumptionEurPerKwh).toBe(0.18);
  });

  it("has source check date", () => {
    expect(ROI_MARKET_CONFIG_2026.sourceCheckedAt).toBe("2026-04-21");
  });

  it("has Bank of Finland source URL", () => {
    expect(ROI_MARKET_CONFIG_2026.bankOfFinlandSourceUrl).toContain("suomenpankki.fi");
  });
});

describe("detectRenovationCategory", () => {
  it("detects roof category from material tags", () => {
    expect(detectRenovationCategory([{ material_id: "m2", quantity: 10, unit: "m2" }], [roofMaterial])).toBe("roof");
  });

  it("detects energy category from insulation material", () => {
    expect(detectRenovationCategory([{ material_id: "m3", quantity: 10, unit: "m2" }], [insulationMaterial])).toBe("energy");
  });

  it("detects windows category", () => {
    expect(detectRenovationCategory([{ material_id: "m4", quantity: 4, unit: "kpl" }], [windowMaterial])).toBe("windows");
  });

  it("returns general for unmatched materials", () => {
    expect(detectRenovationCategory([bomItem], [baseMaterial])).toBe("general");
  });

  it("returns general for empty materials", () => {
    expect(detectRenovationCategory([bomItem], [])).toBe("general");
  });
});

describe("estimateRenovationRoi", () => {
  it("returns null for empty bom", () => {
    expect(estimateRenovationRoi([], [baseMaterial])).toBeNull();
  });

  it("returns an estimate for valid bom", () => {
    const result = estimateRenovationRoi([bomItem], [baseMaterial]);
    expect(result).not.toBeNull();
  });

  it("includes materialCost and labourCost", () => {
    const result = estimateRenovationRoi([bomItem], [baseMaterial])!;
    expect(result.materialCost).toBeGreaterThan(0);
    expect(result.labourCost).toBeGreaterThan(0);
  });

  it("grossCost equals sum of material and labour", () => {
    const result = estimateRenovationRoi([bomItem], [baseMaterial])!;
    expect(result.grossCost).toBe(2250);
  });

  it("netCost is grossCost minus best subsidy", () => {
    const result = estimateRenovationRoi([bomItem], [baseMaterial])!;
    expect(result.netCost).toBe(result.grossCost - result.bestSubsidy.amount);
  });

  it("includes household deduction as best subsidy when no ELY grant", () => {
    const result = estimateRenovationRoi([bomItem], [baseMaterial])!;
    expect(result.bestSubsidy.type).toBe("household_deduction");
    expect(result.bestSubsidy.amount).toBe(200);
  });

  it("includes valueRetentionRate from category rule", () => {
    const result = estimateRenovationRoi([bomItem], [baseMaterial])!;
    expect(result.valueRetentionRate).toBe(0.32);
  });

  it("calculates estimatedValueIncrease from grossCost and retention rate", () => {
    const result = estimateRenovationRoi([bomItem], [baseMaterial])!;
    expect(result.estimatedValueIncrease).toBe(Math.round(2250 * 0.32));
  });

  it("timing defaults to favourable when Euribor < 3%", () => {
    const result = estimateRenovationRoi([bomItem], [baseMaterial])!;
    expect(result.timing.status).toBe("favourable");
    expect(result.timing.headline).toBe("Market timing is favourable");
  });

  it("includes assumptions array", () => {
    const result = estimateRenovationRoi([bomItem], [baseMaterial])!;
    expect(result.assumptions.length).toBeGreaterThanOrEqual(2);
    expect(result.assumptions[0]).toContain("retained-value");
  });

  it("generates summary string", () => {
    const result = estimateRenovationRoi([bomItem], [baseMaterial])!;
    expect(result.summary).toContain("Cost");
    expect(result.summary).toContain("EUR");
    expect(result.summary).toContain("ROI");
  });

  it("includes older building reason when year_built <= 1990", () => {
    const buildingInfo: BuildingInfo = { year_built: 1975, area_m2: 120 };
    const result = estimateRenovationRoi([bomItem], [baseMaterial], buildingInfo)!;
    expect(result.timing.reasons.some((r) => r.includes("Older"))).toBe(true);
  });

  it("general category has zero energy savings and null paybackYears", () => {
    const result = estimateRenovationRoi([bomItem], [baseMaterial])!;
    expect(result.annualEnergySavings).toBe(0);
    expect(result.paybackYears).toBeNull();
  });

  it("passes coupleMode to household deduction", async () => {
    const { calculateHouseholdDeduction } = vi.mocked(await import("@/lib/household-deduction"));
    calculateHouseholdDeduction.mockReturnValueOnce({ credit: 400, rows: [], eligible: true } as any);
    const result = estimateRenovationRoi([bomItem], [baseMaterial], null, { coupleMode: true })!;
    expect(result.bestSubsidy.amount).toBe(400);
  });
});
