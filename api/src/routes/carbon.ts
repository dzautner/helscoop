import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";

const router = Router();

/**
 * Simplified Rakentamislaki carbon limit: 16 kg CO₂-eq / m² / year.
 * This is a baseline for small residential buildings (design life 50 years).
 */
const CARBON_LIMIT_KG_PER_M2_YEAR = 16;

interface CarbonBreakdownItem {
  materialId: string;
  materialName: string;
  quantity: number;
  unit: string;
  co2PerUnit: number;
  totalCo2: number;
}

interface CarbonResult {
  totalCo2Kg: number;
  breakdown: CarbonBreakdownItem[];
  rating: "green" | "amber" | "red";
  limitKg: number;
}

router.use(requireAuth);

/**
 * GET /carbon/calculate?projectId=<id>
 *
 * Calculates total embodied carbon from project BOM using co2_factor_kg
 * values on materials. Returns breakdown per material plus a traffic-light
 * rating against a simplified Rakentamislaki limit.
 *
 * Rating logic (using building area from project.building_info if available,
 * otherwise defaults to 120 m² as typical Finnish single-family house):
 *   - green:  total < 80% of limit
 *   - amber:  80% <= total <= 100% of limit
 *   - red:    total > limit
 */
router.get("/calculate", async (req, res) => {
  const projectId = req.query.projectId as string;
  if (!projectId) {
    return res.status(400).json({ error: "projectId query parameter is required" });
  }

  // Verify project ownership
  const projectResult = await query(
    "SELECT id, building_info FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    [projectId, req.user!.id],
  );
  if (projectResult.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }

  const project = projectResult.rows[0];

  // Extract building area from building_info if available
  let buildingAreaM2 = 120; // default for typical Finnish single-family
  if (project.building_info) {
    const info =
      typeof project.building_info === "string"
        ? JSON.parse(project.building_info)
        : project.building_info;
    if (info.area && typeof info.area === "number" && info.area > 0) {
      buildingAreaM2 = info.area;
    }
  }

  // Fetch BOM items with CO₂ factors
  const bomResult = await query(
    `SELECT pb.material_id, pb.quantity, pb.unit,
            m.name AS material_name, m.co2_factor_kg
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     WHERE pb.project_id = $1
     ORDER BY m.name`,
    [projectId],
  );

  const breakdown: CarbonBreakdownItem[] = [];
  let totalCo2Kg = 0;

  for (const row of bomResult.rows) {
    const co2PerUnit = row.co2_factor_kg ? parseFloat(row.co2_factor_kg) : 0;
    const quantity = parseFloat(row.quantity);
    const itemTotal = quantity * co2PerUnit;

    breakdown.push({
      materialId: row.material_id,
      materialName: row.material_name,
      quantity,
      unit: row.unit,
      co2PerUnit,
      totalCo2: Math.round(itemTotal * 100) / 100,
    });

    totalCo2Kg += itemTotal;
  }

  totalCo2Kg = Math.round(totalCo2Kg * 100) / 100;

  // Calculate limit: 16 kg CO₂-eq / m² / year × area × 50 year design life
  const designLifeYears = 50;
  const limitKg = CARBON_LIMIT_KG_PER_M2_YEAR * buildingAreaM2 * designLifeYears;

  // Rating
  let rating: "green" | "amber" | "red";
  if (totalCo2Kg > limitKg) {
    rating = "red";
  } else if (totalCo2Kg >= limitKg * 0.8) {
    rating = "amber";
  } else {
    rating = "green";
  }

  const result: CarbonResult = {
    totalCo2Kg,
    breakdown,
    rating,
    limitKg,
  };

  res.json(result);
});

export default router;
