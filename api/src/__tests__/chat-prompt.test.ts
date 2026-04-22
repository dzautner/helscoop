/**
 * Tests for the chat system prompt Finnish building context (issue #667).
 *
 * We test the prompt content at the module level by reading the source file
 * rather than importing the live module (which requires a DB connection and
 * auth middleware).  These are static content assertions — if the prompt text
 * drifts, the tests catch it.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const CHAT_SOURCE = readFileSync(
  resolve(__dirname, "../routes/chat.ts"),
  "utf-8",
);

// Pull out the SYSTEM_PROMPT string from the source for targeted assertions
const PROMPT_START = CHAT_SOURCE.indexOf("const SYSTEM_PROMPT = `") + "const SYSTEM_PROMPT = `".length;
const PROMPT_END = CHAT_SOURCE.indexOf("`;", PROMPT_START);
const SYSTEM_PROMPT = CHAT_SOURCE.slice(PROMPT_START, PROMPT_END);

describe("chat.ts — system prompt Finnish building context (#667)", () => {
  it("retains all original 3D primitives (box, cylinder, sphere)", () => {
    expect(SYSTEM_PROMPT).toContain("box(width, height, depth)");
    expect(SYSTEM_PROMPT).toContain("cylinder(radius, height)");
    expect(SYSTEM_PROMPT).toContain("sphere(radius)");
  });

  it("retains transform and boolean operation documentation", () => {
    expect(SYSTEM_PROMPT).toContain("translate(mesh, x, y, z)");
    expect(SYSTEM_PROMPT).toContain("rotate(mesh, rx, ry, rz)");
    expect(SYSTEM_PROMPT).toContain("union(a, b)");
    expect(SYSTEM_PROMPT).toContain("subtract(a, b)");
    expect(SYSTEM_PROMPT).toContain("intersect(a, b)");
  });

  // Finnish building types
  it("includes Finnish building type: omakotitalo", () => {
    expect(SYSTEM_PROMPT).toContain("omakotitalo");
  });

  it("includes Finnish building type: rivitalo", () => {
    expect(SYSTEM_PROMPT).toContain("rivitalo");
  });

  it("includes Finnish building type: kerrostalo", () => {
    expect(SYSTEM_PROMPT).toContain("kerrostalo");
  });

  it("includes Finnish building type: paritalo", () => {
    expect(SYSTEM_PROMPT).toContain("paritalo");
  });

  // Finnish terminology
  it("includes harjakatto (gable roof) terminology", () => {
    expect(SYSTEM_PROMPT).toContain("harjakatto");
  });

  it("includes terassi (terrace) terminology", () => {
    expect(SYSTEM_PROMPT).toContain("terassi");
  });

  it("includes autotalli (garage) terminology", () => {
    expect(SYSTEM_PROMPT).toContain("autotalli");
  });

  it("includes höyrynsulku (vapour barrier) terminology", () => {
    expect(SYSTEM_PROMPT).toContain("höyrynsulku");
  });

  // Energy classes
  it("includes Finnish energy class scale (A–G)", () => {
    expect(SYSTEM_PROMPT).toContain("energy");
    // All seven classes should be mentioned
    ["A", "B", "C", "D", "E", "F", "G"].forEach((cls) => {
      expect(SYSTEM_PROMPT).toContain(cls);
    });
  });

  it("references Finnish building code U-value targets", () => {
    expect(SYSTEM_PROMPT).toContain("U ≤");
    expect(SYSTEM_PROMPT).toContain("W/m²K");
  });

  // Building code basics
  it("includes minimum ceiling height from Finnish building code", () => {
    expect(SYSTEM_PROMPT).toContain("2.5 m");
  });

  it("includes stair dimension requirements", () => {
    expect(SYSTEM_PROMPT).toContain("riser");
  });

  // Common renovation tasks
  it("includes insulation upgrade (lisäeristys) as a renovation task", () => {
    expect(SYSTEM_PROMPT).toContain("Lisäeristys");
  });

  it("includes window replacement (ikkunoiden vaihto) as a renovation task", () => {
    expect(SYSTEM_PROMPT).toContain("Ikkunoiden vaihto");
  });

  it("includes roof renovation (kattoremontti) as a renovation task", () => {
    expect(SYSTEM_PROMPT).toContain("Kattoremontti");
  });

  // Materials catalog injection
  it("contains the materials catalog section header", () => {
    expect(SYSTEM_PROMPT).toContain("## Materials catalog");
  });

  it("references the MATERIALS_CATALOG_SUMMARY template literal placeholder", () => {
    // The source must embed ${MATERIALS_CATALOG_SUMMARY} in the prompt template
    expect(CHAT_SOURCE).toContain("${MATERIALS_CATALOG_SUMMARY}");
  });

  // Language instructions
  it("instructs AI to respond in the user's language (Finnish or English)", () => {
    expect(SYSTEM_PROMPT).toContain("Finnish");
    expect(SYSTEM_PROMPT).toContain("English");
    // Should explicitly mention detecting the user's language
    expect(SYSTEM_PROMPT).toMatch(/detect|language|respond in/i);
  });

  it("instructs AI to include cost estimates in suggestions", () => {
    expect(SYSTEM_PROMPT).toContain("cost");
    expect(SYSTEM_PROMPT).toContain("EUR");
  });

  it("instructs AI to use supplied material substitution opportunities", () => {
    expect(SYSTEM_PROMPT).toContain("substitution opportunities");
    expect(SYSTEM_PROMPT).toContain("onko vaihtoehtoja");
    expect(SYSTEM_PROMPT).toContain("substitute IDs");
  });
});

describe("chat.ts — materials catalog loader", () => {
  it("buildMaterialsCatalogSummary function is defined in source", () => {
    expect(CHAT_SOURCE).toContain("function buildMaterialsCatalogSummary()");
  });

  it("reads materials.json from the expected relative path", () => {
    expect(CHAT_SOURCE).toContain("materials/materials.json");
  });

  it("skips assembly_preview category entries", () => {
    expect(CHAT_SOURCE).toContain('assembly_preview');
    // The filter should skip it
    expect(CHAT_SOURCE).toContain("if (mat.category === \"assembly_preview\") continue");
  });

  it("handles missing materials.json gracefully (try/catch)", () => {
    expect(CHAT_SOURCE).toContain("materials catalog unavailable");
  });

  it("adds substitution opportunities to project context", () => {
    expect(CHAT_SOURCE).toContain("Material substitution opportunities");
    expect(CHAT_SOURCE).toContain("substitutionSuggestions");
    expect(CHAT_SOURCE).toContain("generateSubstitutionResponse");
  });
});
