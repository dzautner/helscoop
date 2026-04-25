import { describe, expect, it } from "vitest";
import { recognizeBlueprintFromMetadata, formatBlueprintHandoff } from "@/lib/blueprint-to-scene";
import { interpretScene } from "@/lib/scene-interpreter";

describe("blueprint-to-scene", () => {
  it("generates editable Scene JS from owner dimensions and room notes", () => {
    const result = recognizeBlueprintFromMetadata({
      fileName: "omakotitalo-sauna-khh-floorplan.jpg",
      mimeType: "image/jpeg",
      projectName: "Espoo house",
      widthMeters: 11,
      depthMeters: 8.5,
      notes: "sauna, KHH, kitchen opens to living room",
    });

    expect(result.scaleSource).toBe("user_dimensions");
    expect(result.widthMeters).toBe(11);
    expect(result.depthMeters).toBe(8.5);
    expect(result.rooms.some((room) => room.type === "sauna")).toBe(true);
    expect(result.rooms.some((room) => room.type === "utility")).toBe(true);
    expect(result.openings.filter((opening) => opening.type === "window").length).toBeGreaterThanOrEqual(2);
    expect(result.sceneJs).toContain("blueprint_wall_north");
    expect(result.sceneJs).toContain("scene.add");

    const interpreted = interpretScene(result.sceneJs);
    expect(interpreted.error).toBeNull();
    expect(interpreted.objects.length).toBeGreaterThan(10);
  });

  it("infers scale from building area when the owner does not provide dimensions", () => {
    const result = recognizeBlueprintFromMetadata({
      fileName: "main-floor.pdf",
      mimeType: "application/pdf",
      buildingInfo: { area_m2: 160, floors: 2 },
    });

    expect(result.scaleSource).toBe("building_area");
    expect(result.areaM2).toBeGreaterThan(70);
    expect(result.assumptions.join(" ")).toContain("PDF files are accepted");
    expect(result.confidence).toBeGreaterThan(0.45);
  });

  it("formats a contractor/founder handoff summary", () => {
    const result = recognizeBlueprintFromMetadata({
      fileName: "draft-plan.png",
      mimeType: "image/png",
      widthMeters: 9,
      depthMeters: 7,
    });

    const handoff = formatBlueprintHandoff(result);

    expect(handoff).toContain("Helscoop blueprint-to-3D draft");
    expect(handoff).toContain("Footprint: 9 m x 7 m");
    expect(handoff).toContain("Rooms");
  });
});
