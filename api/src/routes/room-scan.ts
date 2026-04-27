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
import {
  parseRoomScanImport,
  type ParsedRoomScan,
  type RoomScanBuildingContext,
  type RoomScanFileInput,
  type RoomScanImportOptions,
} from "../room-scan-parser";
import { extractBuildingAreaM2, parseBuildingInfo as parseSharedBuildingInfo } from "../building-info";

const router = Router();

const MAX_SCAN_FILES = 2;
const MAX_DATA_URL_CHARS = 6_200_000;
const OSB_SHEET_AREA_M2 = 2.88;

interface MaterialRow {
  id: string;
  name: string;
  category_name: string | null;
  unit_price: string | number | null;
  unit: string | null;
  supplier_name: string | null;
  link: string | null;
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

function parseBuildingInfo(value: unknown): RoomScanBuildingContext {
  const parsed = parseSharedBuildingInfo(value);
  const normalized = { ...parsed } as RoomScanBuildingContext;
  const areaM2 = extractBuildingAreaM2(parsed);
  if (areaM2 !== undefined) normalized.area_m2 = areaM2;
  const floors = positiveNumber(parsed.floors);
  if (floors !== undefined) normalized.floors = floors;
  return normalized;
}

function normalizeScans(input: unknown): RoomScanFileInput[] {
  if (!Array.isArray(input)) return [];
  const scans: RoomScanFileInput[] = [];
  for (const raw of input.slice(0, MAX_SCAN_FILES + 1)) {
    if (!raw || typeof raw !== "object") continue;
    const scan = raw as {
      name?: unknown;
      mime_type?: unknown;
      type?: unknown;
      size?: unknown;
      data_url?: unknown;
      dataUrl?: unknown;
    };
    const name = typeof scan.name === "string" && scan.name.trim()
      ? scan.name.trim().slice(0, 180)
      : "room-scan.usdz";
    const mimeType = typeof scan.mime_type === "string"
      ? scan.mime_type
      : typeof scan.type === "string"
        ? scan.type
        : "application/octet-stream";
    const size = positiveNumber(scan.size);
    const dataUrl = typeof scan.data_url === "string"
      ? scan.data_url
      : typeof scan.dataUrl === "string"
        ? scan.dataUrl
        : undefined;
    const item: RoomScanFileInput = { name, mime_type: mimeType || "application/octet-stream" };
    if (size) item.size = size;
    if (dataUrl) item.data_url = dataUrl;
    scans.push(item);
  }
  return scans;
}

function scanExtension(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

function validateScans(scans: RoomScanFileInput[]): string | null {
  if (scans.length === 0) return "Upload at least one RoomPlan USDZ, USD, USDA, USDC, or JSON scan export";
  if (scans.length > MAX_SCAN_FILES) return `Upload no more than ${MAX_SCAN_FILES} scan files`;

  for (const scan of scans) {
    const ext = scanExtension(scan.name);
    if (!["usdz", "usd", "usda", "usdc", "json"].includes(ext)) {
      return "Scan files must be USDZ, USD, USDA, USDC, or JSON exports";
    }
    if (scan.data_url) {
      if (!scan.data_url.startsWith("data:") || !scan.data_url.includes(";base64,")) {
        return "Scan data must be a base64 data URL";
      }
      if (scan.data_url.length > MAX_DATA_URL_CHARS) {
        return "Each scan file must be compressed below 6 MB";
      }
    }
  }
  return null;
}

function parseOptions(raw: unknown): RoomScanImportOptions {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    floor_label: typeof value.floor_label === "string" && value.floor_label.trim()
      ? value.floor_label.trim().slice(0, 80)
      : "LiDAR scan",
    notes: typeof value.notes === "string" ? value.notes.trim().slice(0, 1200) : "",
    width_m: positiveNumber(value.width_m),
    depth_m: positiveNumber(value.depth_m),
    area_m2: positiveNumber(value.area_m2),
  };
}

function materialLine(
  materials: Map<string, MaterialRow>,
  materialId: string,
  quantity: number,
  fallbackUnit: string,
  note: string,
  confidence: number,
) {
  const material = materials.get(materialId);
  if (!material || quantity <= 0) return null;
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
    confidence: round(clamp(confidence, 0.25, 0.92), 2),
    note,
  };
}

