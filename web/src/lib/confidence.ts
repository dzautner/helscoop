export type ConfidenceLevel = "verified" | "estimated" | "demo" | "manual";

export interface DataProvenance {
  confidence: ConfidenceLevel;
  source: string; // e.g., "DVV", "MML", "user", "heuristic"
  fetchedAt?: string; // ISO date
}

/** Number of days after which a scraped price is considered stale */
export const STALE_PRICE_THRESHOLD_DAYS = 90;

/**
 * Returns true when a lastUpdated ISO string is older than STALE_PRICE_THRESHOLD_DAYS.
 * Returns false if lastUpdated is undefined/null.
 */
export function isPriceStale(lastUpdated: string | null | undefined): boolean {
  if (!lastUpdated) return false;
  const ageMs = Date.now() - new Date(lastUpdated).getTime();
  return ageMs > STALE_PRICE_THRESHOLD_DAYS * 86_400_000;
}
