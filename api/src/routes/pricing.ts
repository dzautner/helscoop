import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { normalizeRole, requirePermission } from "../permissions";
import { buildMaterialTrend, buildProjectTrendSummary, type PriceHistoryInput } from "../material-trends";
import { notifyPriceWatchers } from "../price-alerts";

const router = Router();

const STOCK_LEVELS = ["in_stock", "low_stock", "out_of_stock", "unknown"] as const;
type StockLevel = typeof STOCK_LEVELS[number];

function isStockLevel(value: unknown): value is StockLevel {
  return typeof value === "string" && STOCK_LEVELS.includes(value as StockLevel);
}

// GET /pricing/compare/:materialId — price comparison (anyone with pricing:read)
router.get("/compare/:materialId", requireAuth, requirePermission("pricing:read"), async (req, res) => {
  const result = await query(
    `SELECT p.*, s.name AS supplier_name, s.url AS supplier_url
     FROM pricing p
     JOIN suppliers s ON p.supplier_id = s.id
     WHERE p.material_id = $1
     ORDER BY p.unit_price ASC`,
    [req.params.materialId]
  );
  res.json(result.rows);
});

// GET /pricing/stock/:materialId — supplier stock availability for one material
router.get("/stock/:materialId", requireAuth, requirePermission("pricing:read"), async (req, res) => {
  const result = await query(
    `SELECT p.material_id, p.supplier_id, s.name AS supplier_name, s.url AS supplier_url,
      p.link, p.is_primary,
      COALESCE(p.stock_level, 'unknown') AS stock_level,
      CASE
        WHEN p.stock_level IN ('in_stock', 'low_stock') THEN true
        WHEN p.stock_level = 'out_of_stock' THEN false
        ELSE p.in_stock
      END AS in_stock,
      p.store_location, p.last_checked_at
     FROM pricing p
     JOIN suppliers s ON p.supplier_id = s.id
     WHERE p.material_id = $1
     ORDER BY
       CASE COALESCE(p.stock_level, 'unknown')
         WHEN 'in_stock' THEN 0
         WHEN 'low_stock' THEN 1
         WHEN 'unknown' THEN 2
         ELSE 3
       END,
       p.is_primary DESC,
       p.unit_price ASC`,
    [req.params.materialId]
  );

  const stock = result.rows;
  const available = stock.filter((row: { stock_level?: string }) =>
    row.stock_level === "in_stock" || row.stock_level === "low_stock"
  ).length;

  res.json({
    material_id: req.params.materialId,
    total: stock.length,
    available,
    stock,
  });
});

// GET /pricing/trends/project/:projectId — BOM-level material cost trends and timing hints
router.get("/trends/project/:projectId", requireAuth, requirePermission("pricing:read"), async (req, res) => {
  const { projectId } = req.params;
  const user = req.user;

  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const isAdmin = normalizeRole(user.role) === "admin";
  const projectResult = await query(
    `SELECT id
     FROM projects
     WHERE id = $1
       AND ($2::boolean OR user_id = $3)
       AND deleted_at IS NULL`,
    [projectId, isAdmin, user.id],
  );

  if (projectResult.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }

  const bomResult = await query(
    `SELECT
       pb.material_id,
       pb.quantity,
       pb.unit,
       m.name AS material_name,
       c.display_name AS category_name,
       p.id AS pricing_id,
       COALESCE(p.unit_price, 0) AS unit_price,
       (pb.quantity * COALESCE(p.unit_price, 0) * COALESCE(m.waste_factor, 1)) AS line_cost
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     JOIN categories c ON m.category_id = c.id
     LEFT JOIN pricing p ON p.material_id = m.id AND p.is_primary = true
     WHERE pb.project_id = $1
     ORDER BY c.sort_order, m.name`,
    [projectId],
  );

  const pricingIds = bomResult.rows
    .map((row: { pricing_id?: string | null }) => row.pricing_id)
    .filter((id: string | null | undefined): id is string => Boolean(id));

  const historyByPricingId = new Map<string, PriceHistoryInput[]>();
  if (pricingIds.length > 0) {
    const historyResult = await query(
      `SELECT pricing_id, unit_price, scraped_at
       FROM pricing_history
       WHERE pricing_id = ANY($1::uuid[])
         AND scraped_at >= now() - interval '18 months'
       ORDER BY scraped_at ASC`,
      [pricingIds],
    );

    for (const row of historyResult.rows as { pricing_id: string; unit_price: string | number; scraped_at: string | Date }[]) {
      const values = historyByPricingId.get(row.pricing_id) ?? [];
      values.push({ unitPrice: Number(row.unit_price), scrapedAt: row.scraped_at });
      historyByPricingId.set(row.pricing_id, values);
    }
  }

  const items = bomResult.rows.map((row: {
    material_id: string;
    material_name: string;
    category_name: string | null;
    quantity: string | number;
    unit: string;
    pricing_id?: string | null;
    unit_price: string | number;
    line_cost: string | number;
  }) => buildMaterialTrend({
    materialId: row.material_id,
    materialName: row.material_name,
    categoryName: row.category_name,
    quantity: Number(row.quantity),
    unit: row.unit,
    unitPrice: Number(row.unit_price),
    lineCost: Number(row.line_cost),
    history: row.pricing_id ? historyByPricingId.get(row.pricing_id) : [],
  }));

  res.json({
    projectId,
    generatedAt: new Date().toISOString(),
    dataSources: Array.from(new Set(items.map((item) => item.source))),
    ...buildProjectTrendSummary(items),
  });
});

