import type { BuildingInfo } from "@/types";

export type BlueprintRoomType =
  | "entry"
  | "living"
  | "kitchen"
  | "bedroom"
  | "bath"
  | "sauna"
  | "utility";

export type BlueprintScaleSource = "user_dimensions" | "user_width_area" | "user_depth_area" | "building_area" | "fallback";

export interface BlueprintRecognitionInput {
  fileName: string;
  mimeType?: string;
  projectName?: string;
  floorLabel?: string;
  notes?: string;
  widthMeters?: number | null;
  depthMeters?: number | null;
  buildingInfo?: BuildingInfo | null;
}

export interface BlueprintRoom {
  id: string;
  name: string;
  type: BlueprintRoomType;
  x: number;
  z: number;
  width: number;
  depth: number;
  areaM2: number;
}

export interface BlueprintOpening {
  id: string;
  type: "door" | "window";
  wall: "north" | "south" | "east" | "west" | "partition";
  x: number;
  z: number;
  width: number;
  connects: string[];
}

export interface BlueprintRecognitionResult {
  sourceFileName: string;
  sourceMimeType: string;
  projectName?: string;
  floorLabel: string;
  widthMeters: number;
  depthMeters: number;
  areaM2: number;
  scaleSource: BlueprintScaleSource;
  confidence: number;
  confidenceLabel: "low" | "medium" | "draft";
  rooms: BlueprintRoom[];
  openings: BlueprintOpening[];
  partitionWallCount: number;
  assumptions: string[];
  sceneJs: string;
}

interface Bounds {
  left: number;
  right: number;
  back: number;
  front: number;
}

interface PartitionWall {
  id: string;
  orientation: "vertical" | "horizontal";
  x: number;
  z: number;
  length: number;
}

interface LayoutResult {
  rooms: BlueprintRoom[];
  openings: BlueprintOpening[];
  partitions: PartitionWall[];
}

const DEFAULT_WIDTH = 9.2;
const DEFAULT_DEPTH = 7.4;
const DEFAULT_AREA = DEFAULT_WIDTH * DEFAULT_DEPTH;

const ROOM_COLORS: Record<BlueprintRoomType, [number, number, number]> = {
  entry: [0.73, 0.68, 0.55],
  living: [0.7, 0.76, 0.64],
  kitchen: [0.77, 0.67, 0.52],
  bedroom: [0.58, 0.66, 0.76],
  bath: [0.52, 0.68, 0.78],
  sauna: [0.69, 0.56, 0.44],
  utility: [0.56, 0.6, 0.63],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeDimension(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 1.5 || value > 80) return null;
  return value;
}

function safeFileName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : "floor-plan";
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ");
}

