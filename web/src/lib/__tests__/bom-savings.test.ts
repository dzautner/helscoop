import { describe, expect, it } from "vitest";
import { buildSavingsRecommendations, sumSavings } from "@/lib/bom-savings";
import type { BomItem, Material } from "@/types";

function material(overrides: Partial<Material>): Material {
  return {
    id: "pine_48x98_c24",
    name: "Pine C24",
    name_fi: "Mänty C24",
    name_en: "Pine C24",
    category_name: "Lumber",
    category_name_fi: "Sahatavara",
    image_url: null,
    pricing: [{ unit_price: 5, unit: "jm", supplier_name: "K-Rauta", is_primary: true }],
    design_unit: "jm",
    substitution_group: "framing_48",
    structural_grade_class: "C24",
    ...overrides,
  };
}

function bomItem(overrides: Partial<BomItem>): BomItem {
  return {
    material_id: "pine_48x98_c24",
    material_name: "Pine C24",
    quantity: 50,
    unit: "jm",
    unit_price: 5,
    total: 250,
    supplier: "K-Rauta",
    ...overrides,
  };
}

describe("buildSavingsRecommendations", () => {
  it("suggests supplier switches when an alternate supplier saves at least the threshold", () => {
    const recommendations = buildSavingsRecommendations(
      [bomItem({ quantity: 40, total: 200 })],
      [
        material({
          pricing: [
            { unit_price: 5, unit: "jm", supplier_name: "K-Rauta", is_primary: true },
            { unit_price: 4, unit: "jm", supplier_name: "Bauhaus", is_primary: false },
          ],
        }),
      ],
    );

    expect(recommendations[0]).toMatchObject({
      type: "supplier_switch",
      savingsAmount: 40,
      toSupplier: "Bauhaus",
    });
  });

  it("filters supplier switches below the minimum savings threshold", () => {
    const recommendations = buildSavingsRecommendations(
      [bomItem({ quantity: 5, total: 25 })],
      [
        material({
          pricing: [
            { unit_price: 5, unit: "jm", supplier_name: "K-Rauta", is_primary: true },
            { unit_price: 4.5, unit: "jm", supplier_name: "Bauhaus", is_primary: false },
          ],
        }),
      ],
    );

    expect(recommendations.some((recommendation) => recommendation.type === "supplier_switch")).toBe(false);
  });

  it("suggests equivalent material substitutions from the same substitution group", () => {
    const recommendations = buildSavingsRecommendations(
      [bomItem({ quantity: 100, total: 500 })],
      [
        material({ id: "pine_48x98_c24", pricing: [{ unit_price: 5, unit: "jm", supplier_name: "K-Rauta", is_primary: true }] }),
        material({
          id: "spruce_48x98_c24",
          name: "Spruce C24",
          name_fi: "Kuusi C24",
          name_en: "Spruce C24",
          pricing: [{ unit_price: 4.2, unit: "jm", supplier_name: "Stark", is_primary: true }],
        }),
      ],
    );

    const substitution = recommendations.find((recommendation) => recommendation.type === "material_substitution");
    expect(substitution).toMatchObject({
      toMaterialId: "spruce_48x98_c24",
      reason: "same_substitution_group",
    });
    expect(substitution?.savingsAmount).toBeCloseTo(80);
  });

  it("suggests bulk discounts for high-quantity line items", () => {
    const recommendations = buildSavingsRecommendations(
      [bomItem({ quantity: 60, total: 300 })],
      [material({})],
    );

    const bulk = recommendations.find((recommendation) => recommendation.type === "bulk_discount");
    expect(bulk?.savingsAmount).toBeCloseTo(24);
    expect(bulk?.targetUnitPrice).toBeCloseTo(4.6);
  });

  it("keeps stock alerts but does not count them as savings", () => {
    const recommendations = buildSavingsRecommendations(
      [bomItem({ stock_level: "low_stock" })],
      [material({})],
    );

    expect(recommendations.some((recommendation) => recommendation.type === "seasonal_stock")).toBe(true);
    expect(sumSavings(recommendations)).toBeGreaterThan(0);
    expect(sumSavings(recommendations.filter((recommendation) => recommendation.type === "seasonal_stock"))).toBe(0);
  });

  it("does not double-count mutually exclusive savings on the same BOM line", () => {
    const recommendations = buildSavingsRecommendations(
      [bomItem({ quantity: 60, total: 300 })],
      [
        material({
          pricing: [
            { unit_price: 5, unit: "jm", supplier_name: "K-Rauta", is_primary: true },
            { unit_price: 4, unit: "jm", supplier_name: "Bauhaus", is_primary: false },
          ],
        }),
      ],
    );

    expect(recommendations.some((recommendation) => recommendation.type === "supplier_switch")).toBe(true);
    expect(recommendations.some((recommendation) => recommendation.type === "bulk_discount")).toBe(true);
    expect(sumSavings(recommendations)).toBeCloseTo(60);
  });
});
