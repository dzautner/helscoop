/**
 * IFC export API for Lupapiste building permit submission.
 *
 * GET /ifc-export/generate?projectId=<id>
 *
 * Generates and returns an IFC4 STEP file from the project's scene,
 * BOM, and building info. The file can be submitted directly to
 * Lupapiste or opened in any IFC-compatible BIM viewer.
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/360
 */

import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { generateIFC } from "../ifc-generator";
import logger from "../logger";

const router = Router();

router.use(requireAuth);

router.get("/generate", async (req, res) => {
  const projectId = req.query.projectId as string;

  if (!projectId) {
    return res.status(400).json({ error: "projectId query parameter is required" });
  }

  try {
    // Fetch project (must belong to the authenticated user)
    const projResult = await query(
      "SELECT id, name, description, scene_js, building_info FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
      [projectId, req.user!.id]
    );

    if (projResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = projResult.rows[0];

    // Fetch BOM with material names and categories
    const bomResult = await query(
      `SELECT pb.material_id, pb.quantity, pb.unit,
              m.name AS material_name,
              c.display_name AS category_name
       FROM project_bom pb
       JOIN materials m ON pb.material_id = m.id
       JOIN categories c ON m.category_id = c.id
       WHERE pb.project_id = $1
       ORDER BY c.sort_order`,
      [projectId]
    );

    // Parse building_info (may be stored as JSON string or object)
    let buildingInfo = project.building_info;
    if (typeof buildingInfo === "string") {
      try {
        buildingInfo = JSON.parse(buildingInfo);
      } catch {
        buildingInfo = {};
      }
    }

    // Normalize Finnish-keyed building info to English keys
    const normalizedBuildingInfo = buildingInfo
      ? {
          address: buildingInfo.address || buildingInfo.osoite,
          buildingType: buildingInfo.buildingType || buildingInfo.kayttotarkoitus,
          yearBuilt: buildingInfo.yearBuilt || buildingInfo.valmistumisvuosi,
          area: buildingInfo.area || buildingInfo.kerrosala,
          floors: buildingInfo.floors || buildingInfo.kerrosluku,
        }
      : undefined;

    // Generate IFC content
    const ifcContent = generateIFC({
      project: {
        id: project.id,
        name: project.name,
        description: project.description,
        scene_js: project.scene_js,
      },
      bom: bomResult.rows.map((r: any) => ({
        material_id: r.material_id,
        material_name: r.material_name,
        quantity: Number(r.quantity),
        unit: r.unit,
        category_name: r.category_name,
      })),
      buildingInfo: normalizedBuildingInfo,
    });

    // Return as downloadable IFC file
    const safeName = (project.name || "project").replace(/[^a-zA-Z0-9_\-]/g, "_");
    res.setHeader("Content-Type", "application/x-step");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}.ifc"`
    );
    res.send(ifcContent);
  } catch (err) {
    logger.error({ err, projectId }, "IFC export failed");
    res.status(500).json({ error: "Failed to generate IFC file" });
  }
});

export default router;
