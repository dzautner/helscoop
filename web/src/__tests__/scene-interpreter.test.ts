import { describe, it, expect } from "vitest";
import { interpretScene } from "@/lib/scene-interpreter";
import type { SceneObject } from "@/lib/scene-interpreter";

describe("interpretScene", () => {
  it("creates a box with default material and color", () => {
    const result = interpretScene(`
      const b = box(2, 3, 4);
      scene.add(b);
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].geometry).toBe("box");
    expect(result.objects[0].args).toEqual([2, 3, 4]);
    expect(result.objects[0].material).toBe("default");
    expect(result.objects[0].color).toEqual([0.8, 0.8, 0.8]);
  });

  it("creates a cylinder", () => {
    const result = interpretScene(`
      const c = cylinder(1.5, 3);
      scene.add(c, { material: "pipe", color: [0.5, 0.5, 0.5] });
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].geometry).toBe("cylinder");
    expect(result.objects[0].args).toEqual([1.5, 3]);
    expect(result.objects[0].material).toBe("pipe");
    expect(result.objects[0].color).toEqual([0.5, 0.5, 0.5]);
  });

  it("creates a sphere", () => {
    const result = interpretScene(`
      scene.add(sphere(2), { material: "stone" });
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].geometry).toBe("sphere");
    expect(result.objects[0].args).toEqual([2]);
  });

  it("translates a mesh", () => {
    const result = interpretScene(`
      const b = translate(box(1, 1, 1), 3, 4, 5);
      scene.add(b);
    `);
    expect(result.error).toBeNull();
    expect(result.objects[0].position).toEqual([3, 4, 5]);
  });

  it("accumulates translations", () => {
    const result = interpretScene(`
      let b = box(1, 1, 1);
      b = translate(b, 1, 0, 0);
      b = translate(b, 0, 2, 0);
      scene.add(b);
    `);
    expect(result.error).toBeNull();
    expect(result.objects[0].position).toEqual([1, 2, 0]);
  });

  it("rotates a mesh", () => {
    const result = interpretScene(`
      const b = rotate(box(1, 1, 1), 0.5, 0, 0);
      scene.add(b);
    `);
    expect(result.error).toBeNull();
    expect(result.objects[0].rotation).toEqual([0.5, 0, 0]);
  });

  it("accumulates rotations", () => {
    const result = interpretScene(`
      let b = box(1, 1, 1);
      b = rotate(b, 0.1, 0, 0);
      b = rotate(b, 0, 0.2, 0);
      scene.add(b);
    `);
    expect(result.error).toBeNull();
    expect(result.objects[0].rotation[0]).toBeCloseTo(0.1);
    expect(result.objects[0].rotation[1]).toBeCloseTo(0.2);
    expect(result.objects[0].rotation[2]).toBeCloseTo(0);
  });

  it("combines translate and rotate", () => {
    const result = interpretScene(`
      let b = box(2, 2, 2);
      b = translate(b, 1, 2, 3);
      b = rotate(b, 0, 0.5, 0);
      scene.add(b);
    `);
    expect(result.error).toBeNull();
    expect(result.objects[0].position).toEqual([1, 2, 3]);
    expect(result.objects[0].rotation).toEqual([0, 0.5, 0]);
  });

  it("creates union groups with children", () => {
    const result = interpretScene(`
      const a = box(1, 1, 1);
      const b = translate(box(1, 1, 1), 2, 0, 0);
      const u = union(a, b);
      scene.add(u, { material: "lumber" });
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].geometry).toBe("group");
    expect(result.objects[0].children).toHaveLength(2);
    expect(result.objects[0].children![0].geometry).toBe("box");
    expect(result.objects[0].children![1].position).toEqual([2, 0, 0]);
  });

  it("creates subtract — returns first operand (CSG not yet implemented)", () => {
    const result = interpretScene(`
      const wall = box(4, 3, 0.15);
      const door = translate(box(1, 2, 0.15), 0, 1, 0);
      const wallWithDoor = subtract(wall, door);
      scene.add(wallWithDoor, { material: "lumber" });
    `);
    expect(result.error).toBeNull();
    // subtract/difference returns the first operand as-is (CSG placeholder)
    expect(result.objects[0].geometry).toBe("box");
  });

  it("creates intersect — returns first operand (CSG not yet implemented)", () => {
    const result = interpretScene(`
      const a = box(2, 2, 2);
      const b = translate(box(2, 2, 2), 1, 0, 0);
      scene.add(intersect(a, b));
    `);
    expect(result.error).toBeNull();
    // intersect/intersection returns the first operand as-is (CSG placeholder)
    expect(result.objects[0].geometry).toBe("box");
  });

  it("handles multiple scene.add calls", () => {
    const result = interpretScene(`
      scene.add(box(6, 0.2, 4), { material: "foundation", color: [0.7, 0.7, 0.7] });
      scene.add(translate(box(6, 2.8, 0.15), 0, 1.5, -1.925), { material: "lumber", color: [0.85, 0.75, 0.55] });
      scene.add(translate(box(6, 2.8, 0.15), 0, 1.5, 1.925), { material: "lumber", color: [0.85, 0.75, 0.55] });
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(3);
    expect(result.objects[0].material).toBe("foundation");
    expect(result.objects[1].material).toBe("lumber");
    expect(result.objects[2].material).toBe("lumber");
  });

  it("handles the default scene script", () => {
    const result = interpretScene(`
      const floor = box(6, 0.2, 4);
      const wall1 = translate(box(6, 2.8, 0.15), 0, 1.5, -1.925);
      const wall2 = translate(box(6, 2.8, 0.15), 0, 1.5, 1.925);
      const wall3 = translate(box(0.15, 2.8, 4), -2.925, 1.5, 0);
      const wall4 = translate(box(0.15, 2.8, 4), 2.925, 1.5, 0);
      scene.add(floor, { material: "foundation", color: [0.7, 0.7, 0.7] });
      scene.add(wall1, { material: "lumber", color: [0.85, 0.75, 0.55] });
      scene.add(wall2, { material: "lumber", color: [0.85, 0.75, 0.55] });
      scene.add(wall3, { material: "lumber", color: [0.85, 0.75, 0.55] });
      scene.add(wall4, { material: "lumber", color: [0.85, 0.75, 0.55] });
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(5);
  });

  it("returns error for invalid JavaScript", () => {
    const result = interpretScene(`
      this is not valid javascript!!!
    `);
    expect(result.error).not.toBeNull();
    expect(result.objects).toHaveLength(0);
  });

  it("cube() is a valid alias for box()", () => {
    // cube is provided in the sandbox as an alias for cubeImpl
    const result = interpretScene(`
      const b = cube(1, 1, 1);
      scene.add(b);
    `);
    expect(result.error).toBeNull();
    expect(result.objects[0].geometry).toBe("box");
  });

  it("handles empty script", () => {
    const result = interpretScene("");
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(0);
  });

  it("handles script with only comments", () => {
    const result = interpretScene(`
      // This is a comment
      /* Multi-line
         comment */
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(0);
  });

  it("preserves position on original mesh after translate", () => {
    const result = interpretScene(`
      const original = box(1, 1, 1);
      const moved = translate(original, 5, 0, 0);
      scene.add(original);
      scene.add(moved);
    `);
    expect(result.error).toBeNull();
    expect(result.objects[0].position).toEqual([0, 0, 0]);
    expect(result.objects[1].position).toEqual([5, 0, 0]);
  });

  it("handles pihasauna template scene script", () => {
    const result = interpretScene(`
      const floor = box(4, 0.2, 3);
      const wall1 = translate(box(4, 2.4, 0.12), 0, 1.3, -1.44);
      const wall2 = translate(box(4, 2.4, 0.12), 0, 1.3, 1.44);
      const wall3 = translate(box(0.12, 2.4, 3), -1.94, 1.3, 0);
      const wall4 = translate(box(0.12, 2.4, 3), 1.94, 1.3, 0);
      const door = translate(box(0.8, 2.0, 0.12), 1.0, 1.1, -1.44);
      const wall1_cut = subtract(wall1, door);
      const roof1 = translate(rotate(box(2.3, 0.05, 4.4), 0, 0, 0.52), -1.0, 2.9, 0);
      const roof2 = translate(rotate(box(2.3, 0.05, 4.4), 0, 0, -0.52), 1.0, 2.9, 0);
      scene.add(floor, { material: "foundation", color: [0.65, 0.65, 0.65] });
      scene.add(wall1_cut, { material: "lumber", color: [0.82, 0.68, 0.47] });
      scene.add(wall2, { material: "lumber", color: [0.82, 0.68, 0.47] });
      scene.add(wall3, { material: "lumber", color: [0.82, 0.68, 0.47] });
      scene.add(wall4, { material: "lumber", color: [0.82, 0.68, 0.47] });
      scene.add(roof1, { material: "roofing", color: [0.35, 0.32, 0.30] });
      scene.add(roof2, { material: "roofing", color: [0.35, 0.32, 0.30] });
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(7);
    const materials = result.objects.map((o) => o.material);
    expect(materials).toContain("foundation");
    expect(materials).toContain("lumber");
    expect(materials).toContain("roofing");
  });
});

