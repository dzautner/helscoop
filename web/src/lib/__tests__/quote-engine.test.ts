import { describe, it, expect } from "vitest";
import { calculateQuote, defaultQuoteConfig } from "@/lib/quote-engine";
import type { QuoteConfig } from "@/lib/quote-engine";
import type { BomItem, Material } from "@/types";

/* ── Fixtures ──────────────────────────────────────────────── */

const lumberMaterial: Material = {
  id: "pine_48x98_c24",
  name: "48x98 Runkopuu C24",
  name_fi: "48x98 Runkopuu C24",
  name_en: "48x98 Framing Timber C24",
  category_name: "Lumber",
  category_name_fi: "Sahatavara",
  image_url: null,
  pricing: [{ unit_price: 2.60, unit: "jm", supplier_name: "Sarokas", is_primary: true }],
};

const insulationMaterial: Material = {
  id: "rockwool_50mm",
  name: "Mineraalivilla 50mm",
  name_fi: "Mineraalivilla 50mm",
  name_en: "Mineral Wool 50mm",
  category_name: "Insulation",
  category_name_fi: "Eristys",
  image_url: null,
  pricing: [{ unit_price: 8.0, unit: "m2", supplier_name: "K-Rauta", is_primary: true }],
};

const roofingMaterial: Material = {
  id: "metal_roof_sheet",
  name: "Peltilaatta",
  name_fi: "Peltilaatta",
  name_en: "Metal Roof Sheet",
  category_name: "Roofing",
  category_name_fi: "Katto",
  image_url: null,
  pricing: [{ unit_price: 15.0, unit: "m2", supplier_name: "Ruukki", is_primary: true }],
};

const concreteMaterial: Material = {
  id: "concrete_ready_mix",
  name: "Valmisbetoni C25",
  name_fi: "Valmisbetoni C25",
  name_en: "Ready Mix Concrete C25",
  category_name: "Foundation",
  category_name_fi: "Perustus",
  image_url: null,
  pricing: [{ unit_price: 120.0, unit: "m3", supplier_name: "Rudus", is_primary: true }],
};

const unknownMaterial: Material = {
  id: "generic_item",
  name: "Generic Item",
  name_fi: null,
  name_en: null,
  category_name: "Other",
  category_name_fi: null,
  image_url: null,
  pricing: [{ unit_price: 10.0, unit: "kpl", supplier_name: "Test", is_primary: true }],
};

const allMaterials: Material[] = [
  lumberMaterial,
  insulationMaterial,
  roofingMaterial,
  concreteMaterial,
  unknownMaterial,
];

const homeownerConfig: QuoteConfig = {
  mode: "homeowner",
  vatRate: 0.255,
  labourRatePerHour: 45,
  wastagePercent: 0.10,
};

const contractorConfig: QuoteConfig = {
  mode: "contractor",
  vatRate: 0.255,
  labourRatePerHour: 45,
  wastagePercent: 0.10,
  contractorMarginPercent: 0.15,
};

/* ── 1. Empty BOM ──────────────────────────────────────────── */

describe("calculateQuote — empty BOM", () => {
  it("returns zero totals for an empty BOM", () => {
    const quote = calculateQuote([], allMaterials, homeownerConfig);
    expect(quote.lines).toHaveLength(0);
    expect(quote.grandTotal).toBe(0);
    expect(quote.vatTotal).toBe(0);
    expect(quote.materialSubtotal).toBe(0);
    expect(quote.labourSubtotal).toBe(0);
  });

  it("still has a generatedAt timestamp", () => {
    const before = new Date().toISOString();
    const quote = calculateQuote([], allMaterials, homeownerConfig);
    const after = new Date().toISOString();
    expect(quote.generatedAt >= before).toBe(true);
    expect(quote.generatedAt <= after).toBe(true);
  });
});

/* ── 2. Basic calculation ──────────────────────────────────── */

