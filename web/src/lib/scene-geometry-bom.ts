import type { BomItem, Material } from "@/types";

export interface SceneGeometryBox {
  name: string;
  material?: string;
  type: "wall" | "floor" | "roof" | "opening" | "generic";
  dimensions: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
}

export interface SceneGeometryMetrics {
  wallAreaM2: number;
  floorAreaM2: number;
  roofAreaM2: number;
  wallPerimeterM: number;
  openingCount: number;
  openingAreaM2: number;
  objectCount: number;
  bounds: {
    widthM: number;
    depthM: number;
    heightM: number;
  };
}

export interface GeometryBomSuggestion {
  materialId: string;
  materialName: string;
  unit: string;
  currentQuantity: number;
  suggestedQuantity: number;
  delta: number;
  percentChange: number;
  reason: string;
  metric: keyof Pick<SceneGeometryMetrics, "wallAreaM2" | "floorAreaM2" | "roofAreaM2" | "wallPerimeterM" | "openingCount">;
}

export interface GeometryBomSuggestionResult {
  metrics: SceneGeometryMetrics;
  suggestions: GeometryBomSuggestion[];
  skippedManual: GeometryBomSuggestion[];
}

const MIN_DELTA = 0.25;
const MIN_PERCENT_CHANGE = 0.05;
const MAX_REASONABLE_METERS = 80;

function cleanNumber(value: string | undefined): number | null {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function maybeMeters(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.abs(value) > MAX_REASONABLE_METERS ? value / 1000 : value;
}

function roundQuantity(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value >= 100) return Math.round(value);
  if (value >= 10) return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

function normalizeText(value: string | undefined | null): string {
  return (value || "").toLowerCase();
}

function normalizeUnit(value: string): string {
  const unit = value.toLowerCase().replace("²", "2");
  if (["m2", "sqm", "sq m"].includes(unit)) return "m2";
  if (["jm", "m", "meter", "metre"].includes(unit)) return "jm";
  if (["kpl", "pcs", "pc", "piece", "pieces"].includes(unit)) return "kpl";
  return unit;
}

function classifyBox(name: string, material?: string): SceneGeometryBox["type"] {
  const haystack = `${name} ${material || ""}`.toLowerCase();
  if (/window|ikkuna|door|ovi|gate|portti|opening/.test(haystack)) return "opening";
  if (/roof|katto|kate|galvanized_roofing|roofing/.test(haystack)) return "roof";
  if (/floor|slab|deck|lattia|laatta|foundation|perustus/.test(haystack)) return "floor";
  if (/wall|sein|stud|runko|cladding/.test(haystack)) return "wall";
  return "generic";
}

function parseBoxAssignments(sceneJs: string) {
  const assignments = new Map<string, {
    dimensions: { x: number; y: number; z: number };
    position: { x: number; y: number; z: number };
  }>();

  for (const rawLine of sceneJs.split("\n")) {
    const line = rawLine.trim();
    const translated = line.match(
      /const\s+(\w+)\s*=\s*translate\s*\((?:rotate\s*\()?box\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)(?:\s*,\s*[\d.,\s-]+\s*\))?\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/
    );
    if (translated) {
      assignments.set(translated[1], {
        dimensions: {
          x: maybeMeters(cleanNumber(translated[2]) ?? 0),
          y: maybeMeters(cleanNumber(translated[3]) ?? 0),
          z: maybeMeters(cleanNumber(translated[4]) ?? 0),
        },
        position: {
          x: maybeMeters(cleanNumber(translated[5]) ?? 0),
          y: maybeMeters(cleanNumber(translated[6]) ?? 0),
          z: maybeMeters(cleanNumber(translated[7]) ?? 0),
        },
      });
      continue;
    }

    const box = line.match(/const\s+(\w+)\s*=\s*box\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
    if (box) {
      assignments.set(box[1], {
        dimensions: {
          x: maybeMeters(cleanNumber(box[2]) ?? 0),
          y: maybeMeters(cleanNumber(box[3]) ?? 0),
          z: maybeMeters(cleanNumber(box[4]) ?? 0),
        },
        position: { x: 0, y: 0, z: 0 },
      });
    }
  }

  return assignments;
}

export function parseSceneGeometryBoxes(sceneJs: string): SceneGeometryBox[] {
  const assignments = parseBoxAssignments(sceneJs);
  const boxes: SceneGeometryBox[] = [];
  const addRegex = /scene\.add\s*\(\s*(\w+)\s*(?:,\s*\{([^}]*)\})?\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = addRegex.exec(sceneJs)) !== null) {
    const name = match[1];
    const assigned = assignments.get(name);
    if (!assigned) continue;
    const material = match[2]?.match(/material\s*:\s*["']([^"']+)["']/)?.[1];
    boxes.push({
      name,
      material,
      type: classifyBox(name, material),
      dimensions: assigned.dimensions,
      position: assigned.position,
    });
  }

  return boxes;
}