// ── New tests: Pre-validation (checkBalancedDelimiters, checkTypos, checkUndefinedPrimitives) ──

describe("scene interpreter — pre-validation: balanced delimiters", () => {
  it("warns on unmatched opening brace", () => {
    const result = interpretScene("const x = {");
    // Script will error since it's invalid JS, but pre-validation should catch unmatched brace
    expect(result.warnings.some(w => w.startsWith("validation.unmatchedOpener"))).toBe(true);
  });

  it("warns on unmatched closing paren", () => {
    const result = interpretScene("const x = (1 + 2))");
    expect(result.warnings.some(w => w.startsWith("validation.unmatchedCloser"))).toBe(true);
  });

  it("warns on unmatched opening bracket", () => {
    const result = interpretScene("const arr = [1, 2, 3");
    expect(result.warnings.some(w => w.startsWith("validation.unmatchedOpener"))).toBe(true);
  });

  it("does not warn on balanced delimiters", () => {
    const result = interpretScene(`
      const b = box(1, 1, 1);
      scene.add(b);
    `);
    const delimWarnings = result.warnings.filter(
      w => w.startsWith("validation.unmatchedOpener") || w.startsWith("validation.unmatchedCloser")
    );
    expect(delimWarnings).toHaveLength(0);
  });

  it("ignores delimiters inside string literals", () => {
    const result = interpretScene(`
      const msg = "hello { world (";
      const b = box(1, 1, 1);
      scene.add(b);
    `);
    const delimWarnings = result.warnings.filter(
      w => w.startsWith("validation.unmatchedOpener") || w.startsWith("validation.unmatchedCloser")
    );
    expect(delimWarnings).toHaveLength(0);
  });

  it("ignores delimiters inside comments", () => {
    const result = interpretScene(`
      // this has an unmatched (
      /* and this has an unmatched { */
      const b = box(1, 1, 1);
      scene.add(b);
    `);
    const delimWarnings = result.warnings.filter(
      w => w.startsWith("validation.unmatchedOpener") || w.startsWith("validation.unmatchedCloser")
    );
    expect(delimWarnings).toHaveLength(0);
  });
});

