import JSZip from "jszip";

export type RoomScanSourceFormat = "usdz" | "usd" | "usda" | "usdc" | "json" | "unknown";
export type RoomScanRoomType = "entry" | "living" | "kitchen" | "bedroom" | "bath" | "sauna" | "utility" | "unknown";
export type RoomScanOpeningType = "door" | "window";

export interface RoomScanFileInput {
  name: string;
  mime_type: string;
  size?: number;
  data_url?: string;
}

export interface RoomScanBuildingContext {
  type?: string;
  year_built?: number;
  area_m2?: number;
  floors?: number;
  material?: string;
  heating?: string;
}

export interface RoomScanImportOptions {
  floor_label: string;
  notes: string;
  width_m?: number;
  depth_m?: number;
  area_m2?: number;
}

export interface RoomScanRoom {
  id: string;
  name: string;
  type: RoomScanRoomType;
  x: number;
  z: number;
  width_m: number;
  depth_m: number;
  area_m2: number;
  confidence: number;
}

export interface RoomScanWall {
  id: string;
  start: [number, number];
  end: [number, number];
  length_m: number;
  height_m: number;
  thickness_m: number;
  confidence: number;
}

export interface RoomScanOpening {
  id: string;
  type: RoomScanOpeningType;
  wall_id: string | null;
  x: number;
  z: number;
  width_m: number;
  height_m: number;
  confidence: number;
}

export interface RoomScanSurfaces {
  floor_area_m2: number;
  ceiling_area_m2: number;
  wall_area_m2: number;
  wet_room_area_m2: number;
  opening_count: number;
}

export interface ParsedRoomScan {
  source_format: RoomScanSourceFormat;
  source_detail: string;
  source_files: { name: string; mime_type: string; size: number | null }[];
  floor_label: string;
  width_m: number;
  depth_m: number;
  floor_area_m2: number;
  rooms: RoomScanRoom[];
  walls: RoomScanWall[];
  openings: RoomScanOpening[];
  surfaces: RoomScanSurfaces;
  quality: {
    coverage_percent: number;
    detected_feature_count: number;
    parser: "roomplan_text" | "json" | "fallback";
    warnings: string[];
  };
  assumptions: string[];
  scene_js: string;
}

interface RawRoom {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  x?: unknown;
  z?: unknown;
  width_m?: unknown;
  depth_m?: unknown;
  width?: unknown;
  depth?: unknown;
  dimensions?: { width?: unknown; depth?: unknown };
  position?: { x?: unknown; z?: unknown };
}

interface RawWall {
  id?: unknown;
  start?: unknown;
  end?: unknown;
  height_m?: unknown;
  thickness_m?: unknown;
  height?: unknown;
  thickness?: unknown;
}

interface RawOpening {
  id?: unknown;
  type?: unknown;
  wall_id?: unknown;
  wallId?: unknown;
  x?: unknown;
  z?: unknown;
  width_m?: unknown;
  height_m?: unknown;
  width?: unknown;
  height?: unknown;
}

interface UsdFeature {
  kind: "room" | "wall" | "door" | "window";
  name: string;
  translate: [number, number, number];
  dims: [number, number, number];
}

const DEFAULT_WIDTH = 9.2;
const DEFAULT_DEPTH = 7.4;
const DEFAULT_WALL_HEIGHT = 2.7;
const DEFAULT_WALL_THICKNESS = 0.16;

function round(value: number, digits = 1): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function round2(value: number): number {
  return round(value, 2);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function positiveNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function safeDimension(value: unknown, min = 0.2, max = 80): number | undefined {
  const parsed = positiveNumber(value);
  if (!parsed || parsed < min || parsed > max) return undefined;
  return parsed;
}

function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || "scan_item";
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ");
}

