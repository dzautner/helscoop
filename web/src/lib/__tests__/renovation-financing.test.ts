import { describe, expect, it } from "vitest";
import {
  buildFinancingPartnerUrl,
  buildRenovationFinancingPlan,
  calculateMonthlyPayment,
  FINANCING_PARTNERS,
  RENOVATION_FINANCING_CONFIG,
} from "@/lib/renovation-financing";
import type { BomItem, BuildingInfo, Material } from "@/types";

const materials: Material[] = [
  {
    id: "heat-pump",
    name: "Air-water heat pump",
    name_fi: "Ilma-vesilampopumppu",
    name_en: "Air-water heat pump",
    category_name: "heating",
    category_name_fi: "lammitys",
    image_url: null,
    tags: ["energy", "air-water heat pump"],
    pricing: [{ unit_price: 4500, unit: "pcs", supplier_name: "Test supplier", is_primary: true }],
  },
  {
    id: "tile",
    name: "Tile",
    name_fi: "Laatta",
    name_en: "Tile",
    category_name: "interior",
    category_name_fi: "sisustus",
    image_url: null,
    pricing: [{ unit_price: 45, unit: "m2", supplier_name: "Test supplier", is_primary: true }],
  },
];

const energyBom: BomItem[] = [
  { material_id: "heat-pump", material_name: "Air-water heat pump", quantity: 1, unit: "pcs" },
  { material_id: "tile", material_name: "Tile", quantity: 200, unit: "m2" },
];

const buildingInfo: BuildingInfo = {
  address: "Hidden Street 1",
  type: "omakotitalo",
  year_built: 1978,
  area_m2: 140,
  heating: "oil",
};

describe("renovation financing", () => {
  it("calculates zero-interest monthly payments as straight-line instalments", () => {
    expect(calculateMonthlyPayment(1200, 0, 12)).toBe(100);
  });

  it("amortizes interest-bearing loans", () => {
    expect(calculateMonthlyPayment(1000, 12, 12)).toBeCloseTo(88.85, 2);
  });

  it("does not mark small BOMs as financing eligible", () => {
    const plan = buildRenovationFinancingPlan({
      bom: [{ material_id: "tile", quantity: 1, unit: "m2" }],
      materials,
    });

    expect(plan.eligible).toBe(false);
    expect(plan.threshold).toBe(RENOVATION_FINANCING_CONFIG.minBomTotal);
  });

  it("builds unsecured, secured, and material split offers for eligible renovations", () => {
    const plan = buildRenovationFinancingPlan({ bom: energyBom, materials, buildingInfo, termYears: 7 });

    expect(plan.eligible).toBe(true);
    expect(plan.offers.map((offer) => offer.productType)).toEqual([
      "unsecured_remonttilaina",
      "secured_bank_loan",
      "materials_bnpl",
    ]);
    expect(plan.offers[0].monthlyMin).toBeLessThan(plan.offers[0].monthlyMax);
    expect(plan.termComparisons).toHaveLength(3);
  });

  it("adds household deduction and energy grant notices when context supports them", () => {
    const plan = buildRenovationFinancingPlan({ bom: energyBom, materials, buildingInfo });

    expect(plan.notices.some((notice) => notice.id === "household_deduction" && (notice.amount ?? 0) > 0)).toBe(true);
    expect(plan.notices.some((notice) => notice.id === "energy_grant" && notice.amount === 4000)).toBe(true);
    expect(plan.notices.at(-1)?.id).toBe("credit_disclaimer");
  });

  it("builds affiliate-ready partner URLs without leaking the address", () => {
    const plan = buildRenovationFinancingPlan({ bom: energyBom, materials, buildingInfo, loanAmount: 12000, termYears: 5 });
    const url = buildFinancingPartnerUrl(FINANCING_PARTNERS[0], plan, buildingInfo, "fi");

    expect(url).toContain("utm_source=helscoop");
    expect(url).toContain("amount_eur=12000");
    expect(url).toContain("term_years=5");
    expect(url).toContain("building_type=omakotitalo");
    expect(url).not.toContain("Hidden");
    expect(url).not.toContain("address");
  });
});
