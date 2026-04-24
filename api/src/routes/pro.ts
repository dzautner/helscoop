import { Router } from "express";
import { requireAuth } from "../auth";
import { query } from "../db";
import { logAuditEvent } from "../audit";
import { requirePermission } from "../permissions";

const router = Router();

const LEAD_STATUSES = ["submitted", "forwarded", "closed"] as const;
type LeadStatus = (typeof LEAD_STATUSES)[number];

interface ProLeadRow {
  id: string;
  project_id: string;
  project_name: string;
  project_description: string | null;
  project_type: string | null;
  unit_count: number | null;
  building_info: unknown;
  homeowner_name: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  postcode: string;
  work_scope: string;
  bom_line_count: number;
  estimated_cost: string | number | null;
  partner_channel: string;
  matched_contractor_count: number;
  status: LeadStatus;
  created_at: string;
}

interface ProLead {
  id: string;
  project_id: string;
  project_name: string;
  project_description: string | null;
  project_type: string | null;
  unit_count: number | null;
  building_info: Record<string, unknown> | null;
  homeowner_name: string | null;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  postcode: string;
  work_scope: string;
  bom_line_count: number;
  estimated_cost: number;
  partner_channel: string;
  matched_contractor_count: number;
  status: LeadStatus;
  created_at: string;
}

function parseLimit(value: unknown): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(100, parsed));
}

function parseStatus(value: unknown): LeadStatus | null {
  if (typeof value !== "string") return null;
  return LEAD_STATUSES.includes(value as LeadStatus) ? value as LeadStatus : null;
}

function parseOptionalStatus(value: unknown): LeadStatus | null | undefined {
  if (value == null || value === "") return undefined;
  return parseStatus(value);
}

function normalizeBuildingInfo(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function toLead(row: ProLeadRow): ProLead {
  return {
    id: row.id,
    project_id: row.project_id,
    project_name: row.project_name,
    project_description: row.project_description,
    project_type: row.project_type,
    unit_count: row.unit_count,
    building_info: normalizeBuildingInfo(row.building_info),
    homeowner_name: row.homeowner_name,
    contact_name: row.contact_name,
    contact_email: row.contact_email,
    contact_phone: row.contact_phone,
    postcode: row.postcode,
    work_scope: row.work_scope,
    bom_line_count: Number(row.bom_line_count || 0),
    estimated_cost: Number(row.estimated_cost || 0),
    partner_channel: row.partner_channel,
    matched_contractor_count: Number(row.matched_contractor_count || 0),
    status: row.status,
    created_at: row.created_at,
  };
}

function buildLeadSummary(leads: ProLead[]) {
  const open = leads.filter((lead) => lead.status === "submitted").length;
  const forwarded = leads.filter((lead) => lead.status === "forwarded").length;
  const closed = leads.filter((lead) => lead.status === "closed").length;
  const totalEstimatedCost = leads.reduce((sum, lead) => sum + lead.estimated_cost, 0);

  return {
    lead_count: leads.length,
    open_count: open,
    forwarded_count: forwarded,
    closed_count: closed,
    total_estimated_cost: Math.round(totalEstimatedCost),
    average_estimated_cost: leads.length > 0 ? Math.round(totalEstimatedCost / leads.length) : 0,
  };
}

const LEAD_SELECT = `
  qr.id, qr.project_id, qr.contact_name, qr.contact_email, qr.contact_phone,
  qr.postcode, qr.work_scope, qr.bom_line_count, qr.estimated_cost,
  qr.partner_channel, qr.matched_contractor_count, qr.status, qr.created_at,
  p.name AS project_name, p.description AS project_description,
  p.project_type, p.unit_count, p.building_info,
  u.name AS homeowner_name
`;

router.use(requireAuth);

router.get("/leads", requirePermission("lead:receive"), async (req, res) => {
  const status = parseOptionalStatus(req.query.status);
  if (status === null) {
    return res.status(400).json({ error: `status must be one of: ${LEAD_STATUSES.join(", ")}` });
  }

  const params: unknown[] = [];
  let whereClause = "WHERE p.deleted_at IS NULL";
  if (status) {
    params.push(status);
    whereClause += ` AND qr.status = $${params.length}`;
  }
  params.push(parseLimit(req.query.limit));

  const result = await query(
    `SELECT ${LEAD_SELECT}
     FROM quote_requests qr
     JOIN projects p ON p.id = qr.project_id
     JOIN users u ON u.id = qr.user_id
     ${whereClause}
     ORDER BY qr.created_at DESC
     LIMIT $${params.length}`,
    params,
  );

  const leads = (result.rows as ProLeadRow[]).map(toLead);
  res.json({
    leads,
    summary: buildLeadSummary(leads),
    tiers: [
      { id: "free", name: "Free profile", monthly_price_eur: 0, lead_limit: 0 },
      { id: "pro", name: "Helscoop Pro", monthly_price_eur: 69, lead_limit: 20 },
      { id: "growth", name: "Helscoop Growth", monthly_price_eur: 149, lead_limit: 60 },
    ],
  });
});

router.patch("/leads/:id/status", requirePermission("lead:receive"), async (req, res) => {
  const status = parseStatus(req.body.status);
  if (!status) {
    return res.status(400).json({ error: `status must be one of: ${LEAD_STATUSES.join(", ")}` });
  }

  const result = await query(
    `WITH updated AS (
       UPDATE quote_requests
       SET status = $2,
           matched_contractor_count = CASE
             WHEN $2 = 'forwarded' THEN GREATEST(matched_contractor_count, 1)
             ELSE matched_contractor_count
           END
       WHERE id = $1
       RETURNING *
     )
     SELECT ${LEAD_SELECT}
     FROM updated qr
     JOIN projects p ON p.id = qr.project_id
     JOIN users u ON u.id = qr.user_id
     WHERE p.deleted_at IS NULL`,
    [req.params.id, status],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Lead not found" });
  }

  logAuditEvent(req.user!.id, "pro.lead_status_updated", {
    leadId: req.params.id,
    status,
    ip: req.ip,
  });

  res.json({ lead: toLead(result.rows[0] as ProLeadRow) });
});

export default router;
