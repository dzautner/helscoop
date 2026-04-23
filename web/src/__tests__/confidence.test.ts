import { describe, it, expect } from "vitest";
import { isPriceStale, STALE_PRICE_THRESHOLD_DAYS } from "@/lib/confidence";
import { getTranslation } from "@/lib/i18n";

describe("isPriceStale", () => {
  it("returns false for null/undefined lastUpdated", () => {
    expect(isPriceStale(null)).toBe(false);
    expect(isPriceStale(undefined)).toBe(false);
  });

  it("returns false for a recent date", () => {
    const recent = new Date(Date.now() - 10 * 86_400_000).toISOString(); // 10 days ago
    expect(isPriceStale(recent)).toBe(false);
  });

  it("returns true for a date older than the threshold", () => {
    const old = new Date(Date.now() - (STALE_PRICE_THRESHOLD_DAYS + 1) * 86_400_000).toISOString();
    expect(isPriceStale(old)).toBe(true);
  });

  it("returns false for a date just inside the threshold boundary", () => {
    const boundary = new Date(Date.now() - (STALE_PRICE_THRESHOLD_DAYS * 86_400_000 - 3_600_000)).toISOString();
    expect(isPriceStale(boundary)).toBe(false);
  });
});

describe("confidence i18n parity", () => {
  const CONFIDENCE_KEYS = [
    "confidence.verified",
    "confidence.estimated",
    "confidence.demo",
    "confidence.manual",
    "confidence.source",
    "confidence.fetchedAt",
    "confidence.dataQuality",
    "confidence.stalePrice",
    "confidence.stalePriceDetail",
  ] as const;

  const tFi = getTranslation("fi");
  const tEn = getTranslation("en");

  // Keys that are intentionally identical in both languages (loanwords / proper nouns)
  const SAME_IN_BOTH = new Set(["confidence.demo"]);

  for (const key of CONFIDENCE_KEYS) {
    it(`fi and en both resolve key "${key}"`, () => {
      const fi = tFi(key);
      const en = tEn(key);
      // Neither locale should fall back to returning the key itself
      expect(fi).not.toBe(key);
      expect(en).not.toBe(key);
      // For most keys the translations should differ; some proper nouns are exempt
      if (!SAME_IN_BOTH.has(key)) {
        expect(fi).not.toBe(en);
      }
    });
  }
});