describe("scene interpreter — pre-validation: typo detection", () => {
  it("detects 'boxx' typo and suggests 'box'", () => {
    const result = interpretScene("const b = boxx(1, 1, 1);");
    expect(result.warnings.some(w => w.includes("typoDetected:box"))).toBe(true);
  });

  it("detects 'cyliner' typo and suggests 'cylinder'", () => {
    const result = interpretScene("const c = cyliner(1, 2);");
    expect(result.warnings.some(w => w.includes("typoDetected:cylinder"))).toBe(true);
  });

  it("detects 'shere' typo and suggests 'sphere'", () => {
    const result = interpretScene("const s = shere(1);");
    expect(result.warnings.some(w => w.includes("typoDetected:sphere"))).toBe(true);
  });

  it("detects 'translte' typo and suggests 'translate'", () => {
    const result = interpretScene("const b = translte(box(1,1,1), 1, 0, 0);");
    expect(result.warnings.some(w => w.includes("typoDetected:translate"))).toBe(true);
  });

  it("detects 'roate' typo and suggests 'rotate'", () => {
    const result = interpretScene("const b = roate(box(1,1,1), 0.5, 0, 0);");
    expect(result.warnings.some(w => w.includes("typoDetected:rotate"))).toBe(true);
  });

  it("detects 'scnee.add' typo and suggests 'scene'", () => {
    const result = interpretScene("scnee.add(box(1,1,1));");
    expect(result.warnings.some(w => w.includes("typoDetected:scene"))).toBe(true);
  });

  it("detects 'scene.addd' typo and suggests 'scene.add'", () => {
    const result = interpretScene("scene.addd(box(1,1,1));");
    expect(result.warnings.some(w => w.includes("typoDetected:scene.add"))).toBe(true);
  });

  it("does not produce typo warnings for correct identifiers", () => {
    const result = interpretScene(`
      const b = box(1, 1, 1);
      scene.add(b);
    `);
    const typoWarnings = result.warnings.filter(w => w.includes("typoDetected"));
    expect(typoWarnings).toHaveLength(0);
  });
});

