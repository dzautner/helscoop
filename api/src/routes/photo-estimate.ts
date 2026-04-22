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

const router = Router();

const MAX_PHOTOS = 5;
const MAX_DATA_URL_CHARS = 1_600_000;

type ScopeId = "roof" | "facade" | "windows" | "insulation" | "heating" | "terrace";

interface PhotoInput {
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
  roof_material?: string;
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

interface ScopeEstimate {
  scope: ScopeId;
  confidence: number;
  rationale: string;
  quantity: number;
  unit: string;
  low_cost: number;
  mid_cost: number;
  high_cost: number;
  non_catalog_cost: number;
  bom_suggestions: {
    material_id: string;
    material_name: string;
    category_name: string | null;
    quantity: number;
    unit: string;
    unit_price: number;
    total: number;
    supplier: string | null;
    link: string | null;
    confidence: number;
    note: string;
  }[];
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseBuildingInfo(value: unknown): BuildingContext {
  if (typeof value === "string") {
    try {
      return parseBuildingInfo(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object") return {};
  return value as BuildingContext;
}

function normalizePhotos(input: unknown): PhotoInput[] {
  if (!Array.isArray(input)) return [];
  const normalized: PhotoInput[] = [];
  for (const raw of input.slice(0, MAX_PHOTOS + 1)) {
    if (!raw || typeof raw !== "object") continue;
    const photo = raw as { name?: unknown; mime_type?: unknown; type?: unknown; size?: unknown; data_url?: unknown; dataUrl?: unknown };
    const name = typeof photo.name === "string" && photo.name.trim() ? photo.name.trim().slice(0, 140) : "photo.jpg";
    const mimeType = typeof photo.mime_type === "string"
      ? photo.mime_type
      : typeof photo.type === "string"
        ? photo.type
        : "";
    const dataUrl = typeof photo.data_url === "string"
      ? photo.data_url
      : typeof photo.dataUrl === "string"
        ? photo.dataUrl
        : undefined;
    const size = Number(photo.size);
    const item: PhotoInput = { name, mime_type: mimeType };
    if (Number.isFinite(size) && size > 0) item.size = size;
    if (dataUrl) item.data_url = dataUrl;
    normalized.push(item);
  }
  return normalized;
}

function validatePhotos(photos: PhotoInput[]): string | null {
  if (photos.length === 0) return "Upload at least one house photo";
  if (photos.length > MAX_PHOTOS) return `Upload no more than ${MAX_PHOTOS} photos`;

  for (const photo of photos) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(photo.mime_type)) {
      return "Photos must be JPEG, PNG, or WebP images";
    }
    if (photo.data_url) {
      if (!photo.data_url.startsWith(`data:${photo.mime_type};base64,`)) {
        return "Photo data must be a base64 data URL matching its MIME type";
      }
      if (photo.data_url.length > MAX_DATA_URL_CHARS) {
        return "Each photo must be compressed below 1.6 MB";
      }
    }
  }
  return null;
}

function estimateGeometry(building: BuildingContext) {
  const area = clamp(Number(building.area_m2) || 120, 30, 420);
  const floors = clamp(Number(building.floors) || 1.5, 1, 3);
  const footprint = area / floors;
  const side = Math.sqrt(footprint);
  const perimeter = side * 4;
  const wallArea = perimeter * floors * 2.8 * 0.82;
  const roofPitchFactor = building.roof_type === "flat" ? 1.08 : 1.32;
  const roofArea = footprint * roofPitchFactor;
  return {
    area,
    floors,
    perimeter,
    wallArea,
    roofArea,
    windowCount: clamp(Math.round(area / 18), 4, 28),
    terraceArea: clamp(area * 0.14, 12, 45),
  };
}

const SCOPE_KEYWORDS: Record<ScopeId, string[]> = {
  roof: ["roof", "katto", "räystäs", "raystas", "gutter", "kouru", "pelti"],
  facade: ["facade", "julkisivu", "ulkoverhous", "paint", "maali", "siding", "cladding"],
  windows: ["window", "windows", "ikkuna", "ikkunat", "glass", "lasi"],
  insulation: ["insulation", "eriste", "eristys", "draft", "veto"],
  heating: ["heating", "heat", "oil", "öljy", "oljy", "boiler", "kattila", "lämmitys", "lammitys"],
  terrace: ["terrace", "terassi", "deck", "patio", "porch"],
};

function detectScopes(photos: PhotoInput[], building: BuildingContext): ScopeId[] {
  const text = photos.map((photo) => photo.name.toLowerCase()).join(" ");
  const detected = new Set<ScopeId>();
  for (const [scope, keywords] of Object.entries(SCOPE_KEYWORDS) as [ScopeId, string[]][]) {
    if (keywords.some((keyword) => text.includes(keyword))) detected.add(scope);
  }

  const year = Number(building.year_built) || 0;
  const heating = String(building.heating || "").toLowerCase();
  if (detected.size === 0) {
    detected.add("facade");
    detected.add("roof");
    if (!year || year < 1995) detected.add("windows");
  }
  if (year > 0 && year < 1985) detected.add("insulation");
  if (heating.includes("oil") || heating.includes("öljy") || heating.includes("oljy") || heating.includes("gas")) {
    detected.add("heating");
  }

  return Array.from(detected).slice(0, 5);
}

function materialLine(materials: Map<string, MaterialRow>, materialId: string, quantity: number, fallbackUnit: string, note: string, confidence: number) {
  const material = materials.get(materialId);
  if (!material) return null;
  const unitPrice = Number(material.unit_price) || 0;
  const unit = material.unit || fallbackUnit;
  return {
    material_id: material.id,
    material_name: material.name,
    category_name: material.category_name,
    quantity: roundQuantity(quantity),
    unit,
    unit_price: unitPrice,
    total: roundMoney(quantity * unitPrice),
    supplier: material.supplier_name,
    link: material.link,
    confidence,
    note,
  };
}

function scopeEstimate(scope: ScopeId, photos: PhotoInput[], building: BuildingContext, materials: Map<string, MaterialRow>): ScopeEstimate {
  const geometry = estimateGeometry(building);
  const photoText = photos.map((photo) => photo.name.toLowerCase()).join(" ");
  const explicitPhotoSignal = SCOPE_KEYWORDS[scope].some((keyword) => photoText.includes(keyword));
  const confidence = explicitPhotoSignal ? 0.78 : 0.58;
  const rationale = explicitPhotoSignal
    ? "Scope matched uploaded photo names and was quantified with project building metadata."
    : "Scope inferred from building age, heating, and area; verify visible condition before purchase.";

  let quantity = 1;
  let unit = "kpl";
  let nonCatalogCost = 0;
  const suggestions: ReturnType<typeof materialLine>[] = [];

  if (scope === "roof") {
    quantity = geometry.roofArea;
    unit = "m2";
    nonCatalogCost = quantity * 42;
    suggestions.push(
      materialLine(materials, "galvanized_roofing", quantity, "sqm", "Roof covering estimated from footprint and roof type.", confidence),
      materialLine(materials, "galvanized_flashing", geometry.perimeter, "jm", "Perimeter flashing allowance.", confidence - 0.05),
      materialLine(materials, "screws_50mm", Math.max(1, quantity / 35), "box", "Fastener allowance for roof work.", confidence - 0.12),
    );
  } else if (scope === "facade") {
    quantity = geometry.wallArea;
    unit = "m2";
    nonCatalogCost = quantity * 24;
    suggestions.push(
      materialLine(materials, "exterior_board_yellow", quantity / 2.4, "sheet", "Facade board quantity estimated from wall area.", confidence - 0.08),
      materialLine(materials, "exterior_paint_white", quantity / 6, "liter", "Exterior paint estimated with one-coat coverage.", confidence),
      materialLine(materials, "trim_21x45", geometry.perimeter * 1.4, "jm", "Trim allowance around visible facade edges.", confidence - 0.1),
    );
  } else if (scope === "windows") {
    quantity = geometry.windowCount;
    unit = "kpl";
    nonCatalogCost = quantity * 740;
    suggestions.push(
      materialLine(materials, "trim_21x45", quantity * 7.2, "jm", "Trim allowance around windows.", confidence - 0.08),
      materialLine(materials, "exterior_paint_white", Math.max(1, quantity * 0.7), "liter", "Touch-up paint allowance for window surrounds.", confidence - 0.1),
    );
  } else if (scope === "insulation") {
    quantity = geometry.wallArea;
    unit = "m2";
    nonCatalogCost = quantity * 26;
    suggestions.push(
      materialLine(materials, "insulation_100mm", quantity, "sqm", "Wall insulation quantity estimated from exterior wall area.", confidence),
      materialLine(materials, "vapor_barrier", quantity, "sqm", "Vapour barrier matched to insulation area.", confidence - 0.06),
      materialLine(materials, "osb_9mm", quantity / 2.88, "sheet", "Interior sheathing allowance where walls are opened.", confidence - 0.14),
    );
  } else if (scope === "heating") {
    quantity = 1;
    unit = "system";
    nonCatalogCost = 9800;
  } else if (scope === "terrace") {
    quantity = geometry.terraceArea;
    unit = "m2";
    nonCatalogCost = quantity * 55;
    suggestions.push(
      materialLine(materials, "pressure_treated_48x148", quantity * 2.8, "jm", "Joist/frame allowance for terrace area.", confidence),
      materialLine(materials, "cedar_post_98x98", Math.max(8, quantity / 2), "jm", "Post allowance for terrace support.", confidence - 0.08),
      materialLine(materials, "concrete_block", Math.max(6, quantity / 3), "kpl", "Foundation block allowance.", confidence - 0.12),
      materialLine(materials, "screws_50mm", Math.max(1, quantity / 10), "box", "Fastener allowance.", confidence - 0.1),
    );
  }

  const bomSuggestions = suggestions.filter((item): item is Exclude<ReturnType<typeof materialLine>, null> => item !== null);
  const catalogCost = bomSuggestions.reduce((sum, item) => sum + item.total, 0);
  const midCost = roundMoney(catalogCost + nonCatalogCost);
  return {
    scope,
    confidence,
    rationale,
    quantity: roundQuantity(quantity),
    unit,
    low_cost: roundMoney(midCost * 0.78),
    mid_cost: midCost,
    high_cost: roundMoney(midCost * 1.28),
    non_catalog_cost: roundMoney(nonCatalogCost),
    bom_suggestions: bomSuggestions,
  };
}

router.post(
  "/projects/:projectId/analyze",
  requireAuth,
  requirePermission("project:read_own"),
  checkCredits("photoEstimate"),
  async (req, res) => {
    const photos = normalizePhotos(req.body?.photos);
    const photoError = validatePhotos(photos);
    if (photoError) return res.status(400).json({ error: photoError });

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

    const materialIds = [
      "galvanized_roofing",
      "galvanized_flashing",
      "screws_50mm",
      "exterior_board_yellow",
      "exterior_paint_white",
      "trim_21x45",
      "insulation_100mm",
      "vapor_barrier",
      "osb_9mm",
      "pressure_treated_48x148",
      "cedar_post_98x98",
      "concrete_block",
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

    const scopes = detectScopes(photos, buildingInfo).map((scope) => scopeEstimate(scope, photos, buildingInfo, materials));
    const estimate = scopes.reduce(
      (total, scope) => ({
        low: roundMoney(total.low + scope.low_cost),
        mid: roundMoney(total.mid + scope.mid_cost),
        high: roundMoney(total.high + scope.high_cost),
      }),
      { low: 0, mid: 0, high: 0 },
    );

    const subsidyFlags = String(buildingInfo.heating || "").toLowerCase().match(/oil|öljy|oljy|gas/)
      ? [{
          id: "fossil_heating_replacement",
          label: "Potential fossil-heating replacement support",
          reason: "Project heating metadata suggests fossil heating. Verify current ELY/ARA and tax-deduction rules before applying.",
        }]
      : [];

    const debit = await deductCreditsForFeature(req.user!.id, "photoEstimate", {
      projectId: req.params.projectId,
      photoCount: photos.length,
      scopes: scopes.map((scope) => scope.scope),
    });
    if (!debit.ok) {
      return res.status(402).json({
        error: "insufficient_credits",
        feature: "photoEstimate",
        cost: debit.cost,
        balance: debit.balance,
        packs: CREDIT_PACKS,
      } satisfies InsufficientCreditsBody);
    }

    res.json({
      project_id: project.id,
      project_name: project.name,
      analysis_mode: process.env.ANTHROPIC_API_KEY ? "catalog_heuristic_ai_ready" : "catalog_heuristic",
      photos_analyzed: photos.length,
      building_context: {
        area_m2: buildingInfo.area_m2 ?? null,
        year_built: buildingInfo.year_built ?? null,
        floors: buildingInfo.floors ?? null,
        heating: buildingInfo.heating ?? null,
        roof_type: buildingInfo.roof_type ?? null,
      },
      estimate,
      scopes,
      subsidy_flags: subsidyFlags,
      disclaimer: "Photo estimates are planning ranges, not binding quotes. Confirm visible condition, dimensions, permits, and contractor labour before purchasing.",
      credits: {
        cost: CREDIT_COSTS.photoEstimate,
        balance: debit.entry.balanceAfter,
      },
    });
  },
);

export default router;
