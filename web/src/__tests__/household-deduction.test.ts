import { describe, it, expect } from "vitest";
import {
  HOUSEHOLD_DEDUCTION_2026,
  buildHouseholdDeductionRows,
  calculateHouseholdDeduction,
} from "@/lib/household-deduction";
import type { HouseholdDeductionRow } from "@/lib/household-deduction";
import type { Quote } from "@/lib/quote-engine";

const makeQuote = (materialSubtotal: number, labourSubtotal: number): Quote => ({
  lines: [],
  materialSubtotal,
  labourSubtotal,
  wastageTotal: 0,
  subtotalExVat: materialSubtotal + labourSubtotal,
  vatTotal: (materialSubtotal + labourSubtotal) * 0.255,
  grandTotal: (materialSubtotal + labourSubtotal) * 1.255,
  config: {
    mode: "homeowner",
    vatRate: 0.255,
    labourRatePerHour: 45,
    wastagePercent: 0.10,
  },
  generatedAt: "2026-04-22T00:00:00Z",
});

describe("HOUSEHOLD_DEDUCTION_2026", () => {
  it("has 35% company work rate", () => {
    expect(HOUSEHOLD_DEDUCTION_2026.companyWorkRate).toBe(0.35);
  });

  it("has 150€ threshold per claimant", () => {
    expect(HOUSEHOLD_DEDUCTION_2026.annualThresholdPerClaimant).toBe(150);
  });

  it("has 1600€ max credit per claimant", () => {
    expect(HOUSEHOLD_DEDUCTION_2026.maxCreditPerClaimant).toBe(1600);
  });

  it("has Vero source URL", () => {
    expect(HOUSEHOLD_DEDUCTION_2026.sourceUrl).toContain("vero.fi");
  });
});

describe("buildHouseholdDeductionRows", () => {
  it("returns 2 rows (material + labour)", () => {
    const rows = buildHouseholdDeductionRows(makeQuote(1000, 500));
    expect(rows).toHaveLength(2);
    expect(rows[0].type).toBe("material");
    expect(rows[1].type).toBe("labour");
  });

  it("includes VAT in amounts", () => {
    const rows = buildHouseholdDeductionRows(makeQuote(1000, 500));
    expect(rows[0].amount).toBeCloseTo(1000 * 1.255, 1);
    expect(rows[1].amount).toBeCloseTo(500 * 1.255, 1);
  });

  it("labels rows correctly", () => {
    const rows = buildHouseholdDeductionRows(makeQuote(100, 200));
    expect(rows[0].label).toBe("Materials");
    expect(rows[1].label).toBe("Labour");
  });
});

describe("calculateHouseholdDeduction", () => {
  it("computes gross cost as sum of all rows", () => {
    const rows: HouseholdDeductionRow[] = [
      { type: "material", label: "Mat", amount: 1000 },
      { type: "labour", label: "Lab", amount: 2000 },
    ];
    const result = calculateHouseholdDeduction(rows);
    expect(result.grossCost).toBe(3000);
  });

  it("computes labour cost from labour rows only", () => {
    const rows: HouseholdDeductionRow[] = [
      { type: "material", label: "Mat", amount: 1000 },
      { type: "labour", label: "Lab", amount: 2000 },
    ];
    const result = calculateHouseholdDeduction(rows);
    expect(result.labourCost).toBe(2000);
  });

  it("computes raw credit at 35% of labour", () => {
    const rows: HouseholdDeductionRow[] = [
      { type: "labour", label: "Lab", amount: 1000 },
    ];
    const result = calculateHouseholdDeduction(rows);
    expect(result.rawCredit).toBe(350);
  });

  it("subtracts 150€ threshold for single claimant", () => {
    const rows: HouseholdDeductionRow[] = [
      { type: "labour", label: "Lab", amount: 1000 },
    ];
    const result = calculateHouseholdDeduction(rows);
    expect(result.threshold).toBe(150);
    expect(result.credit).toBe(200); // 350 - 150 = 200
  });

  it("doubles threshold for couple mode", () => {
    const rows: HouseholdDeductionRow[] = [
      { type: "labour", label: "Lab", amount: 1000 },
    ];
    const result = calculateHouseholdDeduction(rows, { coupleMode: true });
    expect(result.threshold).toBe(300);
    expect(result.claimantCount).toBe(2);
    expect(result.credit).toBe(50); // 350 - 300 = 50
  });

  it("caps credit at 1600€ for single", () => {
    const rows: HouseholdDeductionRow[] = [
      { type: "labour", label: "Lab", amount: 10000 },
    ];
    const result = calculateHouseholdDeduction(rows);
    expect(result.credit).toBe(1600);
  });

  it("caps credit at 3200€ for couple", () => {
    const rows: HouseholdDeductionRow[] = [
      { type: "labour", label: "Lab", amount: 20000 },
    ];
    const result = calculateHouseholdDeduction(rows, { coupleMode: true });
    expect(result.credit).toBe(3200);
  });

  it("credit is 0 when labour too low for threshold", () => {
    const rows: HouseholdDeductionRow[] = [
      { type: "labour", label: "Lab", amount: 400 },
    ];
    const result = calculateHouseholdDeduction(rows);
    // 400 * 0.35 = 140, below 150 threshold
    expect(result.credit).toBe(0);
  });

  it("netCost = grossCost - credit", () => {
    const rows: HouseholdDeductionRow[] = [
      { type: "material", label: "Mat", amount: 5000 },
      { type: "labour", label: "Lab", amount: 3000 },
    ];
    const result = calculateHouseholdDeduction(rows);
    expect(result.netCost).toBe(result.grossCost - result.credit);
  });

  it("handles empty rows", () => {
    const result = calculateHouseholdDeduction([]);
    expect(result.grossCost).toBe(0);
    expect(result.labourCost).toBe(0);
    expect(result.credit).toBe(0);
    expect(result.netCost).toBe(0);
  });

  it("ignores negative amounts", () => {
    const rows: HouseholdDeductionRow[] = [
      { type: "labour", label: "Lab", amount: -500 },
    ];
    const result = calculateHouseholdDeduction(rows);
    expect(result.labourCost).toBe(0);
  });
});
