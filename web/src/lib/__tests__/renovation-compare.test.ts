import { describe, expect, it } from "vitest";
import { formatRenovationCompareCurrency, summarizeRenovationComparison } from "@/lib/renovation-compare";

describe("renovation comparison summary", () => {
  it("uses BOM totals for renovation cost and new total value", () => {
    const summary = summarizeRenovationComparison([
      { quantity: 2, unit_price: 100, total: 250 },
      { quantity: 3, unit_price: 40, total: undefined },
    ], 1000);

    expect(summary).toEqual({
      currentEstimatedValue: 1000,
      renovationCost: 370,
      newTotalValue: 1370,
    });
  });

  it("clamps missing current value to zero for first-pass baselines", () => {
    expect(summarizeRenovationComparison([], -100).currentEstimatedValue).toBe(0);
  });

  it("formats Finnish currency without decimals for the compact bar", () => {
    expect(formatRenovationCompareCurrency(4200.4, "fi").replace(/\s/g, " ")).toBe("4 200 EUR");
  });
});
