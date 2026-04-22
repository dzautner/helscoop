import { describe, it, expect } from "vitest";
import {
  PRESENTATION_PRESETS,
  getPresentationPreset,
  buildPresentationUrl,
  sanitizePresentationFilename,
  formatPresentationCurrency,
} from "@/lib/presentation-export";

describe("PRESENTATION_PRESETS", () => {
  it("has 4 presets", () => {
    expect(PRESENTATION_PRESETS).toHaveLength(4);
  });

  it("has front, side, aerial, iso IDs", () => {
    const ids = PRESENTATION_PRESETS.map((p) => p.id);
    expect(ids).toEqual(["front", "side", "aerial", "iso"]);
  });

  it("camera indices are 0-3", () => {
    PRESENTATION_PRESETS.forEach((p, i) => {
      expect(p.cameraIndex).toBe(i);
    });
  });

  it("all have label and description keys", () => {
    for (const p of PRESENTATION_PRESETS) {
      expect(p.labelKey).toMatch(/^presentation\./);
      expect(p.descriptionKey).toMatch(/^presentation\./);
    }
  });
});

describe("getPresentationPreset", () => {
  it("returns front preset for 'front'", () => {
    expect(getPresentationPreset("front").id).toBe("front");
  });

  it("returns side preset for 'side'", () => {
    expect(getPresentationPreset("side").id).toBe("side");
  });

  it("returns aerial preset for 'aerial'", () => {
    expect(getPresentationPreset("aerial").id).toBe("aerial");
  });

  it("returns iso preset for 'iso'", () => {
    expect(getPresentationPreset("iso").id).toBe("iso");
  });

  it("defaults to iso for null", () => {
    expect(getPresentationPreset(null).id).toBe("iso");
  });

  it("defaults to iso for undefined", () => {
    expect(getPresentationPreset(undefined).id).toBe("iso");
  });

  it("defaults to iso for unknown string", () => {
    expect(getPresentationPreset("top-down").id).toBe("iso");
  });
});

describe("buildPresentationUrl", () => {
  it("builds URL with share token and preset", () => {
    const url = buildPresentationUrl("https://helscoop.fi", "abc123", "front");
    expect(url).toContain("/shared/abc123");
    expect(url).toContain("presentation=1");
    expect(url).toContain("camera=front");
  });

  it("strips trailing slash from origin", () => {
    const url = buildPresentationUrl("https://helscoop.fi/", "tok", "side");
    expect(url).toMatch(/^https:\/\/helscoop\.fi\/shared\//);
    expect(url).not.toContain("helscoop.fi//");
  });

  it("encodes share token", () => {
    const url = buildPresentationUrl("https://helscoop.fi", "a b+c", "front");
    expect(url).toContain("a%20b%2Bc");
  });

  it("defaults to iso camera for null preset", () => {
    const url = buildPresentationUrl("https://helscoop.fi", "tok", null);
    expect(url).toContain("camera=iso");
  });
});

describe("sanitizePresentationFilename", () => {
  it("generates filename with preset ID", () => {
    const name = sanitizePresentationFilename("My Sauna", "front");
    expect(name).toBe("my-sauna-front.png");
  });

  it("removes special characters", () => {
    const name = sanitizePresentationFilename("Talo #1 (uusi)", "side");
    expect(name).toBe("talo-1-uusi-side.png");
  });

  it("defaults to iso for null preset", () => {
    const name = sanitizePresentationFilename("Test", null);
    expect(name).toBe("test-iso.png");
  });

  it("uses default name for empty project name", () => {
    const name = sanitizePresentationFilename("", "front");
    expect(name).toBe("helscoop-project-front.png");
  });

  it("uses custom extension", () => {
    const name = sanitizePresentationFilename("Sauna", "aerial", "jpg");
    expect(name).toBe("sauna-aerial.jpg");
  });

  it("collapses multiple dashes", () => {
    const name = sanitizePresentationFilename("A - B - C", "front");
    expect(name).toBe("a-b-c-front.png");
  });
});

describe("formatPresentationCurrency", () => {
  it("formats with Finnish locale", () => {
    const result = formatPresentationCurrency(1500, "fi");
    expect(result).toContain("€");
    expect(result).toContain("1");
    expect(result).toContain("500");
  });

  it("formats with English locale", () => {
    const result = formatPresentationCurrency(1500, "en");
    expect(result).toContain("€");
    expect(result).toContain("1");
  });

  it("no decimal digits", () => {
    const result = formatPresentationCurrency(1500.75, "en");
    expect(result).not.toContain(".");
    expect(result).toContain("€");
  });

  it("formats zero", () => {
    const result = formatPresentationCurrency(0, "fi");
    expect(result).toContain("0");
    expect(result).toContain("€");
  });
});
