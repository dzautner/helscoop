import { describe, expect, it } from "vitest";
import type { Material } from "@/types";
import {
  DEFAULT_RENOVATION_WIZARD_STATE,
  buildGuidedRenovationPlan,
  buildWizardScene,
  estimateWizardCost,
  hydrateWizardBomRows,
  type RenovationWizardState,
} from "../renovation-wizard";

const materials: Material[] = [
  {
    id: "galvanized_roofing",
    name: "Peltikatto Sinkitty",
    name_fi: "Peltikatto Sinkitty",
    name_en: "Galvanized roofing",
    category_name: "roofing",
    category_name_fi: "Katto",
    image_url: null,
    pricing: [{ unit_price: 22, unit: "m2", supplier_name: "K-Rauta", is_primary: true }],
    tags: ["roof"],
  },
  {
    id: "insulation_100mm",
    name: "Mineraalivilla 100mm",
    name_fi: "Mineraalivilla 100mm",
    name_en: "Mineral wool 100mm",
    category_name: "insulation",
    category_name_fi: "Eriste",
    image_url: null,
    pricing: [{ unit_price: 8, unit: "m2", supplier_name: "Stark", is_primary: true }],
    tags: ["energy"],
  },
];

describe("renovation wizard planner", () => {
  it("estimates higher cost for premium and energy upgrade choices", () => {
    const good: RenovationWizardState = {
      ...DEFAULT_RENOVATION_WIZARD_STATE,
      designTier: "good",
      energyUpgrade: "none",
    };
    const best: RenovationWizardState = {
      ...good,
      designTier: "best",
      energyUpgrade: "insulation",
    };

    expect(estimateWizardCost(best)).toBeGreaterThan(estimateWizardCost(good));
  });

  it("hydrates BOM rows using catalog prices when available", () => {
    const rows = [{ material_id: "galvanized_roofing", quantity: 10, unit: "m2", note: "Roof" }];
    const bom = hydrateWizardBomRows(rows, materials);

    expect(bom[0].material_name).toBe("Galvanized roofing");
    expect(bom[0].total).toBe(220);
    expect(bom[0].manual_override).toBe(true);
  });

  it("generates a valid scene script with selected material references", () => {
    const scene = buildWizardScene({
      ...DEFAULT_RENOVATION_WIZARD_STATE,
      renovationType: "roof",
      designTier: "best",
    });

    expect(scene).toContain("scene.add");
    expect(scene).toContain("galvanized_roofing");
  });

  it("builds a complete guided plan with scene, BOM rows, and estimate", () => {
    const plan = buildGuidedRenovationPlan({
      ...DEFAULT_RENOVATION_WIZARD_STATE,
      renovationType: "extension",
      energyUpgrade: "insulation",
    }, materials, { area_m2: 140 });

    expect(plan.name).toContain("Extension");
    expect(plan.sceneJs).toContain("guided renovation wizard");
    expect(plan.bom.length).toBeGreaterThan(3);
    expect(plan.estimatedCost).toBeGreaterThan(0);
  });
});
