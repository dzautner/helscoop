import type { BomItem } from "@/types";

export interface LayerSeedSource {
  objectId?: string;
  materialId: string;
  color: [number, number, number];
}

export interface LayerSeed {
  id: string;
  objectId: string;
  materialId: string;
  color: [number, number, number];
  meshCount: number;
}

export interface SceneLayer extends LayerSeed {
  name: string;
  approxCost: number;
}

export function humanizeObjectId(objectId: string): string {
  return objectId
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function groupLayerSeeds(items: LayerSeedSource[]): LayerSeed[] {
  const grouped = new Map<string, LayerSeed>();

  for (const item of items) {
    if (!item.objectId || item.objectId.trim().length === 0) continue;
    const key = item.objectId.trim();
    const existing = grouped.get(key);
    if (existing) {
      existing.meshCount += 1;
      continue;
    }
    grouped.set(key, {
      id: key,
      objectId: key,
      materialId: item.materialId,
      color: item.color,
      meshCount: 1,
    });
  }

  return Array.from(grouped.values());
}

export function buildSceneLayers(
  seeds: LayerSeed[],
  bom: BomItem[],
): SceneLayer[] {
  const materialTotals = new Map<string, number>();
  for (const item of bom) {
    const total = Number(item.total ?? ((item.unit_price || 0) * item.quantity));
    materialTotals.set(item.material_id, (materialTotals.get(item.material_id) ?? 0) + total);
  }

  const materialCounts = new Map<string, number>();
  for (const seed of seeds) {
    materialCounts.set(seed.materialId, (materialCounts.get(seed.materialId) ?? 0) + 1);
  }

  return seeds.map((seed) => {
    const total = materialTotals.get(seed.materialId) ?? 0;
    const count = materialCounts.get(seed.materialId) ?? 1;
    return {
      ...seed,
      name: humanizeObjectId(seed.objectId),
      approxCost: total / count,
    };
  });
}