function includesAny(text: string, keywords: string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function identifier(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned.length > 0 ? cleaned : "blueprint_object";
}

function jsNum(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function jsColor(color: [number, number, number]): string {
  return `[${color.map((part) => Number(part.toFixed(2))).join(", ")}]`;
}

function floorAreaFromBuildingInfo(buildingInfo?: BuildingInfo | null): number | null {
  const rawArea = buildingInfo?.area_m2;
  if (typeof rawArea !== "number" || !Number.isFinite(rawArea) || rawArea < 20 || rawArea > 600) {
    return null;
  }
  const floors = typeof buildingInfo?.floors === "number" && Number.isFinite(buildingInfo.floors)
    ? clamp(Math.round(buildingInfo.floors), 1, 4)
    : 1;
  return rawArea / floors;
}

function inferDimensions(input: BlueprintRecognitionInput): {
  width: number;
  depth: number;
  area: number;
  scaleSource: BlueprintScaleSource;
} {
  const userWidth = safeDimension(input.widthMeters);
  const userDepth = safeDimension(input.depthMeters);
  const buildingArea = floorAreaFromBuildingInfo(input.buildingInfo);

  if (userWidth && userDepth) {
    return {
      width: round2(userWidth),
      depth: round2(userDepth),
      area: round2(userWidth * userDepth),
      scaleSource: "user_dimensions",
    };
  }

  if (userWidth && buildingArea) {
    const depth = clamp(buildingArea / userWidth, 2.4, 40);
    return {
      width: round2(userWidth),
      depth: round2(depth),
      area: round2(userWidth * depth),
      scaleSource: "user_width_area",
    };
  }

  if (userDepth && buildingArea) {
    const width = clamp(buildingArea / userDepth, 2.4, 40);
    return {
      width: round2(width),
      depth: round2(userDepth),
      area: round2(width * userDepth),
      scaleSource: "user_depth_area",
    };
  }

  if (buildingArea) {
    const width = clamp(Math.sqrt(buildingArea * 1.28), 4.5, 28);
    const depth = clamp(buildingArea / width, 4, 24);
    return {
      width: round2(width),
      depth: round2(depth),
      area: round2(width * depth),
      scaleSource: "building_area",
    };
  }

  return {
    width: DEFAULT_WIDTH,
    depth: DEFAULT_DEPTH,
    area: round2(DEFAULT_AREA),
    scaleSource: "fallback",
  };
}

function detectRoomTypes(input: BlueprintRecognitionInput, area: number): Set<BlueprintRoomType> {
  const text = normalizeText(`${input.fileName} ${input.projectName ?? ""} ${input.floorLabel ?? ""} ${input.notes ?? ""}`);
  const types = new Set<BlueprintRoomType>(["entry", "living", "kitchen", "bedroom", "bath"]);

  if (includesAny(text, ["sauna", "loyly", "pesuhuone"])) types.add("sauna");
  if (includesAny(text, ["utility", "laundry", "kodinhoito", "khh", "technical", "tekninen"])) types.add("utility");
  if (includesAny(text, ["wc", "bath", "kph", "shower", "pesu"])) types.add("bath");
  if (includesAny(text, ["kitchen", "keittio", "kt"])) types.add("kitchen");
  if (includesAny(text, ["living", "olohuone", "oh", "lounge"])) types.add("living");
  if (area >= 95 || includesAny(text, ["mh2", "2mh", "bedroom 2", "two bedroom", "kids", "lasten"])) {
    types.add("bedroom");
  }

  return types;
}

function roomFromBounds(id: string, name: string, type: BlueprintRoomType, bounds: Bounds): BlueprintRoom {
  const width = round2(bounds.right - bounds.left);
  const depth = round2(bounds.front - bounds.back);
  return {
    id,
    name,
    type,
    x: round2(bounds.left + width / 2),
    z: round2(bounds.back + depth / 2),
    width,
    depth,
    areaM2: round2(width * depth),
  };
}

function buildLayout(width: number, depth: number, roomTypes: Set<BlueprintRoomType>): LayoutResult {
  const left = -width / 2;
  const right = width / 2;
  const back = -depth / 2;
  const front = depth / 2;

  const leftBlockWidth = clamp(width * (width * depth >= 95 ? 0.42 : 0.36), 3.1, width * 0.48);
  const splitX = round2(left + leftBlockWidth);
  const serviceDepth = clamp(depth * 0.34, 2.35, 3.8);
  const serviceBack = round2(front - serviceDepth);
  const entryWidth = clamp(leftBlockWidth * 0.36, 1.25, 2.35);
  const kitchenBack = round2(front - clamp(depth * 0.32, 2.2, 3.4));
  const hasSecondBedroom = width * depth >= 95;
  const hasSauna = roomTypes.has("sauna");
  const hasUtility = roomTypes.has("utility");

  const rooms: BlueprintRoom[] = [];
  const openings: BlueprintOpening[] = [];
  const partitions: PartitionWall[] = [
    { id: "private_open_partition", orientation: "vertical", x: splitX, z: 0, length: depth - 0.24 },
    { id: "service_sleeping_partition", orientation: "horizontal", x: left + leftBlockWidth / 2, z: serviceBack, length: leftBlockWidth - 0.12 },
  ];

  if (hasSecondBedroom) {
    const bedroomSplitZ = round2(back + (serviceBack - back) / 2);
    rooms.push(roomFromBounds("primary_bedroom", "Primary bedroom", "bedroom", {
      left,
      right: splitX,
      back,
      front: bedroomSplitZ,
    }));
    rooms.push(roomFromBounds("second_bedroom", "Second bedroom", "bedroom", {
      left,
      right: splitX,
      back: bedroomSplitZ,
      front: serviceBack,
    }));
    partitions.push({
      id: "bedroom_divider",
      orientation: "horizontal",
      x: left + leftBlockWidth / 2,
      z: bedroomSplitZ,
      length: leftBlockWidth - 0.12,
    });
  } else {
    rooms.push(roomFromBounds("bedroom", "Bedroom", "bedroom", {
      left,
      right: splitX,
      back,
      front: serviceBack,
    }));
  }

  const entryRight = round2(left + entryWidth);
  rooms.push(roomFromBounds("entry", "Entry", "entry", {
    left,
    right: entryRight,
    back: serviceBack,
    front,
  }));

  const wetLeft = entryRight;
  const wetWidth = splitX - wetLeft;
  if (hasSauna && hasUtility) {
    const bathRight = round2(wetLeft + wetWidth * 0.36);
    const saunaRight = round2(wetLeft + wetWidth * 0.68);
    rooms.push(roomFromBounds("bath", "Bath", "bath", { left: wetLeft, right: bathRight, back: serviceBack, front }));
    rooms.push(roomFromBounds("sauna", "Sauna", "sauna", { left: bathRight, right: saunaRight, back: serviceBack, front }));
    rooms.push(roomFromBounds("utility", "Utility", "utility", { left: saunaRight, right: splitX, back: serviceBack, front }));
    partitions.push({ id: "bath_sauna_partition", orientation: "vertical", x: bathRight, z: serviceBack + serviceDepth / 2, length: serviceDepth - 0.12 });
    partitions.push({ id: "sauna_utility_partition", orientation: "vertical", x: saunaRight, z: serviceBack + serviceDepth / 2, length: serviceDepth - 0.12 });
  } else if (hasSauna) {
    const bathRight = round2(wetLeft + wetWidth * 0.52);
    rooms.push(roomFromBounds("bath", "Bath", "bath", { left: wetLeft, right: bathRight, back: serviceBack, front }));
    rooms.push(roomFromBounds("sauna", "Sauna", "sauna", { left: bathRight, right: splitX, back: serviceBack, front }));
    partitions.push({ id: "bath_sauna_partition", orientation: "vertical", x: bathRight, z: serviceBack + serviceDepth / 2, length: serviceDepth - 0.12 });
  } else if (hasUtility) {
    const bathRight = round2(wetLeft + wetWidth * 0.58);
    rooms.push(roomFromBounds("bath", "Bath", "bath", { left: wetLeft, right: bathRight, back: serviceBack, front }));
    rooms.push(roomFromBounds("utility", "Utility", "utility", { left: bathRight, right: splitX, back: serviceBack, front }));
    partitions.push({ id: "bath_utility_partition", orientation: "vertical", x: bathRight, z: serviceBack + serviceDepth / 2, length: serviceDepth - 0.12 });
  } else {
    rooms.push(roomFromBounds("bath", "Bath", "bath", { left: wetLeft, right: splitX, back: serviceBack, front }));
  }

  if (roomTypes.has("kitchen")) {
    rooms.push(roomFromBounds("living", "Living", "living", { left: splitX, right, back, front: kitchenBack }));
    rooms.push(roomFromBounds("kitchen", "Kitchen", "kitchen", { left: splitX, right, back: kitchenBack, front }));
    partitions.push({
      id: "kitchen_living_soft_divider",
      orientation: "horizontal",
      x: splitX + (right - splitX) / 2,
      z: kitchenBack,
      length: right - splitX - 0.2,
    });
  } else {
    rooms.push(roomFromBounds("living", "Living", "living", { left: splitX, right, back, front }));
  }

  openings.push(
    { id: "front_entry_door", type: "door", wall: "south", x: left + entryWidth / 2, z: front, width: 1.0, connects: ["entry", "outside"] },
    { id: "entry_living_door", type: "door", wall: "partition", x: splitX, z: serviceBack + serviceDepth * 0.55, width: 0.95, connects: ["entry", "living"] },
    { id: "bedroom_door", type: "door", wall: "partition", x: splitX, z: serviceBack - 0.7, width: 0.9, connects: ["bedroom", "living"] },
    { id: "bath_door", type: "door", wall: "partition", x: wetLeft + wetWidth * 0.45, z: serviceBack, width: 0.8, connects: ["bath", "entry"] },
    { id: "living_window", type: "window", wall: "east", x: right, z: back + (kitchenBack - back) * 0.5, width: clamp(depth * 0.24, 1.2, 2.8), connects: ["living", "outside"] },
    { id: "kitchen_window", type: "window", wall: "south", x: splitX + (right - splitX) * 0.66, z: front, width: clamp(width * 0.16, 1.0, 2.4), connects: ["kitchen", "outside"] },
    { id: "bedroom_window", type: "window", wall: "north", x: left + leftBlockWidth * 0.48, z: back, width: clamp(leftBlockWidth * 0.45, 1.0, 2.2), connects: ["bedroom", "outside"] },
  );

  return { rooms, openings, partitions };
}

function buildAssumptions(input: BlueprintRecognitionInput, scaleSource: BlueprintScaleSource, roomTypes: Set<BlueprintRoomType>): string[] {
  const assumptions = [
    "Generated as an editable draft for planning, not as a permit drawing.",
    "Wall, door, and window positions are heuristic until a human verifies the uploaded plan.",
  ];

  if (scaleSource === "user_dimensions") {
    assumptions.push("Scale uses the owner-provided width and depth.");
  } else if (scaleSource === "building_area") {
    assumptions.push("Scale is inferred from building_info.area_m2 and floor count.");
  } else if (scaleSource === "user_width_area" || scaleSource === "user_depth_area") {
    assumptions.push("One missing dimension is inferred from building_info.area_m2.");
  } else {
    assumptions.push("No reliable scale was provided, so a typical omakotitalo floor footprint is used.");
  }

  if (input.mimeType?.includes("pdf")) {
    assumptions.push("PDF files are accepted for the owner workflow; this draft uses metadata and scale hints until OCR/CV extraction is connected.");
  }

  if (roomTypes.has("sauna")) {
    assumptions.push("Sauna/wet-room split was inferred from file name or owner notes.");
  }

  return assumptions;
}

function buildConfidence(scaleSource: BlueprintScaleSource, input: BlueprintRecognitionInput, roomTypes: Set<BlueprintRoomType>): number {
  const searchableText = normalizeText(`${input.fileName} ${input.notes ?? ""}`);
  let confidence = 0.38;
  if (scaleSource === "user_dimensions") confidence += 0.22;
  if (scaleSource === "user_width_area" || scaleSource === "user_depth_area") confidence += 0.14;
  if (scaleSource === "building_area") confidence += 0.1;
  if (safeFileName(input.fileName).includes(".")) confidence += 0.04;
  if (input.mimeType?.startsWith("image/") || input.mimeType?.includes("pdf")) confidence += 0.04;
  if (roomTypes.has("sauna") || roomTypes.has("utility")) confidence += 0.04;
  if (includesAny(searchableText, ["kitchen", "keittio", "sauna", "bath", "kph", "mh", "bedroom"])) confidence += 0.06;
  return round2(clamp(confidence, 0.3, 0.78));
}

function confidenceLabel(confidence: number): BlueprintRecognitionResult["confidenceLabel"] {
  if (confidence >= 0.68) return "medium";
  if (confidence >= 0.48) return "draft";
  return "low";
}

function addBox(
  lines: string[],
  id: string,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  material: string,
  color: [number, number, number],
): void {
  const safeId = identifier(id);
  lines.push(`const ${safeId} = translate(box(${jsNum(width)}, ${jsNum(height)}, ${jsNum(depth)}), ${jsNum(x)}, ${jsNum(y)}, ${jsNum(z)});`);
  lines.push(`scene.add(${safeId}, { material: "${material}", color: ${jsColor(color)} });`);
}

function buildSceneJs(result: Omit<BlueprintRecognitionResult, "sceneJs">, partitions: PartitionWall[]): string {
  const wallThickness = 0.16;
  const wallHeight = 2.7;
  const floorThickness = 0.12;
  const yWall = floorThickness + wallHeight / 2;
  const width = result.widthMeters;
  const depth = result.depthMeters;
  const lines: string[] = [
    "// Helscoop blueprint-to-3D draft.",
    `// Source: ${safeFileName(result.sourceFileName)} (${result.sourceMimeType || "unknown mime"})`,
    `// Floor: ${result.floorLabel}; confidence: ${Math.round(result.confidence * 100)}% (${result.confidenceLabel}).`,
    "// Verify scale, wall alignment, and openings before quote requests or permits.",
    `const blueprint_width_m = ${jsNum(width)};`,
    `const blueprint_depth_m = ${jsNum(depth)};`,
    `const wall_h = ${jsNum(wallHeight)};`,
    `const wall_t = ${jsNum(wallThickness)};`,
    "",
  ];

  addBox(lines, "blueprint_floor_slab", width, floorThickness, depth, 0, floorThickness / 2, 0, "foundation", [0.54, 0.55, 0.5]);
  addBox(lines, "blueprint_wall_north", width, wallHeight, wallThickness, 0, yWall, -depth / 2 + wallThickness / 2, "pine_48x98_c24", [0.78, 0.68, 0.52]);
  addBox(lines, "blueprint_wall_south", width, wallHeight, wallThickness, 0, yWall, depth / 2 - wallThickness / 2, "pine_48x98_c24", [0.78, 0.68, 0.52]);
  addBox(lines, "blueprint_wall_west", wallThickness, wallHeight, depth, -width / 2 + wallThickness / 2, yWall, 0, "pine_48x98_c24", [0.78, 0.68, 0.52]);
  addBox(lines, "blueprint_wall_east", wallThickness, wallHeight, depth, width / 2 - wallThickness / 2, yWall, 0, "pine_48x98_c24", [0.78, 0.68, 0.52]);
  lines.push("");

  for (const partition of partitions) {
    if (partition.orientation === "vertical") {
      addBox(lines, partition.id, wallThickness, wallHeight, partition.length, partition.x, yWall, partition.z, "pine_48x98_c24", [0.72, 0.62, 0.47]);
    } else {
      addBox(lines, partition.id, partition.length, wallHeight, wallThickness, partition.x, yWall, partition.z, "pine_48x98_c24", [0.72, 0.62, 0.47]);
    }
  }
  lines.push("");

  for (const room of result.rooms) {
    const color = ROOM_COLORS[room.type];
    addBox(lines, `${room.id}_room_zone`, room.width - 0.18, 0.045, room.depth - 0.18, room.x, floorThickness + 0.035, room.z, "blueprint_room_zone", color);
  }
  lines.push("");

  for (const opening of result.openings) {
    const isWindow = opening.type === "window";
    const color: [number, number, number] = isWindow ? [0.42, 0.64, 0.85] : [0.42, 0.33, 0.24];
    const material = isWindow ? "glass" : "door_thermal_bridge";
    const height = isWindow ? 0.9 : 0.08;
    const y = isWindow ? 1.45 : floorThickness + 0.12;
    const alongX = opening.wall === "north" || opening.wall === "south" || opening.wall === "partition";
    const markerWidth = alongX ? opening.width : 0.12;
    const markerDepth = alongX ? 0.12 : opening.width;
    addBox(lines, opening.id, markerWidth, height, markerDepth, opening.x, y, opening.z, material, color);
  }

  lines.push("");
  lines.push("// Next edits: move/delete room zones and wall boxes directly, then save the project.");
  return `${lines.join("\n")}\n`;
}

export function recognizeBlueprintFromMetadata(input: BlueprintRecognitionInput): BlueprintRecognitionResult {
  const dimensions = inferDimensions(input);
  const roomTypes = detectRoomTypes(input, dimensions.area);
  const layout = buildLayout(dimensions.width, dimensions.depth, roomTypes);
  const assumptions = buildAssumptions(input, dimensions.scaleSource, roomTypes);
  const confidence = buildConfidence(dimensions.scaleSource, input, roomTypes);
  const baseResult: Omit<BlueprintRecognitionResult, "sceneJs"> = {
    sourceFileName: safeFileName(input.fileName),
    sourceMimeType: input.mimeType || "application/octet-stream",
    projectName: input.projectName,
    floorLabel: input.floorLabel?.trim() || "Main floor",
    widthMeters: dimensions.width,
    depthMeters: dimensions.depth,
    areaM2: dimensions.area,
    scaleSource: dimensions.scaleSource,
    confidence,
    confidenceLabel: confidenceLabel(confidence),
    rooms: layout.rooms,
    openings: layout.openings,
    partitionWallCount: layout.partitions.length,
    assumptions,
  };

  return {
    ...baseResult,
    sceneJs: buildSceneJs(baseResult, layout.partitions),
  };
}

export function formatBlueprintHandoff(result: BlueprintRecognitionResult): string {
  const roomLines = result.rooms
    .map((room) => `- ${room.name}: ${room.width} m x ${room.depth} m (${room.areaM2} m2)`)
    .join("\n");
  const assumptionLines = result.assumptions.map((assumption) => `- ${assumption}`).join("\n");

  return [
    "Helscoop blueprint-to-3D draft",
    `Project: ${result.projectName || "Untitled project"}`,
    `Source: ${result.sourceFileName}`,
    `Floor: ${result.floorLabel}`,
    `Footprint: ${result.widthMeters} m x ${result.depthMeters} m (${result.areaM2} m2)`,
    `Confidence: ${Math.round(result.confidence * 100)}% (${result.confidenceLabel})`,
    "",
    "Rooms",
    roomLines,
    "",
    "Openings",
    `- ${result.openings.filter((opening) => opening.type === "door").length} doors`,
    `- ${result.openings.filter((opening) => opening.type === "window").length} windows`,
    "",
    "Assumptions",
    assumptionLines,
  ].join("\n");
}
