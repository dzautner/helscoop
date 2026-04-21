import { describe, expect, it } from "vitest";
import { replaceSceneMaterialReferences } from "@/lib/scene-materials";

describe("replaceSceneMaterialReferences", () => {
  it("replaces scene.add material declarations", () => {
    const result = replaceSceneMaterialReferences(
      'scene.add(wall, { material: "pine_48x98_c24", color: [1, 1, 1] });',
      "pine_48x98_c24",
      "spruce_48x98_c30",
    );

    expect(result.code).toContain('material: "spruce_48x98_c30"');
    expect(result.replacements).toBe(1);
  });

  it("replaces withMaterial calls without changing unrelated strings", () => {
    const result = replaceSceneMaterialReferences(
      [
        'const wall = withMaterial(box(1, 2, 3), "pine_48x98_c24");',
        'const note = "pine_48x98_c24";',
      ].join("\n"),
      "pine_48x98_c24",
      "glulam_gl24h",
    );

    expect(result.code).toContain('withMaterial(box(1, 2, 3), "glulam_gl24h")');
    expect(result.code).toContain('const note = "pine_48x98_c24"');
    expect(result.replacements).toBe(1);
  });

  it("does nothing for identical material ids", () => {
    const scene = 'scene.add(wall, { material: "pine_48x98_c24" });';
    const result = replaceSceneMaterialReferences(scene, "pine_48x98_c24", "pine_48x98_c24");

    expect(result.code).toBe(scene);
    expect(result.replacements).toBe(0);
  });
});
