import JSZip from "jszip";
import PDFDocument from "pdfkit";
import { IFCSceneObject, parseSceneObjects } from "./ifc-generator";
import { normalizeBuildingInfo, sanitizePermitMetadata } from "./ryhti-client";

export const PERMIT_PACK_FORMAT = "Helscoop permit-pack v1";
export const PERMIT_PACK_DRAWING_SCALE = "1:100";
export const PERMIT_PACK_PAPER = "A3";

export interface PermitPackProject {
  id: string;
  name: string;
  description?: string | null;
  scene_js?: string | null;
  building_info?: unknown;
  permit_metadata?: unknown;
}

export interface PermitPackBomItem {
  material_id: string;
  material_name?: string | null;
  category_name?: string | null;
  quantity: number;
  unit: string;
  unit_price?: number | null;
  supplier_name?: string | null;
  structural_grade_class?: string | null;
}

export interface PermitPackDrawingSummary {
  fileName: string;
  title: string;
  paper: typeof PERMIT_PACK_PAPER;
  scale: typeof PERMIT_PACK_DRAWING_SCALE;
  contentType: "application/pdf";
}

export interface PermitPackManifest {
  format: typeof PERMIT_PACK_FORMAT;
  generatedAt: string;
  projectId: string;
  projectName: string;
  drawingScale: typeof PERMIT_PACK_DRAWING_SCALE;
  paper: typeof PERMIT_PACK_PAPER;
  geometrySource: string;
  drawings: PermitPackDrawingSummary[];
  notes: string[];
}

export interface PermitPackResult {
  buffer: Buffer;
  manifest: PermitPackManifest;
}

type ProjectionAxis = "x" | "y" | "z";

interface NormalizedObject extends IFCSceneObject {
  bounds: ObjectBounds;
}

interface ObjectBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

interface ModelBounds extends ObjectBounds {
  width: number;
  depth: number;
  height: number;
  centerX: number;
  centerY: number;
  centerZ: number;
  source: string;
}

interface PermitModel {
  project: PermitPackProject;
  bom: PermitPackBomItem[];
  objects: NormalizedObject[];
  bounds: ModelBounds;
  buildingInfo: Record<string, unknown>;
  permitMetadata: Record<string, unknown>;
  areaM2: number;
  volumeM3: number;
}

interface FallbackDimensions {
  width: number;
  depth: number;
  height: number;
  source: string;
}

const PT_PER_MM = 72 / 25.4;
const M_TO_PT_AT_1_100 = 10 * PT_PER_MM;
const DEFAULT_HEIGHT_M = 2.8;
const MIN_FALLBACK_DIMENSION_M = 1;
const MAX_REASONABLE_DIMENSION_M = 80;

const TYPE_STYLES: Record<IFCSceneObject["type"], { stroke: string; fill: string }> = {
  slab: { stroke: "#667085", fill: "#e4e7ec" },
  wall: { stroke: "#8a5a1f", fill: "#f0c674" },
  roof: { stroke: "#475467", fill: "#d0d5dd" },
  door: { stroke: "#344054", fill: "#b692f6" },
  window: { stroke: "#1570ef", fill: "#b2ddff" },
  generic: { stroke: "#667085", fill: "#f2f4f7" },
};

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function cleanNumber(value: unknown): number | undefined {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(num) ? num : undefined;
}

function formatMeters(value: number): string {
  return `${Number(value.toFixed(2))} m`;
}

function formatArea(value: number): string {
  return `${Number(value.toFixed(1))} m2`;
}

function formatVolume(value: number): string {
  return `${Number(value.toFixed(1))} m3`;
}

function safeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80) || "helscoop_project";
}

function maybeMeters(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value > MAX_REASONABLE_DIMENSION_M ? value / 1000 : value;
}