function roomTypeFromName(name: string): RoomScanRoomType {
  const text = normalizeText(name);
  if (/(entry|eteinen|hall|porch)/.test(text)) return "entry";
  if (/(living|olohuone|lounge|oh)/.test(text)) return "living";
  if (/(kitchen|keittio|kt)/.test(text)) return "kitchen";
  if (/(bed|mh|makuuhuone|sleep)/.test(text)) return "bedroom";
  if (/(bath|wc|kph|pesu|shower)/.test(text)) return "bath";
  if (/(sauna|loyly)/.test(text)) return "sauna";
  if (/(utility|laundry|khh|technical|tekninen)/.test(text)) return "utility";
  return "unknown";
}

function sourceFormat(file: RoomScanFileInput): RoomScanSourceFormat {
  const name = file.name.toLowerCase();
  const mime = file.mime_type.toLowerCase();
  if (name.endsWith(".usdz") || mime.includes("usdz")) return "usdz";
  if (name.endsWith(".usda")) return "usda";
  if (name.endsWith(".usd") || mime.includes("usd")) return "usd";
  if (name.endsWith(".usdc")) return "usdc";
  if (name.endsWith(".json") || mime.includes("json")) return "json";
  return "unknown";
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const comma = dataUrl.indexOf(",");
  if (comma === -1 || !dataUrl.slice(0, comma).includes(";base64")) return null;
  try {
    return Buffer.from(dataUrl.slice(comma + 1), "base64");
  } catch {
    return null;
  }
}

async function extractText(file: RoomScanFileInput): Promise<{ text: string | null; detail: string; warnings: string[] }> {
  if (!file.data_url) {
    return { text: null, detail: "No scan payload was attached; metadata fallback used.", warnings: ["No scan payload was attached."] };
  }

  const format = sourceFormat(file);
  const buffer = dataUrlToBuffer(file.data_url);
  if (!buffer) {
    return { text: null, detail: "Scan payload was not a valid base64 data URL.", warnings: ["Invalid scan data URL."] };
  }

  if (format === "usdz") {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const usdFile = Object.values(zip.files).find((entry) => /\.(usd|usda|json)$/i.test(entry.name) && !entry.dir);
      if (!usdFile) {
        return {
          text: null,
          detail: "USDZ archive did not contain an ASCII USD/USDA sidecar.",
          warnings: ["Binary-only USDZ/USDC archives can be stored but need an iOS/native parser for exact geometry."],
        };
      }
      return {
        text: await usdFile.async("text"),
        detail: `Parsed ${usdFile.name} from USDZ archive.`,
        warnings: [],
      };
    } catch {
      return {
        text: null,
        detail: "USDZ archive could not be opened.",
        warnings: ["The USDZ archive could not be opened; export as ASCII USD/USDA if this repeats."],
      };
    }
  }

  if (format === "usdc") {
    return {
      text: null,
      detail: "USDC binary scan received.",
      warnings: ["Binary USDC geometry is accepted as a scan artifact, but this importer needs ASCII USD/USDA or JSON for exact dimensions."],
    };
  }

  return {
    text: buffer.toString("utf8"),
    detail: format === "json" ? "Parsed JSON scan export." : "Parsed ASCII USD/USDA scan export.",
    warnings: [],
  };
}

function parseTuple(value: unknown): [number, number] | null {
  if (Array.isArray(value) && value.length >= 2) {
    const x = Number(value[0]);
    const z = Number(value[1]);
    if (Number.isFinite(x) && Number.isFinite(z)) return [round2(x), round2(z)];
  }
  if (value && typeof value === "object") {
    const obj = value as { x?: unknown; z?: unknown };
    const x = Number(obj.x);
    const z = Number(obj.z);
    if (Number.isFinite(x) && Number.isFinite(z)) return [round2(x), round2(z)];
  }
  return null;
}

