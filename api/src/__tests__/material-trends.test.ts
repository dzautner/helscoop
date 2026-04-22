import { describe, expect, it } from "vitest";
import { buildMaterialTrend, buildProjectTrendSummary } from "../material-trends";

describe("material trend forecasting", () => {
  it("uses a seasonal fallback when retailer history is too sparse", () => {
    const trend = buildMaterialTrend(
      {
        materialId: "roof_tile",
        materialName: "Roof tile",
        categoryName: "Roofing",
        quantity: 10,
        unit: "m2",
        unitPrice: 100,
        lineCost: 1000,
        history: [],
      },
      new Date(Date.UTC(2026, 5, 15)),
    );

    expect(trend.source).toBe("seasonal_model");
    expect(trend.confidence).toBe("low");
    expect(trend.points).toHaveLength(12);
    expect(trend.bestBuyMonth).toBe("2026-12");
    expect(trend.estimatedWaitSavingsPct).toBe(14.4);
    expect(trend.estimatedWaitSavings).toBe(144);
    expect(trend.recommendation).toBe("wait");
  });

  it("prefers retailer history when enough monthly observations exist", () => {
    const trend = buildMaterialTrend(
      {
        materialId: "window",
        materialName: "Window",
        categoryName: "Fixtures",
        quantity: 2,
        unit: "kpl",
        unitPrice: 95,
        lineCost: 190,
        history: [
          { unitPrice: 110, scrapedAt: "2026-01-05T00:00:00.000Z" },
          { unitPrice: 105, scrapedAt: "2026-02-05T00:00:00.000Z" },
          { unitPrice: 100, scrapedAt: "2026-03-05T00:00:00.000Z" },
          { unitPrice: 95, scrapedAt: "2026-04-05T00:00:00.000Z" },
        ],
      },
      new Date(Date.UTC(2026, 5, 15)),
    );

    expect(trend.source).toBe("retailer_history");
    expect(trend.confidence).toBe("medium");
    expect(trend.points.map((point) => point.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04"]);
    expect(trend.average12m).toBe(102.5);
    expect(trend.vs12mPct).toBe(-7.3);
    expect(trend.direction).toBe("falling");
    expect(trend.recommendation).toBe("buy_now");
  });

  it("summarizes project-level timing impact across BOM rows", () => {
    const roof = buildMaterialTrend(
      {
        materialId: "roof_tile",
        materialName: "Roof tile",
        categoryName: "Roofing",
        quantity: 10,
        unit: "m2",
        unitPrice: 100,
        lineCost: 1000,
      },
      new Date(Date.UTC(2026, 5, 15)),
    );
    const fixture = buildMaterialTrend(
      {
        materialId: "window",
        materialName: "Window",
        categoryName: "Fixtures",
        quantity: 1,
        unit: "kpl",
        unitPrice: 500,
        lineCost: 500,
        history: [
          { unitPrice: 540, scrapedAt: "2026-01-05T00:00:00.000Z" },
          { unitPrice: 520, scrapedAt: "2026-02-05T00:00:00.000Z" },
          { unitPrice: 500, scrapedAt: "2026-03-05T00:00:00.000Z" },
        ],
      },
      new Date(Date.UTC(2026, 5, 15)),
    );

    const summary = buildProjectTrendSummary([roof, fixture]);

    expect(summary.totalCurrentCost).toBe(1500);
    expect(summary.estimatedWaitSavings).toBeGreaterThan(140);
    expect(summary.bestBuyMonth).toBe("2026-12");
    expect(summary.waitCount).toBe(1);
    expect(summary.buyNowCount).toBe(1);
    expect(summary.items).toHaveLength(2);
  });
});