function largestVerticalFaceArea(box: SceneGeometryBox): number {
  const { x, y, z } = box.dimensions;
  return Math.max(x * y, z * y);
}

function horizontalArea(box: SceneGeometryBox): number {
  return box.dimensions.x * box.dimensions.z;
}

export function analyzeSceneGeometry(sceneJs: string): SceneGeometryMetrics {
  const boxes = parseSceneGeometryBoxes(sceneJs);
  const structuralBoxes = boxes.filter((box) => box.type !== "opening");
  const minX = structuralBoxes.length
    ? Math.min(...structuralBoxes.map((box) => box.position.x - box.dimensions.x / 2))
    : 0;
  const maxX = structuralBoxes.length
    ? Math.max(...structuralBoxes.map((box) => box.position.x + box.dimensions.x / 2))
    : 0;
  const minZ = structuralBoxes.length
    ? Math.min(...structuralBoxes.map((box) => box.position.z - box.dimensions.z / 2))
    : 0;
  const maxZ = structuralBoxes.length
    ? Math.max(...structuralBoxes.map((box) => box.position.z + box.dimensions.z / 2))
    : 0;
  const maxY = structuralBoxes.length
    ? Math.max(...structuralBoxes.map((box) => box.position.y + box.dimensions.y / 2))
    : 0;

  let wallAreaM2 = 0;
  let floorAreaM2 = 0;
  let roofAreaM2 = 0;
  let openingAreaM2 = 0;
  let openingCount = 0;

  for (const box of boxes) {
    if (box.type === "opening") {
      openingCount += 1;
      openingAreaM2 += largestVerticalFaceArea(box);
      continue;
    }
    if (box.type === "roof") {
      roofAreaM2 += horizontalArea(box);
      continue;
    }
    if (box.type === "floor") {
      floorAreaM2 += horizontalArea(box);
      continue;
    }
    if (box.type === "wall") {
      wallAreaM2 += largestVerticalFaceArea(box);
    }
  }

  const widthM = Math.max(0, maxX - minX);
  const depthM = Math.max(0, maxZ - minZ);
  const fallbackWallPerimeter = widthM > 0 && depthM > 0 ? 2 * (widthM + depthM) : 0;
  const explicitWallLength = boxes
    .filter((box) => box.type === "wall")
    .reduce((sum, box) => sum + Math.max(box.dimensions.x, box.dimensions.z), 0);

  return {
    wallAreaM2: roundQuantity(Math.max(0, wallAreaM2 - openingAreaM2)),
    floorAreaM2: roundQuantity(floorAreaM2),
    roofAreaM2: roundQuantity(roofAreaM2 || floorAreaM2),
    wallPerimeterM: roundQuantity(explicitWallLength || fallbackWallPerimeter),
    openingCount,
    openingAreaM2: roundQuantity(openingAreaM2),
    objectCount: boxes.length,
    bounds: {
      widthM: roundQuantity(widthM),
      depthM: roundQuantity(depthM),
      heightM: roundQuantity(maxY),
    },
  };
}

function materialLookup(materials: Material[]): Map<string, Material> {
  return new Map(materials.map((material) => [material.id, material]));
}

function materialText(item: BomItem, material: Material | undefined): string {
  return [
    item.material_id,
    item.material_name,
    item.category_name,
    material?.name,
    material?.category_name,
    ...(material?.tags ?? []),
  ].map((value) => normalizeText(value)).join(" ");
}

