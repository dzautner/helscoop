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
