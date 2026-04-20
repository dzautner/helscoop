import { describe, it, expect } from "vitest";
import {
  inferMaterial,
  inferHeating,
  inferFloors,
  inferBuildingType,
  extractCity,
  normalizeAddress,
} from "../routes/building-registry";

describe("inferMaterial", () => {
  it("returns hirsi for pre-1920 buildings", () => {
    expect(inferMaterial(1890)).toBe("hirsi");
    expect(inferMaterial(1919)).toBe("hirsi");
  });

  it("returns tiili for 1920-1949 buildings", () => {
    expect(inferMaterial(1920)).toBe("tiili");
    expect(inferMaterial(1940)).toBe("tiili");
  });

  it("returns betoni for 1950-1989 buildings", () => {
    expect(inferMaterial(1960)).toBe("betoni");
    expect(inferMaterial(1985)).toBe("betoni");
  });

  it("returns puu for 1990+ buildings", () => {
    expect(inferMaterial(1990)).toBe("puu");
    expect(inferMaterial(2024)).toBe("puu");
  });
});

describe("inferHeating", () => {
  it("returns kaukolampo for Helsinki", () => {
    expect(inferHeating("Helsinki")).toBe("kaukolampo");
  });

  it("returns kaukolampo for Tampere", () => {
    expect(inferHeating("Tampere")).toBe("kaukolampo");
  });

  it("returns kaukolampo for other major cities", () => {
    expect(inferHeating("Turku")).toBe("kaukolampo");
    expect(inferHeating("Oulu")).toBe("kaukolampo");
    expect(inferHeating("Espoo")).toBe("kaukolampo");
  });

  it("returns oljy for unknown/rural locations", () => {
    expect(inferHeating("Kittila")).toBe("oljy");
    expect(inferHeating("")).toBe("oljy");
  });
});

describe("inferFloors", () => {
  it("returns 1 for small omakotitalo", () => {
    expect(inferFloors(120, "omakotitalo")).toBe(1);
  });

  it("returns 2 for large omakotitalo", () => {
    expect(inferFloors(250, "omakotitalo")).toBe(2);
  });

  it("returns 2 for rivitalo", () => {
    expect(inferFloors(400, "rivitalo")).toBe(2);
  });

  it("returns 6 for large kerrostalo", () => {
    expect(inferFloors(4000, "kerrostalo")).toBe(6);
  });
});

describe("inferBuildingType", () => {
  it("returns omakotitalo for small areas", () => {
    expect(inferBuildingType(120)).toBe("omakotitalo");
  });

  it("returns rivitalo for medium areas", () => {
    expect(inferBuildingType(300)).toBe("rivitalo");
  });

  it("returns kerrostalo for large areas", () => {
    expect(inferBuildingType(2000)).toBe("kerrostalo");
  });
});

describe("extractCity", () => {
  it("extracts city after comma", () => {
    expect(extractCity("Mannerheimintie 1, Helsinki")).toBe("Helsinki");
  });

  it("extracts city after postal code with comma", () => {
    expect(extractCity("Hameenkatu 1, 33100 Tampere")).toBe("Tampere");
  });

  it("extracts city after postal code without comma", () => {
    expect(extractCity("Hameenkatu 1 33100 Tampere")).toBe("Tampere");
  });

  it("returns empty for bare street address", () => {
    expect(extractCity("Mannerheimintie 1")).toBe("");
  });
});

describe("normalizeAddress", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalizeAddress("Hameenkatu 1")).toBe("hameenkatu 1");
  });

  it("strips commas and dots", () => {
    expect(normalizeAddress("Mannerheimintie 1, Helsinki")).toBe("mannerheimintie 1 helsinki");
  });

  it("collapses whitespace", () => {
    expect(normalizeAddress("  foo   bar  ")).toBe("foo bar");
  });
});
