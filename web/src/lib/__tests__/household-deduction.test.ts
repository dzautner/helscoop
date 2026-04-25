import { describe, expect, it } from "vitest";
import {
  buildHouseholdDeductionRows,
  calculateHouseholdDeduction,
  type HouseholdDeductionRow,
} from "../household-deduction";
import type { Quote } from "../quote-engine";

describe("calculateHouseholdDeduction", () => {
  it("uses only labour rows for the credit", () => {
    const rows: HouseholdDeductionRow[] = [
      { type: "material", label: "Materials", amount: 10000 },
      { type: "labour", label: "Labour", amount: 1000 },
    ];

    const result = calculateHouseholdDeduction(rows);

    expect(result.grossCost).toBe(11000);
    expect(result.labourCost).toBe(1000);
    expect(result.credit).toBe(200); // 1000 * 35% - 150 threshold
    expect(result.netCost).toBe(10800);
  });

  it("returns zero credit below the annual threshold", () => {
    const result = calculateHouseholdDeduction([
      { type: "labour", label: "Small repair", amount: 400 },
    ]);

    expect(result.rawCredit).toBe(140);
    expect(result.threshold).toBe(150);
    expect(result.credit).toBe(0);
  });

  it("caps a single claimant at 1600 euros", () => {
    const result = calculateHouseholdDeduction([
      { type: "labour", label: "Bathroom labour", amount: 8000 },
    ]);

    expect(result.rawCredit).toBe(2800);
    expect(result.maxCredit).toBe(1600);
    expect(result.credit).toBe(1600);
  });

  it("doubles the cap and threshold in couple mode", () => {
    const result = calculateHouseholdDeduction([
      { type: "labour", label: "Large renovation labour", amount: 10000 },
    ], { coupleMode: true });

    expect(result.claimantCount).toBe(2);
    expect(result.threshold).toBe(300);
    expect(result.maxCredit).toBe(3200);
    expect(result.credit).toBe(3200);
  });

  it("builds material and labour rows from the quote engine totals with VAT included", () => {
    const quote = {
      materialSubtotal: 1000,
      labourSubtotal: 500,
      config: { vatRate: 0.255 },
    } as Quote;

    expect(buildHouseholdDeductionRows(quote)).toEqual([
      { type: "material", label: "Materials", amount: 1255 },
      { type: "labour", label: "Labour", amount: 627.5 },
    ]);
  });
});
