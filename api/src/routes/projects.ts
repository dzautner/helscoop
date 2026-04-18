import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res) => {
  const result = await query(
    `SELECT id, name, description, is_public, created_at, updated_at,
      (SELECT COALESCE(SUM(pb.quantity * p.unit_price * m.waste_factor), 0)
       FROM project_bom pb
       JOIN pricing p ON pb.material_id = p.material_id AND p.is_primary = true
       JOIN materials m ON pb.material_id = m.id
       WHERE pb.project_id = projects.id) AS estimated_cost
     FROM projects WHERE user_id = $1 ORDER BY updated_at DESC`,
    [req.user!.id]
  );
  res.json(result.rows);
});

router.post("/", async (req, res) => {
  const { name, description, scene_js } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Project name is required" });
  }
  if (name.length > 200) {
    return res.status(400).json({ error: "Project name must be 200 characters or fewer" });
  }
  const result = await query(
    `INSERT INTO projects (user_id, name, description, scene_js)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user!.id, name.trim(), description, scene_js]
  );
  res.status(201).json(result.rows[0]);
});

router.get("/:id", async (req, res) => {
  const result = await query(
    "SELECT * FROM projects WHERE id=$1 AND user_id=$2",
    [req.params.id, req.user!.id]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ error: "Project not found" });

  const bom = await query(
    `SELECT pb.*, m.name AS material_name, c.display_name AS category_name,
      p.unit_price, p.link, s.name AS supplier_name,
      (pb.quantity * p.unit_price * m.waste_factor) AS line_cost
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     JOIN categories c ON m.category_id = c.id
     LEFT JOIN pricing p ON m.id = p.material_id AND p.is_primary = true
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE pb.project_id = $1
     ORDER BY c.sort_order`,
    [req.params.id]
  );

  res.json({ ...result.rows[0], bom: bom.rows });
});

router.put("/:id", async (req, res) => {
  const { name, description, scene_js } = req.body;
  if (name !== undefined && (typeof name !== "string" || name.length > 200)) {
    return res.status(400).json({ error: "Project name must be 200 characters or fewer" });
  }
  const result = await query(
    `UPDATE projects SET name=$1, description=$2, scene_js=$3, updated_at=now()
     WHERE id=$4 AND user_id=$5 RETURNING *`,
    [name?.trim(), description, scene_js, req.params.id, req.user!.id]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ error: "Project not found" });
  res.json(result.rows[0]);
});

router.delete("/:id", async (req, res) => {
  await query("DELETE FROM projects WHERE id=$1 AND user_id=$2", [
    req.params.id,
    req.user!.id,
  ]);
  res.json({ ok: true });
});

router.put("/:id/bom", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items))
    return res.status(400).json({ error: "items must be an array" });

  const proj = await query(
    "SELECT id FROM projects WHERE id=$1 AND user_id=$2",
    [req.params.id, req.user!.id]
  );
  if (proj.rows.length === 0)
    return res.status(404).json({ error: "Project not found" });

  try {
    await query("DELETE FROM project_bom WHERE project_id=$1", [req.params.id]);
    let inserted = 0;
    for (const item of items) {
      const matExists = await query("SELECT id FROM materials WHERE id=$1", [item.material_id]);
      if (matExists.rows.length === 0) continue;
      await query(
        `INSERT INTO project_bom (project_id, material_id, quantity, unit)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, item.material_id, item.quantity, item.unit || "kpl"]
      );
      inserted++;
    }
    res.json({ ok: true, count: inserted, skipped: items.length - inserted });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to save BOM", detail: err.message });
  }
});

router.post("/:id/duplicate", async (req, res) => {
  const src = await query(
    "SELECT * FROM projects WHERE id=$1 AND user_id=$2",
    [req.params.id, req.user!.id]
  );
  if (src.rows.length === 0)
    return res.status(404).json({ error: "Project not found" });
  const p = src.rows[0];
  const dup = await query(
    `INSERT INTO projects (user_id, name, description, scene_js, display_scale)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user!.id, p.name + " (copy)", p.description, p.scene_js, p.display_scale]
  );
  res.status(201).json(dup.rows[0]);
});

export default router;
