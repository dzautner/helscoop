import { describe, expect, it } from "vitest";
import { buildPhasedRenovationPlan, formatPhasedRenovationPlan } from "@/lib/phased-renovation";
import type { BomItem, Material } from "@/types";

const materials = [
  {
    id: "kitchen_cabinet",
    name: "Kitchen cabinet",
    name_fi: "Keittiökaappi",
    name_en: "Kitchen cabinet",
    category_name: "Interior",
    category_name_fi: "Sisätyöt",
    image_url: null,
    pricing: [{ unit_price: 1000, unit: "kpl", supplier_name: "K-Rauta", is_primary: true }],
    tags: ["interior"],
  },
  {
    id: "roof_tile",
    name: "Roof tile",
    name_fi: "Kattotiili",
    name_en: "Roof tile",
    category_name: "Roof",
    category_name_fi: "Katto",
    image_url: null,
    pricing: [{ unit_price: 900, unit: "m2", supplier_name: "K-Rauta", is_primary: true }],
    tags: ["roof"],
  },
] as Material[];

const bom: BomItem[] = [
  { material_id: "kitchen_cabinet", material_name: "Kitchen cabinet", quantity: 14, unit: "kpl", total: 14000 },
  { material_id: "roof_tile", material_name: "Roof tile", quantity: 12, unit: "m2", total: 10800 },
];

describe("phased renovation planner", () => {
  it("splits high-labour phases across tax years when it improves deductions", () => {
    const plan = buildPhasedRenovationPlan({
      bom,
      materials,
      startYear: 2027,
      coupleMode: true,
      locale: "en",
    });

    expect(plan.claimantCount).toBe(2);
    expect(plan.years.length).toBeGreaterThanOrEqual(2);
    expect(plan.totalCredit).toBeGreaterThan(plan.allInOneYearCredit);
    expect(plan.optimizedSavings).toBeGreaterThan(0);
  });

  it("honors manual phase schedule overrides", () => {
    const plan = buildPhasedRenovationPlan({
      bom,
      materials,
      startYear: 2027,
      scheduleOverrides: { interior: { year: 2029, quarter: 3 } },
    });

    const interior = plan.phases.find((phase) => phase.id === "interior");
    expect(interior?.schedule.year).toBe(2029);
    expect(interior?.schedule.quarter).toBe(3);
  });

  it("formats a contractor handoff summary", () => {
    const plan = buildPhasedRenovationPlan({ bom, materials, startYear: 2027 });
    expect(formatPhasedRenovationPlan(plan, "en")).toContain("Helscoop phased renovation plan");
  });
});