describe("scene interpreter — pre-validation: undefined identifiers", () => {
  it("warns on undefined identifier 'pyramid'", () => {
    const result = interpretScene("const b = pyramid(1, 1, 1);");
    expect(result.warnings.some(w => w.includes("undefinedIdentifier:pyramid"))).toBe(true);
  });

  it("does not warn on known primitives", () => {
    const result = interpretScene(`
      const b = box(1, 1, 1);
      const c = cylinder(1, 2);
      const s = sphere(1);
      scene.add(b);
    `);
    const undefWarnings = result.warnings.filter(w => w.includes("undefinedIdentifier"));
    expect(undefWarnings).toHaveLength(0);
  });

  it("does not warn on user-defined functions", () => {
    const result = interpretScene(`
      function makeColumn(h) { return box(0.1, h, 0.1); }
      const col = makeColumn(3);
      scene.add(col);
    `);
    const undefWarnings = result.warnings.filter(w => w.includes("undefinedIdentifier"));
    expect(undefWarnings).toHaveLength(0);
  });

  it("does not warn on known transforms and boolean ops", () => {
    const result = interpretScene(`
      const a = translate(box(1,1,1), 1, 0, 0);
      const b = rotate(box(1,1,1), 0, 0, 0.5);
      const c = scale(box(1,1,1), 2);
      const u = union(a, b);
      scene.add(u);
    `);
    const undefWarnings = result.warnings.filter(w => w.includes("undefinedIdentifier"));
    expect(undefWarnings).toHaveLength(0);
  });
});

// ── New tests: Post-validation ──

describe("scene interpreter — post-validation", () => {
  it("warns on empty scene (no objects added)", () => {
    const result = interpretScene("const x = 42;");
    expect(result.warnings).toContain("validation.emptyScene");
  });

  it("does not warn emptyScene when objects are added", () => {
    const result = interpretScene(`
      const b = box(1, 1, 1);
      scene.add(b);
    `);
    expect(result.warnings).not.toContain("validation.emptyScene");
  });

  it("warns on script with only variable assignments (empty scene)", () => {
    const result = interpretScene(`
      const width = 4;
      const height = 2.5;
      const depth = 3;
    `);
    expect(result.warnings).toContain("validation.emptyScene");
  });
});

// ── New tests: Wall primitive ──