describe("calculateQuote — basic calculation", () => {
  it("calculates a single lumber line correctly", () => {
    const bom: BomItem[] = [{ material_id: "pine_48x98_c24", quantity: 10, unit: "jm" }];
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);

    expect(quote.lines).toHaveLength(1);
    const line = quote.lines[0];

    // designQty = 10, wastageQty = 10 * 0.10 = 1
    expect(line.designQty).toBe(10);
    expect(line.wastageQty).toBe(1);

    // totalQty = 11, unitPrice = 2.60
    const totalQty = 11;
    const materialCost = Math.round(totalQty * 2.60 * 100) / 100; // 28.60
    expect(line.materialCost).toBe(materialCost);

    // Lumber labourHoursPerUnit = 0.5
    const labourHours = Math.round(totalQty * 0.5 * 100) / 100; // 5.5
    expect(line.labourHours).toBe(labourHours);

    const labourCost = Math.round(labourHours * 45 * 100) / 100; // 247.50
    expect(line.labourCost).toBe(labourCost);
  });

  it("includes the config in the returned quote", () => {
    const quote = calculateQuote([], allMaterials, homeownerConfig);
    expect(quote.config).toStrictEqual(homeownerConfig);
  });

  it("populates materialName from the materials catalog", () => {
    const bom: BomItem[] = [{ material_id: "pine_48x98_c24", quantity: 1, unit: "jm" }];
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);
    expect(quote.lines[0].materialName).toBe("48x98 Framing Timber C24");
  });
});

/* ── 3. Wastage calculation ────────────────────────────────── */

describe("calculateQuote — wastage", () => {
  it("adds the correct wastage quantity (10%)", () => {
    const bom: BomItem[] = [{ material_id: "rockwool_50mm", quantity: 20, unit: "m2" }];
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);
    const line = quote.lines[0];
    expect(line.wastageQty).toBe(2); // 20 * 10% = 2
    expect(line.designQty + line.wastageQty).toBe(22);
  });

  it("uses the full quantity (design + wastage) for material cost", () => {
    const bom: BomItem[] = [{ material_id: "rockwool_50mm", quantity: 10, unit: "m2" }];
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);
    const line = quote.lines[0];
    // totalQty = 11, unitPrice = 8.0 => materialCost = 88.00
    expect(line.materialCost).toBe(88.0);
  });

  it("honours a zero wastage percent", () => {
    const config: QuoteConfig = { ...homeownerConfig, wastagePercent: 0 };
    const bom: BomItem[] = [{ material_id: "pine_48x98_c24", quantity: 10, unit: "jm" }];
    const quote = calculateQuote(bom, allMaterials, config);
    expect(quote.lines[0].wastageQty).toBe(0);
    expect(quote.lines[0].designQty).toBe(quote.lines[0].designQty); // unchanged
  });

  it("calculates wastageTotal as sum of wastage costs across all lines", () => {
    const bom: BomItem[] = [
      { material_id: "pine_48x98_c24", quantity: 10, unit: "jm" },
      { material_id: "rockwool_50mm", quantity: 10, unit: "m2" },
    ];
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);
    // Lumber: 1 unit * 2.60 = 2.60; Insulation: 1 unit * 8.0 = 8.00
    expect(quote.wastageTotal).toBeCloseTo(2.60 + 8.0, 1);
  });
});

/* ── 4. VAT calculation ────────────────────────────────────── */

describe("calculateQuote — VAT", () => {
  it("applies VAT at 25.5% on each line's subtotal", () => {
    const bom: BomItem[] = [{ material_id: "pine_48x98_c24", quantity: 10, unit: "jm" }];
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);
    const line = quote.lines[0];
    const expectedVat = Math.round(line.subtotal * 0.255 * 100) / 100;
    expect(line.vatAmount).toBe(expectedVat);
  });

  it("sums VAT correctly at quote level", () => {
    const bom: BomItem[] = [
      { material_id: "pine_48x98_c24", quantity: 10, unit: "jm" },
      { material_id: "rockwool_50mm", quantity: 5, unit: "m2" },
    ];
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);
    const expectedVat = Math.round(quote.subtotalExVat * 0.255 * 100) / 100;
    expect(quote.vatTotal).toBe(expectedVat);
  });

  it("grand total equals subtotalExVat + vatTotal in homeowner mode", () => {
    const bom: BomItem[] = [{ material_id: "metal_roof_sheet", quantity: 50, unit: "m2" }];
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);
    expect(quote.grandTotal).toBe(
      Math.round((quote.subtotalExVat + quote.vatTotal) * 100) / 100,
    );
  });
});

