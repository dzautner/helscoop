import { describe, expect, it } from "vitest";
import {
  buildEuEnergyGrantPrecheck,
  inferEuGrantApplicantType,
  inferEuGrantScopes,
} from "@/lib/eu-energy-grants";
import type { BomItem, BuildingInfo, Material } from "@/types";

const materials: Material[] = [
  {
    id: "solar-panel",
    name: "Solar panel",
    name_fi: "Aurinkopaneeli",
    name_en: "Solar panel",
    category_name: "solar",
    category_name_fi: "aurinko",
    image_url: null,
    tags: ["solar", "energy community"],
    pricing: [{ unit_price: 250, unit: "pcs", supplier_name: "Test", is_primary: true }],
  },
  {
    id: "smart-control",
    name: "Smart heating control",
    name_fi: "Alyohjaus",
    name_en: "Smart heating control",
    category_name: "controls",
    category_name_fi: "ohjaus",
    image_url: null,
    tags: ["smart controls"],
    pricing: [{ unit_price: 1200, unit: "pcs", supplier_name: "Test", is_primary: true }],
  },
];

const solarBom: BomItem[] = [
  { material_id: "solar-panel", quantity: 80, unit: "pcs" },
  { material_id: "smart-control", quantity: 1, unit: "pcs" },
];

describe("eu energy grants", () => {
  it("infers community energy scopes from BOM and material metadata", () => {
    expect(inferEuGrantScopes(solarBom, materials)).toEqual(expect.arrayContaining(["solar", "smart_controls"]));
  });

  it("infers housing company for apartment-style building context", () => {
    const buildingInfo: BuildingInfo = { type: "kerrostalo", units: 24 };
    expect(inferEuGrantApplicantType(buildingInfo)).toBe("housing_company");
  });

  it("blocks Business Finland Energy Aid for residential housing companies", () => {
    const result = buildEuEnergyGrantPrecheck({
      bom: solarBom,
      materials,
      totalCost: 60000,
      buildingInfo: { type: "kerrostalo", units: 24, year_built: 1975 },
    });
    const businessFinland = result.programs.find((program) => program.id === "business_finland_energy_aid");

    expect(businessFinland?.status).toBe("not_eligible");
    expect(businessFinland?.blockers.join(" ")).toContain("exclude housing associations");
  });

  it("flags EU Energy Communities Facility for housing-company solar projects", () => {
    const result = buildEuEnergyGrantPrecheck({
      bom: solarBom,
      materials,
      totalCost: 60000,
      buildingInfo: { type: "kerrostalo", units: 24, year_built: 1975 },
    });
    const community = result.programs.find((program) => program.id === "eu_energy_communities_facility");

    expect(community?.status).toBe("maybe");
    expect(community?.amountMax).toBe(45000);
    expect(community?.deadline).toBe("2026-07-05");
    expect(result.fundingBadge.show).toBe(true);
    expect(result.totalPotentialAmount).toBe(45000);
  });

  it("allows Business Finland screening for non-residential company projects with new technology", () => {
    const result = buildEuEnergyGrantPrecheck({
      bom: [{ material_id: "smart-control", quantity: 10, unit: "pcs" }],
      materials,
      totalCost: 100000,
      answers: {
        applicantType: "company_or_municipality",
        buildingType: "non_residential",
        scopes: ["smart_controls"],
        stage: "planning",
      },
    });
    const businessFinland = result.programs.find((program) => program.id === "business_finland_energy_aid");

    expect(businessFinland?.status).toBe("maybe");
    expect(businessFinland?.amountMax).toBe(30000);
  });

  it("always includes Motiva energy advice as an official advice path", () => {
    const result = buildEuEnergyGrantPrecheck({ bom: [], materials: [] });
    const motiva = result.programs.find((program) => program.id === "motiva_energy_advice");

    expect(motiva?.status).toBe("info");
    expect(motiva?.amountMax).toBeNull();
  });
});
