import { Router } from "express";
import { requireAuth } from "../auth";
import { requirePermission } from "../permissions";
import { query } from "../db";
import {
  CREDIT_COSTS,
  CREDIT_PACKS,
  checkCredits,
  deductCreditsForFeature,
  type InsufficientCreditsBody,
} from "../entitlements";
import { extractBuildingAreaM2, parseBuildingInfo as parseSharedBuildingInfo } from "../building-info";

const router = Router();

const MAX_DRAWINGS = 3;
const MAX_DATA_URL_CHARS = 2_400_000;
const WALL_HEIGHT_M = 2.7;
const OSB_SHEET_AREA_M2 = 2.88;

type DrawingType = "floor_plan" | "elevation" | "mixed";
type ScaleSource = "user_dimensions" | "user_area" | "building_area" | "scale_hint" | "fallback";
type RoomType = "entry" | "living" | "kitchen" | "bedroom" | "bath" | "sauna" | "utility";

interface DrawingInput {
  name: string;
  mime_type: string;
  size?: number;
  data_url?: string;
}

interface BuildingContext {
  type?: string;
  year_built?: number;
  area_m2?: number;
  floors?: number;
  material?: string;
  heating?: string;
  roof_type?: string;
  units?: number;
}

interface TakeoffOptions {
  drawing_type: DrawingType;
  floor_label: string;
  notes: string;
  scale_text: string;
  width_m?: number;
  depth_m?: number;
  area_m2?: number;
}

interface MaterialRow {
  id: string;
  name: string;
  category_name: string | null;
  unit_price: string | number | null;
  unit: string | null;
  supplier_name: string | null;
  link: string | null;
}

interface TakeoffRoom {
  id: string;
  name: string;
  type: RoomType;
  x: number;
  z: number;
  width_m: number;
  depth_m: number;
  area_m2: number;
  confidence: number;
}

interface QuantityMetrics {
  width_m: number;
  depth_m: number;
  floor_area_m2: number;
  exterior_wall_lm: number;
  partition_wall_lm: number;
  exterior_wall_area_m2: number;
  interior_wall_board_m2: number;
  ceiling_area_m2: number;
  wet_room_area_m2: number;
  door_count: number;
  window_count: number;
}

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseBuildingInfo(value: unknown): BuildingContext {
  const parsed = parseSharedBuildingInfo(value);
  const normalized = { ...parsed } as BuildingContext;
  const areaM2 = extractBuildingAreaM2(parsed);
  if (areaM2 !== undefined) normalized.area_m2 = areaM2;
  const floors = positiveNumber(parsed.floors);
  if (floors !== undefined) normalized.floors = floors;
  return normalized;
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ");
}

function normalizeDrawings(input: unknown): DrawingInput[] {
  if (!Array.isArray(input)) return [];
  const drawings: DrawingInput[] = [];
  for (const raw of input.slice(0, MAX_DRAWINGS + 1)) {
    if (!raw || typeof raw !== "object") continue;
    const drawing = raw as {
      name?: unknown;
      mime_type?: unknown;
      type?: unknown;
      size?: unknown;
      data_url?: unknown;
      dataUrl?: unknown;
    };
    const name = typeof drawing.name === "string" && drawing.name.trim()
      ? drawing.name.trim().slice(0, 160)
      : "drawing.pdf";
    const mimeType = typeof drawing.mime_type === "string"
      ? drawing.mime_type
      : typeof drawing.type === "string"
        ? drawing.type
        : "";
    const size = positiveNumber(drawing.size);
    const dataUrl = typeof drawing.data_url === "string"
      ? drawing.data_url
      : typeof drawing.dataUrl === "string"
        ? drawing.dataUrl
        : undefined;
    const item: DrawingInput = { name, mime_type: mimeType };
    if (size) item.size = size;
    if (dataUrl) item.data_url = dataUrl;
    drawings.push(item);
  }
  return drawings;
}