/* ── 5. Homeowner vs contractor mode ───────────────────────── */

describe("calculateQuote — homeowner vs contractor", () => {
  const bom: BomItem[] = [{ material_id: "pine_48x98_c24", quantity: 20, unit: "jm" }];

  it("homeowner quote has no contractorMargin", () => {
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);
    expect(quote.contractorMargin).toBeUndefined();
  });

  it("contractor quote has a contractorMargin", () => {
    const quote = calculateQuote(bom, allMaterials, contractorConfig);
    expect(quote.contractorMargin).toBeGreaterThan(0);
  });

  it("contractor grand total > homeowner grand total when margin > 0", () => {
    const homeowner = calculateQuote(bom, allMaterials, homeownerConfig);
    const contractor = calculateQuote(bom, allMaterials, contractorConfig);
    expect(contractor.grandTotal).toBeGreaterThan(homeowner.grandTotal);
  });

  it("contractor margin is applied after VAT", () => {
    const quote = calculateQuote(bom, allMaterials, contractorConfig);
    const baseWithVat = Math.round((quote.subtotalExVat + quote.vatTotal) * 100) / 100;
    const expectedMargin = Math.round(baseWithVat * 0.15 * 100) / 100;
    expect(quote.contractorMargin).toBe(expectedMargin);
    expect(quote.grandTotal).toBe(Math.round((baseWithVat + expectedMargin) * 100) / 100);
  });

  it("contractor with 0% margin equals homeowner total", () => {
    const zeroMarginConfig: QuoteConfig = { ...contractorConfig, contractorMarginPercent: 0 };
    const homeowner = calculateQuote(bom, allMaterials, homeownerConfig);
    const contractor = calculateQuote(bom, allMaterials, zeroMarginConfig);
    expect(contractor.grandTotal).toBe(homeowner.grandTotal);
  });
});

/* ── 6. Labour estimation by category ─────────────────────── */

describe("calculateQuote — labour by category", () => {
  it("uses 0.5 h/unit for lumber", () => {
    const bom: BomItem[] = [{ material_id: "pine_48x98_c24", quantity: 10, unit: "jm" }];
    const config: QuoteConfig = { ...homeownerConfig, wastagePercent: 0 };
    const quote = calculateQuote(bom, allMaterials, config);
    // 10 units * 0.5 h = 5 h
    expect(quote.lines[0].labourHours).toBe(5);
  });

  it("uses 0.3 h/unit for insulation", () => {
    const bom: BomItem[] = [{ material_id: "rockwool_50mm", quantity: 10, unit: "m2" }];
    const config: QuoteConfig = { ...homeownerConfig, wastagePercent: 0 };
    const quote = calculateQuote(bom, allMaterials, config);
    expect(quote.lines[0].labourHours).toBe(3);
  });

  it("uses 0.4 h/unit for roofing", () => {
    const bom: BomItem[] = [{ material_id: "metal_roof_sheet", quantity: 10, unit: "m2" }];
    const config: QuoteConfig = { ...homeownerConfig, wastagePercent: 0 };
    const quote = calculateQuote(bom, allMaterials, config);
    expect(quote.lines[0].labourHours).toBe(4);
  });

  it("uses 1.0 h/unit for concrete/foundation", () => {
    const bom: BomItem[] = [{ material_id: "concrete_ready_mix", quantity: 5, unit: "m3" }];
    const config: QuoteConfig = { ...homeownerConfig, wastagePercent: 0 };
    const quote = calculateQuote(bom, allMaterials, config);
    expect(quote.lines[0].labourHours).toBe(5);
  });

  it("uses 0.2 h/unit as default for unknown category", () => {
    const bom: BomItem[] = [{ material_id: "generic_item", quantity: 10, unit: "kpl" }];
    const config: QuoteConfig = { ...homeownerConfig, wastagePercent: 0 };
    const quote = calculateQuote(bom, allMaterials, config);
    expect(quote.lines[0].labourHours).toBe(2);
  });
});