function parseJsonScan(text: string): { rooms: RoomScanRoom[]; walls: RoomScanWall[]; openings: RoomScanOpening[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const root = parsed as { rooms?: unknown; walls?: unknown; openings?: unknown };

  const rooms = Array.isArray(root.rooms)
    ? root.rooms.map((raw, index) => {
        const room = raw as RawRoom;
        const width = safeDimension(room.width_m ?? room.width ?? room.dimensions?.width, 0.8, 40) ?? 3;
        const depth = safeDimension(room.depth_m ?? room.depth ?? room.dimensions?.depth, 0.8, 40) ?? 3;
        const id = typeof room.id === "string" && room.id.trim() ? room.id.trim() : `room_${index + 1}`;
        const name = typeof room.name === "string" && room.name.trim() ? room.name.trim() : `Room ${index + 1}`;
        return {
          id: slug(id),
          name,
          type: roomTypeFromName(`${room.type ?? ""} ${name}`),
          x: round2(Number(room.x ?? room.position?.x ?? 0) || 0),
          z: round2(Number(room.z ?? room.position?.z ?? 0) || 0),
          width_m: round2(width),
          depth_m: round2(depth),
          area_m2: round2(width * depth),
          confidence: 0.82,
        };
      })
    : [];

  const walls = Array.isArray(root.walls)
    ? root.walls.map((raw, index) => {
        const wall = raw as RawWall;
        const start = parseTuple(wall.start) ?? [0, index] as [number, number];
        const end = parseTuple(wall.end) ?? [3, index] as [number, number];
        const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
        return {
          id: slug(typeof wall.id === "string" ? wall.id : `wall_${index + 1}`),
          start,
          end,
          length_m: round2(length),
          height_m: safeDimension(wall.height_m ?? wall.height, 1.8, 5) ?? DEFAULT_WALL_HEIGHT,
          thickness_m: safeDimension(wall.thickness_m ?? wall.thickness, 0.04, 0.6) ?? DEFAULT_WALL_THICKNESS,
          confidence: 0.82,
        };
      })
    : [];

  const openings = Array.isArray(root.openings)
    ? root.openings.map((raw, index) => {
        const opening = raw as RawOpening;
        const type: RoomScanOpeningType = normalizeText(String(opening.type ?? "")).includes("window") ? "window" : "door";
        return {
          id: slug(typeof opening.id === "string" ? opening.id : `${type}_${index + 1}`),
          type,
          wall_id: typeof opening.wall_id === "string" ? opening.wall_id : typeof opening.wallId === "string" ? opening.wallId : null,
          x: round2(Number(opening.x ?? 0) || 0),
          z: round2(Number(opening.z ?? 0) || 0),
          width_m: safeDimension(opening.width_m ?? opening.width, 0.2, 5) ?? (type === "window" ? 1.2 : 0.9),
          height_m: safeDimension(opening.height_m ?? opening.height, 0.2, 3) ?? (type === "window" ? 1.1 : 2.1),
          confidence: 0.78,
        };
      })
    : [];

  if (rooms.length === 0 && walls.length === 0 && openings.length === 0) return null;
  return { rooms, walls, openings };
}

function vectorFromBlock(block: string, keys: string[]): [number, number, number] | null {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`${escaped}[^=]*=\\s*\\(([-0-9.,\\s]+)\\)`, "i").exec(block);
    if (!match) continue;
    const parts = match[1].split(",").map((part) => Number(part.trim()));
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      return [parts[0], parts[1], parts[2]];
    }
  }
  return null;
}

function extentDims(block: string): [number, number, number] | null {
  const match = /extent\s*=\s*\[\s*\(([-0-9.,\s]+)\)\s*,\s*\(([-0-9.,\s]+)\)\s*\]/i.exec(block);
  if (!match) return null;
  const min = match[1].split(",").map((part) => Number(part.trim()));
  const max = match[2].split(",").map((part) => Number(part.trim()));
  if (min.length < 3 || max.length < 3 || !min.every(Number.isFinite) || !max.every(Number.isFinite)) return null;
  return [Math.abs(max[0] - min[0]), Math.abs(max[1] - min[1]), Math.abs(max[2] - min[2])];
}