function validateDrawings(drawings: DrawingInput[]): string | null {
  if (drawings.length === 0) return "Upload at least one floor plan, elevation, image, or PDF";
  if (drawings.length > MAX_DRAWINGS) return `Upload no more than ${MAX_DRAWINGS} drawings`;

  for (const drawing of drawings) {
    if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(drawing.mime_type)) {
      return "Drawings must be PDF, JPEG, PNG, or WebP files";
    }
    if (drawing.data_url) {
      if (!drawing.data_url.startsWith(`data:${drawing.mime_type};base64,`)) {
        return "Drawing data must be a base64 data URL matching its MIME type";
      }
      if (drawing.data_url.length > MAX_DATA_URL_CHARS) {
        return "Each drawing must be compressed below 2.4 MB";
      }
    }
  }
  return null;
}

function parseOptions(raw: unknown): TakeoffOptions {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const drawingType = value.drawing_type === "elevation" || value.drawing_type === "mixed"
    ? value.drawing_type
    : "floor_plan";
  return {
    drawing_type: drawingType,
    floor_label: typeof value.floor_label === "string" && value.floor_label.trim()
      ? value.floor_label.trim().slice(0, 80)
      : "Main floor",
    notes: typeof value.notes === "string" ? value.notes.trim().slice(0, 1200) : "",
    scale_text: typeof value.scale_text === "string" ? value.scale_text.trim().slice(0, 80) : "",
    width_m: positiveNumber(value.width_m),
    depth_m: positiveNumber(value.depth_m),
    area_m2: positiveNumber(value.area_m2),
  };
}

function floorAreaFromBuildingInfo(buildingInfo: BuildingContext): number | null {
  const rawArea = positiveNumber(buildingInfo.area_m2);
  if (!rawArea || rawArea < 20 || rawArea > 900) return null;
  const floors = clamp(Math.round(positiveNumber(buildingInfo.floors) ?? 1), 1, 5);
  return rawArea / floors;
}

function inferFootprint(options: TakeoffOptions, buildingInfo: BuildingContext): {
  width: number;
  depth: number;
  area: number;
  scaleSource: ScaleSource;
} {
  const width = options.width_m && options.width_m >= 2 && options.width_m <= 80 ? options.width_m : undefined;
  const depth = options.depth_m && options.depth_m >= 2 && options.depth_m <= 80 ? options.depth_m : undefined;
  const explicitArea = options.area_m2 && options.area_m2 >= 12 && options.area_m2 <= 900 ? options.area_m2 : undefined;
  const buildingArea = floorAreaFromBuildingInfo(buildingInfo) ?? undefined;
  const area = explicitArea ?? buildingArea;

  if (width && depth) {
    return { width: round(width), depth: round(depth), area: round(width * depth), scaleSource: "user_dimensions" };
  }
  if (width && area) {
    const inferredDepth = clamp(area / width, 2.4, 45);
    return { width: round(width), depth: round(inferredDepth), area: round(width * inferredDepth), scaleSource: explicitArea ? "user_area" : "building_area" };
  }
  if (depth && area) {
    const inferredWidth = clamp(area / depth, 2.4, 45);
    return { width: round(inferredWidth), depth: round(depth), area: round(inferredWidth * depth), scaleSource: explicitArea ? "user_area" : "building_area" };
  }
  if (area) {
    const ratio = String(buildingInfo.type || "").toLowerCase().includes("rivitalo") ? 1.9 : 1.28;
    const inferredWidth = clamp(Math.sqrt(area * ratio), 4.2, 32);
    const inferredDepth = clamp(area / inferredWidth, 3.2, 28);
    return {
      width: round(inferredWidth),
      depth: round(inferredDepth),
      area: round(inferredWidth * inferredDepth),
      scaleSource: explicitArea ? "user_area" : "building_area",
    };
  }
  if (options.scale_text) {
    return { width: 9.2, depth: 7.4, area: round(9.2 * 7.4), scaleSource: "scale_hint" };
  }
  return { width: 9.2, depth: 7.4, area: round(9.2 * 7.4), scaleSource: "fallback" };
}

