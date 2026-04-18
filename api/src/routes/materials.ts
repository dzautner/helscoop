import { Router } from "express";
import { query } from "../db";
import { requireAuth, requireAdmin } from "../auth";

const router = Router();

router.get("/", async (_req, res) => {
  const result = await query(`
    SELECT m.*, c.display_name AS category_name,
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
        'last_scraped_at', p.last_scraped_at
      ))
      FROM pricing p
      JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.material_id = m.id) AS pricing
    FROM materials m
    JOIN categories c ON m.category_id = c.id
    ORDER BY c.sort_order, m.name
  `);
  res.json(result.rows);
});

router.get("/:id", async (req, res) => {
  const result = await query(
    `SELECT m.*, c.display_name AS category_name FROM materials m
     JOIN categories c ON m.category_id = c.id WHERE m.id = $1`,
    [req.params.id]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ error: "Material not found" });

  const pricing = await query(
    `SELECT p.*, s.name AS supplier_name FROM pricing p
     JOIN suppliers s ON p.supplier_id = s.id WHERE p.material_id = $1`,
    [req.params.id]
  );

  const history = await query(
    `SELECT ph.*, p.supplier_id FROM pricing_history ph
     JOIN pricing p ON ph.pricing_id = p.id
     WHERE p.material_id = $1 ORDER BY ph.scraped_at DESC LIMIT 100`,
    [req.params.id]
  );

  res.json({
    ...result.rows[0],
    pricing: pricing.rows,
    price_history: history.rows,
  });
});

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  const {
    id, name, category_id, tags, description,
    visual_albedo, visual_roughness, visual_metallic,
    thermal_conductivity, thermal_thickness,
    waste_factor,
  } = req.body;

  const result = await query(
    `INSERT INTO materials (id, name, category_id, tags, description,
      visual_albedo, visual_roughness, visual_metallic,
      thermal_conductivity, thermal_thickness, waste_factor)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING *`,
    [id, name, category_id, tags || [], description,
     visual_albedo, visual_roughness ?? 0.5, visual_metallic ?? 0.0,
     thermal_conductivity, thermal_thickness, waste_factor ?? 1.05]
  );
  res.status(201).json(result.rows[0]);
});

router.put("/:id", requireAuth, requireAdmin, async (req, res) => {
  const { name, category_id, tags, description, waste_factor } = req.body;
  const result = await query(
    `UPDATE materials SET name=$1, category_id=$2, tags=$3, description=$4,
      waste_factor=$5, updated_at=now()
     WHERE id=$6 RETURNING *`,
    [name, category_id, tags, description, waste_factor, req.params.id]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ error: "Material not found" });
  res.json(result.rows[0]);
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  await query("DELETE FROM materials WHERE id=$1", [req.params.id]);
  res.json({ ok: true });
});

export default router;
