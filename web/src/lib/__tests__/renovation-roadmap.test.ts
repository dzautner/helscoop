import { describe, expect, it } from "vitest";
import type { BomItem, Material } from "@/types";
import {
  buildRenovationRoadmap,
  classifyBomItemPhase,
  formatRoadmapHandoff,
  inferRoadmapProjectType,
} from "../renovation-roadmap";

const baseMaterial: Material = {
  id: "timber",
  name: "C24 timber",
  name_fi: "C24 sahatavara",
  name_en: "C24 timber",
  category_name: "lumber",
  category_name_fi: "Sahatavara",
  image_url: null,
  pricing: [{ unit_price: 8, unit: "m", supplier_name: "K-Rauta", is_primary: true }],
  tags: ["runko", "wood"],
};

const concrete: Material = {
  ...baseMaterial,
  id: "concrete",
  name: "Ready-mix concrete",
  name_fi: "Valmisbetoni",
  category_name: "foundation",
  category_name_fi: "Perustus",
  tags: ["betoni", "foundation"],
};

const roof: Material = {
  ...baseMaterial,
  id: "roof",
  name: "Roof membrane",
  name_fi: "Kattokalvo",
  category_name: "roofing",
  category_name_fi: "Katto",
  tags: ["roof", "membrane"],
};

const cable: Material = {
  ...baseMaterial,
  id: "cable",
  name: "Electrical cable",
  name_fi: "Sahkokaapeli",
  category_name: "electrical",
  category_name_fi: "Sahko",
  tags: ["electric", "mep"],
};

const paint: Material = {
  ...baseMaterial,
  id: "paint",
  name: "Interior paint",
  name_fi: "Sisämaali",
  name_en: "Interior paint",
  category_name: "interior",
  category_name_fi: "Sisätyöt",
  tags: ["paint", "interior"],
};

const materials = [baseMaterial, concrete, roof, cable, paint];

describe("renovation roadmap planner", () => {
  it("classifies BOM rows into construction phases", () => {
    expect(classifyBomItemPhase({ material_id: "concrete", quantity: 3, unit: "m3" }, materials)).toBe("foundation");
    expect(classifyBomItemPhase({ material_id: "roof", quantity: 20, unit: "m2" }, materials)).toBe("weatherproofing");
    expect(classifyBomItemPhase({ material_id: "cable", quantity: 50, unit: "m" }, materials)).toBe("mep");
  });

  it("infers extension work from added area", () => {
    expect(inferRoadmapProjectType({ bom: [], materials, addedAreaM2: 25 })).toBe("extension");
  });

  it("marks an extension over 20 m2 as a likely building permit project", () => {
    const roadmap = buildRenovationRoadmap({
      bom: [{ material_id: "timber", quantity: 12, unit: "m" }],
      materials,
      projectType: "extension",
      addedAreaM2: 25,
      buildingInfo: { address: "Kotikatu 1, Espoo" },
    });

    expect(roadmap.permitAssessment.outcome).toBe("building_permit");
    expect(roadmap.checklist.find((item) => item.id === "permit")?.required).toBe(true);
  });

  it("builds ordered phases with BOM costs and contractor suggestions", () => {
    const bom: BomItem[] = [
      { material_id: "concrete", quantity: 2, unit: "m3" },
      { material_id: "timber", quantity: 10, unit: "m" },
      { material_id: "roof", quantity: 30, unit: "m2", unit_price: 12 },
    ];
    const roadmap = buildRenovationRoadmap({ bom, materials, projectName: "Roof extension" });

    expect(roadmap.phases[0].id).toBe("planning");
    expect(roadmap.totalWeeks).toBeGreaterThan(5);
    expect(roadmap.phases.find((phase) => phase.id === "foundation")?.items).toHaveLength(1);
    expect(roadmap.phases.find((phase) => phase.id === "weatherproofing")?.estimatedCost).toBe(360);
  });

  it("omits irrelevant empty construction phases for simple interior projects", () => {
    const roadmap = buildRenovationRoadmap({
      bom: [{ material_id: "paint", quantity: 5, unit: "l" }],
      materials,
      projectType: "interior",
    });

    expect(roadmap.phases.map((phase) => phase.id)).toEqual(["planning", "interior", "handover"]);
  });

  it("formats a contractor handoff text", () => {
    const roadmap = buildRenovationRoadmap({ bom: [{ material_id: "cable", quantity: 30, unit: "m" }], materials });
    const handoff = formatRoadmapHandoff(roadmap, "en");

    expect(handoff).toContain("renovation execution roadmap");
    expect(handoff).toContain("MEP rough-in");
    expect(handoff).toContain("Permit and inspection checklist");
  });
});
