import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { requirePermission } from "../permissions";
import { extractBuildingAreaM2, parseBuildingInfo } from "../building-info";

const router = Router();

interface AggregateRow {
  project_id: string;
  project_name: string;
  material_id: string;
  material_name: string;
  category_name: string | null;
  quantity: string | number;
  unit: string | null;
  unit_price: string | number | null;
  waste_factor: string | number | null;
  supplier_name: string | null;
}

interface AggregatedBreakdown {
  project_id: string;
  project_name: string;
  quantity: number;
  total: number;
}

interface AggregatedItem {
  material_id: string;
  material_name: string;
  category_name: string | null;
  unit: string;
  quantity: number;
  unit_price: number;
  supplier_name: string | null;
  total: number;
  project_breakdown: AggregatedBreakdown[];
  source_project_count: number;
  bulk_discount: {
    eligible: boolean;
    threshold: number;
    estimated_savings_pct: number;
    estimated_savings_eur: number;
    note: string;
  } | null;
}

function normalizeProjectIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const ids = input
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean);
  return Array.from(new Set(ids));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundQuantity(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function bulkThresholdForUnit(unit: string): number {
  const normalized = unit.toLowerCase();
  if (["jm", "m", "meter", "metre"].includes(normalized)) return 100;
  if (["sqm", "m2", "m²"].includes(normalized)) return 50;
  if (["sheet", "levy"].includes(normalized)) return 20;
  if (["pack", "roll", "box"].includes(normalized)) return 10;
  if (["kpl", "pcs", "pc"].includes(normalized)) return 100;
  return 25;
}

function bulkDiscountFor(quantity: number, total: number, unit: string, sourceProjectCount: number): AggregatedItem["bulk_discount"] {
  const threshold = bulkThresholdForUnit(unit);
  if (quantity < threshold) return null;
  const estimatedSavingsPct = sourceProjectCount > 1 ? 5 : 3;
  return {
    eligible: true,
    threshold,
    estimated_savings_pct: estimatedSavingsPct,
    estimated_savings_eur: roundMoney(total * (estimatedSavingsPct / 100)),
    note: "Estimated negotiation opportunity only; supplier volume discounts are not guaranteed.",
  };
}

router.post("/aggregate", requireAuth, requirePermission("project:read_own"), async (req, res) => {
  const rawIds = (req.body && (req.body.project_ids ?? req.body.projectIds)) as unknown;
  const projectIds = normalizeProjectIds(rawIds);

  if (projectIds.length < 2) {
    return res.status(400).json({ error: "Select at least two projects to aggregate" });
  }
  if (projectIds.length > 20) {
    return res.status(400).json({ error: "Cannot aggregate more than 20 projects at once" });
  }

  const projectsResult = await query(
    `SELECT id::text AS id, name, building_info,
       (SELECT COALESCE(SUM(pb.quantity * COALESCE(p.unit_price, 0) * COALESCE(m.waste_factor, 1)), 0)
        FROM project_bom pb
        JOIN materials m ON pb.material_id = m.id
        LEFT JOIN pricing p ON pb.material_id = p.material_id AND p.is_primary = true
        WHERE pb.project_id = projects.id) AS estimated_cost,
       (SELECT COUNT(*)::int FROM project_bom pb WHERE pb.project_id = projects.id) AS bom_rows
     FROM projects
     WHERE user_id = $1 AND deleted_at IS NULL AND id::text = ANY($2::text[])
     ORDER BY updated_at DESC`,
    [req.user!.id, projectIds],
  );

  if (projectsResult.rows.length !== projectIds.length) {
    return res.status(404).json({ error: "One or more projects were not found" });
  }

  const rowsResult = await query(
    `SELECT p.id::text AS project_id, p.name AS project_name,
       pb.material_id, pb.quantity, COALESCE(pb.unit, 'kpl') AS unit,
       m.name AS material_name, c.display_name AS category_name,
       COALESCE(pr.unit_price, 0) AS unit_price,
       COALESCE(m.waste_factor, 1) AS waste_factor,
       s.name AS supplier_name
     FROM projects p
     JOIN project_bom pb ON pb.project_id = p.id
     JOIN materials m ON pb.material_id = m.id
     LEFT JOIN categories c ON m.category_id = c.id
     LEFT JOIN pricing pr ON pb.material_id = pr.material_id AND pr.is_primary = true
     LEFT JOIN suppliers s ON pr.supplier_id = s.id
     WHERE p.user_id = $1 AND p.deleted_at IS NULL AND p.id::text = ANY($2::text[])
     ORDER BY m.name ASC, p.name ASC`,
    [req.user!.id, projectIds],
  );

  const aggregateMap = new Map<string, AggregatedItem>();
  for (const row of rowsResult.rows as AggregateRow[]) {
    const quantity = Number(row.quantity) || 0;
    const unit = row.unit || "kpl";
    const unitPrice = Number(row.unit_price) || 0;
    const wasteFactor = Number(row.waste_factor) || 1;
    const lineTotal = roundMoney(quantity * unitPrice * wasteFactor);
    const key = `${row.material_id}::${unit}`;
    const existing = aggregateMap.get(key) ?? {
      material_id: row.material_id,
      material_name: row.material_name,
      category_name: row.category_name,
      unit,
      quantity: 0,
      unit_price: unitPrice,
      supplier_name: row.supplier_name,
      total: 0,
      project_breakdown: [],
      source_project_count: 0,
      bulk_discount: null,
    };

    existing.quantity = roundQuantity(existing.quantity + quantity);
    existing.total = roundMoney(existing.total + lineTotal);
    const breakdown = existing.project_breakdown.find((item) => item.project_id === row.project_id);
    if (breakdown) {
      breakdown.quantity = roundQuantity(breakdown.quantity + quantity);
      breakdown.total = roundMoney(breakdown.total + lineTotal);
    } else {
      existing.project_breakdown.push({
        project_id: row.project_id,
        project_name: row.project_name,
        quantity: roundQuantity(quantity),
        total: lineTotal,
      });
    }
    existing.source_project_count = existing.project_breakdown.length;
    aggregateMap.set(key, existing);
  }

  const items = Array.from(aggregateMap.values())
    .map((item) => ({
      ...item,
      bulk_discount: bulkDiscountFor(item.quantity, item.total, item.unit, item.source_project_count),
      project_breakdown: item.project_breakdown.sort((a, b) => b.quantity - a.quantity),
    }))
    .sort((a, b) => b.total - a.total || a.material_name.localeCompare(b.material_name));

  const totalCost = roundMoney(items.reduce((sum, item) => sum + item.total, 0));
  const projects = projectsResult.rows.map((project: {
    id: string;
    name: string;
    building_info?: unknown;
    estimated_cost: string | number;
    bom_rows: string | number;
  }) => {
    const estimatedCost = roundMoney(Number(project.estimated_cost) || 0);
    const areaM2 = extractBuildingAreaM2(parseBuildingInfo(project.building_info)) ?? null;
    return {
      id: project.id,
      name: project.name,
      estimated_cost: estimatedCost,
      bom_rows: Number(project.bom_rows) || 0,
      area_m2: areaM2,
      cost_per_m2: areaM2 ? roundMoney(estimatedCost / areaM2) : null,
    };
  });

  res.json({
    project_ids: projectIds,
    project_count: projects.length,
    item_count: items.length,
    total_cost: totalCost,
    bulk_opportunity_count: items.filter((item) => item.bulk_discount?.eligible).length,
    projects,
    items,
  });
});

export default router;