function objectBounds(object: IFCSceneObject): ObjectBounds {
  const dims = {
    x: maybeMeters(object.dimensions.x),
    y: maybeMeters(object.dimensions.y),
    z: maybeMeters(object.dimensions.z),
  };
  const pos = {
    x: maybeMeters(object.position.x),
    y: maybeMeters(object.position.y),
    z: maybeMeters(object.position.z),
  };

  return {
    minX: pos.x - dims.x / 2,
    maxX: pos.x + dims.x / 2,
    minY: pos.y - dims.y / 2,
    maxY: pos.y + dims.y / 2,
    minZ: pos.z - dims.z / 2,
    maxZ: pos.z + dims.z / 2,
  };
}

function boundsFromObjects(objects: NormalizedObject[], source: string): ModelBounds {
  const minX = Math.min(...objects.map((object) => object.bounds.minX));
  const maxX = Math.max(...objects.map((object) => object.bounds.maxX));
  const minY = Math.min(...objects.map((object) => object.bounds.minY));
  const maxY = Math.max(...objects.map((object) => object.bounds.maxY));
  const minZ = Math.min(...objects.map((object) => object.bounds.minZ));
  const maxZ = Math.max(...objects.map((object) => object.bounds.maxZ));
  const width = Math.max(maxX - minX, MIN_FALLBACK_DIMENSION_M);
  const depth = Math.max(maxZ - minZ, MIN_FALLBACK_DIMENSION_M);
  const height = Math.max(maxY - minY, MIN_FALLBACK_DIMENSION_M);

  return {
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    width,
    depth,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    centerZ: (minZ + maxZ) / 2,
    source,
  };
}

function extractNamedDimensions(name: string): FallbackDimensions | null {
  const match = name.match(/(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*m/i);
  if (!match) return null;
  const width = Number(match[1].replace(",", "."));
  const depth = Number(match[2].replace(",", "."));
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) return null;
  return { width, depth, height: DEFAULT_HEIGHT_M, source: "project name dimensions" };
}

