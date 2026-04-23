import { describe, expect, it } from "vitest";
import { buildSceneLayers, groupLayerSeeds, humanizeObjectId } from "@/lib/scene-layers";
import type { BomItem } from "@/types";

describe("scene layers", () => {
  it("groups tessellated meshes by objectId in first-seen order", () => {
    const grouped = groupLayerSeeds([
      { objectId: "front_wall", materialId: "pine_48x98_c24", color: [1, 0, 0] },
      { objectId: "front_wall", materialId: "pine_48x98_c24", color: [1, 0, 0] },
      { objectId: "roof_panel", materialId: "metal_roof_sheet", color: [0, 0, 1] },
      { materialId: "default", color: [0.5, 0.5, 0.5] },
    ]);

    expect(grouped).toEqual([
      {
        id: "front_wall",
        objectId: "front_wall",
        materialId: "pine_48x98_c24",
        color: [1, 0, 0],
        meshCount: 2,
      },
      {
        id: "roof_panel",
        objectId: "roof_panel",
        materialId: "metal_roof_sheet",
        color: [0, 0, 1],
        meshCount: 1,
      },
    ]);
  });

  it("humanizes object ids for display", () => {
    expect(humanizeObjectId("front_wall-panel")).toBe("Front Wall Panel");
  });

  it("splits BOM totals across layers sharing a material", () => {
    const bom: BomItem[] = [
      { material_id: "pine_48x98_c24", quantity: 1, unit: "jm", total: 120 },
      { material_id: "metal_roof_sheet", quantity: 1, unit: "m2", total: 80 },
    ];

    const layers = buildSceneLayers(
      groupLayerSeeds([
        { objectId: "front_wall", materialId: "pine_48x98_c24", color: [1, 0, 0] },
        { objectId: "back_wall", materialId: "pine_48x98_c24", color: [1, 0, 0] },
        { objectId: "roof_panel", materialId: "metal_roof_sheet", color: [0, 0, 1] },
      ]),
      bom,
    );

    expect(layers.map((layer) => ({ id: layer.id, approxCost: layer.approxCost, name: layer.name }))).toEqual([
      { id: "front_wall", approxCost: 60, name: "Front Wall" },
      { id: "back_wall", approxCost: 60, name: "Back Wall" },
      { id: "roof_panel", approxCost: 80, name: "Roof Panel" },
    ]);
  });
});
