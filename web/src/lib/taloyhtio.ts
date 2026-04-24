import type { BomItem, ShareholderShare } from "@/types";

export interface TaloyhtioShareCost extends ShareholderShare {
  cost: number;
}

export interface TaloyhtioCostModel {
  unitCount: number;
  perUnitTotal: number;
  buildingTotal: number;
  shareTotalPct: number;
  shareDeltaPct: number;
  shares: TaloyhtioShareCost[];
}

function lineTotal(item: BomItem): number {
  const explicit = Number(item.total);
  if (Number.isFinite(explicit)) return explicit;
  const unitPrice = Number(item.unit_price);
  const quantity = Number(item.quantity);
  if (!Number.isFinite(unitPrice) || !Number.isFinite(quantity)) return 0;
  return unitPrice * quantity;
}

export function normalizeTaloyhtioUnitCount(value: unknown): number {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return 1;
  return Math.max(1, Math.floor(next));
}

export function calculateTaloyhtioCostModel(
  bom: BomItem[],
  unitCount: unknown,
  shares: ShareholderShare[] = [],
): TaloyhtioCostModel {
  const normalizedUnitCount = normalizeTaloyhtioUnitCount(unitCount);
  const perUnitTotal = bom.reduce((sum, item) => sum + lineTotal(item), 0);
  const buildingTotal = perUnitTotal * normalizedUnitCount;
  const safeShares = shares
    .filter((share) => Number.isFinite(Number(share.share_pct)) && Number(share.share_pct) >= 0)
    .map((share) => ({
      apartment: share.apartment || "-",
      owner_name: share.owner_name ?? null,
      share_pct: Number(share.share_pct),
      cost: buildingTotal * (Number(share.share_pct) / 100),
    }));
  const shareTotalPct = safeShares.reduce((sum, share) => sum + share.share_pct, 0);

  return {
    unitCount: normalizedUnitCount,
    perUnitTotal,
    buildingTotal,
    shareTotalPct,
    shareDeltaPct: 100 - shareTotalPct,
    shares: safeShares,
  };
}

export function parseShareholderShareRows(text: string): ShareholderShare[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split(/[,;\t]/).map((part) => part.trim());
      if (parts.length < 2 || !parts[0]) {
        throw new Error(`Share row ${index + 1} must use "Apartment, share%"`);
      }
      const sharePct = Number(parts[1].replace("%", "").replace(",", "."));
      if (!Number.isFinite(sharePct) || sharePct < 0 || sharePct > 100) {
        throw new Error(`Share row ${index + 1} must have a percentage between 0 and 100`);
      }
      return {
        apartment: parts[0],
        share_pct: Math.round(sharePct * 10000) / 10000,
        owner_name: parts[2] || null,
      };
    });
}

export function formatShareholderShareRows(shares: ShareholderShare[] = []): string {
  return shares
    .map((share) => [share.apartment, share.share_pct, share.owner_name ?? ""].join(", "))
    .join("\n");
}
