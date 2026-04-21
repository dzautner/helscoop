import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { requirePermission } from "../permissions";

const router = Router();

/**
 * GET /stock/:materialId
 *
 * Returns stock availability for a single material across all suppliers
 * and store locations.
 *
 * Response: { materialId, suppliers: [{ supplierId, storeName, stockLevel, lastChecked }] }
 */
router.get("/:materialId", requireAuth, requirePermission("material:read"), async (req, res) => {
  const { materialId } = req.params;

  // Verify material exists
  const matResult = await query("SELECT id FROM materials WHERE id = $1", [materialId]);
  if (matResult.rows.length === 0) {
    return res.status(404).json({ error: "Material not found" });
  }

  const result = await query(
    `SELECT ss.supplier_id, s.name AS store_name, ss.stock_level, ss.store_location, ss.last_checked_at
     FROM stock_status ss
     JOIN suppliers s ON ss.supplier_id = s.id
     WHERE ss.material_id = $1
     ORDER BY s.name, ss.store_location`,
    [materialId]
  );

  res.json({
    materialId,
    suppliers: result.rows.map((row) => ({
      supplierId: row.supplier_id,
      storeName: row.store_name,
      storeLocation: row.store_location,
      stockLevel: row.stock_level,
      lastChecked: row.last_checked_at,
    })),
  });
});

/**
 * GET /stock/project/:projectId
 *
 * Returns stock availability for all BOM items in a project, grouped
 * by material.
 *
 * Response: { projectId, materials: [{ materialId, materialName, suppliers: [...] }] }
 */
router.get("/project/:projectId", requireAuth, requirePermission("project:read_own"), async (req, res) => {
  const { projectId } = req.params;

  // Verify project exists
  const projResult = await query("SELECT id FROM projects WHERE id = $1", [projectId]);
  if (projResult.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }

  const result = await query(
    `SELECT pb.material_id, m.name AS material_name,
            ss.supplier_id, s.name AS store_name,
            ss.stock_level, ss.store_location, ss.last_checked_at
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     LEFT JOIN stock_status ss ON pb.material_id = ss.material_id
     LEFT JOIN suppliers s ON ss.supplier_id = s.id
     WHERE pb.project_id = $1
     ORDER BY m.name, s.name, ss.store_location`,
    [projectId]
  );

  // Group by material
  const materialMap = new Map<string, {
    materialId: string;
    materialName: string;
    suppliers: Array<{
      supplierId: string;
      storeName: string;
      storeLocation: string | null;
      stockLevel: string;
      lastChecked: string;
    }>;
  }>();

  for (const row of result.rows) {
    if (!materialMap.has(row.material_id)) {
      materialMap.set(row.material_id, {
        materialId: row.material_id,
        materialName: row.material_name,
        suppliers: [],
      });
    }

    // Only add supplier data if stock_status join returned data
    if (row.supplier_id) {
      materialMap.get(row.material_id)!.suppliers.push({
        supplierId: row.supplier_id,
        storeName: row.store_name,
        storeLocation: row.store_location,
        stockLevel: row.stock_level,
        lastChecked: row.last_checked_at,
      });
    }
  }

  res.json({
    projectId,
    materials: Array.from(materialMap.values()),
  });
});

export default router;
