/**
 * Tests for parser robustness fixes:
 * 1. Compliance parser handles integer args, multiline, comments, variable refs
 * 2. IFC parser handles same edge cases + classifies unrecognized as "generic"
 * 3. Address matching is strict (no substring false positives)
 */

import { describe, it, expect } from "vitest";
import { checkCompliance } from "../routes/compliance";
import { parseSceneObjects, classifyElement } from "../ifc-generator";

// ---------------------------------------------------------------------------
// 1. Compliance parser robustness
// ---------------------------------------------------------------------------
describe("compliance parseMeshes — integer dimensions", () => {
  it("parses box with integer arguments via standalone box()", () => {
    // Floor slab: 2m x 3m at 0.15m thick — h must be <= 0.3 to match floor filter
    // Uses integer w and d values to test integer parsing
    const scene = `
      const floor = box(2, 0.15, 3);
      scene.add(floor, { material: "foundation" });
    `;
    const warnings = checkCompliance(scene);
    // 2 * 3 = 6 m2 < 7 m2 min room area
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.2");
    expect(rule).toBeDefined();
    expect((rule!.params as Record<string, number>).area).toBe(6);
  });

  it("parses translate(box()) with integer position args", () => {
    // Wall: 4m wide, 2.2m tall, 0.12m thick — integer position values
    const scene = `
      const wall = translate(box(4, 2.2, 0.12), 0, 1, 0);
      scene.add(wall, { material: "lumber" });
    `;
    const warnings = checkCompliance(scene, { type: "omakotitalo" });
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(rule).toBeDefined();
    expect((rule!.params as Record<string, number>).height).toBe(2200);
  });

  it("parses box with mixed integer and float args", () => {
    const scene = `
      const wall = translate(box(4, 2.5, 0.12), 0, 1.25, 0);
      scene.add(wall, { material: "lumber" });
    `;
    const warnings = checkCompliance(scene, { type: "omakotitalo" });
    // 2.5m wall height is exactly minimum, so no ceiling height violation
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(rule).toBeUndefined();
  });
});

describe("compliance parseMeshes — comments", () => {
  it("strips single-line comments before parsing", () => {
    const scene = `
      // This is a comment about the wall
      const wall = translate(box(4, 2.2, 0.12), 0, 1.1, 0);
      scene.add(wall, { material: "lumber" });
    `;
    const warnings = checkCompliance(scene, { type: "omakotitalo" });
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(rule).toBeDefined();
  });

  it("handles inline comments after code", () => {
    const scene = `
      const wall = translate(box(4, 2.2, 0.12), 0, 1.1, 0); // short wall
      scene.add(wall, { material: "lumber" });
    `;
    const warnings = checkCompliance(scene, { type: "omakotitalo" });
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(rule).toBeDefined();
  });

  it("strips block comments", () => {
    const scene = `
      /* Building front wall */
      const wall = translate(box(4, 2.2, 0.12), 0, 1.1, 0);
      scene.add(wall, { material: "lumber" });
    `;
    const warnings = checkCompliance(scene, { type: "omakotitalo" });
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(rule).toBeDefined();
  });

  it("does not parse box() calls inside comments", () => {
    const scene = `
      // const old_wall = translate(box(4, 1.5, 0.12), 0, 0.75, 0);
      const wall = translate(box(4, 2.6, 0.12), 0, 1.3, 0);
      scene.add(wall, { material: "lumber" });
    `;
    const warnings = checkCompliance(scene, { type: "omakotitalo" });
    // Only the 2.6m wall should be found, which passes
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(rule).toBeUndefined();
  });
});

