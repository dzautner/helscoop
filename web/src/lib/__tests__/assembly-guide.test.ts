import { describe, expect, it } from "vitest";
import { buildAssemblyGuide, getAssemblyViewportState, formatAssemblyDuration } from "@/lib/assembly-guide";
import type { BomItem, Material } from "@/types";
import type { SceneLayer } from "@/lib/scene-layers";

function material(id: string, category: string): Material {
  return {
    id,
    name: id,
    name_fi: null,
    name_en: id,
    category_name: category,
    category_name_fi: null,
    image_url: null,
    pricing: null,
  };
}

const layers: SceneLayer[] = [
  {
    id: "roof_panel",
    objectId: "roof_panel",
    materialId: "metal_roof_sheet",
    color: [0.2, 0.4, 0.8],
    meshCount: 1,
    name: "Roof Panel",
    approxCost: 220,
  },
  {
    id: "foundation_slab",
    objectId: "foundation_slab",
    materialId: "concrete_c25",
    color: [0.5, 0.5, 0.5],
    meshCount: 1,
    name: "Foundation Slab",
    approxCost: 480,
  },
  {
    id: "front_wall",
    objectId: "front_wall",
    materialId: "c24_lumber",
    color: [0.8, 0.6, 0.4],
    meshCount: 1,
    name: "Front Wall",
    approxCost: 120,
  },
];

const bom: BomItem[] = [
  { material_id: "metal_roof_sheet", material_name: "Metal roof", category_name: "roofing", quantity: 12, unit: "m2", unit_price: 18, total: 216 },
  { material_id: "concrete_c25", material_name: "Concrete", category_name: "foundation", quantity: 4, unit: "m3", unit_price: 120, total: 480 },
  { material_id: "c24_lumber", material_name: "C24 lumber", category_name: "lumber", quantity: 24, unit: "m", unit_price: 5, total: 120 },
];

const materials = [
  material("metal_roof_sheet", "roofing"),
  material("concrete_c25", "foundation"),
  material("c24_lumber", "lumber"),
];

describe("assembly-guide", () => {
  it("builds construction-ordered steps from scene layers and BOM", () => {
    const guide = buildAssemblyGuide(layers, bom, materials);

    expect(guide.steps.map((step) => step.layerIds[0])).toEqual([
      "foundation_slab",
      "front_wall",
      "roof_panel",
    ]);
    expect(guide.totalCost).toBeGreaterThan(800);
    expect(guide.steps[0].parts[0].name).toBe("concrete_c25");
    expect(guide.steps[0].tools).toContain("level");
  });

  it("derives viewport state with completed, current, ghost, and hidden object sets", () => {
    const guide = buildAssemblyGuide(layers, bom, materials);
    const state = getAssemblyViewportState(guide.steps, 1);

    expect(state?.completedObjectIds).toEqual(["foundation_slab"]);
    expect(state?.currentObjectIds).toEqual(["front_wall"]);
    expect(state?.ghostObjectIds).toEqual(["roof_panel"]);
    expect(state?.hiddenObjectIds).toEqual([]);
  });

  it("formats durations for short and long steps", () => {
    expect(formatAssemblyDuration(45)).toBe("45 min");
    expect(formatAssemblyDuration(135)).toBe("2 h 15 min");
  });
});
