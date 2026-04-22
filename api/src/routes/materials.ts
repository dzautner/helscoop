import { Router } from "express";
import * as fs from "fs";
import * as path from "path";
import { query } from "../db";
import { requireAuth } from "../auth";
import { requirePermission } from "../permissions";

const router = Router();

// ---------------------------------------------------------------------------
// Static catalog helpers
// ---------------------------------------------------------------------------

interface CatalogMaterial {
  purchasableUnit?: string;
  designUnit?: string;
  packSize?: number | null;
  conversionFactor?: number;
  vatClass?: number;
  supplierSku?: Record<string, string>;
  substitutionGroup?: string | null;
  lastUpdated?: string;
}

interface Catalog {
  version: number;
  materials: Record<string, CatalogMaterial>;
}

let _catalog: Catalog | null = null;

function getCatalog(): Catalog {
  if (_catalog) return _catalog;
  const catalogPath = path.resolve(__dirname, "../../../materials/materials.json");
  try {
    const raw = fs.readFileSync(catalogPath, "utf-8");
    _catalog = JSON.parse(raw) as Catalog;
  } catch {
    _catalog = { version: 2, materials: {} };
  }
  return _catalog;
}

/**
 * Convert a design-unit quantity to the purchasable buy quantity.
 *
 * Examples:
 *   osb_9mm: designQty=10 m² → buyQty=3.473 sheets  (10 * 0.347222)
 *   pine_48x98_c24: designQty=15 m → buyQty=15 m  (1-to-1)
 *
 * Returns null when the material is not in the static catalog or has no
 * conversionFactor defined.
 */
export function designQtyToBuyQty(
  materialId: string,
  designQty: number,
): { buyQty: number; purchasableUnit: string; packSize: number | null } | null {
  const catalog = getCatalog();
  const entry = catalog.materials[materialId];
  if (!entry || entry.conversionFactor === undefined) return null;

  const rawBuyQty = designQty * entry.conversionFactor;
  // Keep 3 decimal places; callers should ceil for whole-unit purchases
  const buyQty = Math.round(rawBuyQty * 1000) / 1000;
  return {
    buyQty,
    purchasableUnit: entry.purchasableUnit ?? "kpl",
    packSize: entry.packSize ?? null,
  };
}

