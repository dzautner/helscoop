import { describe, it, expect } from "vitest";
import { calculateQuote, defaultQuoteConfig } from "@/lib/quote-engine";
import type { QuoteConfig } from "@/lib/quote-engine";

const baseMaterial = {
  id: "m1",
  name: "Pine Board",
  name_en: "Pine Board",
  name_fi: "Mäntylankku",
  category_name: "lumber",
  pricing: [{ unit_price: 5, unit: "kpl", is_primary: true }],
};

const baseConfig: QuoteConfig = {
  mode: "homeowner",
  vatRate: 0.255,
  labourRatePerHour: 45,
  wastagePercent: 0.10,
};

describe("defaultQuoteConfig", () => {
  it("returns Finnish standard VAT rate 25.5%", () => {
    const config = defaultQuoteConfig();
    expect(config.vatRate).toBe(0.255);
  });

  it("returns 45€/h labour rate", () => {
    const config = defaultQuoteConfig();
    expect(config.labourRatePerHour).toBe(45);
  });

  it("returns 10% wastage", () => {
    const config = defaultQuoteConfig();
    expect(config.wastagePercent).toBe(0.10);
  });

  it("homeowner mode has no contractor margin", () => {
    const config = defaultQuoteConfig("homeowner");
    expect(config.contractorMarginPercent).toBeUndefined();
  });

  it("contractor mode has 15% margin", () => {
    const config = defaultQuoteConfig("contractor");
    expect(config.contractorMarginPercent).toBe(0.15);
  });
});

