import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { calculateEnergyClass } from "../energy-class";
import { cleanString, extractBuildingAreaM2, parseBuildingInfo, positiveNumber } from "../building-info";

const router = Router();

/** Finnish VAT rate (25.5%) as of 2024. */
const VAT_RATE = 0.255;

/**
 * ARA grant percentage tiers based on energy class improvement.
 *
 * Asumisen rahoitus- ja kehittamiskeskus (ARA) grants for energy
 * renovations cover 15-50% of eligible costs depending on the
 * achieved energy improvement:
 *   - >= 30% improvement -> 50% grant (significant renovation)
 *   - >= 20% improvement -> 35% grant (moderate renovation)
 *   - >= 10% improvement -> 15% grant (minor improvement)
 *   - < 10% -> not eligible
 */
function grantPercent(savingsPercent: number): number {
  if (savingsPercent >= 30) return 50;
  if (savingsPercent >= 20) return 35;
  if (savingsPercent >= 10) return 15;
  return 0;
}

/**
 * ARA grant application checklist -- documents and prerequisites
 * required for submitting the grant application.
 */
function buildChecklist(hasEnergyImprovement: boolean): string[] {
  const base = [
    "Energiatodistus (energy performance certificate)",
    "Taloyhtion paatospoytakirja (housing company resolution)",
    "Kustannusarvio (cost estimate with itemized BOM)",
    "Rakennuslupa tai toimenpideilmoitus (building permit or notification)",
    "Aikataulusuunnitelma (project timeline)",
  ];

  if (hasEnergyImprovement) {
    base.push(
      "Energiaselvitys ennen ja jalkeen (energy analysis before/after)",
      "Urakoitsijan tarjous (contractor quote)",
      "Asiantuntijan lausunto energiaparannuksesta (expert statement on energy improvement)",
    );
  }

  return base;
}

router.use(requireAuth);

/**
 * GET /ara-grant/package?projectId=<id>
 *
 * Generates an ARA energy grant application package for a project.
 * Combines energy class calculation with cost estimates from BOM
 * to determine eligibility and estimated grant amount.
 */
router.get("/package", async (req, res) => {
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

  const buildingInfo = parseBuildingInfo(project.building_info);

  // Fetch BOM items with pricing
  const bomResult = await query(
    `SELECT pb.material_id, pb.quantity, pb.unit,
            m.name AS material_name,
            p.unit_price,
            m.waste_factor
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     LEFT JOIN pricing p ON m.id = p.material_id AND p.is_primary = true
     WHERE pb.project_id = $1
     ORDER BY m.name`,
    [projectId],
  );

  // Build cost estimate
  const items: Array<{
    materialId: string;
    materialName: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalWithoutVat: number;
    totalWithVat: number;
  }> = [];

  let totalWithoutVat = 0;

  for (const row of bomResult.rows) {
    const unitPrice = row.unit_price ? parseFloat(row.unit_price) : 0;
    const quantity = parseFloat(row.quantity);
    const wasteFactor = row.waste_factor ? parseFloat(row.waste_factor) : 1.0;
    const lineTotal = quantity * unitPrice * wasteFactor;

    items.push({
      materialId: row.material_id,
      materialName: row.material_name,
      quantity,
      unit: row.unit,
      unitPrice,
      totalWithoutVat: Math.round(lineTotal * 100) / 100,
      totalWithVat: Math.round(lineTotal * (1 + VAT_RATE) * 100) / 100,
    });

    totalWithoutVat += lineTotal;
  }

  totalWithoutVat = Math.round(totalWithoutVat * 100) / 100;
  const totalWithVat = Math.round(totalWithoutVat * (1 + VAT_RATE) * 100) / 100;

  // Calculate energy class
  const bom = bomResult.rows.map((r) => ({
    material_id: r.material_id,
    quantity: parseFloat(r.quantity),
    unit: r.unit,
  }));

  const energyResult = calculateEnergyClass(
    {
      year_built: positiveNumber(buildingInfo.year_built ?? buildingInfo.yearBuilt),
      heating: cleanString(buildingInfo.heating),
      area_m2: extractBuildingAreaM2(buildingInfo),
      type: cleanString(buildingInfo.type),
    },
    bom,
  );

  // Determine grant eligibility
  const estimatedGrantPercent = grantPercent(energyResult.savingsPercent);
  const eligibility = estimatedGrantPercent > 0;
  const estimatedGrantAmount = eligibility
    ? Math.round(totalWithVat * (estimatedGrantPercent / 100) * 100) / 100
    : 0;

  res.json({
    energyClassBefore: energyResult.before,
    energyClassAfter: energyResult.after,
    savingsPercent: energyResult.savingsPercent,
    kwhBefore: energyResult.kwhBefore,
    kwhAfter: energyResult.kwhAfter,
    costEstimate: {
      items,
      totalWithoutVat,
      totalWithVat,
      vatRate: VAT_RATE,
    },
    checklist: buildChecklist(eligibility),
    eligibility,
    estimatedGrantPercent,
    estimatedGrantAmount,
  });
});

export default router;