// PUT /pricing/:materialId/:supplierId — update pricing (admin or partner with pricing:update)
router.put(
  "/:materialId/:supplierId",
  requireAuth,
  requirePermission("pricing:update"),
  async (req, res) => {
    const {
      unit_price,
      unit,
      sku,
      ean,
      link,
      is_primary,
      in_stock,
      stock_level,
      store_location,
      last_checked_at,
    } = req.body;
    const { materialId, supplierId } = req.params;
    const normalizedStockLevel = stock_level === undefined ? undefined : stock_level;

    if (normalizedStockLevel !== undefined && !isStockLevel(normalizedStockLevel)) {
      return res.status(400).json({
        error: `stock_level must be one of: ${STOCK_LEVELS.join(", ")}`,
      });
    }

    if (in_stock !== undefined && typeof in_stock !== "boolean") {
      return res.status(400).json({ error: "in_stock must be a boolean" });
    }

    if (is_primary) {
      await query(
        "UPDATE pricing SET is_primary=false WHERE material_id=$1",
        [materialId]
      );
    }

    const stockWasProvided =
      in_stock !== undefined ||
      normalizedStockLevel !== undefined ||
      store_location !== undefined ||
      last_checked_at !== undefined;
    const checkedAt = stockWasProvided ? (last_checked_at ?? new Date().toISOString()) : null;

    const result = await query(
      `INSERT INTO pricing (
         material_id, supplier_id, unit, unit_price, sku, ean, link, is_primary,
         stock_level, in_stock, store_location, last_checked_at, last_verified_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9, 'unknown'),$10,$11,$12,now())
       ON CONFLICT (material_id, supplier_id) DO UPDATE SET
         unit=$3,
         previous_unit_price=CASE
           WHEN pricing.unit_price IS DISTINCT FROM $4 THEN pricing.unit_price
           ELSE pricing.previous_unit_price
         END,
         unit_price=$4, sku=$5, ean=$6, link=$7,
         is_primary=COALESCE($8, pricing.is_primary),
         stock_level=COALESCE($9, pricing.stock_level),
         in_stock=COALESCE($10, pricing.in_stock),
         store_location=COALESCE($11, pricing.store_location),
         last_checked_at=COALESCE($12, pricing.last_checked_at),
         last_verified_at=now(), updated_at=now()
       RETURNING *`,
      [
        materialId,
        supplierId,
        unit,
        unit_price,
        sku,
        ean,
        link,
        is_primary ?? false,
        normalizedStockLevel,
        in_stock,
        store_location,
        checkedAt,
      ]
    );

    await query(
      `INSERT INTO pricing_history (pricing_id, unit_price, source)
       VALUES ($1, $2, 'manual')`,
      [result.rows[0].id, unit_price]
    );

    await notifyPriceWatchers({
      materialId,
      supplierId,
      previousUnitPrice: result.rows[0].previous_unit_price,
      unitPrice: result.rows[0].unit_price,
      source: "manual",
    });

    res.json(result.rows[0]);
  }
);

// GET /pricing/history/:materialId — price history (anyone with pricing:read)
router.get("/history/:materialId", requireAuth, requirePermission("pricing:read"), async (req, res) => {
  const result = await query(
    `SELECT ph.*, p.supplier_id, s.name AS supplier_name
     FROM pricing_history ph
     JOIN pricing p ON ph.pricing_id = p.id
     JOIN suppliers s ON p.supplier_id = s.id
     WHERE p.material_id = $1
     ORDER BY ph.scraped_at DESC
     LIMIT 200`,
    [req.params.materialId]
  );
  res.json(result.rows);
});

// GET /pricing/stale — stale prices (admin only)
router.get("/stale", requireAuth, requirePermission("admin:access"), async (_req, res) => {
  const result = await query(
    `SELECT m.id, m.name, p.supplier_id, s.name AS supplier_name,
      p.unit_price, p.last_scraped_at,
      EXTRACT(EPOCH FROM (now() - p.last_scraped_at))/86400 AS days_stale
     FROM pricing p
     JOIN materials m ON p.material_id = m.id
     JOIN suppliers s ON p.supplier_id = s.id
     WHERE p.is_primary = true
       AND (p.last_scraped_at IS NULL OR p.last_scraped_at < now() - interval '30 days')
     ORDER BY p.last_scraped_at ASC NULLS FIRST`
  );
  res.json(result.rows);
});

export default router;
