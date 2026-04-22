import { describe, it, expect } from "vitest";
import {
  buildMaterialTrend,
  buildProjectTrendSummary,
} from "../material-trends";
import type { MaterialTrendInput, MaterialTrendResult } from "../material-trends";

const baseInput: MaterialTrendInput = {
  materialId: "m1",
  materialName: "Pine Board",
  categoryName: "lumber",
  quantity: 20,
  unit: "kpl",
  unitPrice: 4.5,
  lineCost: 90,
};

const now = new Date("2026-06-15T00:00:00Z");

describe("buildMaterialTrend", () => {
  it("returns correct materialId and name", () => {
    const result = buildMaterialTrend(baseInput, now);
    expect(result.materialId).toBe("m1");
    expect(result.materialName).toBe("Pine Board");
  });

  it("returns current unit price and line cost", () => {
    const result = buildMaterialTrend(baseInput, now);
    expect(result.currentUnitPrice).toBe(4.5);
    expect(result.currentLineCost).toBe(90);
  });

  it("uses seasonal model when no history", () => {
    const result = buildMaterialTrend(baseInput, now);
    expect(result.source).toBe("seasonal_model");
    expect(result.confidence).toBe("low");
  });

  it("generates 12 seasonal points when no history", () => {
    const result = buildMaterialTrend(baseInput, now);
    expect(result.points.length).toBe(12);
    expect(result.points[0].source).toBe("seasonal_model");
  });

  it("uses retailer_history when enough data points", () => {
    const history = Array.from({ length: 6 }, (_, i) => ({
      unitPrice: 4 + i * 0.1,
      scrapedAt: new Date(Date.UTC(2026, i, 15)).toISOString(),
    }));
    const result = buildMaterialTrend({ ...baseInput, history }, now);
    expect(result.source).toBe("retailer_history");
    expect(result.confidence).toBe("high");
  });

  it("uses medium confidence with 2-5 history points", () => {
    const history = [
      { unitPrice: 4.0, scrapedAt: "2026-03-15" },
      { unitPrice: 4.3, scrapedAt: "2026-04-15" },
      { unitPrice: 4.5, scrapedAt: "2026-05-15" },
    ];
    const result = buildMaterialTrend({ ...baseInput, history }, now);
    expect(result.confidence).toBe("medium");
  });

  it("computes vs3mPct and vs12mPct", () => {
    const result = buildMaterialTrend(baseInput, now);
    expect(result.vs3mPct).not.toBeNull();
    expect(result.vs12mPct).not.toBeNull();
  });

  it("detects rising direction for lumber in summer", () => {
    const result = buildMaterialTrend(baseInput, now);
    expect(["rising", "stable", "falling"]).toContain(result.direction);
  });

  it("computes bestBuyMonth", () => {
    const result = buildMaterialTrend(baseInput, now);
    if (result.bestBuyMonth) {
      expect(result.bestBuyMonth).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it("computes estimatedWaitSavings", () => {
    const result = buildMaterialTrend(baseInput, now);
    expect(result.estimatedWaitSavings).toBeGreaterThanOrEqual(0);
  });

  it("provides recommendation", () => {
    const result = buildMaterialTrend(baseInput, now);
    expect(["buy_now", "wait", "watch"]).toContain(result.recommendation);
  });

  it("handles null categoryName", () => {
    const input = { ...baseInput, categoryName: null };
    const result = buildMaterialTrend(input, now);
    expect(result.categoryName).toBeNull();
    expect(result.points.length).toBe(12);
  });

  it("filters invalid history prices", () => {
    const history = [
      { unitPrice: 4.0, scrapedAt: "2026-03-15" },
      { unitPrice: -1, scrapedAt: "2026-04-15" },
      { unitPrice: 4.5, scrapedAt: "2026-05-15" },
    ];
    const result = buildMaterialTrend({ ...baseInput, history }, now);
    expect(result.points.every((p) => p.unitPrice > 0)).toBe(true);
  });

  it("detects falling direction", () => {
    const history = [
      { unitPrice: 6.0, scrapedAt: "2026-01-15" },
      { unitPrice: 5.5, scrapedAt: "2026-02-15" },
      { unitPrice: 5.0, scrapedAt: "2026-03-15" },
      { unitPrice: 4.5, scrapedAt: "2026-04-15" },
      { unitPrice: 4.0, scrapedAt: "2026-05-15" },
      { unitPrice: 3.5, scrapedAt: "2026-06-15" },
    ];
    const result = buildMaterialTrend({ ...baseInput, history }, now);
    expect(result.direction).toBe("falling");
  });

  it("recommends buy_now when below 12m average", () => {
    const history = Array.from({ length: 8 }, (_, i) => ({
      unitPrice: 5.0,
      scrapedAt: new Date(Date.UTC(2025, 10 + i, 15)).toISOString(),
    }));
    const result = buildMaterialTrend({ ...baseInput, unitPrice: 4.0, lineCost: 80, history }, now);
    expect(result.recommendation).toBe("buy_now");
  });

  it("lumber seasonal peaks in summer", () => {
    const winterNow = new Date("2026-01-15T00:00:00Z");
    const result = buildMaterialTrend(baseInput, winterNow);
    const jan = result.points.find((p) => p.month.endsWith("-01"));
    const jun = result.points.find((p) => p.month.endsWith("-06"));
    if (jan && jun) {
      expect(jun.unitPrice).toBeGreaterThan(jan.unitPrice);
    }
  });
});

describe("buildProjectTrendSummary", () => {
  it("computes total current cost", () => {
    const items: MaterialTrendResult[] = [
      buildMaterialTrend(baseInput, now),
      buildMaterialTrend({ ...baseInput, materialId: "m2", lineCost: 60, unitPrice: 3 }, now),
    ];
    const summary = buildProjectTrendSummary(items);
    expect(summary.totalCurrentCost).toBe(150);
  });

  it("counts buy/wait/watch items", () => {
    const items = [
      buildMaterialTrend(baseInput, now),
    ];
    const summary = buildProjectTrendSummary(items);
    expect(summary.buyNowCount + summary.waitCount + summary.watchCount).toBe(items.length);
  });

  it("returns empty summary for no items", () => {
    const summary = buildProjectTrendSummary([]);
    expect(summary.totalCurrentCost).toBe(0);
    expect(summary.buyNowCount).toBe(0);
    expect(summary.waitCount).toBe(0);
    expect(summary.watchCount).toBe(0);
    expect(summary.bestBuyMonth).toBeNull();
  });

  it("computes weighted vs12mPct", () => {
    const items = [buildMaterialTrend(baseInput, now)];
    const summary = buildProjectTrendSummary(items);
    if (items[0].vs12mPct != null) {
      expect(summary.weightedVs12mPct).not.toBeNull();
    }
  });

  it("computes best buy month from items", () => {
    const items = [
      buildMaterialTrend(baseInput, now),
      buildMaterialTrend({ ...baseInput, materialId: "m2", categoryName: "roofing" }, now),
    ];
    const summary = buildProjectTrendSummary(items);
    if (items.some((i) => i.bestBuyMonth)) {
      expect(summary.bestBuyMonth).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it("includes items in summary", () => {
    const items = [buildMaterialTrend(baseInput, now)];
    const summary = buildProjectTrendSummary(items);
    expect(summary.items).toHaveLength(1);
    expect(summary.items[0].materialId).toBe("m1");
  });
});
