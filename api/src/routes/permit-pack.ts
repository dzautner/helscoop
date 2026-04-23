import { Router } from "express";
import { requireAuth } from "../auth";
import { query } from "../db";
import logger from "../logger";
import { generatePermitPack, PERMIT_PACK_FORMAT } from "../permit-pack";
import type { PermitPackBomItem, PermitPackProject } from "../permit-pack";

const router = Router();

router.use(requireAuth);

function safeFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 80) || "helscoop_project";
}

async function loadProject(projectId: string, userId: string): Promise<PermitPackProject | null> {
  const result = await query(
    `SELECT id, name, description, scene_js, building_info, permit_metadata
     FROM projects
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [projectId, userId],
  );
  return result.rows[0] ?? null;
}

async function loadBom(projectId: string): Promise<PermitPackBomItem[]> {
  const result = await query(
    `SELECT pb.material_id, pb.quantity, pb.unit,
            m.name AS material_name,
            c.display_name AS category_name,
            m.structural_grade_class,
            COALESCE(pr.unit_price, 0) AS unit_price,
            s.name AS supplier_name
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     LEFT JOIN categories c ON m.category_id = c.id
     LEFT JOIN pricing pr ON pb.material_id = pr.material_id AND pr.is_primary = true
     LEFT JOIN suppliers s ON pr.supplier_id = s.id
     WHERE pb.project_id = $1
     ORDER BY c.sort_order NULLS LAST, m.name ASC`,
    [projectId],
  );

  return result.rows.map((row) => ({
    material_id: row.material_id,
    material_name: row.material_name,
    category_name: row.category_name,
    structural_grade_class: row.structural_grade_class,
    supplier_name: row.supplier_name,
    quantity: Number(row.quantity) || 0,
    unit: row.unit || "kpl",
    unit_price: Number(row.unit_price) || 0,
  }));
}

router.get("/projects/:id/export", async (req, res) => {
  const projectId = req.params.id;

  try {
    const project = await loadProject(projectId, req.user!.id);
    if (!project) return res.status(404).json({ error: "Project not found" });

    const bom = await loadBom(project.id);
    const { buffer, manifest } = await generatePermitPack({ project, bom });
    const safeName = safeFileName(project.name);

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}_permit_pack.zip"`);
    res.setHeader("X-Helscoop-Permit-Pack", PERMIT_PACK_FORMAT);
    res.setHeader("X-Helscoop-Permit-Pack-Drawings", String(manifest.drawings.length));
    res.send(buffer);
  } catch (err) {
    logger.error({ err, projectId }, "Permit pack export failed");
    res.status(500).json({ error: "Failed to generate permit pack" });
  }
});

export default router;