function detectRoomTypes(drawings: DrawingInput[], options: TakeoffOptions, buildingInfo: BuildingContext): Set<RoomType> {
  const text = normalizeText([
    ...drawings.map((drawing) => drawing.name),
    options.floor_label,
    options.notes,
    buildingInfo.type ?? "",
  ].join(" "));
  const rooms = new Set<RoomType>(["entry", "living", "kitchen", "bedroom", "bath"]);

  if (/(sauna|loyly|löyly)/.test(text)) rooms.add("sauna");
  if (/(khh|kodinhoito|utility|laundry|tekninen|technical)/.test(text)) rooms.add("utility");
  if (/(2mh|mh2|two bedroom|lasten|kids|bedroom 2)/.test(text)) rooms.add("bedroom");
  if (/(wc|kph|bath|pesu|shower)/.test(text)) rooms.add("bath");
  if (/(keittio|keittiö|kt|kitchen)/.test(text)) rooms.add("kitchen");
  if (/(olohuone|oh|living|lounge)/.test(text)) rooms.add("living");
  return rooms;
}

function room(id: string, name: string, type: RoomType, x: number, z: number, width: number, depth: number, confidence: number): TakeoffRoom {
  return {
    id,
    name,
    type,
    x: round(x),
    z: round(z),
    width_m: round(width),
    depth_m: round(depth),
    area_m2: round(width * depth),
    confidence,
  };
}

function buildRooms(width: number, depth: number, roomTypes: Set<RoomType>, confidence: number): TakeoffRoom[] {
  const left = -width / 2;
  const right = width / 2;
  const back = -depth / 2;
  const front = depth / 2;
  const serviceDepth = clamp(depth * 0.34, 2.2, 3.8);
  const serviceBack = front - serviceDepth;
  const leftBlockWidth = clamp(width * (width * depth >= 95 ? 0.42 : 0.36), 3.1, width * 0.5);
  const splitX = left + leftBlockWidth;
  const entryWidth = clamp(leftBlockWidth * 0.36, 1.2, 2.3);
  const entryRight = left + entryWidth;
  const wetWidth = splitX - entryRight;
  const rooms: TakeoffRoom[] = [];

  if (width * depth >= 95) {
    const bedroomDepth = (serviceBack - back) / 2;
    rooms.push(room("primary_bedroom", "Primary bedroom", "bedroom", left + leftBlockWidth / 2, back + bedroomDepth / 2, leftBlockWidth, bedroomDepth, confidence));
    rooms.push(room("second_bedroom", "Second bedroom", "bedroom", left + leftBlockWidth / 2, back + bedroomDepth * 1.5, leftBlockWidth, bedroomDepth, confidence - 0.04));
  } else {
    rooms.push(room("bedroom", "Bedroom", "bedroom", left + leftBlockWidth / 2, back + (serviceBack - back) / 2, leftBlockWidth, serviceBack - back, confidence));
  }

  rooms.push(room("entry", "Entry", "entry", left + entryWidth / 2, serviceBack + serviceDepth / 2, entryWidth, serviceDepth, confidence));

  if (roomTypes.has("sauna") && roomTypes.has("utility")) {
    rooms.push(room("bath", "Bath", "bath", entryRight + wetWidth * 0.18, serviceBack + serviceDepth / 2, wetWidth * 0.36, serviceDepth, confidence));
    rooms.push(room("sauna", "Sauna", "sauna", entryRight + wetWidth * 0.52, serviceBack + serviceDepth / 2, wetWidth * 0.32, serviceDepth, confidence - 0.03));
    rooms.push(room("utility", "Utility", "utility", entryRight + wetWidth * 0.84, serviceBack + serviceDepth / 2, wetWidth * 0.32, serviceDepth, confidence - 0.05));
  } else if (roomTypes.has("sauna")) {
    rooms.push(room("bath", "Bath", "bath", entryRight + wetWidth * 0.26, serviceBack + serviceDepth / 2, wetWidth * 0.52, serviceDepth, confidence));
    rooms.push(room("sauna", "Sauna", "sauna", entryRight + wetWidth * 0.76, serviceBack + serviceDepth / 2, wetWidth * 0.48, serviceDepth, confidence - 0.03));
  } else if (roomTypes.has("utility")) {
    rooms.push(room("bath", "Bath", "bath", entryRight + wetWidth * 0.29, serviceBack + serviceDepth / 2, wetWidth * 0.58, serviceDepth, confidence));
    rooms.push(room("utility", "Utility", "utility", entryRight + wetWidth * 0.79, serviceBack + serviceDepth / 2, wetWidth * 0.42, serviceDepth, confidence - 0.04));
  } else {
    rooms.push(room("bath", "Bath", "bath", entryRight + wetWidth / 2, serviceBack + serviceDepth / 2, wetWidth, serviceDepth, confidence));
  }

  if (roomTypes.has("kitchen")) {
    const openWidth = right - splitX;
    const kitchenDepth = clamp(depth * 0.32, 2.2, 3.4);
    rooms.push(room("living", "Living", "living", splitX + openWidth / 2, back + (depth - kitchenDepth) / 2, openWidth, depth - kitchenDepth, confidence));
    rooms.push(room("kitchen", "Kitchen", "kitchen", splitX + openWidth / 2, front - kitchenDepth / 2, openWidth, kitchenDepth, confidence));
  } else {
    rooms.push(room("living", "Living", "living", splitX + (right - splitX) / 2, 0, right - splitX, depth, confidence));
  }

  return rooms.map((item) => ({ ...item, confidence: round(clamp(item.confidence, 0.35, 0.86), 2) }));
}

