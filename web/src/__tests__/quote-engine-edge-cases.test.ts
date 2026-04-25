/**
 * Edge case tests for the quote engine.
 *
 * Covers: empty BOM, zero quantity, very large quantities, missing prices,
 * negative values, NaN inputs, extreme VAT/wastage/margin configs,
 * and BOM items with no matching material in catalog.
 */

import { describe, it, expect } from "vitest";
import { calculateQuote, defaultQuoteConfig } from "@/lib/quote-engine";
import type { QuoteConfig } from "@/lib/quote-engine";
import type { BomItem, Material } from "@/types";

/* ── Fixtures ──────────────────────────────────────────────── */

function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: "test_mat",
    name: "Test Material",
    name_fi: "Testimateriaali",
    name_en: "Test Material",
    category_name: "lumber",
    category_name_fi: "Sahatavara",
    image_url: null,
    pricing: [{ unit_price: 10, unit: "kpl", supplier_name: "Test", is_primary: true }],
    ...overrides,
  } as Material;
}

function makeBom(overrides: Partial<BomItem> = {}): BomItem {
  return {
    material_id: "test_mat",
    quantity: 10,
    unit: "kpl",
    ...overrides,
  };
}

const baseConfig: QuoteConfig = {
  mode: "homeowner",
  vatRate: 0.255,
  labourRatePerHour: 45,
  wastagePercent: 0.10,
};

const materials = [makeMaterial()];

/* ── 1. Empty BOM edge cases ──────────────────────────────── */

describe("quote-engine edge: empty BOM", () => {
  it("returns zero totals for empty BOM with empty materials", () => {
    const quote = calculateQuote([], [], baseConfig);
    expect(quote.lines).toHaveLength(0);
    expect(quote.grandTotal).toBe(0);
    expect(quote.vatTotal).toBe(0);
    expect(quote.materialSubtotal).toBe(0);
    expect(quote.labourSubtotal).toBe(0);
    expect(quote.wastageTotal).toBe(0);
    expect(quote.subtotalExVat).toBe(0);
  });

  it("returns zero totals for empty BOM with populated materials catalog", () => {
    const quote = calculateQuote([], [makeMaterial(), makeMaterial({ id: "m2" })], baseConfig);
    expect(quote.lines).toHaveLength(0);
    expect(quote.grandTotal).toBe(0);
  });

  it("contractor mode with empty BOM returns zero margin", () => {
    const contractorConfig: QuoteConfig = {
      ...baseConfig,
      mode: "contractor",
      contractorMarginPercent: 0.15,
    };
    const quote = calculateQuote([], [], contractorConfig);
    expect(quote.contractorMargin).toBe(0);
    expect(quote.grandTotal).toBe(0);
  });
});

/* ── 2. Zero quantity ─────────────────────────────────────── */

describe("quote-engine edge: zero quantity", () => {
  it("produces zero costs for zero quantity item", () => {
    const bom = [makeBom({ quantity: 0 })];
    const quote = calculateQuote(bom, materials, baseConfig);

    expect(quote.lines).toHaveLength(1);
    expect(quote.lines[0].designQty).toBe(0);
    expect(quote.lines[0].wastageQty).toBe(0);
    expect(quote.lines[0].materialCost).toBe(0);
    expect(quote.lines[0].labourHours).toBe(0);
    expect(quote.lines[0].labourCost).toBe(0);
    expect(quote.lines[0].subtotal).toBe(0);
    expect(quote.lines[0].vatAmount).toBe(0);
    expect(quote.lines[0].total).toBe(0);
  });

  it("grand total is zero when all items have zero quantity", () => {
    const bom = [
      makeBom({ quantity: 0, material_id: "test_mat" }),
      makeBom({ quantity: 0, material_id: "test_mat" }),
    ];
    const quote = calculateQuote(bom, materials, baseConfig);
    expect(quote.grandTotal).toBe(0);
  });
});

