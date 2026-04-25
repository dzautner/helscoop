export type TrendDirection = "rising" | "falling" | "stable";
export type TrendRecommendation = "buy_now" | "wait" | "watch";
export type TrendConfidence = "high" | "medium" | "low";
export type TrendSource = "retailer_history" | "seasonal_model";

export interface PriceHistoryInput {
  unitPrice: number;
  scrapedAt: string | Date;
}

export interface MaterialTrendInput {
  materialId: string;
  materialName: string;
  categoryName?: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  lineCost: number;
  history?: PriceHistoryInput[];
}

export interface MaterialTrendPoint {
  month: string;
  unitPrice: number;
  source: TrendSource;
}

export interface MaterialTrendResult {
  materialId: string;
  materialName: string;
  categoryName: string | null;
  quantity: number;
  unit: string;
  currentUnitPrice: number;
  currentLineCost: number;
  average3m: number | null;
  average12m: number | null;
  vs3mPct: number | null;
  vs12mPct: number | null;
  direction: TrendDirection;
  recommendation: TrendRecommendation;
  bestBuyMonth: string | null;
  estimatedWaitSavingsPct: number;
  estimatedWaitSavings: number;
  confidence: TrendConfidence;
  source: TrendSource;
  points: MaterialTrendPoint[];
}

export interface ProjectTrendSummary {
  totalCurrentCost: number;
  weightedVs12mPct: number | null;
  estimatedWaitSavings: number;
  bestBuyMonth: string | null;
  buyNowCount: number;
  waitCount: number;
  watchCount: number;
  items: MaterialTrendResult[];
}

const SEASONAL_FACTORS: Record<string, number[]> = {
  lumber: [0.94, 0.95, 0.98, 1.03, 1.08, 1.1, 1.08, 1.04, 1.0, 0.97, 0.95, 0.94],
  insulation: [1.03, 1.02, 1.0, 0.98, 0.96, 0.95, 0.96, 0.98, 1.01, 1.04, 1.06, 1.05],
  roofing: [0.95, 0.96, 0.99, 1.04, 1.09, 1.11, 1.1, 1.06, 1.01, 0.98, 0.96, 0.95],
  concrete: [0.98, 0.99, 1.0, 1.02, 1.04, 1.05, 1.05, 1.03, 1.01, 0.99, 0.98, 0.98],
  fixtures: [0.99, 0.99, 1.0, 1.01, 1.02, 1.02, 1.01, 1.0, 0.99, 0.98, 0.97, 0.99],
  default: [0.97, 0.98, 1.0, 1.03, 1.05, 1.06, 1.05, 1.03, 1.0, 0.98, 0.97, 0.97],
};

function categoryProfile(categoryName?: string | null): keyof typeof SEASONAL_FACTORS {
  const value = (categoryName ?? "").toLowerCase();
  if (/(sahatavara|lumber|wood|puu|timber|vaneri|plywood|osb)/.test(value)) return "lumber";
  if (/(eriste|insulation|villa|wool)/.test(value)) return "insulation";
  if (/(katto|roof|roofing|pelti|bitumen)/.test(value)) return "roofing";
  if (/(betoni|concrete|cement|laasti|mortar)/.test(value)) return "concrete";
  if (/(fixture|kaluste|ikkuna|window|ovi|door)/.test(value)) return "fixtures";
  return "default";
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pctChange(current: number, baseline: number | null): number | null {
  if (!baseline || baseline === 0) return null;
  return roundPct(((current - baseline) / baseline) * 100);
}

function directionFromPoints(points: MaterialTrendPoint[]): TrendDirection {
  if (points.length < 2) return "stable";
  const first = points[0].unitPrice;
  const last = points[points.length - 1].unitPrice;
  if (first === 0) return "stable";
  const pct = ((last - first) / first) * 100;
  if (Math.abs(pct) < 1) return "stable";
  return pct > 0 ? "rising" : "falling";
}

function historySeries(history: PriceHistoryInput[]): MaterialTrendPoint[] {
  const byMonth = new Map<string, number[]>();
  for (const row of history) {
    const unitPrice = Number(row.unitPrice);
    const date = new Date(row.scrapedAt);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0 || Number.isNaN(date.getTime())) continue;
    const key = monthKey(date);
    const values = byMonth.get(key) ?? [];
    values.push(unitPrice);
    byMonth.set(key, values);
  }

  return Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, values]) => ({
      month,
      unitPrice: roundMoney(average(values) ?? 0),
      source: "retailer_history" as TrendSource,
    }));
}

function seasonalSeries(input: MaterialTrendInput, now: Date): MaterialTrendPoint[] {
  const factors = SEASONAL_FACTORS[categoryProfile(input.categoryName)];
  const currentMonth = now.getUTCMonth();
  const currentFactor = factors[currentMonth] || 1;
  const points: MaterialTrendPoint[] = [];

  for (let offset = -11; offset <= 0; offset += 1) {
    const date = addMonths(now, offset);
    const factor = factors[date.getUTCMonth()] || 1;
    points.push({
      month: monthKey(date),
      unitPrice: roundMoney(input.unitPrice * (factor / currentFactor)),
      source: "seasonal_model",
    });
  }

  return points;
}

