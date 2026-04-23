import type { Locale } from "@/lib/i18n";
import type { BomItem } from "@/types";

export interface RenovationComparisonSummary {
  currentEstimatedValue: number;
  renovationCost: number;
  newTotalValue: number;
}

type CostLine = Pick<BomItem, "quantity" | "unit_price" | "total">;

function lineTotal(item: CostLine): number {
  const explicitTotal = Number(item.total);
  if (Number.isFinite(explicitTotal) && explicitTotal > 0) return explicitTotal;
  const unitPrice = Number(item.unit_price || 0);
  const quantity = Number(item.quantity || 0);
  return Number.isFinite(unitPrice * quantity) ? unitPrice * quantity : 0;
}

export function summarizeRenovationComparison(
  bom: CostLine[],
  currentEstimatedValue = 0,
): RenovationComparisonSummary {
  const safeCurrent = Number.isFinite(currentEstimatedValue) && currentEstimatedValue > 0
    ? currentEstimatedValue
    : 0;
  const renovationCost = bom.reduce((sum, item) => sum + lineTotal(item), 0);
  return {
    currentEstimatedValue: safeCurrent,
    renovationCost,
    newTotalValue: safeCurrent + renovationCost,
  };
}

export function formatRenovationCompareCurrency(value: number, locale: Locale): string {
  const tag = locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB";
  return `${value.toLocaleString(tag, { maximumFractionDigits: 0 })} EUR`;
}