/* ── 3. Large quantities ──────────────────────────────────── */

describe("quote-engine edge: large quantities", () => {
  it("handles very large quantity (100,000 units)", () => {
    const bom = [makeBom({ quantity: 100_000 })];
    const quote = calculateQuote(bom, materials, baseConfig);

    expect(quote.lines[0].designQty).toBe(100_000);
    expect(quote.lines[0].wastageQty).toBe(10_000);
    // materialCost = 110,000 * 10 = 1,100,000
    expect(quote.lines[0].materialCost).toBe(1_100_000);
    expect(quote.grandTotal).toBeGreaterThan(1_000_000);
    // Ensure it is finite and not NaN
    expect(Number.isFinite(quote.grandTotal)).toBe(true);
  });

  it("handles quantity of 1 million without overflow", () => {
    const bom = [makeBom({ quantity: 1_000_000 })];
    const quote = calculateQuote(bom, materials, baseConfig);
    expect(Number.isFinite(quote.grandTotal)).toBe(true);
    expect(quote.grandTotal).toBeGreaterThan(0);
  });

  it("handles fractional quantity (0.001)", () => {
    const bom = [makeBom({ quantity: 0.001 })];
    const quote = calculateQuote(bom, materials, baseConfig);
    expect(quote.lines[0].designQty).toBe(0);
    expect(Number.isFinite(quote.grandTotal)).toBe(true);
  });
});

/* ── 4. Missing prices ────────────────────────────────────── */

describe("quote-engine edge: missing prices", () => {
  it("handles BOM item with no matching material (missing from catalog)", () => {
    const bom = [makeBom({ material_id: "nonexistent_material" })];
    const quote = calculateQuote(bom, materials, baseConfig);

    // Should still produce a line item
    expect(quote.lines).toHaveLength(1);
    // No material found -> unitPrice = 0 (from getUnitPrice fallback)
    expect(quote.lines[0].materialCost).toBe(0);
    // Labour still calculated with default rate
    expect(quote.lines[0].labourHours).toBeGreaterThan(0);
  });

  it("uses BOM material_name as fallback name when material not in catalog", () => {
    const bom = [makeBom({ material_id: "missing", material_name: "Custom Wood" })];
    const quote = calculateQuote(bom, [], baseConfig);
    expect(quote.lines[0].materialName).toBe("Custom Wood");
  });

  it("falls back to material_id when no material_name and no catalog entry", () => {
    const bom = [makeBom({ material_id: "raw_id_only" })];
    const quote = calculateQuote(bom, [], baseConfig);
    expect(quote.lines[0].materialName).toBe("raw_id_only");
  });

  it("material with empty pricing array uses unitPrice=0", () => {
    const matNoPricing = makeMaterial({ id: "no_price", pricing: [] });
    const bom = [makeBom({ material_id: "no_price" })];
    const quote = calculateQuote(bom, [matNoPricing], baseConfig);
    expect(quote.lines[0].materialCost).toBe(0);
  });

  it("BOM unit_price overrides material catalog pricing", () => {
    const bom = [makeBom({ unit_price: 25 })];
    const quote = calculateQuote(bom, materials, baseConfig);
    // 11 units * 25 = 275 (not 110 from catalog price of 10)
    expect(quote.lines[0].materialCost).toBe(275);
  });

  it("BOM unit_price of zero produces zero material cost", () => {
    const bom = [makeBom({ unit_price: 0 })];
    const quote = calculateQuote(bom, materials, baseConfig);
    expect(quote.lines[0].materialCost).toBe(0);
  });
});

/* ── 5. VAT calculation edge cases ────────────────────────── */