function classifyUsdFeature(name: string, block: string): UsdFeature["kind"] | null {
  const text = normalizeText(`${name} ${block.slice(0, 800)}`);
  if (/(window|ikkuna|opening window)/.test(text)) return "window";
  if (/(door|ovi|opening door)/.test(text)) return "door";
  if (/(wall|seina)/.test(text)) return "wall";
  if (/(room|floorarea|space|huone|living|kitchen|bed|bath|sauna|utility|entry)/.test(text)) return "room";
  return null;
}

function parseUsdFeatures(text: string): UsdFeature[] {
  const features: UsdFeature[] = [];
  const blockRegex = /(?:def|over)\s+\w+\s+"([^"]+)"\s*\{([\s\S]*?)(?:\n\s*\})/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(text)) !== null) {
    const [, name, block] = match;
    const kind = classifyUsdFeature(name, block);
    if (!kind) continue;
    const translate = vectorFromBlock(block, ["xformOp:translate", "translate"]) ?? [0, 0, 0];
    const dims = vectorFromBlock(block, ["xformOp:scale", "dimensions", "size"]) ?? extentDims(block);
    if (!dims) continue;
    features.push({ kind, name, translate, dims });
  }
  return features;
}

function featureToRoom(feature: UsdFeature, index: number): RoomScanRoom | null {
  const width = safeDimension(Math.abs(feature.dims[0]), 0.8, 60);
  const depth = safeDimension(Math.max(Math.abs(feature.dims[2]), Math.abs(feature.dims[1])), 0.8, 60);
  if (!width || !depth) return null;
  const name = feature.name.replace(/[_-]+/g, " ");
  return {
    id: slug(feature.name || `room_${index + 1}`),
    name,
    type: roomTypeFromName(name),
    x: round2(feature.translate[0]),
    z: round2(feature.translate[2]),
    width_m: round2(width),
    depth_m: round2(depth),
    area_m2: round2(width * depth),
    confidence: 0.74,
  };
}

function featureToWall(feature: UsdFeature, index: number): RoomScanWall | null {
  const horizontalX = Math.abs(feature.dims[0]);
  const horizontalZ = Math.abs(feature.dims[2]) || Math.abs(feature.dims[1]);
  const length = safeDimension(Math.max(horizontalX, horizontalZ), 0.5, 80);
  if (!length) return null;
  const thickness = safeDimension(Math.min(horizontalX || DEFAULT_WALL_THICKNESS, horizontalZ || DEFAULT_WALL_THICKNESS), 0.04, 0.8) ?? DEFAULT_WALL_THICKNESS;
  const height = safeDimension(Math.abs(feature.dims[1]), 1.8, 5) ?? DEFAULT_WALL_HEIGHT;
  const x = feature.translate[0];
  const z = feature.translate[2];
  const alongX = horizontalX >= horizontalZ;
  const start: [number, number] = alongX ? [x - length / 2, z] : [x, z - length / 2];
  const end: [number, number] = alongX ? [x + length / 2, z] : [x, z + length / 2];
  return {
    id: slug(feature.name || `wall_${index + 1}`),
    start: [round2(start[0]), round2(start[1])],
    end: [round2(end[0]), round2(end[1])],
    length_m: round2(length),
    height_m: round2(height),
    thickness_m: round2(thickness),
    confidence: 0.72,
  };
}

function featureToOpening(feature: UsdFeature, index: number): RoomScanOpening | null {
  const type = feature.kind === "window" ? "window" : "door";
  const width = safeDimension(Math.max(Math.abs(feature.dims[0]), Math.abs(feature.dims[2])), 0.2, 5) ?? (type === "window" ? 1.2 : 0.9);
  const height = safeDimension(Math.abs(feature.dims[1]), 0.2, 3) ?? (type === "window" ? 1.1 : 2.1);
  return {
    id: slug(feature.name || `${type}_${index + 1}`),
    type,
    wall_id: null,
    x: round2(feature.translate[0]),
    z: round2(feature.translate[2]),
    width_m: round2(width),
    height_m: round2(height),
    confidence: 0.68,
  };
}