describe("calculateQuote", () => {
  it("returns empty lines for empty BOM", () => {
    const quote = calculateQuote([], [], baseConfig);
    expect(quote.lines).toHaveLength(0);
    expect(quote.grandTotal).toBe(0);
  });

  it("computes material cost with wastage", () => {
    const bom = [{ material_id: "m1", quantity: 10, unit: "kpl" }];
    const quote = calculateQuote(bom, [baseMaterial as any], baseConfig);
    const line = quote.lines[0];
    expect(line.designQty).toBe(10);
    expect(line.wastageQty).toBe(1);
    expect(line.materialCost).toBe(55); // 11 units * 5€
  });

  it("includes labour cost based on category", () => {
    const bom = [{ material_id: "m1", quantity: 10, unit: "kpl" }];
    const quote = calculateQuote(bom, [baseMaterial as any], baseConfig);
    const line = quote.lines[0];
    // lumber = 0.5 hours/unit * 10 design units = 5 hours * 45€/h = 225
    expect(line.labourHours).toBe(5);
    expect(line.labourCost).toBe(225);
  });

  it("computes VAT at configured rate", () => {
    const bom = [{ material_id: "m1", quantity: 10, unit: "kpl" }];
    const quote = calculateQuote(bom, [baseMaterial as any], baseConfig);
    const line = quote.lines[0];
    const expectedVat = Math.round(line.subtotal * 0.255 * 100) / 100;
    expect(line.vatAmount).toBe(expectedVat);
  });

  it("line total = subtotal + VAT", () => {
    const bom = [{ material_id: "m1", quantity: 10, unit: "kpl" }];
    const quote = calculateQuote(bom, [baseMaterial as any], baseConfig);
    const line = quote.lines[0];
    expect(line.total).toBe(Math.round((line.subtotal + line.vatAmount) * 100) / 100);
  });

  it("aggregates across multiple BOM items", () => {
    const mat2 = { ...baseMaterial, id: "m2", name: "Insulation", name_en: "Insulation", category_name: "insulation", pricing: [{ unit_price: 3, unit: "m2", is_primary: true }] };
    const bom = [
      { material_id: "m1", quantity: 10, unit: "kpl" },
      { material_id: "m2", quantity: 20, unit: "m2" },
    ];
    const quote = calculateQuote(bom, [baseMaterial as any, mat2 as any], baseConfig);
    expect(quote.lines).toHaveLength(2);
    expect(quote.materialSubtotal).toBe(quote.lines[0].materialCost + quote.lines[1].materialCost);
    expect(quote.labourSubtotal).toBe(quote.lines[0].labourCost + quote.lines[1].labourCost);
  });

  it("applies contractor margin in contractor mode", () => {
    const contractorConfig: QuoteConfig = {
      ...baseConfig,
      mode: "contractor",
      contractorMarginPercent: 0.15,
    };
    const bom = [{ material_id: "m1", quantity: 10, unit: "kpl" }];
    const quote = calculateQuote(bom, [baseMaterial as any], contractorConfig);
    expect(quote.contractorMargin).toBeDefined();
    expect(quote.contractorMargin).toBeGreaterThan(0);
    const baseTotal = Math.round((quote.subtotalExVat + quote.vatTotal) * 100) / 100;
    expect(quote.grandTotal).toBeGreaterThan(baseTotal);
  });

  it("no contractor margin in homeowner mode", () => {
    const bom = [{ material_id: "m1", quantity: 10, unit: "kpl" }];
    const quote = calculateQuote(bom, [baseMaterial as any], baseConfig);
    expect(quote.contractorMargin).toBeUndefined();
  });

  it("uses BOM unit_price over material pricing when available", () => {
    const bom = [{ material_id: "m1", quantity: 10, unit: "kpl", unit_price: 8 }];
    const quote = calculateQuote(bom, [baseMaterial as any], baseConfig);
    // 11 units * 8€ = 88
    expect(quote.lines[0].materialCost).toBe(88);
  });

  it("uses default labour hours for unknown category", () => {
    const unknownMat = { ...baseMaterial, id: "mx", category_name: "exotic", pricing: [{ unit_price: 10, unit: "kpl", is_primary: true }] };
    const bom = [{ material_id: "mx", quantity: 5, unit: "kpl" }];
    const quote = calculateQuote(bom, [unknownMat as any], baseConfig);
    // default = 0.2h/unit, 5 design units * 0.2 = 1h
    expect(quote.lines[0].labourHours).toBe(1);
  });

  it("handles missing material gracefully", () => {
    const bom = [{ material_id: "unknown", quantity: 5, unit: "kpl", material_name: "Mystery" }];
    const quote = calculateQuote(bom, [], baseConfig);
    expect(quote.lines[0].materialName).toBe("Mystery");
    expect(quote.lines[0].materialCost).toBe(0); // no price info
  });

  it("generatedAt is ISO timestamp", () => {
    const quote = calculateQuote([], [], baseConfig);
    expect(quote.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("config is preserved in output", () => {
    const quote = calculateQuote([], [], baseConfig);
    expect(quote.config).toEqual(baseConfig);
  });

  it("uses insulation category labour rate", () => {
    const mat = { ...baseMaterial, id: "ins", category_name: "eristys", pricing: [{ unit_price: 3, unit: "m2", is_primary: true }] };
    const bom = [{ material_id: "ins", quantity: 10, unit: "m2" }];
    const quote = calculateQuote(bom, [mat as any], baseConfig);
    // eristys = 0.3h/unit, 10 design units * 0.3 = 3h
    expect(quote.lines[0].labourHours).toBe(3);
  });

  it("uses foundation category labour rate", () => {
    const mat = { ...baseMaterial, id: "fnd", category_name: "perustus", pricing: [{ unit_price: 20, unit: "m3", is_primary: true }] };
    const bom = [{ material_id: "fnd", quantity: 5, unit: "m3" }];
    const quote = calculateQuote(bom, [mat as any], baseConfig);
    // perustus = 1.0h/unit, 5 design units * 1.0 = 5h
    expect(quote.lines[0].labourHours).toBe(5);
  });

  it("zero quantity produces zero costs", () => {
    const bom = [{ material_id: "m1", quantity: 0, unit: "kpl" }];
    const quote = calculateQuote(bom, [baseMaterial as any], baseConfig);
    expect(quote.lines[0].materialCost).toBe(0);
    expect(quote.lines[0].labourCost).toBe(0);
    expect(quote.lines[0].total).toBe(0);
  });
});