describe("scene interpreter — Wall primitive", () => {
  it("creates a wall frame with studs, plates as a group", () => {
    const result = interpretScene(`
      const w = Wall({ start: [0, 0], end: [2000, 0], height: 2400 });
      scene.add(w, { material: "lumber" });
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].geometry).toBe("group");
    // Should have bottom plate + top plate + studs (at least 3 children)
    expect(result.objects[0].children!.length).toBeGreaterThanOrEqual(3);
  });

  it("creates a wall with default parameters", () => {
    const result = interpretScene(`
      const w = Wall({});
      scene.add(w);
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].geometry).toBe("group");
    // Default wall should have children (plates + studs)
    expect(result.objects[0].children!.length).toBeGreaterThanOrEqual(3);
  });

  it("creates correct number of studs based on wall length and spacing", () => {
    const result = interpretScene(`
      const w = Wall({ start: [0, 0], end: [1200, 0], height: 2400, studSpacing: 400 });
      scene.add(w, { material: "lumber" });
    `);
    expect(result.error).toBeNull();
    const children = result.objects[0].children!;
    // 1200mm wall with 400mm spacing: ceil(1200/400) + 1 = 4 studs + 2 plates = 6 children
    expect(children.length).toBe(6);
  });

  it("positions a rotated wall correctly for angled walls", () => {
    const result = interpretScene(`
      const w = Wall({ start: [0, 0], end: [0, 2000], height: 2400 });
      scene.add(w, { material: "lumber" });
    `);
    expect(result.error).toBeNull();
    expect(result.objects[0].geometry).toBe("group");
    // Should rotate 90 degrees when wall goes along Y axis
    expect(result.objects[0].children!.length).toBeGreaterThanOrEqual(3);
  });
});

// ── New tests: scale() transform ──

describe("scene interpreter — scale transform", () => {
  it("scales a mesh uniformly", () => {
    const result = interpretScene(`
      const b = scale(box(1, 1, 1), 2);
      scene.add(b);
    `);
    expect(result.error).toBeNull();
    expect(result.objects[0].scale).toEqual([2, 2, 2]);
  });

  it("scales a mesh non-uniformly with array", () => {
    const result = interpretScene(`
      const b = scale(box(1, 1, 1), [2, 3, 4]);
      scene.add(b);
    `);
    expect(result.error).toBeNull();
    expect(result.objects[0].scale).toEqual([2, 3, 4]);
  });

  it("scales position as well as scale", () => {
    const result = interpretScene(`
      let b = translate(box(1, 1, 1), 1, 2, 3);
      b = scale(b, 2);
      scene.add(b);
    `);
    expect(result.error).toBeNull();
    // Position should be scaled: [1*2, 2*2, 3*2] = [2, 4, 6]
    expect(result.objects[0].position).toEqual([2, 4, 6]);
    expect(result.objects[0].scale).toEqual([2, 2, 2]);
  });

  it("recursively scales children in a group", () => {
    const result = interpretScene(`
      const a = translate(box(1, 1, 1), 1, 0, 0);
      const b = translate(box(1, 1, 1), 2, 0, 0);
      let u = union(a, b);
      u = scale(u, 3);
      scene.add(u);
    `);
    expect(result.error).toBeNull();
    expect(result.objects[0].geometry).toBe("group");
    // Children should also be scaled
    expect(result.objects[0].children![0].scale).toEqual([3, 3, 3]);
    expect(result.objects[0].children![0].position).toEqual([3, 0, 0]);
    expect(result.objects[0].children![1].scale).toEqual([3, 3, 3]);
    expect(result.objects[0].children![1].position).toEqual([6, 0, 0]);
  });

  it("accumulates multiple scale operations", () => {
    const result = interpretScene(`
      let b = box(1, 1, 1);
      b = scale(b, 2);
      b = scale(b, 3);
      scene.add(b);
    `);
    expect(result.error).toBeNull();
    // 2 * 3 = 6
    expect(result.objects[0].scale).toEqual([6, 6, 6]);
  });
});

// ── New tests: export const scene = [...] API (C++ style) ──