function buildMetrics(width: number, depth: number, rooms: TakeoffRoom[]): QuantityMetrics {
  const floorArea = width * depth;
  const exteriorWallLm = 2 * (width + depth);
  const hasSecondBedroom = rooms.some((item) => item.id === "second_bedroom");
  const wetRoomCount = rooms.filter((item) => item.type === "bath" || item.type === "sauna" || item.type === "utility").length;
  const partitionWallLm = clamp(width * 0.62 + depth * 0.58 + (rooms.length - 4) * 1.4 + wetRoomCount * 0.8, 8, 58);
  const doorCount = clamp(rooms.length + 1, 4, 14);
  const windowCount = clamp(Math.round(floorArea / 14) + (hasSecondBedroom ? 1 : 0), 3, 20);
  const exteriorWallArea = exteriorWallLm * WALL_HEIGHT_M * 0.82;
  const interiorWallBoard = (exteriorWallLm + partitionWallLm * 2) * WALL_HEIGHT_M;
  const wetRoomArea = rooms
    .filter((item) => item.type === "bath" || item.type === "sauna" || item.type === "utility")
    .reduce((sum, item) => sum + item.area_m2, 0);

  return {
    width_m: round(width),
    depth_m: round(depth),
    floor_area_m2: round(floorArea),
    exterior_wall_lm: round(exteriorWallLm),
    partition_wall_lm: round(partitionWallLm),
    exterior_wall_area_m2: round(exteriorWallArea),
    interior_wall_board_m2: round(interiorWallBoard),
    ceiling_area_m2: round(floorArea),
    wet_room_area_m2: round(wetRoomArea),
    door_count: doorCount,
    window_count: windowCount,
  };
}

function confidence(scaleSource: ScaleSource, options: TakeoffOptions, drawings: DrawingInput[], rooms: Set<RoomType>): number {
  let value = 0.42;
  if (scaleSource === "user_dimensions") value += 0.24;
  if (scaleSource === "user_area" || scaleSource === "building_area") value += 0.14;
  if (scaleSource === "scale_hint") value += 0.07;
  if (drawings.some((drawing) => drawing.mime_type === "application/pdf")) value += 0.04;
  if (options.notes) value += 0.08;
  if (rooms.has("sauna") || rooms.has("utility")) value += 0.04;
  return round(clamp(value, 0.36, 0.84), 2);
}

