import type { BomItem, Material } from "@/types";
import type { SceneLayer } from "@/lib/scene-layers";

export type AssemblyGuideSpeed = 1 | 2 | 4;

export interface AssemblyGuidePart {
  materialId: string;
  name: string;
  quantity: number;
  unit: string;
  approxCost: number;
  color: [number, number, number];
}

export interface AssemblyGuideInstruction {
  id: string;
  text: string;
  tip: string;
  minutes: number;
}

export interface AssemblyGuideStep {
  id: string;
  index: number;
  title: string;
  description: string;
  category: string;
  categoryLabel: string;
  layerIds: string[];
  layerNames: string[];
  parts: AssemblyGuidePart[];
  tools: string[];
  instructions: AssemblyGuideInstruction[];
  estimatedMinutes: number;
  approxCost: number;
  color: [number, number, number];
}

export interface AssemblyGuide {
  steps: AssemblyGuideStep[];
  totalMinutes: number;
  totalCost: number;
}

export interface AssemblyViewportState {
  stepKey: string;
  completedObjectIds: string[];
  currentObjectIds: string[];
  ghostObjectIds: string[];
  hiddenObjectIds: string[];
}

const CATEGORY_ORDER = [
  "foundation",
  "masonry",
  "framing",
  "lumber",
  "sheathing",
  "roofing",
  "insulation",
  "membrane",
  "opening",
  "cladding",
  "hardware",
  "finish",
  "trim",
  "interior",
  "unknown",
];

const CATEGORY_LABELS: Record<string, string> = {
  foundation: "Foundation",
  masonry: "Masonry",
  framing: "Framing",
  lumber: "Lumber",
  sheathing: "Sheathing",
  roofing: "Roofing",
  insulation: "Insulation",
  membrane: "Weather barrier",
  opening: "Openings",
  cladding: "Cladding",
  hardware: "Hardware",
  finish: "Finish",
  trim: "Trim",
  interior: "Interior",
  unknown: "Build",
};

const CATEGORY_MINUTES: Record<string, number> = {
  foundation: 45,
  masonry: 50,
  framing: 35,
  lumber: 35,
  sheathing: 30,
  roofing: 45,
  insulation: 25,
  membrane: 20,
  opening: 35,
  cladding: 35,
  hardware: 15,
  finish: 30,
  trim: 20,
  interior: 30,
  unknown: 25,
};

const CATEGORY_TOOLS: Record<string, string[]> = {
  foundation: ["level", "line", "trowel"],
  masonry: ["masonry line", "level", "rubber mallet"],
  framing: ["drill", "square", "level"],
  lumber: ["drill", "square", "level"],
  sheathing: ["drill", "utility knife", "tape measure"],
  roofing: ["ladder", "tin snips", "driver"],
  insulation: ["knife", "gloves", "respirator"],
  membrane: ["stapler", "tape roller", "knife"],
  opening: ["driver", "shims", "level"],
  cladding: ["saw", "driver", "spacers"],
  hardware: ["driver", "wrench"],
  finish: ["brush", "sander", "masking tape"],
  trim: ["saw", "nailer", "square"],
  interior: ["driver", "level", "utility knife"],
  unknown: ["tape measure", "driver", "level"],
};

const CATEGORY_TIPS: Record<string, string[]> = {
  foundation: ["Check level twice before fixing later parts."],
  masonry: ["Keep joints aligned before moving to the next course."],
  framing: ["Confirm diagonals before fastening the final screws."],
  lumber: ["Pre-drill near ends to avoid splitting timber."],
  sheathing: ["Leave expansion gaps where the product sheet requires them."],
  roofing: ["Work from the safe side and keep lap direction with water flow."],
  insulation: ["Do not compress insulation; trapped air is the performance layer."],
  membrane: ["Overlap and tape seams before covering them."],
  opening: ["Shim before tightening so the frame stays square."],
  cladding: ["Keep the ventilation gap continuous behind cladding."],
  hardware: ["Tighten after alignment, not before."],
  finish: ["Let each coat flash off before adding the next one."],
  trim: ["Dry-fit mitres before final fastening."],
  interior: ["Confirm services and penetrations before closing surfaces."],
  unknown: ["Dry-fit the part and verify orientation before fastening."],
};