function bestFutureMonth(input: MaterialTrendInput, now: Date): { month: string | null; savingsPct: number } {
  if (input.unitPrice <= 0) return { month: null, savingsPct: 0 };
  const factors = SEASONAL_FACTORS[categoryProfile(input.categoryName)];
  const currentFactor = factors[now.getUTCMonth()] || 1;
  let bestMonth: string | null = null;
  let bestPrice = input.unitPrice;

  for (let offset = 1; offset <= 6; offset += 1) {
    const date = addMonths(now, offset);
    const factor = factors[date.getUTCMonth()] || 1;
    const projected = input.unitPrice * (factor / currentFactor);
    if (projected < bestPrice) {
      bestPrice = projected;
      bestMonth = monthKey(date);
    }
  }

  const savingsPct = Math.max(0, ((input.unitPrice - bestPrice) / input.unitPrice) * 100);
  return { month: bestMonth, savingsPct: roundPct(savingsPct) };
}

function recommendation(direction: TrendDirection, vs12mPct: number | null, waitSavingsPct: number): TrendRecommendation {
  if (vs12mPct != null && vs12mPct <= -3) return "buy_now";
  if (waitSavingsPct >= 5) return "wait";
  if (direction === "rising" && (vs12mPct == null || vs12mPct < 5)) return "buy_now";
  return "watch";
}

export function buildMaterialTrend(input: MaterialTrendInput, now: Date = new Date()): MaterialTrendResult {
  const actualSeries = historySeries(input.history ?? []);
  const hasUsableHistory = actualSeries.length >= 2;
  const points = hasUsableHistory ? actualSeries : seasonalSeries(input, now);
  const source: TrendSource = hasUsableHistory ? "retailer_history" : "seasonal_model";
  const latestValues = points.map((point) => point.unitPrice).filter((value) => Number.isFinite(value) && value > 0);
  const last3 = latestValues.slice(-3);
  const average3m = average(last3);
  const average12m = average(latestValues);
  const direction = directionFromPoints(points.slice(-3));
  const future = bestFutureMonth(input, now);
  const waitSavings = roundMoney(input.lineCost * (future.savingsPct / 100));
  const rec = recommendation(direction, pctChange(input.unitPrice, average12m), future.savingsPct);
  const confidence: TrendConfidence = actualSeries.length >= 6 ? "high" : hasUsableHistory ? "medium" : "low";

  return {
    materialId: input.materialId,
    materialName: input.materialName,
    categoryName: input.categoryName ?? null,
    quantity: input.quantity,
    unit: input.unit,
    currentUnitPrice: roundMoney(input.unitPrice),
    currentLineCost: roundMoney(input.lineCost),
    average3m: average3m == null ? null : roundMoney(average3m),
    average12m: average12m == null ? null : roundMoney(average12m),
    vs3mPct: pctChange(input.unitPrice, average3m),
    vs12mPct: pctChange(input.unitPrice, average12m),
    direction,
    recommendation: rec,
    bestBuyMonth: future.month,
    estimatedWaitSavingsPct: future.savingsPct,
    estimatedWaitSavings: waitSavings,
    confidence,
    source,
    points,
  };
}

export function buildProjectTrendSummary(items: MaterialTrendResult[]): ProjectTrendSummary {
  const totalCurrentCost = roundMoney(items.reduce((sum, item) => sum + item.currentLineCost, 0));
  const weightedDelta = items.reduce((sum, item) => {
    if (item.vs12mPct == null || totalCurrentCost === 0) return sum;
    return sum + item.vs12mPct * (item.currentLineCost / totalCurrentCost);
  }, 0);
  const weightedVs12mPct = totalCurrentCost > 0 ? roundPct(weightedDelta) : null;
  const monthSavings = new Map<string, number>();

  for (const item of items) {
    if (item.bestBuyMonth && item.estimatedWaitSavings > 0) {
      monthSavings.set(item.bestBuyMonth, (monthSavings.get(item.bestBuyMonth) ?? 0) + item.estimatedWaitSavings);
    }
  }

  const bestBuyMonth = Array.from(monthSavings.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return {
    totalCurrentCost,
    weightedVs12mPct,
    estimatedWaitSavings: roundMoney(items.reduce((sum, item) => sum + item.estimatedWaitSavings, 0)),
    bestBuyMonth,
    buyNowCount: items.filter((item) => item.recommendation === "buy_now").length,
    waitCount: items.filter((item) => item.recommendation === "wait").length,
    watchCount: items.filter((item) => item.recommendation === "watch").length,
    items,
  };
}