function estimateQuantity(item: BomItem, material: Material | undefined, metrics: SceneGeometryMetrics): {
  quantity: number;
  reason: string;
  metric: GeometryBomSuggestion["metric"];
} | null {
  const id = item.material_id;
  const text = materialText(item, material);

  if (/screws?|ruuvi|fastener/.test(text)) {
    return {
      quantity: (metrics.wallAreaM2 + metrics.floorAreaM2 + metrics.roofAreaM2) * 18,
      reason: "fasteners from total sheathed area",
      metric: "wallAreaM2",
    };
  }

  if (/concrete_block|betoniharkko|foundation|perustus/.test(text)) {
    return {
      quantity: Math.max(4, Math.ceil(metrics.wallPerimeterM * 2)),
      reason: "foundation blocks from building perimeter",
      metric: "wallPerimeterM",
    };
  }

  if (/galvanized_roofing|roofing|katto|kate/.test(text)) {
    return {
      quantity: metrics.roofAreaM2 * 1.1,
      reason: "roofing area plus 10% waste",
      metric: "roofAreaM2",
    };
  }

  if (/insulation|mineraalivilla|villa/.test(text)) {
    return {
      quantity: metrics.wallAreaM2 * 1.05,
      reason: "wall insulation area plus 5% waste",
      metric: "wallAreaM2",
    };
  }

  if (/osb_18|floor|lattia/.test(text) && /osb|sheet|levy|sheathing/.test(text)) {
    return {
      quantity: metrics.floorAreaM2 * 1.08,
      reason: "floor sheathing area plus 8% waste",
      metric: "floorAreaM2",
    };
  }

  if (/osb|sheet|levy|sheathing|cladding|ulkoverhous/.test(text)) {
    return {
      quantity: metrics.wallAreaM2 * 1.08,
      reason: "wall sheathing/cladding area plus 8% waste",
      metric: "wallAreaM2",
    };
  }

  if (id === "pine_48x98_c24" || /48x98|rafter|koolaus/.test(text)) {
    return {
      quantity: metrics.wallPerimeterM * 1.8 + metrics.roofAreaM2 * 2.2,
      reason: "secondary framing from perimeter and roof area",
      metric: "wallPerimeterM",
    };
  }

  if (id === "pine_48x148_c24" || /48x148|stud|joist|lattiavasa/.test(text)) {
    const height = Math.max(metrics.bounds.heightM || 2.4, 2.1);
    return {
      quantity: (metrics.wallPerimeterM / 0.6) * height + metrics.wallPerimeterM * 2,
      reason: "studs at 600mm centres plus top/bottom plates",
      metric: "wallPerimeterM",
    };
  }

  return null;
}

function isUnitCompatible(itemUnit: string, estimate: ReturnType<typeof estimateQuantity>): boolean {
  if (!estimate) return false;
  const unit = normalizeUnit(itemUnit);
  if (estimate.reason.startsWith("foundation blocks")) return unit === "kpl";
  if (estimate.reason.startsWith("fasteners")) return unit === "kpl";
  if (estimate.metric === "wallPerimeterM") return unit === "jm";
  if (estimate.metric === "openingCount") return unit === "kpl";
  return unit === "m2";
}

export function suggestGeometryBomUpdates(
  sceneJs: string,
  bom: BomItem[],
  materials: Material[],
  manualOverrideIds: Set<string> = new Set(),
): GeometryBomSuggestionResult {
  const metrics = analyzeSceneGeometry(sceneJs);
  const materialById = materialLookup(materials);
  const suggestions: GeometryBomSuggestion[] = [];
  const skippedManual: GeometryBomSuggestion[] = [];

  for (const item of bom) {
    const material = materialById.get(item.material_id);
    const estimate = estimateQuantity(item, material, metrics);
    if (!estimate || !isUnitCompatible(item.unit, estimate)) continue;

    const suggestedQuantity = roundQuantity(estimate.quantity);
    const currentQuantity = Number(item.quantity) || 0;
    const delta = roundQuantity(suggestedQuantity - currentQuantity);
    const denominator = Math.max(Math.abs(currentQuantity), 1);
    const percentChange = Math.abs(delta) / denominator;

    if (Math.abs(delta) < MIN_DELTA || percentChange < MIN_PERCENT_CHANGE) continue;

    const suggestion: GeometryBomSuggestion = {
      materialId: item.material_id,
      materialName: item.material_name || material?.name || item.material_id,
      unit: item.unit,
      currentQuantity,
      suggestedQuantity,
      delta,
      percentChange,
      reason: estimate.reason,
      metric: estimate.metric,
    };

    if (manualOverrideIds.has(item.material_id)) {
      skippedManual.push(suggestion);
    } else {
      suggestions.push(suggestion);
    }
  }

  return { metrics, suggestions, skippedManual };
}