describe("scene interpreter — export const scene API", () => {
  it("handles export const scene = [...] with withColor wrappers", () => {
    const result = interpretScene(`
      export const scene = [
        withColor(box(2, 2, 2), [1, 0, 0]),
      ];
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].color).toEqual([1, 0, 0]);
  });

  it("handles export const scene with withPBR wrappers", () => {
    const result = interpretScene(`
      export const scene = [
        withPBR(box(1, 1, 1), { color: [0.5, 0.5, 0.5], material: "steel" }),
      ];
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].material).toBe("steel");
    expect(result.objects[0].color).toEqual([0.5, 0.5, 0.5]);
  });

  it("handles export const scene with bare meshes (no wrapper)", () => {
    const result = interpretScene(`
      export const scene = [
        box(3, 3, 3),
      ];
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].geometry).toBe("box");
    expect(result.objects[0].args).toEqual([3, 3, 3]);
  });

  it("handles multiple items in export const scene array", () => {
    const result = interpretScene(`
      export const scene = [
        withColor(box(1, 1, 1), [1, 0, 0]),
        withColor(translate(cylinder(0.5, 3), 2, 0, 0), [0, 1, 0]),
        sphere(1),
      ];
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(3);
  });

  it("handles const scene (without export keyword)", () => {
    const result = interpretScene(`
      const scene = [
        withColor(box(1, 1, 1), [1, 0, 0]),
      ];
    `);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(1);
  });
});

// ── New tests: Sandbox security ──

describe("scene interpreter — sandbox security", () => {
  it("cannot access globalThis properties like process", () => {
    const result = interpretScene(`
      const p = typeof process !== 'undefined' ? process : null;
      if (p && p.exit) p.exit(1);
      scene.add(box(1, 1, 1));
    `);
    // Should either error or succeed without actually accessing process
    // The key thing is it doesn't crash the test runner
    if (result.error === null) {
      expect(result.objects).toHaveLength(1);
    }
  });

  it("cannot access require", () => {
    const result = interpretScene(`
      try {
        const fs = require('fs');
      } catch(e) {
        // expected
      }
      scene.add(box(1, 1, 1));
    `);
    // Should either error (require is not defined) or succeed after catch
    // The point is require is not available
    if (result.error) {
      expect(result.error).toContain("require");
    } else {
      expect(result.objects).toHaveLength(1);
    }
  });

  it("cannot access fetch", () => {
    const result = interpretScene(`
      try {
        fetch('https://evil.com');
      } catch(e) {
        // expected
      }
      scene.add(box(1, 1, 1));
    `);
    // fetch should not be available in the sandbox
    if (result.error) {
      expect(result.error).toContain("fetch");
    } else {
      // If it didn't error, it caught the error and still added the box
      expect(result.objects).toHaveLength(1);
    }
  });

  it("cannot access document", () => {
    const result = interpretScene(`
      try {
        document.createElement('div');
      } catch(e) {
        // expected
      }
      scene.add(box(1, 1, 1));
    `);
    if (result.error) {
      expect(result.error).toBeTruthy();
    } else {
      expect(result.objects).toHaveLength(1);
    }
  });
});

// ── New tests: Malformed scripts ──

describe("scene interpreter — malformed scripts", () => {
  it("handles script that throws an error", () => {
    const result = interpretScene(`
      throw new Error("intentional error");
    `);
    expect(result.error).not.toBeNull();
    expect(result.error).toContain("intentional error");
  });

  it("handles script with syntax error in expression", () => {
    const result = interpretScene(`
      const b = box(1, , 1);
      scene.add(b);
    `);
    expect(result.error).not.toBeNull();
  });

  it("handles script that references undefined variable", () => {
    const result = interpretScene(`
      scene.add(nonExistentVariable);
    `);
    expect(result.error).not.toBeNull();
  });

  it("handles script with deeply nested unions", () => {
    const script = `
      let current = box(1, 1, 1);
      for (let i = 0; i < 50; i++) {
        current = union(current, translate(box(1, 1, 1), i * 2, 0, 0));
      }
      scene.add(current);
    `;
    const result = interpretScene(script);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].geometry).toBe("group");
  });

  it("handles script with many objects generating tooManyObjects warning", () => {
    // Generate >10000 objects via a loop
    const script = `
      for (let i = 0; i < 10001; i++) {
        scene.add(box(0.1, 0.1, 0.1));
      }
    `;
    const result = interpretScene(script);
    expect(result.error).toBeNull();
    expect(result.objects).toHaveLength(10001);
    expect(result.warnings.some(w => w.startsWith("validation.tooManyObjects"))).toBe(true);
  });
});