function extractConstNumber(sceneJs: string, name: string): number | undefined {
  const match = sceneJs.match(new RegExp(`const\\s+${name}\\s*=\\s*([\\d.]+)`));
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function extractParametricDimensions(sceneJs: string): FallbackDimensions | null {
  const coopLen = extractConstNumber(sceneJs, "coop_len");
  const coopWidth = extractConstNumber(sceneJs, "coop_w");
  const wallHeight = extractConstNumber(sceneJs, "wall_h");
  if (coopLen && coopWidth) {
    return {
      width: maybeMeters(coopLen),
      depth: maybeMeters(coopWidth),
      height: wallHeight ? maybeMeters(wallHeight) : DEFAULT_HEIGHT_M,
      source: "parametric scene dimensions",
    };
  }
  return null;
}

function inferAreaDimensions(areaM2: number | undefined): FallbackDimensions | null {
  if (!areaM2 || !Number.isFinite(areaM2) || areaM2 <= 0) return null;
  const width = Math.max(Math.sqrt(areaM2 * 1.25), MIN_FALLBACK_DIMENSION_M);
  const depth = Math.max(areaM2 / width, MIN_FALLBACK_DIMENSION_M);
  return { width, depth, height: DEFAULT_HEIGHT_M, source: "building area fallback" };
}

function makeFallbackObjects(dimensions: FallbackDimensions): NormalizedObject[] {
  const { width, depth, height } = dimensions;
  const wallThickness = Math.min(0.15, Math.max(0.08, Math.min(width, depth) * 0.035));
  const roofOverhang = 0.3;
  const baseObjects: IFCSceneObject[] = [
    {
      name: "floor",
      type: "slab",
      dimensions: { x: width, y: 0.18, z: depth },
      position: { x: 0, y: 0.09, z: 0 },
      material: "foundation",
    },
    {
      name: "front_wall",
      type: "wall",
      dimensions: { x: width, y: height, z: wallThickness },
      position: { x: 0, y: height / 2, z: depth / 2 - wallThickness / 2 },
      material: "lumber",
    },
    {
      name: "back_wall",
      type: "wall",
      dimensions: { x: width, y: height, z: wallThickness },
      position: { x: 0, y: height / 2, z: -depth / 2 + wallThickness / 2 },
      material: "lumber",
    },
    {
      name: "left_wall",
      type: "wall",
      dimensions: { x: wallThickness, y: height, z: depth },
      position: { x: -width / 2 + wallThickness / 2, y: height / 2, z: 0 },
      material: "lumber",
    },
    {
      name: "right_wall",
      type: "wall",
      dimensions: { x: wallThickness, y: height, z: depth },
      position: { x: width / 2 - wallThickness / 2, y: height / 2, z: 0 },
      material: "lumber",
    },
    {
      name: "roof",
      type: "roof",
      dimensions: { x: width + roofOverhang * 2, y: 0.12, z: depth + roofOverhang * 2 },
      position: { x: 0, y: height + 0.25, z: 0 },
      material: "roofing",
    },
  ];

  return baseObjects.map((object) => ({ ...object, bounds: objectBounds(object) }));
}

function buildModel(project: PermitPackProject, bom: PermitPackBomItem[]): PermitModel {
  const buildingInfo = normalizeBuildingInfo(project.building_info);
  const permitMetadata = sanitizePermitMetadata(project.permit_metadata ?? {});
  const sceneJs = project.scene_js ?? "";
  const parsedObjects = parseSceneObjects(sceneJs)
    .map((object) => ({ ...object, bounds: objectBounds(object) }))
    .filter((object) => object.bounds.maxX > object.bounds.minX && object.bounds.maxZ > object.bounds.minZ);

  let objects = parsedObjects;
  let geometrySource = "scene boxes";

  if (objects.length === 0) {
    const fallback =
      extractParametricDimensions(sceneJs)
      ?? extractNamedDimensions(project.name)
      ?? inferAreaDimensions(
        cleanNumber(permitMetadata.floorAreaM2)
          ?? cleanNumber(permitMetadata.grossAreaM2)
          ?? cleanNumber(buildingInfo.floorAreaM2),
      )
      ?? { width: 4, depth: 3, height: DEFAULT_HEIGHT_M, source: "default small-building fallback" };
    objects = makeFallbackObjects(fallback);
    geometrySource = fallback.source;
  }

  const bounds = boundsFromObjects(objects, geometrySource);
  const areaM2 =
    cleanNumber(permitMetadata.floorAreaM2)
    ?? cleanNumber(permitMetadata.grossAreaM2)
    ?? cleanNumber(buildingInfo.floorAreaM2)
    ?? bounds.width * bounds.depth;
  const volumeM3 = cleanNumber(permitMetadata.volumeM3) ?? areaM2 * bounds.height;

  return {
    project,
    bom,
    objects,
    bounds,
    buildingInfo,
    permitMetadata: permitMetadata as Record<string, unknown>,
    areaM2,
    volumeM3,
  };
}

function renderPdf(
  build: (doc: PDFKit.PDFDocument) => void,
  options: PDFKit.PDFDocumentOptions = {},
): Promise<Buffer> {
  const doc = new PDFDocument({
    size: PERMIT_PACK_PAPER,
    margin: 36,
    info: {
      Producer: "Helscoop",
      Creator: "Helscoop permit-pack generator",
      Title: "Helscoop building permit pack",
    },
    ...options,
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  build(doc);
  doc.end();
  return done;
}

function drawTitleBlock(doc: PDFKit.PDFDocument, model: PermitModel, title: string, drawingNo: string): void {
  const blockWidth = 300;
  const blockHeight = 78;
  const x = doc.page.width - doc.page.margins.right - blockWidth;
  const y = doc.page.height - doc.page.margins.bottom - blockHeight;

  doc.save();
  doc.rect(x, y, blockWidth, blockHeight).stroke("#344054");
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#101828").text(model.project.name, x + 10, y + 8, {
    width: blockWidth - 20,
  });
  doc.font("Helvetica").fontSize(8).fillColor("#344054");
  doc.text(title, x + 10, y + 25, { width: blockWidth - 20 });
  doc.text(`Drawing ${drawingNo} | ${PERMIT_PACK_PAPER} | Scale ${PERMIT_PACK_DRAWING_SCALE}`, x + 10, y + 42);
  doc.text(`Generated ${new Date().toISOString().slice(0, 10)} | Draft for authority review`, x + 10, y + 57);
  doc.restore();
}

function drawScaleBar(doc: PDFKit.PDFDocument, x: number, y: number, meters = 2): void {
  const width = meters * M_TO_PT_AT_1_100;
  doc.save();
  doc.strokeColor("#101828").lineWidth(1);
  doc.moveTo(x, y).lineTo(x + width, y).stroke();
  doc.moveTo(x, y - 4).lineTo(x, y + 4).stroke();
  doc.moveTo(x + width, y - 4).lineTo(x + width, y + 4).stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#101828").text(`${meters} m`, x, y + 8, { width, align: "center" });
  doc.restore();
}

function drawNorthArrow(doc: PDFKit.PDFDocument, x: number, y: number): void {
  doc.save();
  doc.strokeColor("#101828").fillColor("#101828").lineWidth(1.4);
  doc.moveTo(x, y + 38).lineTo(x, y).stroke();
  doc.polygon([x, y], [x - 5, y + 13], [x + 5, y + 13]).fill();
  doc.font("Helvetica-Bold").fontSize(10).text("N", x - 4, y + 42);
  doc.restore();
}

function drawDisclaimer(doc: PDFKit.PDFDocument): void {
  doc.save();
  doc.font("Helvetica").fontSize(8).fillColor("#667085");
  doc.text(
    "Permit-ready draft generated from Helscoop project data. Verify dimensions, structure, fire safety, site placement, and municipality-specific requirements with a qualified designer before submission.",
    doc.page.margins.left,
    doc.page.height - doc.page.margins.bottom - 18,
    { width: doc.page.width - doc.page.margins.left - doc.page.margins.right - 320 },
  );
  doc.restore();
}

function projectPoint(
  valueA: number,
  valueB: number,
  axisA: ProjectionAxis,
  axisB: ProjectionAxis,
  model: PermitModel,
  originX: number,
  originY: number,
): { x: number; y: number } {
  const centerByAxis: Record<ProjectionAxis, number> = {
    x: model.bounds.centerX,
    y: model.bounds.centerY,
    z: model.bounds.centerZ,
  };
  return {
    x: originX + (valueA - centerByAxis[axisA]) * M_TO_PT_AT_1_100,
    y: originY - (valueB - centerByAxis[axisB]) * M_TO_PT_AT_1_100,
  };
}

function getAxisBounds(bounds: ObjectBounds, axis: ProjectionAxis): { min: number; max: number } {
  if (axis === "x") return { min: bounds.minX, max: bounds.maxX };
  if (axis === "y") return { min: bounds.minY, max: bounds.maxY };
  return { min: bounds.minZ, max: bounds.maxZ };
}

function drawProjectedObjects(
  doc: PDFKit.PDFDocument,
  model: PermitModel,
  title: string,
  axisA: ProjectionAxis,
  axisB: ProjectionAxis,
  originX: number,
  originY: number,
  options: { sectionCut?: boolean } = {},
): void {
  doc.save();
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#101828").text(title, originX - 160, originY - 170, {
    width: 320,
    align: "center",
  });

  for (const object of model.objects) {
    const a = getAxisBounds(object.bounds, axisA);
    const b = getAxisBounds(object.bounds, axisB);
    const p1 = projectPoint(a.min, b.max, axisA, axisB, model, originX, originY);
    const p2 = projectPoint(a.max, b.min, axisA, axisB, model, originX, originY);
    const width = Math.max(p2.x - p1.x, 1.5);
    const height = Math.max(p2.y - p1.y, 1.5);
    const style = TYPE_STYLES[object.type] ?? TYPE_STYLES.generic;

    doc.save();
    doc.fillColor(style.fill).fillOpacity(options.sectionCut && object.type === "wall" ? 0.28 : 0.16);
    doc.rect(p1.x, p1.y, width, height).fill();
    doc.restore();
    doc.strokeColor(style.stroke).lineWidth(object.type === "roof" ? 1.2 : 0.8).rect(p1.x, p1.y, width, height).stroke();
  }

  if (options.sectionCut) {
    const floorY = projectPoint(model.bounds.centerX, 0, axisA, axisB, model, originX, originY).y;
    doc.strokeColor("#d92d20").dash(4, { space: 3 }).moveTo(originX - 150, floorY).lineTo(originX + 150, floorY).stroke();
    doc.undash();
    doc.font("Helvetica").fontSize(8).fillColor("#d92d20").text("section cut A-A", originX + 155, floorY - 5);
  }

  doc.restore();
}