function materialLine(
  materials: Map<string, MaterialRow>,
  materialId: string,
  quantity: number,
  fallbackUnit: string,
  note: string,
  lineConfidence: number,
) {
  const material = materials.get(materialId);
  if (!material) return null;
  const unitPrice = Number(material.unit_price) || 0;
  const unit = material.unit || fallbackUnit;
  return {
    material_id: material.id,
    material_name: material.name,
    category_name: material.category_name,
    quantity: round(quantity),
    unit,
    unit_price: unitPrice,
    total: roundMoney(quantity * unitPrice),
    supplier: material.supplier_name,
    link: material.link,
    confidence: round(clamp(lineConfidence, 0.24, 0.9), 2),
    note,
  };
}

function buildBomSuggestions(metrics: QuantityMetrics, materials: Map<string, MaterialRow>, baseConfidence: number) {
  const gypsumM2 = metrics.interior_wall_board_m2 + metrics.ceiling_area_m2;
  const suggestions = [
    materialLine(materials, "pine_48x98_c24", (metrics.exterior_wall_lm + metrics.partition_wall_lm) * 3.1, "jm", "Stud, plate, and nogging allowance from detected wall runs.", baseConfidence),
    materialLine(materials, "gypsum_board_13mm", gypsumM2, "sqm", "Interior wall and ceiling board surface from detected room envelope.", baseConfidence - 0.04),
    materialLine(materials, "osb_18mm", metrics.floor_area_m2 / OSB_SHEET_AREA_M2, "sheet", "Subfloor panel allowance from detected floor area.", baseConfidence - 0.1),
    materialLine(materials, "insulation_100mm", metrics.exterior_wall_area_m2, "sqm", "Exterior-wall insulation from detected perimeter.", baseConfidence - 0.08),
    materialLine(materials, "vapor_barrier", metrics.exterior_wall_area_m2 + metrics.wet_room_area_m2, "sqm", "Vapour barrier allowance for exterior and wet-room surfaces.", baseConfidence - 0.1),
    materialLine(materials, "door_thermal_bridge", metrics.door_count, "kpl", "Door/opening count detected from room graph; verify product type.", baseConfidence - 0.15),
    materialLine(materials, "trim_21x45", metrics.door_count * 5.2 + metrics.window_count * 6.4, "jm", "Trim allowance around detected doors and windows.", baseConfidence - 0.12),
    materialLine(materials, "exterior_paint_white", Math.max(1, gypsumM2 / 8), "liter", "Paint/finish allowance from boardable surface area; verify finish system.", baseConfidence - 0.16),
  ];
  return suggestions.filter((item): item is Exclude<typeof item, null> => item !== null);
}

function assumptions(scaleSource: ScaleSource, options: TakeoffOptions, drawings: DrawingInput[]): string[] {
  const items = [
    "Planning takeoff only: verify dimensions, wall types, wet-room build-up, and fixture counts before purchasing.",
    "The first release uses drawing metadata, owner scale hints, and Finnish room conventions; CV/LLM extraction can replace the recognizer later.",
  ];
  if (scaleSource === "user_dimensions") items.push("Scale uses owner-provided width and depth.");
  if (scaleSource === "user_area") items.push("Scale uses owner-provided area with inferred missing dimension.");
  if (scaleSource === "building_area") items.push("Scale is inferred from project building_info.area_m2 and floor count.");
  if (scaleSource === "scale_hint") items.push(`Scale text "${options.scale_text}" was captured, but absolute dimensions still need verification.`);
  if (scaleSource === "fallback") items.push("No reliable scale was provided; a typical detached-house floor footprint is used.");
  if (drawings.some((drawing) => drawing.mime_type === "application/pdf")) {
    items.push("PDF drawings are accepted; the overlay is generated from extracted takeoff geometry, not a rendered PDF page.");
  }
  return items;
}

