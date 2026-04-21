/**
 * IFC export API for Finnish building permit submission.
 *
 * GET /ifc-export/generate?projectId=<id>
 *
 * Generates and returns an IFC4x3 STEP file from the project's scene,
 * BOM, building info, and permit metadata. The file can be attached to
 * Ryhti/Lupapiste permit workflows or opened in an IFC-compatible BIM viewer.
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/360
 */

import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { IFC_PERMIT_EXPORT_PURPOSE, IFC_SCHEMA, generateIFC } from "../ifc-generator";
import type { IFCBuildingInfo } from "../ifc-generator";
import { normalizeBuildingInfo, sanitizePermitMetadata } from "../ryhti-client";
import logger from "../logger";

const router = Router();

router.use(requireAuth);

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const cleaned = value.replace(/\s+/g, " ").trim();
    if (cleaned) return cleaned;
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(num)) return num;
  }
  return undefined;
}

function buildingInfoForIFC(buildingInfoInput: unknown, permitMetadataInput: unknown): IFCBuildingInfo {
  const buildingInfo = normalizeBuildingInfo(buildingInfoInput);
  const permitMetadata = sanitizePermitMetadata(permitMetadataInput ?? {});
  const floorAreaM2 = firstNumber(permitMetadata.floorAreaM2, buildingInfo.floorAreaM2);
  const grossAreaM2 = firstNumber(permitMetadata.grossAreaM2, buildingInfo.grossAreaM2, floorAreaM2);

  return {
    address: firstString(permitMetadata.address, buildingInfo.address),
    buildingType: firstString(buildingInfo.buildingType),
    yearBuilt: firstNumber(buildingInfo.yearBuilt),
    area: floorAreaM2,
    floorAreaM2,
    grossAreaM2,
    floors: firstNumber(permitMetadata.floors, buildingInfo.floors),
    permanentBuildingIdentifier: firstString(
      permitMetadata.permanentBuildingIdentifier,
      buildingInfo.permanentBuildingIdentifier
    ),
    propertyIdentifier: firstString(permitMetadata.propertyIdentifier, buildingInfo.propertyIdentifier),
    municipalityNumber: firstString(permitMetadata.municipalityNumber, buildingInfo.municipalityNumber),
    latitude: firstNumber(permitMetadata.latitude, buildingInfo.latitude),
    longitude: firstNumber(permitMetadata.longitude, buildingInfo.longitude),
    energyClass: firstString(permitMetadata.energyClass, buildingInfo.energyClass),
  };
}

router.get("/generate", async (req, res) => {
  const projectId = req.query.projectId as string;

  if (!projectId) {
    return res.status(400).json({ error: "projectId query parameter is required" });
  }

  try {
    // Fetch project (must belong to the authenticated user)
    const projResult = await query(
      `SELECT id, name, description, scene_js, building_info, permit_metadata
       FROM projects
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
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

    const permitMetadata = sanitizePermitMetadata(project.permit_metadata ?? {});

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
      buildingInfo: buildingInfoForIFC(project.building_info, project.permit_metadata),
      permitMetadata,
    });

    // Return as downloadable IFC file
    const safeName = (project.name || "project").replace(/[^a-zA-Z0-9_\-]/g, "_");
    res.setHeader("Content-Type", "application/x-step");
    res.setHeader("X-Helscoop-IFC-Schema", IFC_SCHEMA);
    res.setHeader("X-Helscoop-Permit-Export", IFC_PERMIT_EXPORT_PURPOSE);
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