function drawHorizontalDimension(
  doc: PDFKit.PDFDocument,
  x1: number,
  x2: number,
  y: number,
  label: string,
): void {
  doc.save();
  doc.strokeColor("#101828").fillColor("#101828").lineWidth(0.8);
  doc.moveTo(x1, y).lineTo(x2, y).stroke();
  doc.moveTo(x1, y - 5).lineTo(x1, y + 5).stroke();
  doc.moveTo(x2, y - 5).lineTo(x2, y + 5).stroke();
  doc.font("Helvetica").fontSize(8).text(label, x1, y - 14, { width: x2 - x1, align: "center" });
  doc.restore();
}

function drawVerticalDimension(
  doc: PDFKit.PDFDocument,
  x: number,
  y1: number,
  y2: number,
  label: string,
): void {
  doc.save();
  doc.strokeColor("#101828").fillColor("#101828").lineWidth(0.8);
  doc.moveTo(x, y1).lineTo(x, y2).stroke();
  doc.moveTo(x - 5, y1).lineTo(x + 5, y1).stroke();
  doc.moveTo(x - 5, y2).lineTo(x + 5, y2).stroke();
  doc.rotate(-90, { origin: [x - 12, (y1 + y2) / 2] });
  doc.font("Helvetica").fontSize(8).text(label, x - 55, (y1 + y2) / 2 - 4, { width: 110, align: "center" });
  doc.restore();
}

