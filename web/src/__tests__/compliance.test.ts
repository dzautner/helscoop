import { describe, it, expect } from "vitest";
import { checkCompliance, RULE_COUNT } from "@/lib/compliance";

describe("checkCompliance", () => {
  it("returns empty array for empty scene", () => {
    expect(checkCompliance("")).toEqual([]);
  });

  it("returns empty array for whitespace-only scene", () => {
    expect(checkCompliance("   ")).toEqual([]);
  });

  it("returns empty array for unparseable scene", () => {
    expect(checkCompliance("console.log('hello')")).toEqual([]);
  });

  it("exports RULE_COUNT", () => {
    expect(RULE_COUNT).toBe(5);
  });

  describe("minimum ceiling height", () => {
    it("warns when wall height is below 2.5m", () => {
      const scene = `const wall = box(4, 2.3, 0.15);
scene.add(wall, { material: "lumber" });`;
      const warnings = checkCompliance(scene);
      const w = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
      expect(w).toBeTruthy();
      expect(w!.severity).toBe("error");
      expect(w!.params.height).toBe(2300);
    });

    it("does not warn when wall height is 2.5m", () => {
      const scene = `const wall = box(4, 2.5, 0.15);
scene.add(wall, { material: "lumber" });`;
      const warnings = checkCompliance(scene);
      expect(warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1")).toBeUndefined();
    });

    it("does not warn for non-residential building type", () => {
      const scene = `const wall = box(4, 2.3, 0.15);`;
      const warnings = checkCompliance(scene, { type: "kerrostalo" });
      expect(warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1")).toBeUndefined();
    });

    it("warns for omakotitalo type", () => {
      const scene = `const wall = box(4, 2.3, 0.15);`;
      const warnings = checkCompliance(scene, { type: "omakotitalo" });
      expect(warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1")).toBeTruthy();
    });
  });

  describe("minimum door width", () => {
    it("warns when door opening is less than 800mm", () => {
      const scene = `const wall = box(6, 2.8, 0.15);
const doorHole = box(0.7, 2.1, 0.15);
const wallWithDoor = subtract(wall, doorHole);`;
      const warnings = checkCompliance(scene);
      const w = warnings.find((w) => w.ruleId === "FI-RakMK-F1-2.3");
      expect(w).toBeTruthy();
      expect(w!.severity).toBe("error");
      expect(w!.params.width).toBe(700);
    });

    it("does not warn when door is 900mm wide", () => {
      const scene = `const wall = box(6, 2.8, 0.15);
const doorHole = box(0.9, 2.1, 0.15);
const wallWithDoor = subtract(wall, doorHole);`;
      const warnings = checkCompliance(scene);
      expect(warnings.find((w) => w.ruleId === "FI-RakMK-F1-2.3")).toBeUndefined();
    });
  });

  describe("handrail required", () => {
    it("warns when elevated platform has no posts", () => {
      const scene = `const deck = translate(box(3, 0.08, 2), 0, 0.6, 0);`;
      const warnings = checkCompliance(scene);
      const w = warnings.find((w) => w.ruleId === "FI-RakMK-F2-3.2");
      expect(w).toBeTruthy();
      expect(w!.severity).toBe("warning");
    });

    it("does not warn when posts are present near platform", () => {
      const scene = `const deck = translate(box(3, 0.08, 2), 0, 0.6, 0);
const post1 = translate(box(0.1, 1.0, 0.1), -1.3, 0.6, -0.8);
const post2 = translate(box(0.1, 1.0, 0.1), 1.3, 0.6, -0.8);`;
      const warnings = checkCompliance(scene);
      expect(warnings.find((w) => w.ruleId === "FI-RakMK-F2-3.2")).toBeUndefined();
    });

    it("does not warn for ground-level platform", () => {
      const scene = `const deck = translate(box(3, 0.08, 2), 0, 0.3, 0);`;
      const warnings = checkCompliance(scene);
      expect(warnings.find((w) => w.ruleId === "FI-RakMK-F2-3.2")).toBeUndefined();
    });
  });

  describe("maximum building height", () => {
    it("warns when building exceeds 12m", () => {
      const scene = `const tower = translate(box(2, 14, 2), 0, 7, 0);`;
      const warnings = checkCompliance(scene);
      const w = warnings.find((w) => w.ruleId === "FI-MRL-115");
      expect(w).toBeTruthy();
      expect(w!.severity).toBe("error");
    });

    it("does not warn when building is under 12m", () => {
      const scene = `const wall = translate(box(4, 2.8, 0.15), 0, 1.4, 0);`;
      const warnings = checkCompliance(scene);
      expect(warnings.find((w) => w.ruleId === "FI-MRL-115")).toBeUndefined();
    });
  });

  describe("minimum room area", () => {
    it("warns when floor area is less than 7m²", () => {
      const scene = `const floor = box(2, 0.2, 3);`;
      const warnings = checkCompliance(scene);
      const w = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.2");
      expect(w).toBeTruthy();
      expect(w!.severity).toBe("warning");
      expect(w!.params.area).toBe(6);
    });

    it("does not warn when floor area is 7m² or more", () => {
      const scene = `const floor = box(3.5, 0.2, 2);`;
      const warnings = checkCompliance(scene);
      expect(warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.2")).toBeUndefined();
    });
  });

  describe("Three.js fallback parser", () => {
    it("parses THREE.BoxGeometry meshes", () => {
      const scene = `const geom = new THREE.BoxGeometry(4, 2.3, 0.15);`;
      const warnings = checkCompliance(scene);
      expect(warnings.length).toBeGreaterThan(0);
    });
  });

  describe("translate with reference", () => {
    it("handles translate of named mesh reference", () => {
      const scene = `const base = box(3, 0.08, 2);
const deck = translate(base, 0, 0.6, 0);`;
      const warnings = checkCompliance(scene);
      const w = warnings.find((w) => w.ruleId === "FI-RakMK-F2-3.2");
      expect(w).toBeTruthy();
    });
  });

  describe("material tagging", () => {
    it("tags mesh material from scene.add", () => {
      const scene = `const wall = box(4, 2.3, 0.15);
scene.add(wall, { material: "lumber" });`;
      const warnings = checkCompliance(scene);
      const w = warnings.find((w) => w.affectedMesh === "wall");
      expect(w).toBeTruthy();
    });
  });
});