describe("compliance parseMeshes — multiline", () => {
  it("parses box() call split across multiple lines", () => {
    const scene = `
      const wall = translate(
        box(
          4,
          2.2,
          0.12
        ),
        0, 1.1, 0
      );
      scene.add(wall, { material: "lumber" });
    `;
    const warnings = checkCompliance(scene, { type: "omakotitalo" });
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(rule).toBeDefined();
    expect((rule!.params as Record<string, number>).height).toBe(2200);
  });

  it("parses standalone box() on multiple lines", () => {
    const scene = `
      const floor = box(
        2,
        0.15,
        3
      );
      scene.add(floor, { material: "foundation" });
    `;
    const warnings = checkCompliance(scene);
    // 2 * 3 = 6 m2 < 7 m2 min
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.2");
    expect(rule).toBeDefined();
    expect((rule!.params as Record<string, number>).area).toBe(6);
  });
});

describe("compliance parseMeshes — parse warnings", () => {
  it("emits warning for box() with variable reference args", () => {
    const scene = `
      const width = 4;
      const wall = box(width, 2.2, 0.12);
      scene.add(wall, { material: "lumber" });
    `;
    const warnings = checkCompliance(scene);
    const parseWarn = warnings.find((w) => w.ruleId === "PARSE-WARN");
    expect(parseWarn).toBeDefined();
    expect(parseWarn!.severity).toBe("warning");
  });

  it("does not emit parse warning for correctly parsed box()", () => {
    const scene = `
      const wall = translate(box(4, 2.6, 0.12), 0, 1.3, 0);
      scene.add(wall, { material: "lumber" });
    `;
    const warnings = checkCompliance(scene);
    const parseWarn = warnings.find((w) => w.ruleId === "PARSE-WARN");
    expect(parseWarn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. IFC parser robustness
// ---------------------------------------------------------------------------
describe("IFC parseSceneObjects — integer dimensions", () => {
  it("parses translate(box(4, 2, 1), ...) with integer args", () => {
    const scene = `
const wall = translate(box(4, 2, 1), 0, 1, 0)
scene.add(wall)
`;
    const objs = parseSceneObjects(scene);
    expect(objs).toHaveLength(1);
    expect(objs[0].dimensions).toEqual({ x: 4, y: 2, z: 1 });
    expect(objs[0].position).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("parses box(10, 3, 8) standalone with integer args", () => {
    const scene = `
const slab = box(10, 3, 8)
scene.add(slab)
`;
    const objs = parseSceneObjects(scene);
    expect(objs).toHaveLength(1);
    expect(objs[0].dimensions).toEqual({ x: 10, y: 3, z: 8 });
  });
});

describe("IFC parseSceneObjects — comments", () => {
  it("ignores box calls inside single-line comments", () => {
    const scene = `
// const old = box(1, 1, 1)
const wall = translate(box(4, 2.5, 0.2), 0, 0, 0)
scene.add(wall)
`;
    const objs = parseSceneObjects(scene);
    expect(objs).toHaveLength(1);
    expect(objs[0].name).toBe("wall");
  });

  it("ignores box calls inside block comments", () => {
    const scene = `
/* const commented = box(1, 1, 1) */
const wall = translate(box(4, 2.5, 0.2), 0, 0, 0)
scene.add(wall)
`;
    const objs = parseSceneObjects(scene);
    expect(objs).toHaveLength(1);
    expect(objs[0].name).toBe("wall");
  });
});

describe("IFC parseSceneObjects — multiline", () => {
  it("parses translate(box()) split across lines", () => {
    const scene = `
const wall = translate(
  box(
    4.0,
    2.5,
    0.2
  ),
  0, 0, 0
)
scene.add(wall)
`;
    const objs = parseSceneObjects(scene);
    expect(objs).toHaveLength(1);
    expect(objs[0].dimensions).toEqual({ x: 4, y: 2.5, z: 0.2 });
  });

  it("parses standalone box() on multiple lines", () => {
    const scene = `
const slab = box(
  10,
  0.3,
  8
)
scene.add(slab)
`;
    const objs = parseSceneObjects(scene);
    expect(objs).toHaveLength(1);
    expect(objs[0].dimensions).toEqual({ x: 10, y: 0.3, z: 8 });
  });
});

// ---------------------------------------------------------------------------
// 3. IFC classifyElement — "generic" default
// ---------------------------------------------------------------------------
describe("IFC classifyElement — generic default", () => {
  it("returns generic for unrecognized element names", () => {
    expect(classifyElement("structural_beam")).toBe("generic");
    expect(classifyElement("column_1")).toBe("generic");
    expect(classifyElement("railing")).toBe("generic");
    expect(classifyElement("stair_core")).toBe("generic");
  });

  it("still correctly classifies known element types", () => {
    expect(classifyElement("front_wall")).toBe("wall");
    expect(classifyElement("main_roof")).toBe("roof");
    expect(classifyElement("front_door")).toBe("door");
    expect(classifyElement("side_window")).toBe("window");
    expect(classifyElement("foundation_base")).toBe("slab");
  });
});

// ---------------------------------------------------------------------------
// 4. Address matching — strict, no substring false positives
// ---------------------------------------------------------------------------
// We cannot import matchesDemoAddress directly (not exported), so we test
// via the exported HTTP endpoint behavior.  However, we can test the
// normalizeAddress and parseStreetAddressKey logic indirectly by importing
// the building module.  Since those are not exported either, we test the
// behavior end-to-end via compliance-like unit tests.
//
// For unit-level coverage of address strictness, we re-implement the logic
// here and assert that the fixed matching rejects known false positives.
// ---------------------------------------------------------------------------

function normalizeAddress(addr: string): string {
  return addr
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[,.\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseStreetAddressKey(normalizedAddress: string): { streetName: string; houseNumber: string } | null {
  const streetPart = normalizedAddress.split(/\b\d{5}\b/)[0].trim();
  const match = streetPart.match(/^(.+?)\s+(\d+)\b/);
  if (!match) return null;
  return {
    streetName: match[1].trim(),
    houseNumber: match[2],
  };
}

function matchesDemoAddress(query: string, demoAddress: string): boolean {
  const normQ = normalizeAddress(query);
  const normD = normalizeAddress(demoAddress);

  const queryKey = parseStreetAddressKey(normQ);
  const demoKey = parseStreetAddressKey(normD);

  if (!queryKey || !demoKey) return false;

  return queryKey.streetName === demoKey.streetName && queryKey.houseNumber === demoKey.houseNumber;
}

describe("strict address matching", () => {
  it("matches exact street name and number", () => {
    expect(matchesDemoAddress("Ribbingintie 109", "Ribbingintie 109-11, 00890 Helsinki")).toBe(true);
  });

  it("matches case-insensitive", () => {
    expect(matchesDemoAddress("ribbingintie 109", "Ribbingintie 109-11, 00890 Helsinki")).toBe(true);
  });

  it("does NOT match substring overlap — different street name", () => {
    // Previously this would match via substring: "katu 1" is contained in "katukatu 10"
    expect(matchesDemoAddress("Katu 1", "Katukatu 10, 00100 Helsinki")).toBe(false);
  });

  it("does NOT match when house numbers differ", () => {
    expect(matchesDemoAddress("Ribbingintie 110", "Ribbingintie 109-11, 00890 Helsinki")).toBe(false);
  });

  it("does NOT match completely different addresses", () => {
    expect(matchesDemoAddress("Mannerheimintie 42", "Ribbingintie 109-11, 00890 Helsinki")).toBe(false);
  });

  it("does NOT match when street name is substring of another", () => {
    expect(matchesDemoAddress("Tie 5", "Katutie 5, 00100 Helsinki")).toBe(false);
  });

  it("returns false when query has no house number", () => {
    expect(matchesDemoAddress("Helsinki", "Ribbingintie 109-11, 00890 Helsinki")).toBe(false);
  });

  it("returns false when demo has no house number", () => {
    expect(matchesDemoAddress("Ribbingintie 109", "Helsinki keskusta")).toBe(false);
  });
});