function buildBomSuggestions(scan: ParsedRoomScan, materials: Map<string, MaterialRow>) {
  const wallLength = scan.walls.reduce((sum, wall) => sum + wall.length_m, 0);
  const doorCount = scan.openings.filter((opening) => opening.type === "door").length;
  const windowCount = scan.openings.filter((opening) => opening.type === "window").length;
  const confidence = scan.quality.parser === "fallback" ? 0.42 : scan.quality.parser === "json" ? 0.78 : 0.7;
  const boardArea = scan.surfaces.wall_area_m2 + scan.surfaces.ceiling_area_m2;
  const suggestions = [
    materialLine(materials, "pine_48x98_c24", wallLength * 3.1, "jm", "Stud, plate, and blocking allowance from scanned wall runs.", confidence),
    materialLine(materials, "gypsum_board_13mm", boardArea, "sqm", "Interior board area from scanned walls and ceilings.", confidence - 0.04),
    materialLine(materials, "osb_18mm", scan.surfaces.floor_area_m2 / OSB_SHEET_AREA_M2, "sheet", "Subfloor sheet allowance from scanned floor area.", confidence - 0.08),
    materialLine(materials, "vapor_barrier", scan.surfaces.wall_area_m2 * 0.35 + scan.surfaces.wet_room_area_m2, "sqm", "Membrane allowance for exterior-adjacent and wet-room surfaces.", confidence - 0.1),
    materialLine(materials, "trim_21x45", doorCount * 5.2 + windowCount * 6.4, "jm", "Trim allowance around scanned doors and windows.", confidence - 0.12),
    materialLine(materials, "door_thermal_bridge", Math.max(doorCount, scan.rooms.length > 1 ? scan.rooms.length - 1 : 0), "kpl", "Door count from RoomPlan openings; verify swing direction and product class.", confidence - 0.14),
    materialLine(materials, "exterior_paint_white", Math.max(1, boardArea / 8), "liter", "Paint allowance from scanned boardable surfaces; verify finish system.", confidence - 0.16),
  ];
  return suggestions.filter((item): item is Exclude<typeof item, null> => item !== null);
}

router.post(
  "/projects/:projectId/import",
  requireAuth,
  requirePermission("project:read_own"),
  checkCredits("quantityTakeoff"),
  async (req, res) => {
    const scans = normalizeScans(req.body?.scans);
    const scanError = validateScans(scans);
    if (scanError) return res.status(400).json({ error: scanError });

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
    const parsed = await parseRoomScanImport(scans, options, buildingInfo);

    const materialIds = [
      "pine_48x98_c24",
      "gypsum_board_13mm",
      "osb_18mm",
      "vapor_barrier",
      "trim_21x45",
      "door_thermal_bridge",
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

    const bomSuggestions = buildBomSuggestions(parsed, materials);
    const materialsTotal = bomSuggestions.reduce((sum, item) => sum + item.total, 0);
    const nonCatalogAllowance = roundMoney(parsed.surfaces.wet_room_area_m2 * 48 + parsed.openings.filter((opening) => opening.type === "window").length * 190);
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
      scanCount: scans.length,
      sourceFormat: parsed.source_format,
      parser: parsed.quality.parser,
      coveragePercent: parsed.quality.coverage_percent,
      roomCount: parsed.rooms.length,
      wallCount: parsed.walls.length,
      openingCount: parsed.openings.length,
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
      analysis_mode: process.env.ANTHROPIC_API_KEY ? "roomplan_import_ai_ready" : "roomplan_import",
      ...parsed,
      estimate,
      bom_suggestions: bomSuggestions,
      disclaimer: "LiDAR/RoomPlan import is a planning aid. Verify dimensions, wall types, wet-room systems, and product choices before buying materials or submitting permits.",
      credits: {
        cost: CREDIT_COSTS.quantityTakeoff,
        balance: debit.entry.balanceAfter,
      },
    });
  },
);

export default router;