function drawFloorPlanAnnotations(doc: PDFKit.PDFDocument, model: PermitModel, originX: number, originY: number): void {
  const left = originX - (model.bounds.width / 2) * M_TO_PT_AT_1_100;
  const right = originX + (model.bounds.width / 2) * M_TO_PT_AT_1_100;
  const top = originY - (model.bounds.depth / 2) * M_TO_PT_AT_1_100;
  const bottom = originY + (model.bounds.depth / 2) * M_TO_PT_AT_1_100;
  drawHorizontalDimension(doc, left, right, top - 22, formatMeters(model.bounds.width));
  drawVerticalDimension(doc, right + 22, top, bottom, formatMeters(model.bounds.depth));

  doc.save();
  doc.strokeColor("#175cd3").dash(5, { space: 3 }).lineWidth(0.9);
  doc.moveTo(left, originY).lineTo(right, originY).stroke();
  doc.undash();
  doc.font("Helvetica").fontSize(8).fillColor("#175cd3").text("A-A", right + 8, originY - 4);
  doc.restore();
}

function drawElevationAnnotations(
  doc: PDFKit.PDFDocument,
  model: PermitModel,
  originX: number,
  originY: number,
  horizontalMeters: number,
): void {
  const left = originX - (horizontalMeters / 2) * M_TO_PT_AT_1_100;
  const right = originX + (horizontalMeters / 2) * M_TO_PT_AT_1_100;
  const top = originY - (model.bounds.height / 2) * M_TO_PT_AT_1_100;
  const bottom = originY + (model.bounds.height / 2) * M_TO_PT_AT_1_100;
  drawHorizontalDimension(doc, left, right, bottom + 18, formatMeters(horizontalMeters));
  drawVerticalDimension(doc, right + 18, top, bottom, formatMeters(model.bounds.height));
}