function roomBounds(rooms: RoomScanRoom[]): { left: number; right: number; back: number; front: number } | null {
  if (rooms.length === 0) return null;
  return rooms.reduce((bounds, room) => ({
    left: Math.min(bounds.left, room.x - room.width_m / 2),
    right: Math.max(bounds.right, room.x + room.width_m / 2),
    back: Math.min(bounds.back, room.z - room.depth_m / 2),
    front: Math.max(bounds.front, room.z + room.depth_m / 2),
  }), {
    left: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    back: Number.POSITIVE_INFINITY,
    front: Number.NEGATIVE_INFINITY,
  });
}

function wallBounds(walls: RoomScanWall[]): { left: number; right: number; back: number; front: number } | null {
  if (walls.length === 0) return null;
  return walls.reduce((bounds, wall) => ({
    left: Math.min(bounds.left, wall.start[0], wall.end[0]),
    right: Math.max(bounds.right, wall.start[0], wall.end[0]),
    back: Math.min(bounds.back, wall.start[1], wall.end[1]),
    front: Math.max(bounds.front, wall.start[1], wall.end[1]),
  }), {
    left: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    back: Number.POSITIVE_INFINITY,
    front: Number.NEGATIVE_INFINITY,
  });
}

function wallsFromRooms(rooms: RoomScanRoom[]): RoomScanWall[] {
  const bounds = roomBounds(rooms);
  if (!bounds) return [];
  const height = DEFAULT_WALL_HEIGHT;
  const thickness = DEFAULT_WALL_THICKNESS;
  const outer = [
    { id: "scan_wall_north", start: [bounds.left, bounds.back] as [number, number], end: [bounds.right, bounds.back] as [number, number] },
    { id: "scan_wall_south", start: [bounds.left, bounds.front] as [number, number], end: [bounds.right, bounds.front] as [number, number] },
    { id: "scan_wall_west", start: [bounds.left, bounds.back] as [number, number], end: [bounds.left, bounds.front] as [number, number] },
    { id: "scan_wall_east", start: [bounds.right, bounds.back] as [number, number], end: [bounds.right, bounds.front] as [number, number] },
  ];
  return outer.map((wall) => ({
    ...wall,
    start: [round2(wall.start[0]), round2(wall.start[1])] as [number, number],
    end: [round2(wall.end[0]), round2(wall.end[1])] as [number, number],
    length_m: round2(Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1])),
    height_m: height,
    thickness_m: thickness,
    confidence: 0.48,
  }));
}

function roomFromWallBounds(walls: RoomScanWall[]): RoomScanRoom[] {
  const bounds = wallBounds(walls);
  if (!bounds) return [];
  const width = clamp(bounds.right - bounds.left, 2, 80);
  const depth = clamp(bounds.front - bounds.back, 2, 80);
  return [{
    id: "scanned_room_envelope",
    name: "Scanned room envelope",
    type: "unknown",
    x: round2(bounds.left + width / 2),
    z: round2(bounds.back + depth / 2),
    width_m: round2(width),
    depth_m: round2(depth),
    area_m2: round2(width * depth),
    confidence: 0.46,
  }];
}

function inferDimensions(options: RoomScanImportOptions, building: RoomScanBuildingContext): { width: number; depth: number; area: number; source: string } {
  const width = safeDimension(options.width_m, 2, 80);
  const depth = safeDimension(options.depth_m, 2, 80);
  const area = safeDimension(options.area_m2, 8, 900);
  const buildingArea = safeDimension(building.area_m2, 20, 900);
  const floors = clamp(Math.round(safeDimension(building.floors, 1, 5) ?? 1), 1, 5);
  const floorArea = area ?? (buildingArea ? buildingArea / floors : undefined);

  if (width && depth) return { width: round2(width), depth: round2(depth), area: round2(width * depth), source: "owner dimensions" };
  if (width && floorArea) return { width: round2(width), depth: round2(clamp(floorArea / width, 2.4, 45)), area: round2(floorArea), source: "owner width + area" };
  if (depth && floorArea) return { width: round2(clamp(floorArea / depth, 2.4, 45)), depth: round2(depth), area: round2(floorArea), source: "owner depth + area" };
  if (floorArea) {
    const inferredWidth = clamp(Math.sqrt(floorArea * 1.28), 4.2, 32);
    return { width: round2(inferredWidth), depth: round2(floorArea / inferredWidth), area: round2(floorArea), source: area ? "owner area" : "building area" };
  }
  return { width: DEFAULT_WIDTH, depth: DEFAULT_DEPTH, area: round2(DEFAULT_WIDTH * DEFAULT_DEPTH), source: "fallback footprint" };
}