function normalizeCategory(raw: string | null | undefined, materialId = ""): string {
  const value = `${raw ?? ""} ${materialId}`.toLowerCase();
  if (/(foundation|concrete|betoni|slab|footing)/.test(value)) return "foundation";
  if (/(masonry|brick|block|harkko|tiili)/.test(value)) return "masonry";
  if (/(frame|stud|runko|framing)/.test(value)) return "framing";
  if (/(lumber|timber|wood|c24|puu|lauta|vaneri)/.test(value)) return "lumber";
  if (/(sheath|osb|plywood|levy)/.test(value)) return "sheathing";
  if (/(roof|katto|tile|metal_roof|huopa)/.test(value)) return "roofing";
  if (/(insulation|villa|eriste|xps|eps)/.test(value)) return "insulation";
  if (/(membrane|barrier|höyry|vapou?r|tuulensuoja|underlay)/.test(value)) return "membrane";
  if (/(window|door|ikkuna|ovi|opening)/.test(value)) return "opening";
  if (/(cladding|siding|verhous|panel)/.test(value)) return "cladding";
  if (/(hardware|fastener|screw|naula|bolt|hinge)/.test(value)) return "hardware";
  if (/(paint|finish|surface|maali)/.test(value)) return "finish";
  if (/(trim|list|skirting)/.test(value)) return "trim";
  if (/(interior|gypsum|drywall|kipsi)/.test(value)) return "interior";
  return "unknown";
}

function categoryRank(category: string): number {
  const rank = CATEGORY_ORDER.indexOf(category);
  return rank === -1 ? CATEGORY_ORDER.length : rank;
}

function roundMinutes(value: number): number {
  return Math.max(10, Math.round(value / 5) * 5);
}

function getMaterialInfo(materialId: string, bom: BomItem[], materials: Material[]) {
  const bomItem = bom.find((item) => item.material_id === materialId);
  const material = materials.find((item) => item.id === materialId);
  return {
    bomItem,
    material,
    name: material?.name_en || material?.name || bomItem?.material_name || materialId,
    category: normalizeCategory(material?.category_name || bomItem?.category_name, materialId),
  };
}

function chunkLayers(layers: SceneLayer[], size = 3): SceneLayer[][] {
  const chunks: SceneLayer[][] = [];
  for (let i = 0; i < layers.length; i += size) {
    chunks.push(layers.slice(i, i + size));
  }
  return chunks;
}

function buildParts(layers: SceneLayer[], allLayers: SceneLayer[], bom: BomItem[], materials: Material[]): AssemblyGuidePart[] {
  const byMaterial = new Map<string, { layers: SceneLayer[]; color: [number, number, number] }>();
  for (const layer of layers) {
    const existing = byMaterial.get(layer.materialId);
    if (existing) existing.layers.push(layer);
    else byMaterial.set(layer.materialId, { layers: [layer], color: layer.color });
  }

  return Array.from(byMaterial.entries()).map(([materialId, group]) => {
    const { bomItem, name } = getMaterialInfo(materialId, bom, materials);
    const sceneLayerCount = Math.max(1, allLayers.filter((layer) => layer.materialId === materialId).length);
    const allLayerCount = Math.max(1, group.layers.length);
    const quantity = bomItem ? Number(bomItem.quantity || 0) * (group.layers.length / sceneLayerCount) : allLayerCount;
    const unitPrice = Number(bomItem?.unit_price ?? 0);
    const approxCost = group.layers.reduce((sum, layer) => sum + layer.approxCost, 0) || quantity * unitPrice;
    return {
      materialId,
      name,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : allLayerCount,
      unit: bomItem?.unit || "pcs",
      approxCost,
      color: group.color,
    };
  });
}

function buildInstructions(category: string, layerNames: string[], minutes: number): AssemblyGuideInstruction[] {
  const label = CATEGORY_LABELS[category] ?? CATEGORY_LABELS.unknown;
  const names = layerNames.slice(0, 2).join(", ");
  const extra = layerNames.length > 2 ? ` and ${layerNames.length - 2} more` : "";
  const tip = CATEGORY_TIPS[category]?.[0] ?? CATEGORY_TIPS.unknown[0];
  return [
    {
      id: "prep",
      text: `Lay out ${names}${extra} and verify orientation before fastening.`,
      tip,
      minutes: Math.max(3, Math.round(minutes * 0.2)),
    },
    {
      id: "place",
      text: `Place the ${label.toLowerCase()} parts in the highlighted position.`,
      tip: "Use the ghost preview to understand the next part before committing.",
      minutes: Math.max(5, Math.round(minutes * 0.55)),
    },
    {
      id: "check",
      text: "Check alignment, tighten fixings, and mark the step complete.",
      tip: "Re-center the camera if the next part is hidden behind the model.",
      minutes: Math.max(3, Math.round(minutes * 0.25)),
    },
  ];
}