function renderFloorPlan(model: PermitModel): Promise<Buffer> {
  return renderPdf((doc) => {
    const originX = doc.page.width / 2;
    const originY = doc.page.height / 2 - 25;
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#101828").text("Floor plan / Pohjapiirros", doc.page.margins.left, 38);
    doc.font("Helvetica").fontSize(9).fillColor("#344054").text(`Geometry source: ${model.bounds.source}`, doc.page.margins.left, 58);
    drawProjectedObjects(doc, model, "Plan view", "x", "z", originX, originY);
    drawFloorPlanAnnotations(doc, model, originX, originY);
    drawNorthArrow(doc, doc.page.width - 92, 65);
    drawScaleBar(doc, doc.page.margins.left, doc.page.height - 118);
    drawTitleBlock(doc, model, "Floor plan / Pohjapiirros", "01");
    drawDisclaimer(doc);
  }, { layout: "landscape" });
}

function renderElevations(model: PermitModel): Promise<Buffer> {
  return renderPdf((doc) => {
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#101828").text("Elevations / Julkisivut", doc.page.margins.left, 38);
    const topY = 260;
    const bottomY = 545;
    const leftX = doc.page.width * 0.29;
    const rightX = doc.page.width * 0.71;
    drawProjectedObjects(doc, model, "Front elevation", "x", "y", leftX, topY);
    drawElevationAnnotations(doc, model, leftX, topY, model.bounds.width);
    drawProjectedObjects(doc, model, "Rear elevation", "x", "y", rightX, topY);
    drawElevationAnnotations(doc, model, rightX, topY, model.bounds.width);
    drawProjectedObjects(doc, model, "Left side", "z", "y", leftX, bottomY);
    drawElevationAnnotations(doc, model, leftX, bottomY, model.bounds.depth);
    drawProjectedObjects(doc, model, "Right side", "z", "y", rightX, bottomY);
    drawElevationAnnotations(doc, model, rightX, bottomY, model.bounds.depth);
    drawScaleBar(doc, doc.page.margins.left, doc.page.height - 118);
    drawTitleBlock(doc, model, "Elevations / Julkisivut", "02");
    drawDisclaimer(doc);
  }, { layout: "landscape" });
}

function renderCrossSection(model: PermitModel): Promise<Buffer> {
  return renderPdf((doc) => {
    const originX = doc.page.width / 2;
    const originY = doc.page.height / 2 - 15;
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#101828").text("Cross-section A-A / Leikkaus A-A", doc.page.margins.left, 38);
    drawProjectedObjects(doc, model, "Section through centre line", "x", "y", originX, originY, { sectionCut: true });
    drawElevationAnnotations(doc, model, originX, originY, model.bounds.width);

    doc.save();
    doc.font("Helvetica").fontSize(9).fillColor("#344054");
    doc.text(`Floor area: ${formatArea(model.areaM2)}`, doc.page.margins.left, 76);
    doc.text(`Estimated volume: ${formatVolume(model.volumeM3)}`, doc.page.margins.left, 92);
    doc.text(`Overall footprint: ${formatMeters(model.bounds.width)} x ${formatMeters(model.bounds.depth)}`, doc.page.margins.left, 108);
    doc.restore();

    drawScaleBar(doc, doc.page.margins.left, doc.page.height - 118);
    drawTitleBlock(doc, model, "Cross-section A-A / Leikkaus A-A", "03");
    drawDisclaimer(doc);
  }, { layout: "landscape" });
}

function metadataValue(model: PermitModel, key: string, fallback = "-"): string {
  const value = model.permitMetadata[key] ?? model.buildingInfo[key];
  const string = cleanString(value);
  if (string) return string;
  const number = cleanNumber(value);
  if (number !== undefined) return String(number);
  return fallback;
}

