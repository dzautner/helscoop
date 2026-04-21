import type { Quote } from "@/lib/quote-engine";

export type HouseholdDeductionRowType = "material" | "labour";

export interface HouseholdDeductionRow {
  type: HouseholdDeductionRowType;
  label: string;
  amount: number;
}

export interface HouseholdDeductionResult {
  grossCost: number;
  labourCost: number;
  rawCredit: number;
  threshold: number;
  maxCredit: number;
  credit: number;
  netCost: number;
  claimantCount: 1 | 2;
}

export const HOUSEHOLD_DEDUCTION_2026 = {
  companyWorkRate: 0.35,
  annualThresholdPerClaimant: 150,
  maxCreditPerClaimant: 1600,
  sourceUrl: "https://www.vero.fi/en/individuals/deductions/Tax-credit-for-household-expenses/calculator-for-tax-credit-for-household-expenses/",
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildHouseholdDeductionRows(quote: Quote): HouseholdDeductionRow[] {
  const vatMultiplier = 1 + quote.config.vatRate;
  return [
    {
      type: "material",
      label: "Materials",
      amount: round2(quote.materialSubtotal * vatMultiplier),
    },
    {
      type: "labour",
      label: "Labour",
      amount: round2(quote.labourSubtotal * vatMultiplier),
    },
  ];
}

export function calculateHouseholdDeduction(
  rows: HouseholdDeductionRow[],
  options: { coupleMode?: boolean } = {},
): HouseholdDeductionResult {
  const claimantCount: 1 | 2 = options.coupleMode ? 2 : 1;
  const grossCost = round2(rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0));
  const labourCost = round2(
    rows
      .filter((row) => row.type === "labour")
      .reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0),
  );
  const rawCredit = round2(labourCost * HOUSEHOLD_DEDUCTION_2026.companyWorkRate);
  const threshold = HOUSEHOLD_DEDUCTION_2026.annualThresholdPerClaimant * claimantCount;
  const maxCredit = HOUSEHOLD_DEDUCTION_2026.maxCreditPerClaimant * claimantCount;
  const credit = round2(Math.min(Math.max(0, rawCredit - threshold), maxCredit));

  return {
    grossCost,
    labourCost,
    rawCredit,
    threshold,
    maxCredit,
    credit,
    netCost: round2(Math.max(0, grossCost - credit)),
    claimantCount,
  };
}
