import { describe, it, expect } from "vitest";
import { replaceSceneMaterialReferences } from "@/lib/scene-materials";

describe("replaceSceneMaterialReferences", () => {
  it("returns unchanged code when from equals to", () => {
    const code = 'scene.add(wall, { material: "lumber" });';
    const result = replaceSceneMaterialReferences(code, "lumber", "lumber");
    expect(result).toEqual({ code, replacements: 0 });
  });

  it("returns unchanged code when from is empty", () => {
    const code = 'scene.add(wall, { material: "lumber" });';
    const result = replaceSceneMaterialReferences(code, "", "stone");
    expect(result).toEqual({ code, replacements: 0 });
  });

  it("replaces material in scene.add options", () => {
    const code = 'scene.add(wall, { material: "lumber", color: [1,1,1] });';
    const result = replaceSceneMaterialReferences(code, "lumber", "stone");
    expect(result.code).toContain('"stone"');
    expect(result.code).not.toContain('"lumber"');
    expect(result.replacements).toBe(1);
  });

  it("replaces material with single quotes", () => {
    const code = "scene.add(wall, { material: 'lumber' });";
    const result = replaceSceneMaterialReferences(code, "lumber", "stone");
    expect(result.code).toContain("'stone'");
    expect(result.replacements).toBe(1);
  });

  it("replaces withMaterial references", () => {
    const code = 'withMaterial(wall, "lumber")';
    const result = replaceSceneMaterialReferences(code, "lumber", "foundation");
    expect(result.code).toContain('"foundation"');
    expect(result.replacements).toBe(1);
  });

  it("replaces multiple occurrences", () => {
    const code = `scene.add(wall1, { material: "lumber" });
scene.add(wall2, { material: "lumber" });`;
    const result = replaceSceneMaterialReferences(code, "lumber", "roofing");
    expect(result.replacements).toBe(2);
  });

  it("does not replace unrelated strings", () => {
    const code = 'scene.add(wall, { material: "stone" });';
    const result = replaceSceneMaterialReferences(code, "lumber", "roofing");
    expect(result.code).toBe(code);
    expect(result.replacements).toBe(0);
  });

  it("handles regex special chars in material id", () => {
    const code = 'scene.add(wall, { material: "a.b" });';
    const result = replaceSceneMaterialReferences(code, "a.b", "stone");
    expect(result.code).toContain('"stone"');
    expect(result.replacements).toBe(1);
  });
});
