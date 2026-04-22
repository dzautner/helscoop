import { describe, it, expect } from "vitest";
import type { BomItem, Material } from "@/types";
import { buildSavingsRecommendations, sumSavings } from "@/lib/bom-savings";

const baseMaterial: Material = {
  id: "m1",
  name: "Pine Board 22x100",
  name_fi: "Mäntylankku 22x100",
  name_en: "Pine Board 22x100",
  category_name: "lumber",
  category_name_fi: "Sahatavara",
  image_url: null,
  pricing: [
    { unit_price: 5, unit: "jm", supplier_name: "K-Rauta", is_primary: true, link: "https://k-rauta.fi/123" },
    { unit_price: 4, unit: "jm", supplier_name: "Stark", is_primary: false, link: "https://stark.fi/456" },
  ],
  thermal_conductivity: 0.13,
  thermal_thickness: null,
  fire_rating: null,
  tags: ["wood", "pine"],
  visual_albedo: [0.6, 0.45, 0.3],
};

const cheaperSubstitute: Material = {
  ...baseMaterial,
  id: "m2",
  name: "Spruce Board 22x100",
  name_fi: "Kuusilankku 22x100",
  name_en: "Spruce Board 22x100",
  category_name: "lumber",
  pricing: [
    { unit_price: 3, unit: "jm", supplier_name: "Stark", is_primary: true, link: null },
  ],
  thermal_conductivity: 0.12,
};

const insulationMaterial: Material = {
  ...baseMaterial,
  id: "m3",
  name: "Rockwool 100mm",
  name_fi: "Kivivilla 100mm",
  name_en: "Rockwool 100mm",
  category_name: "insulation",
  category_name_fi: "Eristeet",
  pricing: [
    { unit_price: 8.5, unit: "m2", supplier_name: "K-Rauta", is_primary: true, link: null },
  ],
  thermal_conductivity: 0.035,
  tags: ["mineral", "rockwool"],
};

const bomItem: BomItem = {
  material_id: "m1",
  quantity: 20,
  unit: "jm",
};

const materials = [baseMaterial, cheaperSubstitute, insulationMaterial];

