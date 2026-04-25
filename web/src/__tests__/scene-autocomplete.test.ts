import { describe, it, expect } from "vitest";
import {
  getAutocompleteContext,
  filterCompletions,
  STATIC_COMPLETIONS,
} from "@/components/SceneAutocomplete";

describe("getAutocompleteContext", () => {
  it("detects a word prefix", () => {
    const ctx = getAutocompleteContext("const w = bo", 12);
    expect(ctx.prefix).toBe("bo");
    expect(ctx.startPos).toBe(10);
    expect(ctx.isMaterialString).toBe(false);
  });

  it("detects scene.add prefix via dot notation", () => {
    const ctx = getAutocompleteContext("scene.ad", 8);
    expect(ctx.prefix).toBe("scene.ad");
    expect(ctx.startPos).toBe(0);
    expect(ctx.isMaterialString).toBe(false);
  });

  it("detects material string context", () => {
    const ctx = getAutocompleteContext('scene.add(w, { material: "lum', 30);
    expect(ctx.prefix).toBe("lum");
    expect(ctx.isMaterialString).toBe(true);
  });

  it("detects empty material string context", () => {
    const ctx = getAutocompleteContext('scene.add(w, { material: "', 27);
    expect(ctx.prefix).toBe("");
    expect(ctx.isMaterialString).toBe(true);
  });

  it("returns empty prefix when cursor is after whitespace", () => {
    const ctx = getAutocompleteContext("const x = ", 10);
    expect(ctx.prefix).toBe("");
    expect(ctx.isMaterialString).toBe(false);
  });

  it("handles cursor at beginning of text", () => {
    const ctx = getAutocompleteContext("box(", 0);
    expect(ctx.prefix).toBe("");
  });

  it("handles multi-line text", () => {
    const code = "const a = box(1,2,3);\nconst b = cyl";
    const ctx = getAutocompleteContext(code, code.length);
    expect(ctx.prefix).toBe("cyl");
    expect(ctx.startPos).toBe(code.length - 3);
  });
});

describe("filterCompletions", () => {
  it("returns empty for short prefix", () => {
    const ctx = { prefix: "b", startPos: 0, isMaterialString: false };
    expect(filterCompletions(ctx)).toEqual([]);
  });

  it("matches primitives by prefix", () => {
    const ctx = { prefix: "bo", startPos: 0, isMaterialString: false };
    const items = filterCompletions(ctx);
    expect(items.length).toBe(1);
    expect(items[0].label).toBe("box");
    expect(items[0].kind).toBe("primitive");
  });

  it("matches transforms", () => {
    const ctx = { prefix: "tr", startPos: 0, isMaterialString: false };
    const items = filterCompletions(ctx);
    expect(items.length).toBe(1);
    expect(items[0].label).toBe("translate");
  });

  it("matches scene.add", () => {
    const ctx = { prefix: "scene.a", startPos: 0, isMaterialString: false };
    const items = filterCompletions(ctx);
    expect(items.length).toBe(1);
    expect(items[0].label).toBe("scene.add");
  });

  it("excludes exact matches", () => {
    const ctx = { prefix: "box", startPos: 0, isMaterialString: false };
    const items = filterCompletions(ctx);
    expect(items.length).toBe(0);
  });

  it("matches multiple items for common prefix", () => {
    const ctx = { prefix: "sc", startPos: 0, isMaterialString: false };
    const items = filterCompletions(ctx);
    const labels = items.map((i) => i.label);
    expect(labels).toContain("scale");
    expect(labels).toContain("scene.add");
  });

  it("filters materials by id in material context", () => {
    const materials = [
      { id: "lumber", name: "Sahatavara" },
      { id: "concrete", name: "Betoni" },
      { id: "lumber_glulam", name: "Liimapuu" },
    ];
    const ctx = { prefix: "lum", startPos: 10, isMaterialString: true };
    const items = filterCompletions(ctx, materials);
    expect(items.length).toBe(2);
    expect(items[0].label).toBe("lumber");
    expect(items[0].kind).toBe("material");
    expect(items[1].label).toBe("lumber_glulam");
  });

  it("filters materials by name in material context", () => {
    const materials = [
      { id: "lumber", name: "Sahatavara" },
      { id: "concrete", name: "Betoni" },
    ];
    const ctx = { prefix: "bet", startPos: 10, isMaterialString: true };
    const items = filterCompletions(ctx, materials);
    expect(items.length).toBe(1);
    expect(items[0].label).toBe("concrete");
    expect(items[0].detail).toBe("Betoni");
  });

  it("returns all materials for empty prefix in material context", () => {
    const materials = [
      { id: "lumber", name: "Sahatavara" },
      { id: "concrete", name: "Betoni" },
    ];
    const ctx = { prefix: "", startPos: 10, isMaterialString: true };
    const items = filterCompletions(ctx, materials);
    expect(items.length).toBe(2);
  });

  it("returns empty for material context with no materials prop", () => {
    const ctx = { prefix: "lum", startPos: 10, isMaterialString: true };
    expect(filterCompletions(ctx)).toEqual([]);
    expect(filterCompletions(ctx, [])).toEqual([]);
  });

  it("limits material results to 12", () => {
    const materials = Array.from({ length: 20 }, (_, i) => ({
      id: `mat_${i}`,
      name: `Material ${i}`,
    }));
    const ctx = { prefix: "", startPos: 10, isMaterialString: true };
    const items = filterCompletions(ctx, materials);
    expect(items.length).toBe(12);
  });
});

describe("STATIC_COMPLETIONS", () => {
  it("contains all primitives", () => {
    const labels = STATIC_COMPLETIONS.map((c) => c.label);
    expect(labels).toContain("box");
    expect(labels).toContain("cylinder");
    expect(labels).toContain("sphere");
  });

  it("contains all transforms", () => {
    const labels = STATIC_COMPLETIONS.map((c) => c.label);
    expect(labels).toContain("translate");
    expect(labels).toContain("rotate");
    expect(labels).toContain("scale");
  });

  it("contains all booleans", () => {
    const labels = STATIC_COMPLETIONS.map((c) => c.label);
    expect(labels).toContain("union");
    expect(labels).toContain("subtract");
    expect(labels).toContain("intersect");
  });

  it("all insertText for functions ends with open paren", () => {
    for (const c of STATIC_COMPLETIONS) {
      expect(c.insertText).toMatch(/\($/);
    }
  });
});