function averageColor(layers: SceneLayer[]): [number, number, number] {
  if (layers.length === 0) return [0.9, 0.6, 0.25];
  const totals = layers.reduce<[number, number, number]>((sum, layer) => [
    sum[0] + layer.color[0],
    sum[1] + layer.color[1],
    sum[2] + layer.color[2],
  ], [0, 0, 0]);
  return [totals[0] / layers.length, totals[1] / layers.length, totals[2] / layers.length];
}

export function buildAssemblyGuide(layers: SceneLayer[], bom: BomItem[], materials: Material[]): AssemblyGuide {
  const sorted = [...layers].sort((a, b) => {
    const aCategory = getMaterialInfo(a.materialId, bom, materials).category;
    const bCategory = getMaterialInfo(b.materialId, bom, materials).category;
    const rankDelta = categoryRank(aCategory) - categoryRank(bCategory);
    if (rankDelta !== 0) return rankDelta;
    return a.name.localeCompare(b.name);
  });

  const grouped = new Map<string, SceneLayer[]>();
  for (const layer of sorted) {
    const category = getMaterialInfo(layer.materialId, bom, materials).category;
    const existing = grouped.get(category);
    if (existing) existing.push(layer);
    else grouped.set(category, [layer]);
  }

  const steps: AssemblyGuideStep[] = [];
  for (const category of CATEGORY_ORDER) {
    const group = grouped.get(category);
    if (!group || group.length === 0) continue;
    for (const chunk of chunkLayers(group, 3)) {
      const index = steps.length;
      const parts = buildParts(chunk, sorted, bom, materials);
      const layerNames = chunk.map((layer) => layer.name);
      const label = CATEGORY_LABELS[category] ?? CATEGORY_LABELS.unknown;
      const partCost = parts.reduce((sum, part) => sum + part.approxCost, 0);
      const minutes = roundMinutes((CATEGORY_MINUTES[category] ?? 25) + chunk.length * 8 + Math.min(30, partCost / 40));
      const titleName = layerNames.length === 1 ? layerNames[0] : `${layerNames[0]} + ${layerNames.length - 1}`;
      steps.push({
        id: `${index + 1}-${category}-${chunk.map((layer) => layer.id).join("-")}`,
        index,
        title: `${label}: ${titleName}`,
        description: `Add ${chunk.length} object${chunk.length === 1 ? "" : "s"} while keeping previous parts visible and the next step ghosted.`,
        category,
        categoryLabel: label,
        layerIds: chunk.map((layer) => layer.id),
        layerNames,
        parts,
        tools: CATEGORY_TOOLS[category] ?? CATEGORY_TOOLS.unknown,
        instructions: buildInstructions(category, layerNames, minutes),
        estimatedMinutes: minutes,
        approxCost: partCost,
        color: averageColor(chunk),
      });
    }
  }

  const totalMinutes = steps.reduce((sum, step) => sum + step.estimatedMinutes, 0);
  const totalCost = steps.reduce((sum, step) => sum + step.approxCost, 0);
  return { steps, totalMinutes, totalCost };
}

export function getAssemblyViewportState(steps: AssemblyGuideStep[], stepIndex: number): AssemblyViewportState | null {
  if (steps.length === 0) return null;
  const currentIndex = Math.min(Math.max(stepIndex, 0), steps.length - 1);
  const completedObjectIds = steps.slice(0, currentIndex).flatMap((step) => step.layerIds);
  const currentObjectIds = steps[currentIndex]?.layerIds ?? [];
  const ghostObjectIds = steps[currentIndex + 1]?.layerIds ?? [];
  const visible = new Set([...completedObjectIds, ...currentObjectIds, ...ghostObjectIds]);
  const hiddenObjectIds = steps.flatMap((step) => step.layerIds).filter((id) => !visible.has(id));
  return {
    stepKey: steps[currentIndex]?.id ?? String(currentIndex),
    completedObjectIds,
    currentObjectIds,
    ghostObjectIds,
    hiddenObjectIds,
  };
}

export function formatAssemblyDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}
