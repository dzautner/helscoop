import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { requirePermission } from "../permissions";

const router = Router();

// GET /suppliers — list all suppliers (anyone with supplier:read)
router.get("/", requireAuth, requirePermission("supplier:read"), async (_req, res) => {
  const result = await query(
    `SELECT s.*,
      (SELECT COUNT(*) FROM pricing p WHERE p.supplier_id = s.id) AS product_count,
      (SELECT MIN(p.last_scraped_at) FROM pricing p WHERE p.supplier_id = s.id) AS oldest_price
     FROM suppliers s ORDER BY s.name`
  );
  res.json(result.rows);
});

// GET /suppliers/:id — single supplier detail (anyone with supplier:read)
router.get("/:id", requireAuth, requirePermission("supplier:read"), async (req, res) => {
  const result = await query("SELECT * FROM suppliers WHERE id=$1", [
    req.params.id,
  ]);
  if (result.rows.length === 0)
    return res.status(404).json({ error: "Supplier not found" });

  const products = await query(
    `SELECT p.*, m.name AS material_name, m.category_id
     FROM pricing p JOIN materials m ON p.material_id = m.id
     WHERE p.supplier_id = $1 ORDER BY m.name`,
    [req.params.id]
  );
  res.json({ ...result.rows[0], products: products.rows });
});

// PUT /suppliers/:id — update supplier (admin or partner with supplier:update)
router.put("/:id", requireAuth, requirePermission("supplier:update"), async (req, res) => {
  const { name, url, scrape_enabled, scrape_config } = req.body;
  const result = await query(
    `UPDATE suppliers SET name=$1, url=$2, scrape_enabled=$3,
      scrape_config=$4, updated_at=now()
     WHERE id=$5 RETURNING *`,
    [name, url, scrape_enabled, JSON.stringify(scrape_config), req.params.id]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ error: "Supplier not found" });
  res.json(result.rows[0]);
});

// GET /suppliers/:id/scrape-history — scrape history (admin only)
router.get("/:id/scrape-history", requireAuth, requirePermission("admin:access"), async (req, res) => {
  const result = await query(
    `SELECT * FROM scrape_runs WHERE supplier_id=$1 ORDER BY started_at DESC LIMIT 50`,
    [req.params.id]
  );
  res.json(result.rows);
});

export default router;