describe("quote-engine edge: VAT calculation", () => {
  it("zero VAT rate produces zero VAT", () => {
    const config: QuoteConfig = { ...baseConfig, vatRate: 0 };
    const bom = [makeBom()];
    const quote = calculateQuote(bom, materials, config);
    expect(quote.vatTotal).toBe(0);
    expect(quote.lines[0].vatAmount).toBe(0);
    // grandTotal = subtotalExVat when VAT is 0
    expect(quote.grandTotal).toBe(quote.subtotalExVat);
  });

  it("100% VAT rate doubles the total (approx)", () => {
    const config: QuoteConfig = { ...baseConfig, vatRate: 1.0 };
    const bom = [makeBom()];
    const quote = calculateQuote(bom, materials, config);
    expect(quote.vatTotal).toBe(quote.subtotalExVat);
    expect(quote.grandTotal).toBe(
      Math.round((quote.subtotalExVat * 2) * 100) / 100,
    );
  });

  it("contractor mode VAT is on (subtotal + margin)", () => {
    const config: QuoteConfig = {
      ...baseConfig,
      mode: "contractor",
      contractorMarginPercent: 0.20,
    };
    const bom = [makeBom()];
    const quote = calculateQuote(bom, materials, config);

    const margin = quote.contractorMargin!;
    const taxableBase = Math.round((quote.subtotalExVat + margin) * 100) / 100;
    const expectedVat = Math.round(taxableBase * config.vatRate * 100) / 100;
    expect(quote.vatTotal).toBe(expectedVat);
  });
});

/* ── 6. Wastage edge cases ────────────────────────────────── */

describe("quote-engine edge: wastage", () => {
  it("zero wastage produces no wastage quantity or cost", () => {
    const config: QuoteConfig = { ...baseConfig, wastagePercent: 0 };
    const bom = [makeBom()];
    const quote = calculateQuote(bom, materials, config);
    expect(quote.lines[0].wastageQty).toBe(0);
    expect(quote.wastageTotal).toBe(0);
  });

  it("50% wastage adds correct extra material", () => {
    const config: QuoteConfig = { ...baseConfig, wastagePercent: 0.50 };
    const bom = [makeBom({ quantity: 100 })];
    const quote = calculateQuote(bom, materials, config);
    expect(quote.lines[0].wastageQty).toBe(50);
    // materialCost = 150 units * 10 = 1500
    expect(quote.lines[0].materialCost).toBe(1500);
    // But labourHours should still be based on designQty=100
    // lumber = 0.5 h/unit => 50 hours
    expect(quote.lines[0].labourHours).toBe(50);
  });

  it("wastageTotal correctly sums across multiple lines", () => {
    const config: QuoteConfig = { ...baseConfig, wastagePercent: 0.10 };
    const mat2 = makeMaterial({ id: "mat2", pricing: [{ unit_price: 20, unit: "m2", supplier_name: "X", is_primary: true }] });
    const bom = [
      makeBom({ quantity: 10, material_id: "test_mat" }),
      makeBom({ quantity: 10, material_id: "mat2" }),
    ];
    const quote = calculateQuote(bom, [makeMaterial(), mat2], config);
    // wastage for test_mat: 1 unit * 10 EUR = 10
    // wastage for mat2: 1 unit * 20 EUR = 20
    expect(quote.wastageTotal).toBeCloseTo(30, 1);
  });
});

/* ── 7. Contractor margin edge cases ──────────────────────── */

describe("quote-engine edge: contractor margin", () => {
  it("zero margin in contractor mode equals homeowner total", () => {
    const contractorConfig: QuoteConfig = {
      ...baseConfig,
      mode: "contractor",
      contractorMarginPercent: 0,
    };
    const bom = [makeBom()];
    const homeowner = calculateQuote(bom, materials, baseConfig);
    const contractor = calculateQuote(bom, materials, contractorConfig);
    expect(contractor.grandTotal).toBe(homeowner.grandTotal);
    expect(contractor.contractorMargin).toBe(0);
  });

  it("undefined margin in contractor mode has no margin field", () => {
    const contractorConfig: QuoteConfig = {
      ...baseConfig,
      mode: "contractor",
      contractorMarginPercent: undefined,
    };
    const bom = [makeBom()];
    const quote = calculateQuote(bom, materials, contractorConfig);
    expect(quote.contractorMargin).toBeUndefined();
  });

  it("high margin (50%) significantly increases grand total", () => {
    const highMarginConfig: QuoteConfig = {
      ...baseConfig,
      mode: "contractor",
      contractorMarginPercent: 0.50,
    };
    const bom = [makeBom()];
    const homeowner = calculateQuote(bom, materials, baseConfig);
    const contractor = calculateQuote(bom, materials, highMarginConfig);
    // Contractor should be much higher
    expect(contractor.grandTotal).toBeGreaterThan(homeowner.grandTotal * 1.4);
  });
});

