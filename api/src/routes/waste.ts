import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import {
  WASTE_FACTORS,
  DEFAULT_WASTE_FACTOR,
  SORTING_GUIDE,
  recommendContainer,
  type WasteType,
  type SortingGuideEntry,
} from "../waste-factors";

const router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface WasteCategory {
  type: WasteType;
  weightKg: number;
  volumeM3: number;
  recyclable: boolean;
  disposalCostEur: number;
}

interface WasteEstimateResponse {
  totalWeightKg: number;
  totalVolumeM3: number;
  categories: WasteCategory[];
  containerRecommendation: {
    size: string;
    count: number;
    totalCost: number;
  };
  sortingGuide: SortingGuideEntry[];
  totalDisposalCost: number;
}

// ---------------------------------------------------------------------------
// GET /waste/estimate?projectId=<id>
//
// Estimates renovation waste from a project's BOM (bill of materials).
// Joins project_bom with materials and categories to map each line item
// to its waste classification, weight, volume, and disposal cost.
// ---------------------------------------------------------------------------
router.get("/estimate", requireAuth, async (req, res) => {
  const projectId = req.query.projectId as string | undefined;

  if (!projectId) {
    return res.status(400).json({ error: "projectId query parameter is required" });
  }

  // Validate UUID format to avoid SQL injection / bad queries
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(projectId)) {
    return res.status(400).json({ error: "Invalid projectId format" });
  }

  // Verify the project exists, belongs to the authenticated user, and is not soft-deleted
  const projectResult = await query(
    "SELECT id FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL",
    [projectId, req.user!.id],
  );

  if (projectResult.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }

  // Fetch BOM with category info
  const bomResult = await query(
    `SELECT pb.quantity, pb.unit, m.category_id, m.waste_factor,
            c.display_name AS category_name
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     JOIN categories c ON m.category_id = c.id
     WHERE pb.project_id = $1`,
    [projectId],
  );

  // Aggregate waste by waste type
  const wasteByType = new Map<WasteType, { weightKg: number; volumeM3: number; disposalCostEur: number }>();

  for (const row of bomResult.rows) {
    const factor = WASTE_FACTORS[row.category_id] || DEFAULT_WASTE_FACTOR;

    // Waste weight = quantity * waste_factor_from_material * kgPerUnit
    // The material's waste_factor represents the fraction of material that becomes waste
    // (e.g. 1.05 means 5% extra is purchased, so 0.05 * quantity becomes waste).
    // When waste_factor is NULL, use the category-specific default from WASTE_FACTORS
    // rather than a blanket 5%, because waste rates vary widely by material type
    // (e.g. insulation 10%, windows 2%, foundation blocks 3%).
    const materialWasteFactor = row.waste_factor != null
      ? parseFloat(row.waste_factor)
      : (factor.defaultWasteFactor ?? 1.05);
    const wasteFraction = Math.max(0, materialWasteFactor - 1.0);
    const wasteQty = row.quantity * wasteFraction;
    const weightKg = wasteQty * factor.kgPerUnit;
    const volumeM3 = weightKg * factor.volumePerKg;
    const disposalCostEur = (weightKg / 1000) * factor.disposalCostPerTonne;

    const existing = wasteByType.get(factor.wasteType) || { weightKg: 0, volumeM3: 0, disposalCostEur: 0 };
    existing.weightKg += weightKg;
    existing.volumeM3 += volumeM3;
    existing.disposalCostEur += disposalCostEur;
    wasteByType.set(factor.wasteType, existing);

    // Handle secondary waste type if present
    if (factor.secondaryWasteType) {
      const secondaryWeight = weightKg * 0.2; // 20% of waste is secondary type
      const secondaryVolume = secondaryWeight * factor.volumePerKg;
      const secondaryCost = (secondaryWeight / 1000) * factor.disposalCostPerTonne;
      const existingSecondary = wasteByType.get(factor.secondaryWasteType) || { weightKg: 0, volumeM3: 0, disposalCostEur: 0 };
      existingSecondary.weightKg += secondaryWeight;
      existingSecondary.volumeM3 += secondaryVolume;
      existingSecondary.disposalCostEur += secondaryCost;
      wasteByType.set(factor.secondaryWasteType, existingSecondary);
    }
  }

  // Build categories array
  const categories: WasteCategory[] = [];
  let totalWeightKg = 0;
  let totalVolumeM3 = 0;
  let totalDisposalCost = 0;

  for (const [wasteType, data] of wasteByType.entries()) {
    const recyclable = (WASTE_FACTORS[
      Object.keys(WASTE_FACTORS).find(k => WASTE_FACTORS[k].wasteType === wasteType) || ""
    ] || DEFAULT_WASTE_FACTOR).recyclingRate > 0.5;

    const category: WasteCategory = {
      type: wasteType,
      weightKg: Math.round(data.weightKg * 100) / 100,
      volumeM3: Math.round(data.volumeM3 * 1000) / 1000,
      recyclable,
      disposalCostEur: Math.round(data.disposalCostEur * 100) / 100,
    };
    categories.push(category);
    totalWeightKg += data.weightKg;
    totalVolumeM3 += data.volumeM3;
    totalDisposalCost += data.disposalCostEur;
  }

  // Sort categories by weight descending
  categories.sort((a, b) => b.weightKg - a.weightKg);

  // Container recommendation
  const container = recommendContainer(totalVolumeM3, totalWeightKg);

  // Filter sorting guide to only include waste types present in this project
  const presentTypes = new Set(categories.map(c => c.type));
  const sortingGuide = SORTING_GUIDE.filter(g => presentTypes.has(g.wasteType));

  const response: WasteEstimateResponse = {
    totalWeightKg: Math.round(totalWeightKg * 100) / 100,
    totalVolumeM3: Math.round(totalVolumeM3 * 1000) / 1000,
    categories,
    containerRecommendation: {
      size: `${container.size.sizeM3}m\u00B3`,
      count: container.count,
      totalCost: container.totalCost,
    },
    sortingGuide,
    totalDisposalCost: Math.round(totalDisposalCost * 100) / 100,
  };

  res.json(response);
});

export default router;