function fallbackRooms(width: number, depth: number, notes: string): RoomScanRoom[] {
  const types = new Set<RoomScanRoomType>(["entry", "living", "kitchen", "bedroom", "bath"]);
  const text = normalizeText(notes);
  if (/(sauna|loyly)/.test(text)) types.add("sauna");
  if (/(khh|utility|laundry|tekninen)/.test(text)) types.add("utility");
  const left = -width / 2;
  const back = -depth / 2;
  const serviceDepth = clamp(depth * 0.34, 2.2, 3.6);
  const serviceBack = depth / 2 - serviceDepth;
  const leftWidth = clamp(width * 0.36, 3.1, width * 0.48);
  const rooms: RoomScanRoom[] = [
    { id: "scan_bedroom", name: "Bedroom", type: "bedroom", x: round2(left + leftWidth / 2), z: round2(back + (serviceBack - back) / 2), width_m: round2(leftWidth), depth_m: round2(serviceBack - back), area_m2: round2(leftWidth * (serviceBack - back)), confidence: 0.36 },
    { id: "scan_entry", name: "Entry", type: "entry", x: round2(left + leftWidth * 0.18), z: round2(serviceBack + serviceDepth / 2), width_m: round2(leftWidth * 0.36), depth_m: round2(serviceDepth), area_m2: round2(leftWidth * 0.36 * serviceDepth), confidence: 0.36 },
    { id: "scan_bath", name: types.has("sauna") ? "Bath / sauna zone" : "Bath", type: types.has("sauna") ? "sauna" : "bath", x: round2(left + leftWidth * 0.68), z: round2(serviceBack + serviceDepth / 2), width_m: round2(leftWidth * 0.64), depth_m: round2(serviceDepth), area_m2: round2(leftWidth * 0.64 * serviceDepth), confidence: 0.34 },
    { id: "scan_living", name: "Living / kitchen", type: "living", x: round2(left + leftWidth + (width - leftWidth) / 2), z: 0, width_m: round2(width - leftWidth), depth_m: round2(depth), area_m2: round2((width - leftWidth) * depth), confidence: 0.36 },
  ];
  if (types.has("utility")) {
    rooms.push({ id: "scan_utility", name: "Utility", type: "utility", x: round2(left + leftWidth * 0.85), z: round2(serviceBack + serviceDepth / 2), width_m: round2(leftWidth * 0.3), depth_m: round2(serviceDepth), area_m2: round2(leftWidth * 0.3 * serviceDepth), confidence: 0.32 });
  }
  return rooms;
}

function surfaces(rooms: RoomScanRoom[], walls: RoomScanWall[], openings: RoomScanOpening[], footprintArea: number): RoomScanSurfaces {
  const floorArea = rooms.length > 0
    ? rooms.reduce((sum, room) => sum + room.area_m2, 0)
    : footprintArea;
  const wallArea = walls.reduce((sum, wall) => sum + wall.length_m * wall.height_m, 0);
  const wetRoomArea = rooms
    .filter((room) => room.type === "bath" || room.type === "sauna" || room.type === "utility")
    .reduce((sum, room) => sum + room.area_m2, 0);
  return {
    floor_area_m2: round(floorArea),
    ceiling_area_m2: round(floorArea),
    wall_area_m2: round(wallArea > 0 ? wallArea : Math.sqrt(floorArea) * 4 * DEFAULT_WALL_HEIGHT),
    wet_room_area_m2: round(wetRoomArea),
    opening_count: openings.length,
  };
}