/** Attach catalog-derived fields to a material DB row */
function enrichWithCatalogFields(row: Record<string, unknown>): Record<string, unknown> {
  const catalog = getCatalog();
  const entry = catalog.materials[row["id"] as string];
  if (!entry) return row;
  return {
    ...row,
    purchasable_unit: entry.purchasableUnit ?? null,
    design_unit: entry.designUnit ?? null,
    pack_size: entry.packSize ?? null,
    conversion_factor: entry.conversionFactor ?? null,
    vat_class: entry.vatClass ?? null,
    supplier_sku: entry.supplierSku ?? {},
    substitution_group: entry.substitutionGroup ?? null,
    last_updated: entry.lastUpdated ?? null,
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const STOCK_RISK_LEVELS = new Set(["low_stock", "out_of_stock"]);

function toNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildSubstitutionReasons(row: Record<string, unknown>): string[] {
  const reasons: string[] = [];
  const currentPrice = toNumber(row.current_unit_price);
  const previousPrice = toNumber(row.previous_unit_price);
  const substitutePrice = toNumber(row.unit_price);

  if (typeof row.current_stock_level === "string" && STOCK_RISK_LEVELS.has(row.current_stock_level)) {
    reasons.push("current_stock_risk");
  }
  if (
    currentPrice != null &&
    previousPrice != null &&
    previousPrice > 0 &&
    ((currentPrice - previousPrice) / previousPrice) * 100 >= 15
  ) {
    reasons.push("price_spike");
  }
  if (
    currentPrice != null &&
    substitutePrice != null &&
    currentPrice > 0 &&
    substitutePrice < currentPrice &&
    ((currentPrice - substitutePrice) / currentPrice) * 100 >= 10
  ) {
    reasons.push("cheaper_equivalent");
  }

  if (reasons.length === 0) reasons.push("mapped_substitution");
  return reasons;
}

function formatSubstitutionSuggestion(row: Record<string, unknown>) {
  const currentPrice = toNumber(row.current_unit_price);
  const substitutePrice = toNumber(row.unit_price);
  const savingsPerUnit =
    currentPrice != null && substitutePrice != null
      ? Math.max(0, currentPrice - substitutePrice)
      : 0;
  const savingsPercent =
    currentPrice != null && currentPrice > 0
      ? (savingsPerUnit / currentPrice) * 100
      : 0;

  return {
    material_id: row.substitute_id,
    material_name: row.substitute_name,
    category_name: row.category_name,
    substitution_type: row.substitution_type,
    confidence: row.confidence,
    notes: row.notes,
    unit_price: substitutePrice,
    unit: row.unit,
    supplier_id: row.supplier_id,
    supplier_name: row.supplier_name,
    link: row.link,
    stock_level: row.stock_level ?? "unknown",
    savings_per_unit: savingsPerUnit,
    savings_percent: savingsPercent,
    trigger_reasons: buildSubstitutionReasons(row),
  };
}

router.get("/", async (_req, res) => {
  const result = await query(`
    SELECT m.*, c.display_name AS category_name, c.display_name_fi AS category_name_fi,
      (SELECT json_agg(json_build_object(
        'supplier_id', p.supplier_id,
        'supplier_name', s.name,
        'unit', p.unit,
        'unit_price', p.unit_price,
        'currency', p.currency,
        'sku', p.sku,
        'ean', p.ean,
        'link', p.link,
        'is_primary', p.is_primary,
        'in_stock', p.in_stock,
        'stock_level', p.stock_level,
        'store_location', p.store_location,
        'last_checked_at', p.last_checked_at,
        'last_scraped_at', p.last_scraped_at
      ))
      FROM pricing p
      JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.material_id = m.id) AS pricing
    FROM materials m
    JOIN categories c ON m.category_id = c.id
    ORDER BY c.sort_order, m.name
  `);
  const enriched = result.rows.map((row) =>
    enrichWithCatalogFields(row as Record<string, unknown>),
  );
  res.json(enriched);
});

router.get("/:id/substitutions", requireAuth, requirePermission("material:read"), async (req, res) => {
  const material = await query(
    `SELECT m.id, m.name, p.unit_price AS current_unit_price,
       p.previous_unit_price, COALESCE(p.stock_level, 'unknown') AS current_stock_level
     FROM materials m
     LEFT JOIN pricing p ON p.material_id = m.id AND p.is_primary = true
     WHERE m.id = $1`,
    [req.params.id],
  );
  if (material.rows.length === 0) {
    return res.status(404).json({ error: "Material not found" });
  }

  const result = await query(
    `SELECT
       ms.material_id,
       ms.substitute_id,
       ms.substitution_type,
       ms.confidence,
       ms.notes,
       sub.name AS substitute_name,
       c.display_name AS category_name,
       current_p.unit_price AS current_unit_price,
       current_p.previous_unit_price,
       COALESCE(current_p.stock_level, 'unknown') AS current_stock_level,
       p.unit_price,
       p.unit,
       p.link,
       COALESCE(p.stock_level, 'unknown') AS stock_level,
       p.supplier_id,
       s.name AS supplier_name
     FROM material_substitutions ms
     JOIN materials sub ON sub.id = ms.substitute_id
     JOIN categories c ON c.id = sub.category_id
     LEFT JOIN pricing current_p
       ON current_p.material_id = ms.material_id AND current_p.is_primary = true
     LEFT JOIN pricing p
       ON p.material_id = ms.substitute_id AND p.is_primary = true
     LEFT JOIN suppliers s ON s.id = p.supplier_id
     WHERE ms.material_id = $1
     ORDER BY
       CASE COALESCE(p.stock_level, 'unknown')
         WHEN 'in_stock' THEN 0
         WHEN 'low_stock' THEN 1
         WHEN 'unknown' THEN 2
         ELSE 3
       END,
       p.unit_price ASC NULLS LAST,
       sub.name ASC`,
    [req.params.id],
  );

  res.json({
    material_id: material.rows[0].id,
    material_name: material.rows[0].name,
    current: {
      unit_price: toNumber(material.rows[0].current_unit_price),
      previous_unit_price: toNumber(material.rows[0].previous_unit_price),
      stock_level: material.rows[0].current_stock_level ?? "unknown",
    },
    suggestions: result.rows.map((row) =>
      formatSubstitutionSuggestion(row as Record<string, unknown>),
    ),
  });
});

router.get("/:id", async (req, res) => {
  const result = await query(
    `SELECT m.*, c.display_name AS category_name FROM materials m
     JOIN categories c ON m.category_id = c.id WHERE m.id = $1`,
    [req.params.id],
  );
  if (result.rows.length === 0)
    return res.status(404).json({ error: "Material not found" });

  const pricing = await query(
    `SELECT p.*, s.name AS supplier_name FROM pricing p
     JOIN suppliers s ON p.supplier_id = s.id WHERE p.material_id = $1`,
    [req.params.id],
  );

  const history = await query(
    `SELECT ph.*, p.supplier_id FROM pricing_history ph
     JOIN pricing p ON ph.pricing_id = p.id
     WHERE p.material_id = $1 ORDER BY ph.scraped_at DESC LIMIT 100`,
    [req.params.id],
  );

  const enriched = enrichWithCatalogFields(result.rows[0] as Record<string, unknown>);
  res.json({
    ...enriched,
    pricing: pricing.rows,
    price_history: history.rows,
  });
});

router.get("/:id/prices", async (req, res) => {
  const material = await query(
    "SELECT id, name FROM materials WHERE id = $1",
    [req.params.id],
  );
  if (material.rows.length === 0)
    return res.status(404).json({ error: "Material not found" });

  const result = await query(
    `SELECT p.id, p.material_id, p.supplier_id, p.unit, p.unit_price, p.currency,
      p.sku, p.ean, p.link, p.is_primary,
      p.in_stock, p.stock_level, p.store_location, p.last_checked_at,
      p.last_scraped_at, p.last_verified_at,
      s.name AS supplier_name, s.url AS supplier_url, s.logo_url AS supplier_logo
     FROM pricing p
     JOIN suppliers s ON p.supplier_id = s.id
     WHERE p.material_id = $1
     ORDER BY p.unit_price ASC`,
    [req.params.id],
  );

  const prices = result.rows;
  const cheapest = prices.length > 0 ? parseFloat(prices[0].unit_price) : null;
  const primaryRow = prices.find((p) => p.is_primary);
  const primaryPrice = primaryRow ? parseFloat(primaryRow.unit_price) : null;
  const savings =
    cheapest !== null && primaryPrice !== null && primaryPrice > cheapest
      ? primaryPrice - cheapest
      : 0;

  res.json({
    material_id: req.params.id,
    material_name: material.rows[0].name,
    prices,
    cheapest_price: cheapest,
    primary_price: primaryPrice,
    savings_per_unit: savings,
  });
});

/**
 * POST /materials/catalog/convert
 *
 * Batch-convert design quantities to purchasable buy quantities.
 *
 * Request body: { items: [{ materialId: string, designQty: number }] }
 * Response:     { results: [{ materialId, designQty, buyQty, purchasableUnit, packSize } | { materialId, error }] }
 */
router.post("/catalog/convert", (req, res) => {
  const { items } = req.body as {
    items?: { materialId: string; designQty: number }[];
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items must be a non-empty array" });
  }
  if (items.length > 200) {
    return res
      .status(400)
      .json({ error: "items must not exceed 200 entries per request" });
  }

  const results = items.map(({ materialId, designQty }) => {
    if (
      typeof materialId !== "string" ||
      typeof designQty !== "number" ||
      designQty < 0
    ) {
      return { materialId, error: "invalid input" };
    }
    const conversion = designQtyToBuyQty(materialId, designQty);
    if (!conversion) {
      return { materialId, error: "material not found in static catalog" };
    }
    return { materialId, designQty, ...conversion };
  });

  res.json({ results });
});

router.post("/", requireAuth, requirePermission("material:create"), async (req, res) => {
  const {
    id,
    name,
    category_id,
    tags,
    description,
    visual_albedo,
    visual_roughness,
    visual_metallic,
    thermal_conductivity,
    thermal_thickness,
    waste_factor,
  } = req.body;

  const result = await query(
    `INSERT INTO materials (id, name, category_id, tags, description,
      visual_albedo, visual_roughness, visual_metallic,
      thermal_conductivity, thermal_thickness, waste_factor)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [
      id,
      name,
      category_id,
      tags || [],
      description,
      visual_albedo,
      visual_roughness ?? 0.5,
      visual_metallic ?? 0.0,
      thermal_conductivity,
      thermal_thickness,
      waste_factor ?? 1.05,
    ],
  );
  res.status(201).json(result.rows[0]);
});

router.put("/:id", requireAuth, requirePermission("material:update"), async (req, res) => {
  const { name, category_id, tags, description, waste_factor } = req.body;
  const result = await query(
    `UPDATE materials SET name=$1, category_id=$2, tags=$3, description=$4,
      waste_factor=$5, updated_at=now()
     WHERE id=$6 RETURNING *`,
    [name, category_id, tags, description, waste_factor, req.params.id],
  );
  if (result.rows.length === 0)
    return res.status(404).json({ error: "Material not found" });
  res.json(result.rows[0]);
});

router.delete("/:id", requireAuth, requirePermission("material:delete"), async (req, res) => {
  await query("DELETE FROM materials WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

export default router;