function renderRhPrefill(model: PermitModel): Promise<Buffer> {
  return renderPdf((doc) => {
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#101828").text("RH-lomake pre-fill / Building register form draft", 48, 48);
    doc.font("Helvetica").fontSize(9).fillColor("#667085").text(
      "This PDF pre-fills project data for the official Finnish building register / permit workflow. Transfer or verify fields in the municipality's official form before submission.",
      48,
      74,
      { width: doc.page.width - 96 },
    );

    const rows: Array<[string, string]> = [
      ["Project name", model.project.name],
      ["Description of action", metadataValue(model, "descriptionOfAction", model.project.description ?? "-")],
      ["Address", metadataValue(model, "address")],
      ["Postal code / city", `${metadataValue(model, "postalCode")} ${metadataValue(model, "city", "")}`.trim()],
      ["Municipality number", metadataValue(model, "municipalityNumber")],
      ["Property identifier", metadataValue(model, "propertyIdentifier")],
      ["Permanent building ID", metadataValue(model, "permanentBuildingIdentifier")],
      ["Application type", metadataValue(model, "permitApplicationType", metadataValue(model, "buildingPermitApplicationType"))],
      ["Construction action", metadataValue(model, "constructionActionType", "renovation / new small structure")],
      ["Building type", metadataValue(model, "buildingType", "small auxiliary building")],
      ["Floor area", formatArea(model.areaM2)],
      ["Gross area", metadataValue(model, "grossAreaM2", formatArea(model.areaM2))],
      ["Volume", formatVolume(model.volumeM3)],
      ["Floors", metadataValue(model, "floors", "1")],
      ["Energy class", metadataValue(model, "energyClass")],
      ["Coordinates", `${metadataValue(model, "latitude")} / ${metadataValue(model, "longitude")}`],
      ["Applicant role", metadataValue(model, "applicantRole", "owner / homeowner to complete")],
      ["Suomi.fi authentication", metadataValue(model, "suomiFiAuthenticated", "to be confirmed in official service")],
    ];

    let y = 118;
    const labelWidth = 190;
    for (const [label, value] of rows) {
      doc.rect(48, y, doc.page.width - 96, 24).stroke("#d0d5dd");
      doc.font("Helvetica-Bold").fontSize(9).fillColor("#344054").text(label, 58, y + 7, { width: labelWidth });
      doc.font("Helvetica").fontSize(9).fillColor("#101828").text(value || "-", 58 + labelWidth, y + 7, {
        width: doc.page.width - 116 - labelWidth,
      });
      y += 24;
    }

    drawTitleBlock(doc, model, "RH-lomake pre-fill", "04");
    drawDisclaimer(doc);
  }, { layout: "portrait" });
}

function renderMaterialSpec(model: PermitModel): Promise<Buffer> {
  return renderPdf((doc) => {
    doc.font("Helvetica-Bold").fontSize(18).fillColor("#101828").text("Material specification / Materiaaliluettelo", 48, 48);
    doc.font("Helvetica").fontSize(9).fillColor("#667085").text(
      "BOM exported as permit-pack support material. Supplier prices and substitutions are commercial planning data, not structural certification.",
      48,
      74,
      { width: doc.page.width - 96 },
    );

    const startY = 112;
    const columns = [
      { label: "Material", x: 48, width: 195 },
      { label: "Category", x: 243, width: 100 },
      { label: "Qty", x: 343, width: 55 },
      { label: "Unit", x: 398, width: 45 },
      { label: "Grade", x: 443, width: 55 },
      { label: "Supplier", x: 498, width: 90 },
    ];
    let y = startY;

    doc.rect(48, y, 540, 24).fillAndStroke("#f2f4f7", "#d0d5dd");
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#344054");
    for (const column of columns) {
      doc.text(column.label, column.x + 4, y + 8, { width: column.width - 8 });
    }
    y += 24;

    const rows = model.bom.length > 0
      ? model.bom
      : [{ material_id: "no_bom", material_name: "No BOM items saved", quantity: 0, unit: "-", category_name: null }];

    for (const item of rows) {
      if (y > doc.page.height - 130) {
        doc.addPage({ size: PERMIT_PACK_PAPER, layout: "portrait", margin: 36 });
        y = 48;
      }
      doc.rect(48, y, 540, 24).stroke("#d0d5dd");
      doc.font("Helvetica").fontSize(8).fillColor("#101828");
      doc.text(item.material_name || item.material_id, columns[0].x + 4, y + 7, { width: columns[0].width - 8 });
      doc.text(item.category_name || "-", columns[1].x + 4, y + 7, { width: columns[1].width - 8 });
      doc.text(String(Number(item.quantity.toFixed(3))), columns[2].x + 4, y + 7, { width: columns[2].width - 8 });
      doc.text(item.unit, columns[3].x + 4, y + 7, { width: columns[3].width - 8 });
      doc.text(item.structural_grade_class || "-", columns[4].x + 4, y + 7, { width: columns[4].width - 8 });
      doc.text(item.supplier_name || "-", columns[5].x + 4, y + 7, { width: columns[5].width - 8 });
      y += 24;
    }

    y += 18;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#101828").text("Drawing-derived summary", 48, y);
    doc.font("Helvetica").fontSize(9).fillColor("#344054");
    doc.text(`Footprint: ${formatMeters(model.bounds.width)} x ${formatMeters(model.bounds.depth)}`, 48, y + 18);
    doc.text(`Height: ${formatMeters(model.bounds.height)}`, 48, y + 34);
    doc.text(`Floor area: ${formatArea(model.areaM2)}`, 48, y + 50);
    doc.text(`Object count: ${model.objects.length}`, 48, y + 66);

    drawTitleBlock(doc, model, "Material specification", "05");
    drawDisclaimer(doc);
  }, { layout: "portrait" });
}

