import { describe, expect, it } from "vitest";
import {
  analyzeSceneGeometry,
  parseSceneGeometryBoxes,
  suggestGeometryBomUpdates,
} from "../scene-geometry-bom";
import type { BomItem, Material } from "@/types";

function material(id: string, name: string, category = "Lumber", tags: string[] = []): Material {
  return {
    id,
    name,
    name_fi: null,
    name_en: null,
    category_name: category,
    category_name_fi: null,
    image_url: null,
    pricing: null,
    tags,
  };
}

const baseScene = `
const floor = box(4, 0.2, 3);
const wall_back = translate(box(4, 2.4, 0.12), 0, 1.3, -1.44);
const wall_front = translate(box(4, 2.4, 0.12), 0, 1.3, 1.44);
const wall_left = translate(box(0.12, 2.4, 3), -1.94, 1.3, 0);
const wall_right = translate(box(0.12, 2.4, 3), 1.94, 1.3, 0);
const roof = translate(rotate(box(4.5, 0.08, 3.5), 0, 0, 0.2), 0, 2.8, 0);
const door = translate(box(0.9, 2.0, 0.12), 0, 1.0, 1.44);
scene.add(floor, { material: "foundation" });
scene.add(wall_back, { material: "lumber" });
scene.add(wall_front, { material: "lumber" });
scene.add(wall_left, { material: "lumber" });
scene.add(wall_right, { material: "lumber" });
scene.add(roof, { material: "roofing" });
scene.add(door, { material: "door" });
`;

describe("scene geometry BOM analyzer", () => {
  it("extracts box geometry from scene.add calls", () => {
    const boxes = parseSceneGeometryBoxes(baseScene);

    expect(boxes).toHaveLength(7);
    expect(boxes.find((box) => box.name === "roof")?.type).toBe("roof");
    expect(boxes.find((box) => box.name === "door")?.type).toBe("opening");
  });

  it("calculates floor, roof, wall, and opening metrics", () => {
    const metrics = analyzeSceneGeometry(baseScene);

    expect(metrics.floorAreaM2).toBeCloseTo(12, 1);
    expect(metrics.roofAreaM2).toBeCloseTo(15.8, 1);
    expect(metrics.wallAreaM2).toBeGreaterThan(30);
    expect(metrics.openingCount).toBe(1);
    expect(metrics.wallPerimeterM).toBeGreaterThan(13);
  });

  it("suggests material quantity updates from geometry", () => {
    const bom: BomItem[] = [
      { material_id: "insulation_100mm", material_name: "Insulation", quantity: 8, unit: "m2", unit_price: 5, total: 40 },
      { material_id: "pine_48x148_c24", material_name: "48x148 C24", quantity: 20, unit: "jm", unit_price: 3, total: 60 },
      { material_id: "galvanized_roofing", material_name: "Roofing", quantity: 6, unit: "m2", unit_price: 9, total: 54 },
    ];
    const materials = [
      material("insulation_100mm", "Mineraalivilla 100mm", "Insulation", ["insulation"]),
      material("pine_48x148_c24", "48x148 Runkopuu C24", "Lumber", ["structural"]),
      material("galvanized_roofing", "Peltikatto", "Roofing", ["roofing"]),
    ];

    const result = suggestGeometryBomUpdates(baseScene, bom, materials);

    expect(result.suggestions.map((suggestion) => suggestion.materialId)).toEqual(
      expect.arrayContaining(["insulation_100mm", "pine_48x148_c24", "galvanized_roofing"]),
    );
    expect(result.suggestions.find((suggestion) => suggestion.materialId === "insulation_100mm")?.suggestedQuantity)
      .toBeGreaterThan(30);
  });

  it("preserves manual overrides by moving them to skippedManual", () => {
    const bom: BomItem[] = [
      { material_id: "insulation_100mm", material_name: "Insulation", quantity: 8, unit: "m2" },
      { material_id: "galvanized_roofing", material_name: "Roofing", quantity: 6, unit: "m2" },
    ];
    const materials = [
      material("insulation_100mm", "Mineraalivilla 100mm", "Insulation", ["insulation"]),
      material("galvanized_roofing", "Peltikatto", "Roofing", ["roofing"]),
    ];

    const result = suggestGeometryBomUpdates(baseScene, bom, materials, new Set(["insulation_100mm"]));

    expect(result.suggestions.map((suggestion) => suggestion.materialId)).toContain("galvanized_roofing");
    expect(result.suggestions.map((suggestion) => suggestion.materialId)).not.toContain("insulation_100mm");
    expect(result.skippedManual.map((suggestion) => suggestion.materialId)).toContain("insulation_100mm");
  });

  it("keeps quantity units compatible for kpl foundation materials", () => {
    const bom: BomItem[] = [
      { material_id: "concrete_block", material_name: "Betoniharkko", quantity: 4, unit: "kpl" },
    ];
    const materials = [material("concrete_block", "Betoniharkko 200mm", "Masonry", ["foundation"])];

    const result = suggestGeometryBomUpdates(baseScene, bom, materials);

    expect(result.suggestions[0]?.materialId).toBe("concrete_block");
    expect(result.suggestions[0]?.unit).toBe("kpl");
  });
});