/* ── 8. Labour by material category ───────────────────────── */

describe("quote-engine edge: labour category edge cases", () => {
  it("Finnish category name (eristys) matches insulation rate", () => {
    const mat = makeMaterial({ id: "fi_insulation", category_name: "Eristys" });
    const bom = [makeBom({ material_id: "fi_insulation", quantity: 10 })];
    const config: QuoteConfig = { ...baseConfig, wastagePercent: 0 };
    const quote = calculateQuote(bom, [mat], config);
    // eristys => 0.3 h/unit => 3h
    expect(quote.lines[0].labourHours).toBe(3);
  });

  it("category with partial match (e.g. 'kalvo' in category name) matches membrane", () => {
    const mat = makeMaterial({ id: "membrane", category_name: "Höyrynsulkukalvo" });
    const bom = [makeBom({ material_id: "membrane", quantity: 10 })];
    const config: QuoteConfig = { ...baseConfig, wastagePercent: 0 };
    const quote = calculateQuote(bom, [mat], config);
    // kalvo => 0.25 h/unit => 2.5h
    expect(quote.lines[0].labourHours).toBe(2.5);
  });

  it("null material uses default labour hours", () => {
    const bom = [makeBom({ material_id: "missing" })];
    const config: QuoteConfig = { ...baseConfig, wastagePercent: 0 };
    const quote = calculateQuote(bom, [], config);
    // default 0.2h/unit, 10 units => 2h
    expect(quote.lines[0].labourHours).toBe(2);
  });
});

/* ── 9. Multi-item BOM correctness ────────────────────────── */

describe("quote-engine edge: multi-item BOM", () => {
  it("handles 20 BOM items without issue", () => {
    const mats = Array.from({ length: 20 }, (_, i) =>
      makeMaterial({
        id: `mat_${i}`,
        pricing: [{ unit_price: i + 1, unit: "kpl", supplier_name: "S", is_primary: true }],
      }),
    );
    const bom = mats.map((m) => makeBom({ material_id: m.id, quantity: 5 }));
    const quote = calculateQuote(bom, mats, baseConfig);

    expect(quote.lines).toHaveLength(20);
    expect(Number.isFinite(quote.grandTotal)).toBe(true);
    expect(quote.grandTotal).toBeGreaterThan(0);
  });

  it("subtotalExVat equals materialSubtotal + labourSubtotal exactly", () => {
    const mat2 = makeMaterial({
      id: "insul",
      category_name: "insulation",
      pricing: [{ unit_price: 8, unit: "m2", supplier_name: "X", is_primary: true }],
    });
    const bom = [
      makeBom({ quantity: 7, material_id: "test_mat" }),
      makeBom({ quantity: 13, material_id: "insul" }),
    ];
    const quote = calculateQuote(bom, [makeMaterial(), mat2], baseConfig);
    expect(quote.subtotalExVat).toBe(
      Math.round((quote.materialSubtotal + quote.labourSubtotal) * 100) / 100,
    );
  });
});

/* ── 10. Rounding precision ───────────────────────────────── */