/* ── 7. Rounding ───────────────────────────────────────────── */

describe("calculateQuote — rounding", () => {
  it("rounds all monetary values to 2 decimal places", () => {
    const bom: BomItem[] = [
      { material_id: "pine_48x98_c24", quantity: 7, unit: "jm" },
      { material_id: "rockwool_50mm", quantity: 13, unit: "m2" },
    ];
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);

    for (const line of quote.lines) {
      const decPlaces = (n: number) => {
        const s = n.toString();
        const dot = s.indexOf(".");
        return dot === -1 ? 0 : s.length - dot - 1;
      };
      expect(decPlaces(line.materialCost)).toBeLessThanOrEqual(2);
      expect(decPlaces(line.labourCost)).toBeLessThanOrEqual(2);
      expect(decPlaces(line.vatAmount)).toBeLessThanOrEqual(2);
      expect(decPlaces(line.total)).toBeLessThanOrEqual(2);
    }

    expect(Number.isFinite(quote.grandTotal)).toBe(true);
    const grandStr = quote.grandTotal.toString();
    const dot = grandStr.indexOf(".");
    const decDigits = dot === -1 ? 0 : grandStr.length - dot - 1;
    expect(decDigits).toBeLessThanOrEqual(2);
  });
});

/* ── 8. defaultQuoteConfig ─────────────────────────────────── */

describe("defaultQuoteConfig", () => {
  it("returns homeowner defaults with 25.5% VAT", () => {
    const cfg = defaultQuoteConfig("homeowner");
    expect(cfg.vatRate).toBe(0.255);
    expect(cfg.mode).toBe("homeowner");
    expect(cfg.labourRatePerHour).toBe(45);
    expect(cfg.wastagePercent).toBe(0.10);
    expect(cfg.contractorMarginPercent).toBeUndefined();
  });

  it("returns contractor defaults with 15% margin", () => {
    const cfg = defaultQuoteConfig("contractor");
    expect(cfg.mode).toBe("contractor");
    expect(cfg.contractorMarginPercent).toBe(0.15);
  });
});

/* ── 9. Multi-line aggregate totals ────────────────────────── */

describe("calculateQuote — multi-line aggregates", () => {
  it("materialSubtotal equals sum of per-line materialCosts", () => {
    const bom: BomItem[] = [
      { material_id: "pine_48x98_c24", quantity: 10, unit: "jm" },
      { material_id: "rockwool_50mm", quantity: 20, unit: "m2" },
      { material_id: "metal_roof_sheet", quantity: 30, unit: "m2" },
    ];
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);
    const sumMat = Math.round(quote.lines.reduce((s, l) => s + l.materialCost, 0) * 100) / 100;
    expect(quote.materialSubtotal).toBe(sumMat);
  });

  it("labourSubtotal equals sum of per-line labourCosts", () => {
    const bom: BomItem[] = [
      { material_id: "pine_48x98_c24", quantity: 10, unit: "jm" },
      { material_id: "concrete_ready_mix", quantity: 2, unit: "m3" },
    ];
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);
    const sumLabour = Math.round(quote.lines.reduce((s, l) => s + l.labourCost, 0) * 100) / 100;
    expect(quote.labourSubtotal).toBe(sumLabour);
  });

  it("subtotalExVat = materialSubtotal + labourSubtotal", () => {
    const bom: BomItem[] = [
      { material_id: "pine_48x98_c24", quantity: 5, unit: "jm" },
      { material_id: "rockwool_50mm", quantity: 10, unit: "m2" },
    ];
    const quote = calculateQuote(bom, allMaterials, homeownerConfig);
    expect(quote.subtotalExVat).toBe(
      Math.round((quote.materialSubtotal + quote.labourSubtotal) * 100) / 100,
    );
  });
});
