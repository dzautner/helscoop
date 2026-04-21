import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { requirePermission } from "../permissions";

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
         unit=$3, unit_price=$4, sku=$5, ean=$6, link=$7,
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