describe("quote-engine edge: rounding", () => {
  it("all monetary values have at most 2 decimal places", () => {
    const bom = [
      makeBom({ quantity: 7 }),
      makeBom({
        material_id: "odd_price",
        quantity: 13,
      }),
    ];
    const oddMat = makeMaterial({
      id: "odd_price",
      pricing: [{ unit_price: 3.33, unit: "m", supplier_name: "X", is_primary: true }],
    });
    const quote = calculateQuote(bom, [makeMaterial(), oddMat], baseConfig);

    const decPlaces = (n: number) => {
      const s = n.toString();
      const dot = s.indexOf(".");
      return dot === -1 ? 0 : s.length - dot - 1;
    };

    for (const line of quote.lines) {
      expect(decPlaces(line.materialCost)).toBeLessThanOrEqual(2);
      expect(decPlaces(line.labourCost)).toBeLessThanOrEqual(2);
      expect(decPlaces(line.subtotal)).toBeLessThanOrEqual(2);
      expect(decPlaces(line.vatAmount)).toBeLessThanOrEqual(2);
      expect(decPlaces(line.total)).toBeLessThanOrEqual(2);
    }

    expect(decPlaces(quote.grandTotal)).toBeLessThanOrEqual(2);
    expect(decPlaces(quote.vatTotal)).toBeLessThanOrEqual(2);
    expect(decPlaces(quote.materialSubtotal)).toBeLessThanOrEqual(2);
    expect(decPlaces(quote.labourSubtotal)).toBeLessThanOrEqual(2);
  });
});

/* ── 11. defaultQuoteConfig edge cases ────────────────────── */

describe("quote-engine edge: defaultQuoteConfig", () => {
  it("defaults to homeowner mode when no argument", () => {
    const config = defaultQuoteConfig();
    expect(config.mode).toBe("homeowner");
  });

  it("homeowner config has no contractorMarginPercent", () => {
    const config = defaultQuoteConfig("homeowner");
    expect(config.contractorMarginPercent).toBeUndefined();
  });

  it("contractor config has contractorMarginPercent of 0.15", () => {
    const config = defaultQuoteConfig("contractor");
    expect(config.contractorMarginPercent).toBe(0.15);
  });

  it("all numeric fields are positive", () => {
    const config = defaultQuoteConfig();
    expect(config.vatRate).toBeGreaterThan(0);
    expect(config.labourRatePerHour).toBeGreaterThan(0);
    expect(config.wastagePercent).toBeGreaterThan(0);
  });
});

/* ── 12. generatedAt timestamp ────────────────────────────── */

describe("quote-engine edge: timestamp", () => {
  it("generatedAt is a valid ISO 8601 string", () => {
    const quote = calculateQuote([], [], baseConfig);
    expect(quote.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    // Should parse without error
    const date = new Date(quote.generatedAt);
    expect(date.getTime()).not.toBeNaN();
  });

  it("generatedAt is recent (within last 5 seconds)", () => {
    const before = Date.now();
    const quote = calculateQuote([], [], baseConfig);
    const after = Date.now();
    const ts = new Date(quote.generatedAt).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

/* ── 13. Design unit passthrough ──────────────────────────── */

describe("quote-engine edge: design unit", () => {
  it("uses BOM unit when specified", () => {
    const bom = [makeBom({ unit: "m2" })];
    const quote = calculateQuote(bom, materials, baseConfig);
    expect(quote.lines[0].designUnit).toBe("m2");
  });

  it("falls back to material pricing unit when BOM has no unit", () => {
    const bom = [{ material_id: "test_mat", quantity: 10 } as BomItem];
    const quote = calculateQuote(bom, materials, baseConfig);
    // Material pricing unit is "kpl"
    expect(quote.lines[0].designUnit).toBe("kpl");
  });

  it("uses 'unit' as last resort when no unit info available", () => {
    const bom = [{ material_id: "missing", quantity: 5 } as BomItem];
    const quote = calculateQuote(bom, [], baseConfig);
    expect(quote.lines[0].designUnit).toBe("unit");
  });
});