router.post(
  "/projects/:projectId/analyze",
  requireAuth,
  requirePermission("project:read_own"),
  checkCredits("quantityTakeoff"),
  async (req, res) => {
    const drawings = normalizeDrawings(req.body?.drawings);
    const drawingError = validateDrawings(drawings);
    if (drawingError) return res.status(400).json({ error: drawingError });

    const projectResult = await query(
      "SELECT id::text AS id, name, building_info FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
      [req.params.projectId, req.user!.id],
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = projectResult.rows[0];
    const requestBuildingInfo = parseBuildingInfo(req.body?.building_info);
    const projectBuildingInfo = parseBuildingInfo(project.building_info);
    const buildingInfo = { ...projectBuildingInfo, ...requestBuildingInfo };
    const options = parseOptions(req.body?.options);
    const footprint = inferFootprint(options, buildingInfo);
    const roomTypes = detectRoomTypes(drawings, options, buildingInfo);
    const baseConfidence = confidence(footprint.scaleSource, options, drawings, roomTypes);
    const rooms = buildRooms(footprint.width, footprint.depth, roomTypes, baseConfidence);
    const metrics = buildMetrics(footprint.width, footprint.depth, rooms);

    const materialIds = [
      "pine_48x98_c24",
      "gypsum_board_13mm",
      "osb_18mm",
      "insulation_100mm",
      "vapor_barrier",
      "door_thermal_bridge",
      "trim_21x45",
      "exterior_paint_white",
    ];
    const materialResult = await query(
      `SELECT m.id, m.name, c.display_name AS category_name,
              COALESCE(p.unit_price, 0) AS unit_price,
              COALESCE(p.unit, m.design_unit, 'kpl') AS unit,
              s.name AS supplier_name,
              p.link
       FROM materials m
       LEFT JOIN categories c ON m.category_id = c.id
       LEFT JOIN pricing p ON m.id = p.material_id AND p.is_primary = true
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE m.id = ANY($1::text[])`,
      [materialIds],
    );
    const materials = new Map<string, MaterialRow>(
      (materialResult.rows as MaterialRow[]).map((row) => [row.id, row]),
    );

    const bomSuggestions = buildBomSuggestions(metrics, materials, baseConfidence);
    const materialsTotal = bomSuggestions.reduce((sum, item) => sum + item.total, 0);
    const nonCatalogAllowance = roundMoney(metrics.wet_room_area_m2 * 42 + metrics.window_count * 180);
    const mid = roundMoney(materialsTotal + nonCatalogAllowance);
    const estimate = {
      materials_total: roundMoney(materialsTotal),
      non_catalog_allowance: nonCatalogAllowance,
      low: roundMoney(mid * 0.82),
      mid,
      high: roundMoney(mid * 1.24),
    };

    const debit = await deductCreditsForFeature(req.user!.id, "quantityTakeoff", {
      projectId: req.params.projectId,
      drawingCount: drawings.length,
      drawingType: options.drawing_type,
      scaleSource: footprint.scaleSource,
      bomLineCount: bomSuggestions.length,
    });
    if (!debit.ok) {
      return res.status(402).json({
        error: "insufficient_credits",
        feature: "quantityTakeoff",
        cost: debit.cost,
        balance: debit.balance,
        packs: CREDIT_PACKS,
      } satisfies InsufficientCreditsBody);
    }

    res.json({
      project_id: project.id,
      project_name: project.name,
      analysis_mode: process.env.ANTHROPIC_API_KEY ? "catalog_heuristic_ai_ready" : "catalog_heuristic",
      drawings_analyzed: drawings.length,
      source_files: drawings.map((drawing) => ({ name: drawing.name, mime_type: drawing.mime_type, size: drawing.size ?? null })),
      drawing_context: {
        drawing_type: options.drawing_type,
        floor_label: options.floor_label,
        scale_text: options.scale_text || null,
        scale_source: footprint.scaleSource,
        width_m: metrics.width_m,
        depth_m: metrics.depth_m,
        floor_area_m2: metrics.floor_area_m2,
        room_count: rooms.length,
        door_count: metrics.door_count,
        window_count: metrics.window_count,
      },
      detected_quantities: metrics,
      rooms,
      estimate,
      bom_suggestions: bomSuggestions,
      assumptions: assumptions(footprint.scaleSource, options, drawings),
      disclaimer: "Quantity takeoff is a planning estimate, not a contractor quote or structural design. Confirm scale, wall build-ups, wet-room systems, and product choices before buying.",
      credits: {
        cost: CREDIT_COSTS.quantityTakeoff,
        balance: debit.entry.balanceAfter,
      },
    });
  },
);

export default router;