function scanDimensions(rooms: RoomScanRoom[], walls: RoomScanWall[], fallback: { width: number; depth: number; area: number }): { width: number; depth: number; area: number } {
  const bounds = roomBounds(rooms) ?? wallBounds(walls);
  if (!bounds) return fallback;
  const width = clamp(bounds.right - bounds.left, 1, 120);
  const depth = clamp(bounds.front - bounds.back, 1, 120);
  return { width: round2(width), depth: round2(depth), area: round2(width * depth) };
}

function buildQuality(rooms: RoomScanRoom[], walls: RoomScanWall[], openings: RoomScanOpening[], floorArea: number, parser: ParsedRoomScan["quality"]["parser"], warnings: string[]) {
  const roomArea = rooms.reduce((sum, room) => sum + room.area_m2, 0);
  const areaCoverage = floorArea > 0 ? (roomArea / floorArea) * 100 : 0;
  const wallCoverage = walls.length >= 4 ? 18 : walls.length * 4;
  const openingBonus = Math.min(12, openings.length * 2);
  const coverage = parser === "fallback"
    ? clamp(areaCoverage || 42, 28, 55)
    : clamp(Math.max(areaCoverage, 45) + wallCoverage + openingBonus, 45, 96);
  return {
    coverage_percent: Math.round(coverage),
    detected_feature_count: rooms.length + walls.length + openings.length,
    parser,
    warnings,
  };
}

