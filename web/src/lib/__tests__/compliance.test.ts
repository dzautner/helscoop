import { describe, it, expect } from "vitest";
import { checkCompliance, RULE_COUNT } from "../compliance";

describe("checkCompliance", () => {
  it("returns empty array for empty scene", () => {
    expect(checkCompliance("")).toEqual([]);
    expect(checkCompliance("  ")).toEqual([]);
  });

  it("returns empty array for scene with no meshes", () => {
    expect(checkCompliance("// just a comment")).toEqual([]);
  });

  it("exports RULE_COUNT equal to 5", () => {
    expect(RULE_COUNT).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Rule 1: Minimum ceiling height (2500mm)
// ---------------------------------------------------------------------------
describe("FI-RakMK-G1-2.1 — minimum ceiling height", () => {
  it("flags wall shorter than 2.5m", () => {
    const scene = `
      const wall = translate(box(5, 2.3, 0.2), 0, 1.15, 0);
      scene.add(wall, {material: "wood"});
    `;
    const warnings = checkCompliance(scene);
    const match = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
    expect(match!.params.height).toBe(2300);
  });

  it("passes for wall at exactly 2.5m", () => {
    const scene = `
      const wall = translate(box(5, 2.5, 0.2), 0, 1.25, 0);
      scene.add(wall, {material: "wood"});
    `;
    const warnings = checkCompliance(scene);
    const match = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(match).toBeUndefined();
  });

  it("skips check for non-residential buildings", () => {
    const scene = `
      const wall = translate(box(5, 2.0, 0.2), 0, 1.0, 0);
      scene.add(wall, {material: "wood"});
    `;
    const warnings = checkCompliance(scene, { type: "kerrostalo" });
    const match = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(match).toBeUndefined();
  });

  it("applies check when building type is omakotitalo", () => {
    const scene = `
      const wall = translate(box(5, 2.3, 0.2), 0, 1.15, 0);
      scene.add(wall, {material: "wood"});
    `;
    const warnings = checkCompliance(scene, { type: "omakotitalo" });
    expect(warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 2: Minimum door opening width (800mm)
// ---------------------------------------------------------------------------
describe("FI-RakMK-F1-2.3 — minimum door width", () => {
  it("flags door narrower than 800mm", () => {
    const scene = `
      const wall = translate(box(5, 2.7, 0.2), 0, 1.35, 0);
      const opening = translate(box(0.7, 2.1, 0.2), 1, 1.05, 0);
      const result = subtract(wall, opening);
      scene.add(result, {material: "wood"});
    `;
    const warnings = checkCompliance(scene);
    const match = warnings.find((w) => w.ruleId === "FI-RakMK-F1-2.3");
    expect(match).toBeDefined();
    expect(match!.params.width).toBe(700);
  });

  it("passes for standard 900mm door", () => {
    const scene = `
      const wall = translate(box(5, 2.7, 0.2), 0, 1.35, 0);
      const opening = translate(box(0.9, 2.1, 0.2), 1, 1.05, 0);
      const result = subtract(wall, opening);
      scene.add(result, {material: "wood"});
    `;
    const warnings = checkCompliance(scene);
    expect(warnings.find((w) => w.ruleId === "FI-RakMK-F1-2.3")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 3: Handrail required for platforms > 500mm
// ---------------------------------------------------------------------------
describe("FI-RakMK-F2-3.2 — handrail required", () => {
  it("flags elevated platform without posts", () => {
    const scene = `
      const deck = translate(box(3, 0.15, 2), 0, 0.8, 0);
      scene.add(deck, {material: "wood"});
    `;
    const warnings = checkCompliance(scene);
    const match = warnings.find((w) => w.ruleId === "FI-RakMK-F2-3.2");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("warning");
  });

  it("passes when posts are present near platform", () => {
    const scene = `
      const deck = translate(box(3, 0.15, 2), 0, 0.8, 0);
      scene.add(deck, {material: "wood"});
      const post = translate(box(0.1, 1.0, 0.1), 1.4, 1.3, 0.9);
      scene.add(post, {material: "wood"});
    `;
    const warnings = checkCompliance(scene);
    expect(warnings.find((w) => w.ruleId === "FI-RakMK-F2-3.2")).toBeUndefined();
  });

  it("does not flag low platforms (< 500mm)", () => {
    const scene = `
      const deck = translate(box(3, 0.15, 2), 0, 0.3, 0);
      scene.add(deck, {material: "wood"});
    `;
    const warnings = checkCompliance(scene);
    expect(warnings.find((w) => w.ruleId === "FI-RakMK-F2-3.2")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 4: Maximum building height (12m)
// ---------------------------------------------------------------------------
describe("FI-MRL-115 — maximum building height", () => {
  it("flags building exceeding 12m", () => {
    const scene = `
      const wall = translate(box(5, 13, 0.2), 0, 6.5, 0);
      scene.add(wall, {material: "concrete"});
    `;
    const warnings = checkCompliance(scene);
    const match = warnings.find((w) => w.ruleId === "FI-MRL-115");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("error");
    expect(match!.params.limit).toBe(12000);
  });

  it("passes for building at exactly 12m", () => {
    const scene = `
      const wall = translate(box(5, 10, 0.2), 0, 5, 0);
      scene.add(wall, {material: "concrete"});
    `;
    const warnings = checkCompliance(scene);
    expect(warnings.find((w) => w.ruleId === "FI-MRL-115")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 5: Minimum room area (7m²)
// ---------------------------------------------------------------------------
describe("FI-RakMK-G1-2.2 — minimum room area", () => {
  it("flags floor smaller than 7m²", () => {
    const scene = `
      const floor = translate(box(2, 0.15, 3), 0, 0.075, 0);
      scene.add(floor, {material: "concrete"});
    `;
    const warnings = checkCompliance(scene);
    const match = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.2");
    expect(match).toBeDefined();
    expect(match!.severity).toBe("warning");
    expect(match!.params.area).toBe(6);
  });

  it("passes for floor at 7m² or larger", () => {
    const scene = `
      const floor = translate(box(3, 0.15, 3), 0, 0.075, 0);
      scene.add(floor, {material: "concrete"});
    `;
    const warnings = checkCompliance(scene);
    expect(warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.2")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Three.js fallback parsing
// ---------------------------------------------------------------------------
describe("Three.js BoxGeometry fallback", () => {
  it("parses THREE.BoxGeometry and checks rules", () => {
    // Three.js meshes default to position (0,0,0), so top = h/2.
    // A box with height 26 at origin has top at 13m > 12m limit.
    const scene = `
      const geometry = new THREE.BoxGeometry(5, 26, 0.2);
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
    `;
    const warnings = checkCompliance(scene);
    const match = warnings.find((w) => w.ruleId === "FI-MRL-115");
    expect(match).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Integration: multiple rules triggered
// ---------------------------------------------------------------------------
describe("checkCompliance — multiple rules", () => {
  it("can flag multiple rules in one scene", () => {
    const scene = `
      const wall = translate(box(5, 2.3, 0.2), 0, 1.15, 0);
      const opening = translate(box(0.6, 2.0, 0.2), 1, 1.0, 0);
      const result = subtract(wall, opening);
      scene.add(result, {material: "wood"});
    `;
    const warnings = checkCompliance(scene);
    const ruleIds = warnings.map((w) => w.ruleId);
    expect(ruleIds).toContain("FI-RakMK-G1-2.1");
    expect(ruleIds).toContain("FI-RakMK-F1-2.3");
  });
});