describe("buildSavingsRecommendations", () => {
  it("returns empty array for empty bom", () => {
    expect(buildSavingsRecommendations([], materials)).toEqual([]);
  });

  it("returns empty array for zero-quantity items", () => {
    const zeroItem: BomItem = { ...bomItem, quantity: 0 };
    expect(buildSavingsRecommendations([zeroItem], materials)).toEqual([]);
  });

  it("detects supplier switch savings", () => {
    const recs = buildSavingsRecommendations([bomItem], materials);
    const supplierSwitch = recs.find((r) => r.type === "supplier_switch");
    expect(supplierSwitch).toBeDefined();
    expect(supplierSwitch!.toSupplier).toBe("Stark");
    expect(supplierSwitch!.savingsAmount).toBe(20);
  });

  it("calculates correct savings percent", () => {
    const recs = buildSavingsRecommendations([bomItem], materials);
    const supplierSwitch = recs.find((r) => r.type === "supplier_switch");
    expect(supplierSwitch!.savingsPercent).toBe(20);
  });

  it("detects material substitution", () => {
    const recs = buildSavingsRecommendations([bomItem], materials);
    const substitution = recs.find((r) => r.type === "material_substitution");
    expect(substitution).toBeDefined();
    expect(substitution!.toMaterialId).toBe("m2");
    expect(substitution!.toMaterialName).toBe("Kuusilankku 22x100");
  });

  it("detects bulk discount for lumber ≥50 quantity", () => {
    const bulkItem: BomItem = { ...bomItem, quantity: 60 };
    const recs = buildSavingsRecommendations([bulkItem], materials);
    const bulk = recs.find((r) => r.type === "bulk_discount");
    expect(bulk).toBeDefined();
    expect(bulk!.reason).toContain("bulk_50");
  });

  it("does not suggest bulk discount below threshold", () => {
    const smallItem: BomItem = { ...bomItem, quantity: 10 };
    const recs = buildSavingsRecommendations([smallItem], materials);
    const bulk = recs.find((r) => r.type === "bulk_discount");
    expect(bulk).toBeUndefined();
  });

  it("respects minSavings option", () => {
    const recs = buildSavingsRecommendations([bomItem], materials, { minSavings: 100 });
    expect(recs.length).toBe(0);
  });

  it("detects low stock warning", () => {
    const lowStockItem: BomItem = { ...bomItem, stock_level: "low_stock" };
    const recs = buildSavingsRecommendations([lowStockItem], materials);
    const stock = recs.find((r) => r.type === "seasonal_stock");
    expect(stock).toBeDefined();
    expect(stock!.reason).toBe("low_stock");
  });

  it("detects out of stock warning", () => {
    const oosItem: BomItem = { ...bomItem, stock_level: "out_of_stock" };
    const recs = buildSavingsRecommendations([oosItem], materials);
    const stock = recs.find((r) => r.type === "seasonal_stock");
    expect(stock).toBeDefined();
    expect(stock!.reason).toBe("out_of_stock");
  });

  it("sorts recommendations by savings amount descending", () => {
    const recs = buildSavingsRecommendations([bomItem], materials);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].savingsAmount).toBeGreaterThanOrEqual(recs[i].savingsAmount);
    }
  });

  it("uses explicit unit_price from bom item when available", () => {
    const explicitPriceItem: BomItem = { ...bomItem, unit_price: 10 };
    const recs = buildSavingsRecommendations([explicitPriceItem], materials);
    const supplierSwitch = recs.find((r) => r.type === "supplier_switch");
    expect(supplierSwitch).toBeDefined();
    expect(supplierSwitch!.currentUnitPrice).toBe(10);
  });

  it("skips items with no pricing", () => {
    const noPriceMaterial: Material = { ...baseMaterial, id: "m9", pricing: null };
    const noPriceItem: BomItem = { material_id: "m9", quantity: 20, unit: "jm" };
    const recs = buildSavingsRecommendations([noPriceItem], [noPriceMaterial]);
    expect(recs).toEqual([]);
  });

  it("does not substitute materials already in BOM", () => {
    const bothItems: BomItem[] = [
      { material_id: "m1", quantity: 20, unit: "jm" },
      { material_id: "m2", quantity: 10, unit: "jm" },
    ];
    const recs = buildSavingsRecommendations(bothItems, materials);
    const sub = recs.find((r) => r.type === "material_substitution" && r.materialId === "m1");
    expect(sub).toBeUndefined();
  });

  it("detects fastener bulk discount at 100+ quantity", () => {
    const fastenerMat: Material = { ...baseMaterial, id: "mf", category_name: "fasteners", pricing: [{ unit_price: 2, unit: "kpl", supplier_name: "K-Rauta", is_primary: true }] };
    const fastenerItem: BomItem = { material_id: "mf", quantity: 150, unit: "kpl" };
    const recs = buildSavingsRecommendations([fastenerItem], [fastenerMat]);
    const bulk = recs.find((r) => r.type === "bulk_discount");
    expect(bulk).toBeDefined();
    expect(bulk!.reason).toContain("bulk_100");
  });
});

describe("sumSavings", () => {
  it("returns 0 for empty recommendations", () => {
    expect(sumSavings([])).toBe(0);
  });

  it("sums savings across different materials", () => {
    const recs = [
      { materialId: "m1", savingsAmount: 50 },
      { materialId: "m2", savingsAmount: 30 },
    ] as any[];
    expect(sumSavings(recs)).toBe(80);
  });

  it("takes best savings per material when duplicated", () => {
    const recs = [
      { materialId: "m1", savingsAmount: 50 },
      { materialId: "m1", savingsAmount: 80 },
      { materialId: "m2", savingsAmount: 30 },
    ] as any[];
    expect(sumSavings(recs)).toBe(110);
  });

  it("ignores zero savings", () => {
    const recs = [
      { materialId: "m1", savingsAmount: 50 },
      { materialId: "m2", savingsAmount: 0 },
    ] as any[];
    expect(sumSavings(recs)).toBe(50);
  });
});
