import { describe, expect, it } from "vitest";
import {
  buildBeforeAfterShareUrl,
  buildPresentationUrl,
  formatPresentationCurrency,
  getPresentationPreset,
  sanitizePresentationFilename,
} from "@/lib/presentation-export";

describe("presentation-export", () => {
  it("builds a shareable presentation URL with a sanitized preset", () => {
    expect(buildPresentationUrl("https://helscoop.fi/", "token/with/slash", "front")).toBe(
      "https://helscoop.fi/shared/token%2Fwith%2Fslash?presentation=1&camera=front",
    );
  });

  it("builds a public before/after share URL", () => {
    expect(buildBeforeAfterShareUrl("https://helscoop.fi/", "token/with/slash")).toBe(
      "https://helscoop.fi/share/token%2Fwith%2Fslash?compare=1",
    );
  });

  it("falls back to the iso preset for unknown preset ids", () => {
    expect(getPresentationPreset("unknown").id).toBe("iso");
    expect(buildPresentationUrl("https://helscoop.fi", "abc", "unknown")).toBe(
      "https://helscoop.fi/shared/abc?presentation=1&camera=iso",
    );
  });

  it("generates safe render filenames", () => {
    expect(sanitizePresentationFilename("Omakotitalo / tarjous #1", "aerial")).toBe(
      "omakotitalo-tarjous-1-aerial.png",
    );
  });

  it("formats presentation totals for Finnish and English locales", () => {
    expect(formatPresentationCurrency(12345, "fi").replace(/\s/g, " ")).toBe("12 345 €");
    expect(formatPresentationCurrency(12345, "en")).toBe("12,345 €");
  });
});