export async function generatePermitPack(input: {
  project: PermitPackProject;
  bom: PermitPackBomItem[];
  generatedAt?: string;
}): Promise<PermitPackResult> {
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const model = buildModel(input.project, input.bom);
  const safeName = safeFileName(input.project.name);
  const files = [
    {
      fileName: `01_${safeName}_floor_plan_A3_1-100.pdf`,
      title: "Floor plan / Pohjapiirros",
      content: await renderFloorPlan(model),
    },
    {
      fileName: `02_${safeName}_elevations_A3_1-100.pdf`,
      title: "Elevations / Julkisivut",
      content: await renderElevations(model),
    },
    {
      fileName: `03_${safeName}_cross_section_A3_1-100.pdf`,
      title: "Cross-section A-A / Leikkaus A-A",
      content: await renderCrossSection(model),
    },
    {
      fileName: `04_${safeName}_RH_lomake_prefill.pdf`,
      title: "RH-lomake pre-fill",
      content: await renderRhPrefill(model),
    },
    {
      fileName: `05_${safeName}_material_specification.pdf`,
      title: "Material specification / Materiaaliluettelo",
      content: await renderMaterialSpec(model),
    },
  ];

  const manifest: PermitPackManifest = {
    format: PERMIT_PACK_FORMAT,
    generatedAt,
    projectId: input.project.id,
    projectName: input.project.name,
    drawingScale: PERMIT_PACK_DRAWING_SCALE,
    paper: PERMIT_PACK_PAPER,
    geometrySource: model.bounds.source,
    drawings: files.map((file) => ({
      fileName: file.fileName,
      title: file.title,
      paper: PERMIT_PACK_PAPER,
      scale: PERMIT_PACK_DRAWING_SCALE,
      contentType: "application/pdf",
    })),
    notes: [
      "Generated documents are permit-ready drafts, not official authority decisions.",
      "All dimensions are derived from saved Helscoop project scene data or fallback project metadata.",
      "Homeowner must verify site placement, fire separation, structure, energy data, and municipality-specific attachments before filing.",
    ],
  };

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file(
    "README.txt",
    [
      "Helscoop permit pack",
      `Project: ${input.project.name}`,
      `Generated: ${generatedAt}`,
      `Paper/scale: ${PERMIT_PACK_PAPER} ${PERMIT_PACK_DRAWING_SCALE}`,
      "",
      "This package is a draft support bundle for Finnish building permit workflows.",
      "Verify all documents with the local municipality or qualified designer before submission.",
    ].join("\n"),
  );
  for (const file of files) {
    zip.file(file.fileName, file.content);
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return { buffer, manifest };
}