function jsNum(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function addBox(lines: string[], id: string, width: number, height: number, depth: number, x: number, y: number, z: number, material: string, color: [number, number, number]) {
  const safeId = slug(id);
  lines.push(`const ${safeId} = translate(box(${jsNum(width)}, ${jsNum(height)}, ${jsNum(depth)}), ${jsNum(x)}, ${jsNum(y)}, ${jsNum(z)});`);
  lines.push(`scene.add(${safeId}, { material: "${material}", color: [${color.map((part) => jsNum(part)).join(", ")}] });`);
}

export function buildRoomScanSceneJs(scan: Omit<ParsedRoomScan, "scene_js">): string {
  const lines = [
    "// Helscoop LiDAR / RoomPlan scan import.",
    `// Source: ${scan.source_detail}`,
    `// Floor: ${scan.floor_label}; quality: ${scan.quality.coverage_percent}% coverage, ${scan.quality.detected_feature_count} detected features.`,
    "// Verify dimensions before permits, purchases, or contractor handoff.",
    "",
  ];
  addBox(lines, "room_scan_floor", scan.width_m, 0.08, scan.depth_m, 0, 0.04, 0, "foundation", [0.48, 0.5, 0.46]);
  for (const wall of scan.walls) {
    const dx = wall.end[0] - wall.start[0];
    const dz = wall.end[1] - wall.start[1];
    const length = Math.max(0.1, wall.length_m);
    const alongX = Math.abs(dx) >= Math.abs(dz);
    const x = (wall.start[0] + wall.end[0]) / 2;
    const z = (wall.start[1] + wall.end[1]) / 2;
    addBox(
      lines,
      wall.id,
      alongX ? length : wall.thickness_m,
      wall.height_m,
      alongX ? wall.thickness_m : length,
      x,
      0.08 + wall.height_m / 2,
      z,
      "pine_48x98_c24",
      [0.74, 0.64, 0.48],
    );
  }
  for (const room of scan.rooms) {
    addBox(
      lines,
      `${room.id}_zone`,
      Math.max(0.1, room.width_m - 0.14),
      0.035,
      Math.max(0.1, room.depth_m - 0.14),
      room.x,
      0.11,
      room.z,
      "room_scan_zone",
      room.type === "bath" || room.type === "sauna" ? [0.42, 0.62, 0.72] : [0.62, 0.7, 0.56],
    );
  }
  for (const opening of scan.openings) {
    const material = opening.type === "window" ? "glass" : "door_thermal_bridge";
    const color: [number, number, number] = opening.type === "window" ? [0.36, 0.58, 0.78] : [0.38, 0.28, 0.2];
    addBox(lines, opening.id, opening.width_m, opening.height_m, 0.08, opening.x, 0.08 + opening.height_m / 2, opening.z, material, color);
  }
  lines.push("");
  lines.push("// Imported scan geometry is appended as editable boxes/zones; keep or delete individual objects as needed.");
  return `${lines.join("\n")}\n`;
}

export async function parseRoomScanImport(
  files: RoomScanFileInput[],
  options: RoomScanImportOptions,
  building: RoomScanBuildingContext,
): Promise<ParsedRoomScan> {
  const primary = files[0];
  const fallback = inferDimensions(options, building);
  const format = primary ? sourceFormat(primary) : "unknown";
  const extraction = primary
    ? await extractText(primary)
    : { text: null, detail: "No scan file supplied.", warnings: ["No scan file supplied."] };

  let rooms: RoomScanRoom[] = [];
  let walls: RoomScanWall[] = [];
  let openings: RoomScanOpening[] = [];
  let parser: ParsedRoomScan["quality"]["parser"] = "fallback";
  const warnings = [...extraction.warnings];

  if (extraction.text) {
    const json = parseJsonScan(extraction.text);
    if (json) {
      rooms = json.rooms;
      walls = json.walls;
      openings = json.openings;
      parser = "json";
    } else {
      const features = parseUsdFeatures(extraction.text);
      rooms = features.filter((feature) => feature.kind === "room").map(featureToRoom).filter((room): room is RoomScanRoom => room !== null);
      walls = features.filter((feature) => feature.kind === "wall").map(featureToWall).filter((wall): wall is RoomScanWall => wall !== null);
      openings = features
        .filter((feature) => feature.kind === "door" || feature.kind === "window")
        .map(featureToOpening)
        .filter((opening): opening is RoomScanOpening => opening !== null);
      if (features.length > 0) parser = "roomplan_text";
    }
  }

  if (rooms.length === 0 && walls.length > 0) {
    rooms = roomFromWallBounds(walls);
    warnings.push("Rooms were inferred from wall envelope because the scan did not expose named room volumes.");
  }
  if (walls.length === 0 && rooms.length > 0) {
    walls = wallsFromRooms(rooms);
    warnings.push("Wall envelope was inferred from scanned room extents.");
  }
  if (rooms.length === 0 && walls.length === 0) {
    rooms = fallbackRooms(fallback.width, fallback.depth, options.notes);
    walls = wallsFromRooms(rooms);
    parser = "fallback";
    warnings.push(`Exact geometry was unavailable, so dimensions use ${fallback.source}.`);
  }

  const dimensions = scanDimensions(rooms, walls, fallback);
  const scanSurfaces = surfaces(rooms, walls, openings, dimensions.area);
  const quality = buildQuality(rooms, walls, openings, dimensions.area, parser, warnings);
  const base: Omit<ParsedRoomScan, "scene_js"> = {
    source_format: format,
    source_detail: extraction.detail,
    source_files: files.map((file) => ({ name: file.name, mime_type: file.mime_type, size: file.size ?? null })),
    floor_label: options.floor_label,
    width_m: dimensions.width,
    depth_m: dimensions.depth,
    floor_area_m2: round(dimensions.area),
    rooms,
    walls,
    openings,
    surfaces: scanSurfaces,
    quality,
    assumptions: [
      "RoomPlan/LiDAR import is a planning model, not a certified measurement report.",
      "Wall types, wet-room build-up, and product selections must be verified before purchase or permit work.",
      parser === "roomplan_text"
        ? "Geometry came from ASCII USD/USDA transform data extracted from the scan export."
        : parser === "json"
          ? "Geometry came from a structured scan JSON export."
          : "Geometry used metadata fallback because exact scan primitives were not readable.",
    ],
  };
  return {
    ...base,
    scene_js: buildRoomScanSceneJs(base),
  };
}
