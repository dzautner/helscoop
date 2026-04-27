/**
 * Huoltokirja (maintenance manual) generator API.
 *
 * GET /huoltokirja/generate?projectId=<id>
 *
 * Generates a machine-readable maintenance manual JSON from the project's
 * BOM and building info. The output format aligns with the digital
 * huoltokirja requirements of Finland's Rakentamislaki.
 */

import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { cleanString, extractBuildingAreaM2, parseBuildingInfo, positiveNumber } from "../building-info";
import {
  getScheduleForCategory,
  type MaintenanceSchedule,
} from "../maintenance-schedules";
import logger from "../logger";

const router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HuoltokirjaBuildingInfo {
  address?: string;
  buildingType?: string;
  yearBuilt?: number;
  area?: number;
}

export interface HuoltokirjaComponent {
  materialId: string;
  materialName: string;
  category: string;
  quantity: number;
  unit: string;
  supplier: string | null;
  unitPrice: number | null;
  maintenanceSchedule: MaintenanceSchedule;
  expectedLifeYears: number;
}

export interface MaintenanceProgramEntry {
  task_fi: string;
  task_en: string;
  intervalMonths: number;
  category: string;
  materials: string[];
}

export interface HuoltokirjaDocument {
  projectName: string;
  generatedAt: string;
  buildingInfo: HuoltokirjaBuildingInfo;
  components: HuoltokirjaComponent[];
  maintenanceProgram: MaintenanceProgramEntry[];
}

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Build the maintenance program by deduplicating schedules per category
 * and combining material names that share the same category.
 */
export function buildMaintenanceProgram(
  components: HuoltokirjaComponent[],
): MaintenanceProgramEntry[] {
  const byCategory = new Map<
    string,
    { schedule: MaintenanceSchedule; materials: string[] }
  >();

  for (const comp of components) {
    const existing = byCategory.get(comp.category);
    if (existing) {
      if (!existing.materials.includes(comp.materialName)) {
        existing.materials.push(comp.materialName);
      }
    } else {
      byCategory.set(comp.category, {
        schedule: comp.maintenanceSchedule,
        materials: [comp.materialName],
      });
    }
  }

  const program: MaintenanceProgramEntry[] = [];
  for (const [category, { schedule, materials }] of byCategory) {
    program.push({
      task_fi: schedule.maintenanceNotes_fi,
      task_en: schedule.maintenanceNotes_en,
      intervalMonths: schedule.inspectionIntervalMonths,
      category,
      materials,
    });
  }

  // Sort by interval ascending so most-frequent tasks appear first
  program.sort((a, b) => a.intervalMonths - b.intervalMonths);

  return program;
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

router.use(requireAuth);

router.get("/generate", async (req, res) => {
  const projectId = req.query.projectId as string | undefined;
  if (!projectId) {
    return res.status(400).json({ error: "projectId query parameter is required" });
  }

  try {
    // Fetch project (owned by requesting user)
    const projectResult = await query(
      "SELECT id, name, building_info FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
      [projectId, req.user!.id],
    );
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    const project = projectResult.rows[0];

    // Fetch BOM with material + category + pricing info
    const bomResult = await query(
      `SELECT pb.material_id, pb.quantity, pb.unit,
              m.name AS material_name,
              c.id AS category_id, c.display_name AS category_name,
              p.unit_price, s.name AS supplier_name
       FROM project_bom pb
       JOIN materials m ON pb.material_id = m.id
       JOIN categories c ON m.category_id = c.id
       LEFT JOIN pricing p ON m.id = p.material_id AND p.is_primary = true
       LEFT JOIN suppliers s ON p.supplier_id = s.id
       WHERE pb.project_id = $1
       ORDER BY c.sort_order`,
      [projectId],
    );

    const rawBuildingInfo = parseBuildingInfo(project.building_info);
    const buildingInfo: HuoltokirjaBuildingInfo = {
      address: cleanString(rawBuildingInfo.address ?? rawBuildingInfo.osoite),
      buildingType: cleanString(rawBuildingInfo.buildingType ?? rawBuildingInfo.kayttotarkoitus),
      yearBuilt: positiveNumber(rawBuildingInfo.yearBuilt ?? rawBuildingInfo.year_built ?? rawBuildingInfo.valmistumisvuosi),
      area: extractBuildingAreaM2(rawBuildingInfo),
    };

    // Map BOM rows to huoltokirja components
    const components: HuoltokirjaComponent[] = bomResult.rows.map((row) => {
      const schedule = getScheduleForCategory(row.category_id);
      return {
        materialId: row.material_id,
        materialName: row.material_name,
        category: row.category_name,
        quantity: parseFloat(row.quantity),
        unit: row.unit,
        supplier: row.supplier_name || null,
        unitPrice: row.unit_price ? parseFloat(row.unit_price) : null,
        maintenanceSchedule: schedule,
        expectedLifeYears: schedule.expectedLifeYears,
      };
    });

    // Build deduplicated maintenance program
    const maintenanceProgram = buildMaintenanceProgram(components);

    const document: HuoltokirjaDocument = {
      projectName: project.name,
      generatedAt: new Date().toISOString(),
      buildingInfo,
      components,
      maintenanceProgram,
    };

    res.json(document);
  } catch (err) {
    logger.error({ err, projectId }, "Huoltokirja generation failed");
    res.status(500).json({ error: "Failed to generate huoltokirja" });
  }
});

export default router;
