import { Router } from "express";
import crypto from "crypto";
import PDFDocument from "pdfkit";
import { query } from "../db";
import { requireAuth } from "../auth";
import { requirePermission } from "../permissions";
import { logAuditEvent } from "../audit";
import { sendEmail, type EmailAttachment } from "../email";

const router = Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface QuoteRequestBomRow {
  material_name: string;
  quantity: string | number;
  unit: string | null;
  unit_price: string | number | null;
  line_cost: string | number | null;
  supplier_name?: string | null;
}

interface ProjectVersionBomItem {
  material_id: string;
  quantity: number;
  unit: string;
}

interface ProjectVersionSnapshot {
  name: string;
  description: string;
  scene_js: string;
  bom: ProjectVersionBomItem[];
}

type ProjectVersionEvent = "auto" | "named" | "restore" | "branch";

const MAX_AUTO_VERSIONS = 100;
const VERSION_EVENTS = new Set<ProjectVersionEvent>(["auto", "named", "restore", "branch"]);

function requiredText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required`);
  }
  const cleaned = value.trim();
  if (cleaned.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer`);
  }
  return cleaned;
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

function formatCurrency(value: number, locale: "fi" | "en"): string {
  return `${value.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} EUR`;
}

function safeFilename(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 80) || "project";
}

function normalizeVersionSnapshot(value: unknown): ProjectVersionSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as {
    name?: unknown;
    description?: unknown;
    scene_js?: unknown;
    bom?: unknown;
  };
  if (typeof raw.name !== "string" || typeof raw.scene_js !== "string" || !Array.isArray(raw.bom)) {
    return null;
  }
  if (raw.scene_js.length > 512 * 1024) {
    return null;
  }

  const bom: ProjectVersionBomItem[] = [];
  for (const item of raw.bom) {
    if (!item || typeof item !== "object") return null;
    const row = item as { material_id?: unknown; quantity?: unknown; unit?: unknown };
    const quantity = Number(row.quantity);
    if (typeof row.material_id !== "string" || row.material_id.trim().length === 0) return null;
    if (!Number.isFinite(quantity) || quantity <= 0) return null;
    bom.push({
      material_id: row.material_id,
      quantity,
      unit: typeof row.unit === "string" && row.unit.trim() ? row.unit : "kpl",
    });
  }

  return {
    name: raw.name.trim().slice(0, 200),
    description: typeof raw.description === "string" ? raw.description.slice(0, 5000) : "",
    scene_js: raw.scene_js,
    bom,
  };
}

function snapshotEquals(a: ProjectVersionSnapshot, b: ProjectVersionSnapshot): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildVersionDelta(previous: ProjectVersionSnapshot | null, next: ProjectVersionSnapshot) {
  const changedFields: string[] = [];
  if (!previous) {
    return {
      changedFields: ["initial"],
      bom: { added: next.bom.length, removed: 0, quantityChanged: 0, unitChanged: 0 },
    };
  }

  if (previous.name !== next.name) changedFields.push("name");
  if (previous.description !== next.description) changedFields.push("description");
  if (previous.scene_js !== next.scene_js) changedFields.push("scene_js");

  const previousBom = new Map(previous.bom.map((item) => [item.material_id, item]));
  const nextBom = new Map(next.bom.map((item) => [item.material_id, item]));
  let added = 0;
  let removed = 0;
  let quantityChanged = 0;
  let unitChanged = 0;

  for (const item of next.bom) {
    const old = previousBom.get(item.material_id);
    if (!old) {
      added += 1;
      continue;
    }
    if (old.quantity !== item.quantity) quantityChanged += 1;
    if (old.unit !== item.unit) unitChanged += 1;
  }

  for (const item of previous.bom) {
    if (!nextBom.has(item.material_id)) removed += 1;
  }

  if (added || removed || quantityChanged || unitChanged) changedFields.push("bom");
  return { changedFields, bom: { added, removed, quantityChanged, unitChanged } };
}

async function ensureDefaultBranch(projectId: string) {
  const existing = await query(
    "SELECT * FROM project_branches WHERE project_id=$1 AND is_default=true LIMIT 1",
    [projectId],
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const created = await query(
    `INSERT INTO project_branches (project_id, name, is_default)
     VALUES ($1, 'Main', true)
     RETURNING *`,
    [projectId],
  );
  return created.rows[0];
}

async function getOwnedProjectSnapshot(projectId: string, userId: string): Promise<ProjectVersionSnapshot | null> {
  const projectResult = await query(
    "SELECT name, description, scene_js FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
    [projectId, userId],
  );
  if (projectResult.rows.length === 0) return null;
  const bomResult = await query(
    "SELECT material_id, quantity, unit FROM project_bom WHERE project_id=$1 ORDER BY created_at, material_id",
    [projectId],
  );
  const project = projectResult.rows[0];
  return {
    name: project.name || "",
    description: project.description || "",
    scene_js: project.scene_js || "",
    bom: bomResult.rows.map((row: { material_id: string; quantity: string | number; unit: string | null }) => ({
      material_id: row.material_id,
      quantity: Number(row.quantity),
      unit: row.unit || "kpl",
    })),
  };
}

async function getLatestVersion(projectId: string, branchId: string | null) {
  const result = await query(
    `SELECT *
     FROM project_versions
     WHERE project_id=$1
       AND (($2::uuid IS NULL AND branch_id IS NULL) OR branch_id=$2)
     ORDER BY created_at DESC
     LIMIT 1`,
    [projectId, branchId],
  );
  return result.rows[0] ?? null;
}

async function insertProjectVersion(params: {
  projectId: string;
  branchId: string | null;
  snapshot: ProjectVersionSnapshot;
  name?: string | null;
  description?: string | null;
  eventType: ProjectVersionEvent;
  thumbnailUrl?: string | null;
  restoredFromVersionId?: string | null;
}) {
  const latest = await getLatestVersion(params.projectId, params.branchId);
  const previousSnapshot = latest?.snapshot ? normalizeVersionSnapshot(latest.snapshot) : null;
  if (latest && previousSnapshot && snapshotEquals(previousSnapshot, params.snapshot) && params.eventType === "auto" && !params.name) {
    return latest;
  }

  const delta = buildVersionDelta(previousSnapshot, params.snapshot);
  const result = await query(
    `INSERT INTO project_versions (
       project_id, branch_id, parent_version_id, restored_from_version_id,
       name, description, event_type, snapshot, delta, thumbnail_url
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      params.projectId,
      params.branchId,
      latest?.id ?? null,
      params.restoredFromVersionId ?? null,
      params.name ?? null,
      params.description ?? null,
      params.eventType,
      JSON.stringify(params.snapshot),
      JSON.stringify(delta),
      params.thumbnailUrl ?? null,
    ],
  );

  await query(
    `DELETE FROM project_versions
     WHERE id IN (
       SELECT id
       FROM project_versions
       WHERE project_id=$1
         AND (($2::uuid IS NULL AND branch_id IS NULL) OR branch_id=$2)
         AND event_type='auto'
         AND name IS NULL
       ORDER BY created_at DESC
       OFFSET $3
     )`,
    [params.projectId, params.branchId, MAX_AUTO_VERSIONS],
  );

  return result.rows[0];
}

async function estimateSnapshotCost(snapshot: ProjectVersionSnapshot): Promise<number> {
  const materialIds = Array.from(new Set(snapshot.bom.map((item) => item.material_id)));
  if (materialIds.length === 0) return 0;

  const pricingResult = await query(
    `SELECT m.id, COALESCE(p.unit_price, 0) AS unit_price, COALESCE(m.waste_factor, 1) AS waste_factor
     FROM materials m
     LEFT JOIN pricing p ON p.material_id = m.id AND p.is_primary = true
     WHERE m.id = ANY($1::text[])`,
    [materialIds],
  );
  const priceByMaterial = new Map(
    pricingResult.rows.map((row: { id: string; unit_price: string | number; waste_factor: string | number }) => [
      row.id,
      { unitPrice: Number(row.unit_price), wasteFactor: Number(row.waste_factor) || 1 },
    ]),
  );

  return snapshot.bom.reduce((sum, item) => {
    const pricing = priceByMaterial.get(item.material_id);
    if (!pricing) return sum;
    return sum + item.quantity * pricing.unitPrice * pricing.wasteFactor;
  }, 0);
}

async function renderQuoteRequestPdf(params: {
  projectName: string;
  projectDescription?: string | null;
  workScope: string;
  contactName: string;
  contactEmail: string;
  postcode: string;
  bomRows: QuoteRequestBomRow[];
  estimatedCost: number;
  locale: "fi" | "en";
}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const fi = params.locale === "fi";
    doc.font("Helvetica-Bold").fontSize(20).text(fi ? "Helscoop - tarjouspyynto" : "Helscoop - quote request");
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(10).fillColor("#666").text(new Date().toLocaleDateString(fi ? "fi-FI" : "en-GB"));
    doc.moveDown(1);

    doc.fillColor("#111").font("Helvetica-Bold").fontSize(12).text(fi ? "Projektin tiedot" : "Project details");
    doc.font("Helvetica").fontSize(10);
    doc.text(`${fi ? "Projekti" : "Project"}: ${params.projectName}`);
    if (params.projectDescription) doc.text(`${fi ? "Kuvaus" : "Description"}: ${params.projectDescription}`);
    doc.text(`${fi ? "Työn kuvaus" : "Work scope"}: ${params.workScope}`);
    doc.text(`${fi ? "Postinumero" : "Postcode"}: ${params.postcode}`);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text(fi ? "Yhteyshenkilo" : "Contact");
    doc.font("Helvetica").fontSize(10);
    doc.text(`${params.contactName} <${params.contactEmail}>`);
    doc.moveDown(1);

    doc.font("Helvetica-Bold").fontSize(12).text(fi ? "Materiaalilista" : "Bill of materials");
    doc.font("Helvetica").fontSize(9);
    for (const row of params.bomRows.slice(0, 40)) {
      const qty = Number(row.quantity || 0).toLocaleString(fi ? "fi-FI" : "en-GB", { maximumFractionDigits: 2 });
      const cost = Number(row.line_cost || 0);
      doc.text(
        `${row.material_name}: ${qty} ${row.unit || ""} - ${formatCurrency(cost, params.locale)}${row.supplier_name ? ` (${row.supplier_name})` : ""}`,
        { continued: false },
      );
    }
    if (params.bomRows.length > 40) {
      doc.text(fi ? `...ja ${params.bomRows.length - 40} muuta rivia` : `...and ${params.bomRows.length - 40} more rows`);
    }
    doc.moveDown(0.75);
    doc.font("Helvetica-Bold").fontSize(12).text(`${fi ? "Arvio yhteensa" : "Estimated total"}: ${formatCurrency(params.estimatedCost, params.locale)}`);
    doc.moveDown(1);
    doc.font("Helvetica").fontSize(8).fillColor("#777").text(fi ? "Luotu Helscoop.fi-palvelulla." : "Generated with Helscoop.fi.");
    doc.end();
  });
}

function buildQuoteRequestEmail(params: {
  projectName: string;
  workScope: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  postcode: string;
  bomLineCount: number;
  estimatedCost: number;
  locale: "fi" | "en";
}): { subject: string; body: string } {
  const fi = params.locale === "fi";
  const subject = fi
    ? `Helscoop: tarjouspyynto vastaanotettu - ${params.projectName}`
    : `Helscoop: quote request received - ${params.projectName}`;
  const body = [
    fi ? `Hei ${params.contactName},` : `Hi ${params.contactName},`,
    "",
    fi
      ? "Tarjouspyyntosi on tallennettu. Liitteenä on urakoitsijalle jaettava PDF-yhteenveto projektista ja materiaalilistasta."
      : "Your quote request has been saved. The attached PDF summarizes the project and BOM for contractor sharing.",
    "",
    `${fi ? "Projekti" : "Project"}: ${params.projectName}`,
    `${fi ? "Työn kuvaus" : "Work scope"}: ${params.workScope}`,
    `${fi ? "Postinumero" : "Postcode"}: ${params.postcode}`,
    `${fi ? "BOM-rivejä" : "BOM rows"}: ${params.bomLineCount}`,
    `${fi ? "Arvioitu kustannus" : "Estimated cost"}: ${formatCurrency(params.estimatedCost, params.locale)}`,
    params.contactPhone ? `${fi ? "Puhelin" : "Phone"}: ${params.contactPhone}` : null,
    "",
    fi
      ? "Seuraava vaihe: Helscoop voi jatkossa välittää tämän Luotettava Kumppani -varmennetuille urakoitsijoille."
      : "Next step: Helscoop can later forward this to Reliable Partner verified contractors.",
  ].filter(Boolean).join("\n");
  return { subject, body };
}

router.use(requireAuth);

router.get("/", async (req, res) => {
  const result = await query(
    `SELECT id, name, description, is_public, created_at, updated_at, thumbnail_url, tags, status,
      (SELECT COALESCE(SUM(pb.quantity * p.unit_price * m.waste_factor), 0)
       FROM project_bom pb
       JOIN pricing p ON pb.material_id = p.material_id AND p.is_primary = true
       JOIN materials m ON pb.material_id = m.id
       WHERE pb.project_id = projects.id) AS estimated_cost,
      (SELECT COUNT(*)::int FROM project_views pv WHERE pv.project_id = projects.id) AS view_count
     FROM projects WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC`,
    [req.user!.id]
  );
  res.json(result.rows);
});

router.get("/trash", async (req, res) => {
  const result = await query(
    `SELECT id, name, description, is_public, created_at, updated_at, deleted_at, thumbnail_url,
      (SELECT COALESCE(SUM(pb.quantity * p.unit_price * m.waste_factor), 0)
       FROM project_bom pb
       JOIN pricing p ON pb.material_id = p.material_id AND p.is_primary = true
       JOIN materials m ON pb.material_id = m.id
       WHERE pb.project_id = projects.id) AS estimated_cost
     FROM projects WHERE user_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC`,
    [req.user!.id]
  );
  res.json(result.rows);
});

router.post("/bulk", async (req, res) => {
  const { ids, action, status, tags } = req.body;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 100) {
    return res.status(400).json({ error: "ids must be an array of 1-100 project IDs" });
  }
  const VALID_ACTIONS = ["archive", "unarchive", "delete", "add_tags", "remove_tags", "set_status"];
  if (!action || !VALID_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action must be one of: ${VALID_ACTIONS.join(", ")}` });
  }
  const userId = req.user!.id;

  try {
    let result;
    switch (action) {
      case "archive":
        result = await query(
          `UPDATE projects SET status = 'archived', updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
          [ids, userId]
        );
        break;
      case "unarchive":
        result = await query(
          `UPDATE projects SET status = 'planning', updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND user_id = $2 AND deleted_at IS NULL AND status = 'archived' RETURNING id`,
          [ids, userId]
        );
        break;
      case "delete":
        result = await query(
          `UPDATE projects SET deleted_at = NOW()
           WHERE id = ANY($1::uuid[]) AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
          [ids, userId]
        );
        break;
      case "add_tags": {
        if (!Array.isArray(tags) || tags.length === 0) {
          return res.status(400).json({ error: "tags must be a non-empty array" });
        }
        const safeTags = tags.filter((t: unknown) => typeof t === "string" && t.trim()).map((t: string) => t.trim().slice(0, 50));
        result = await query(
          `UPDATE projects SET tags = (
             SELECT ARRAY(SELECT DISTINCT unnest FROM unnest(tags || $3::text[]) LIMIT 20)
           ), updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
          [ids, userId, safeTags]
        );
        break;
      }
      case "remove_tags": {
        if (!Array.isArray(tags) || tags.length === 0) {
          return res.status(400).json({ error: "tags must be a non-empty array" });
        }
        const removeTags = tags.filter((t: unknown) => typeof t === "string");
        result = await query(
          `UPDATE projects SET tags = (
             SELECT ARRAY(SELECT unnest(tags) EXCEPT SELECT unnest($3::text[]))
           ), updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
          [ids, userId, removeTags]
        );
        break;
      }
      case "set_status": {
        const VALID_STATUSES = ["planning", "in_progress", "completed", "archived"];
        if (!status || !VALID_STATUSES.includes(status)) {
          return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(", ")}` });
        }
        result = await query(
          `UPDATE projects SET status = $3, updated_at = NOW()
           WHERE id = ANY($1::uuid[]) AND user_id = $2 AND deleted_at IS NULL RETURNING id`,
          [ids, userId, status]
        );
        break;
      }
    }
    const affected = result?.rows.length ?? 0;
    logAuditEvent(userId, `project.bulk_${action}`, { ids, affected, ip: req.ip });
    res.json({ ok: true, affected });
  } catch (err) {
    console.error("Bulk project action failed:", err);
    res.status(500).json({ error: "Bulk action failed" });
  }
});

router.post("/", requirePermission("project:create"), async (req, res) => {
  const { name, description, scene_js, building_info, tags, status } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Project name is required" });
  }
  if (name.length > 200) {
    return res.status(400).json({ error: "Project name must be 200 characters or fewer" });
  }
  if (scene_js !== undefined && typeof scene_js === "string" && scene_js.length > 512 * 1024) {
    return res.status(400).json({ error: "Scene script exceeds maximum size of 512 KB" });
  }
  const VALID_STATUSES = ["planning", "in_progress", "completed", "archived"];
  const safeStatus = status && VALID_STATUSES.includes(status) ? status : "planning";
  const safeTags = Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === "string").slice(0, 20) : [];
  const result = await query(
    `INSERT INTO projects (user_id, name, description, scene_js, building_info, tags, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.user!.id, name.trim(), description, scene_js, building_info ? JSON.stringify(building_info) : null, safeTags, safeStatus]
  );
  res.status(201).json(result.rows[0]);
});

router.get("/:id", async (req, res) => {
  const result = await query(
    `SELECT projects.*,
      (SELECT COUNT(*)::int FROM project_views pv WHERE pv.project_id = projects.id) AS view_count
     FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`,
    [req.params.id, req.user!.id]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ error: "Project not found" });

  const bom = await query(
    `SELECT pb.*, m.name AS material_name, c.display_name AS category_name,
      p.unit_price, p.link, s.name AS supplier_name,
      p.in_stock, p.stock_level, p.store_location, p.last_checked_at AS stock_last_checked_at,
      (pb.quantity * p.unit_price * m.waste_factor) AS total
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     JOIN categories c ON m.category_id = c.id
     LEFT JOIN pricing p ON m.id = p.material_id AND p.is_primary = true
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE pb.project_id = $1
     ORDER BY c.sort_order`,
    [req.params.id]
  );

  res.json({ ...result.rows[0], bom: bom.rows });
});

router.get("/:id/versions", async (req, res) => {
  const project = await query(
    "SELECT id FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
    [req.params.id, req.user!.id],
  );
  if (project.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }

  await ensureDefaultBranch(req.params.id);
  const branches = await query(
    `SELECT id, project_id, name, forked_from_version_id, is_default, created_at
     FROM project_branches
     WHERE project_id=$1
     ORDER BY is_default DESC, created_at ASC`,
    [req.params.id],
  );
  const versions = await query(
    `SELECT id, project_id, branch_id, parent_version_id, restored_from_version_id,
       name, description, event_type, delta, thumbnail_url, created_at
     FROM project_versions
     WHERE project_id=$1
     ORDER BY created_at DESC
     LIMIT 200`,
    [req.params.id],
  );

  res.json({ branches: branches.rows, versions: versions.rows });
});

router.post("/:id/versions", async (req, res) => {
  const project = await query(
    "SELECT id FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
    [req.params.id, req.user!.id],
  );
  if (project.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }

  const snapshot = normalizeVersionSnapshot(req.body.snapshot)
    ?? await getOwnedProjectSnapshot(req.params.id, req.user!.id);
  if (!snapshot) {
    return res.status(400).json({ error: "Valid snapshot is required" });
  }

  let branchId = typeof req.body.branch_id === "string" ? req.body.branch_id : null;
  if (branchId) {
    const branch = await query(
      "SELECT id FROM project_branches WHERE id=$1 AND project_id=$2",
      [branchId, req.params.id],
    );
    if (branch.rows.length === 0) {
      return res.status(400).json({ error: "Invalid branch_id" });
    }
  } else {
    const branch = await ensureDefaultBranch(req.params.id);
    branchId = branch.id;
  }

  const rawEvent = typeof req.body.event_type === "string" ? req.body.event_type : "auto";
  const eventType = VERSION_EVENTS.has(rawEvent as ProjectVersionEvent)
    ? rawEvent as ProjectVersionEvent
    : "auto";
  const versionName = optionalText(req.body.name, 200);
  const version = await insertProjectVersion({
    projectId: req.params.id,
    branchId,
    snapshot,
    name: versionName,
    description: optionalText(req.body.description, 1000),
    eventType: versionName && eventType === "auto" ? "named" : eventType,
    thumbnailUrl: optionalText(req.body.thumbnail_url, 250000),
  });

  res.status(201).json({ version });
});

router.post("/:id/branches", async (req, res) => {
  const project = await query(
    "SELECT id FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
    [req.params.id, req.user!.id],
  );
  if (project.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }

  let name: string;
  try {
    name = requiredText(req.body.name ?? "Alternative", "name", 120);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid branch name" });
  }
  const snapshot = normalizeVersionSnapshot(req.body.snapshot)
    ?? await getOwnedProjectSnapshot(req.params.id, req.user!.id);
  if (!snapshot) {
    return res.status(400).json({ error: "Valid snapshot is required" });
  }

  const branchResult = await query(
    `INSERT INTO project_branches (project_id, name, is_default)
     VALUES ($1,$2,false)
     RETURNING *`,
    [req.params.id, name],
  );
  const branch = branchResult.rows[0];
  const version = await insertProjectVersion({
    projectId: req.params.id,
    branchId: branch.id,
    snapshot,
    name,
    description: "Branch fork",
    eventType: "branch",
    thumbnailUrl: optionalText(req.body.thumbnail_url, 250000),
  });
  await query(
    "UPDATE project_branches SET forked_from_version_id=$1 WHERE id=$2",
    [version.id, branch.id],
  );

  res.status(201).json({ branch: { ...branch, forked_from_version_id: version.id }, version });
});

router.get("/:id/versions/compare", async (req, res) => {
  const baseId = typeof req.query.base === "string" ? req.query.base : "";
  const targetId = typeof req.query.target === "string" ? req.query.target : "";
  if (!baseId || !targetId) {
    return res.status(400).json({ error: "base and target query params are required" });
  }

  const versions = await query(
    `SELECT v.id, v.name, v.created_at, v.snapshot
     FROM project_versions v
     JOIN projects p ON p.id = v.project_id
     WHERE v.project_id=$1
       AND v.id = ANY($2::uuid[])
       AND p.user_id=$3
       AND p.deleted_at IS NULL`,
    [req.params.id, [baseId, targetId], req.user!.id],
  );

  if (versions.rows.length !== 2) {
    return res.status(404).json({ error: "Versions not found" });
  }

  const baseRow = versions.rows.find((row: { id: string }) => row.id === baseId);
  const targetRow = versions.rows.find((row: { id: string }) => row.id === targetId);
  const baseSnapshot = normalizeVersionSnapshot(baseRow?.snapshot);
  const targetSnapshot = normalizeVersionSnapshot(targetRow?.snapshot);
  if (!baseSnapshot || !targetSnapshot) {
    return res.status(500).json({ error: "Version snapshot is invalid" });
  }

  const [baseCost, targetCost] = await Promise.all([
    estimateSnapshotCost(baseSnapshot),
    estimateSnapshotCost(targetSnapshot),
  ]);

  res.json({
    base: { id: baseRow.id, name: baseRow.name, created_at: baseRow.created_at, estimated_cost: baseCost },
    target: { id: targetRow.id, name: targetRow.name, created_at: targetRow.created_at, estimated_cost: targetCost },
    delta: buildVersionDelta(baseSnapshot, targetSnapshot),
    cost_delta: targetCost - baseCost,
  });
});

router.post("/:id/versions/:versionId/restore", async (req, res) => {
  const versionResult = await query(
    `SELECT v.*
     FROM project_versions v
     JOIN projects p ON p.id = v.project_id
     WHERE v.project_id=$1
       AND v.id=$2
       AND p.user_id=$3
       AND p.deleted_at IS NULL`,
    [req.params.id, req.params.versionId, req.user!.id],
  );
  if (versionResult.rows.length === 0) {
    return res.status(404).json({ error: "Version not found" });
  }

  const sourceVersion = versionResult.rows[0];
  const snapshot = normalizeVersionSnapshot(sourceVersion.snapshot);
  if (!snapshot) {
    return res.status(500).json({ error: "Version snapshot is invalid" });
  }

  const projectResult = await query(
    `UPDATE projects SET name=$1, description=$2, scene_js=$3, updated_at=now()
     WHERE id=$4 AND user_id=$5
     RETURNING *`,
    [snapshot.name, snapshot.description, snapshot.scene_js, req.params.id, req.user!.id],
  );
  await query("DELETE FROM project_bom WHERE project_id=$1", [req.params.id]);
  for (const item of snapshot.bom) {
    const matExists = await query("SELECT id FROM materials WHERE id=$1", [item.material_id]);
    if (matExists.rows.length === 0) continue;
    await query(
      "INSERT INTO project_bom (project_id, material_id, quantity, unit) VALUES ($1,$2,$3,$4)",
      [req.params.id, item.material_id, item.quantity, item.unit],
    );
  }

  const branchId = sourceVersion.branch_id ?? (await ensureDefaultBranch(req.params.id)).id;
  const restoredVersion = await insertProjectVersion({
    projectId: req.params.id,
    branchId,
    snapshot,
    name: sourceVersion.name ? `Restore: ${sourceVersion.name}` : "Restore checkpoint",
    description: `Restored from ${sourceVersion.id}`,
    eventType: "restore",
    thumbnailUrl: sourceVersion.thumbnail_url,
    restoredFromVersionId: sourceVersion.id,
  });

  res.json({ project: projectResult.rows[0], snapshot, version: restoredVersion });
});

router.post("/:id/quote-request", async (req, res) => {
  let contactName: string;
  let contactEmail: string;
  let postcode: string;
  let workScope: string;
  try {
    contactName = requiredText(req.body.contact_name ?? req.body.contactName, "contact_name", 160);
    contactEmail = requiredText(req.body.contact_email ?? req.body.contactEmail, "contact_email", 254).toLowerCase();
    postcode = requiredText(req.body.postcode, "postcode", 12);
    workScope = requiredText(req.body.work_scope ?? req.body.workScope, "work_scope", 3000);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Invalid quote request" });
  }

  if (!EMAIL_RE.test(contactEmail)) {
    return res.status(400).json({ error: "contact_email must be a valid email address" });
  }
  if (!/^\d{5}$/.test(postcode)) {
    return res.status(400).json({ error: "postcode must be a Finnish 5-digit postcode" });
  }

  const contactPhone = optionalText(req.body.contact_phone ?? req.body.contactPhone, 80);
  const locale = req.body.locale === "en" ? "en" : "fi";

  const projectResult = await query(
    `SELECT p.id, p.name, p.description, p.building_info, u.email AS user_email, u.name AS user_name
     FROM projects p
     JOIN users u ON u.id = p.user_id
     WHERE p.id = $1 AND p.user_id = $2 AND p.deleted_at IS NULL`,
    [req.params.id, req.user!.id],
  );
  if (projectResult.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }
  const project = projectResult.rows[0];

  const bomResult = await query(
    `SELECT pb.*, m.name AS material_name, m.waste_factor,
      p.unit_price, p.unit,
      (pb.quantity * p.unit_price * m.waste_factor) AS line_cost,
      s.name AS supplier_name
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     LEFT JOIN pricing p ON m.id = p.material_id AND p.is_primary = true
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE pb.project_id = $1
     ORDER BY m.name`,
    [req.params.id],
  );
  const bomRows = bomResult.rows as QuoteRequestBomRow[];
  if (bomRows.length === 0) {
    return res.status(400).json({ error: "Cannot request quotes for an empty BOM" });
  }

  const estimatedCost = bomRows.reduce((sum, row) => sum + Number(row.line_cost || 0), 0);
  const insertResult = await query(
    `INSERT INTO quote_requests (
       project_id, user_id, contact_name, contact_email, contact_phone, postcode,
       work_scope, bom_line_count, estimated_cost, matched_contractor_count
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id, status, created_at`,
    [
      req.params.id,
      req.user!.id,
      contactName,
      contactEmail,
      contactPhone,
      postcode,
      workScope,
      bomRows.length,
      estimatedCost,
      0,
    ],
  );

  const email = buildQuoteRequestEmail({
    projectName: project.name,
    workScope,
    contactName,
    contactEmail,
    contactPhone,
    postcode,
    bomLineCount: bomRows.length,
    estimatedCost,
    locale,
  });
  const pdf = await renderQuoteRequestPdf({
    projectName: project.name,
    projectDescription: project.description,
    workScope,
    contactName,
    contactEmail,
    postcode,
    bomRows,
    estimatedCost,
    locale,
  });
  const attachments: EmailAttachment[] = [{
    filename: `helscoop_quote_${safeFilename(project.name)}.pdf`,
    content: pdf,
    contentType: "application/pdf",
  }];
  const emailSent = await sendEmail(contactEmail, email.subject, email.body, attachments);

  logAuditEvent(req.user!.id, "quote_request.submitted", {
    targetId: req.params.id,
    quoteRequestId: insertResult.rows[0].id,
    bomLineCount: bomRows.length,
    estimatedCost,
    ip: req.ip,
  });

  res.status(201).json({
    id: insertResult.rows[0].id,
    status: insertResult.rows[0].status,
    created_at: insertResult.rows[0].created_at,
    email_sent: emailSent,
    bom_line_count: bomRows.length,
    estimated_cost: estimatedCost,
    matched_contractor_count: 0,
  });
});

router.put("/:id", async (req, res) => {
  const { name, description, scene_js, household_deduction_joint, tags, status } = req.body;
  if (name !== undefined && (typeof name !== "string" || name.length > 200)) {
    return res.status(400).json({ error: "Project name must be 200 characters or fewer" });
  }
  if (scene_js !== undefined && typeof scene_js === "string" && scene_js.length > 512 * 1024) {
    return res.status(400).json({ error: "Scene script exceeds maximum size of 512 KB" });
  }
  if (household_deduction_joint !== undefined && typeof household_deduction_joint !== "boolean") {
    return res.status(400).json({ error: "household_deduction_joint must be a boolean" });
  }
  const VALID_STATUSES = ["planning", "in_progress", "completed", "archived"];
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(", ")}` });
  }
  const safeTags = tags !== undefined
    ? (Array.isArray(tags) ? tags.filter((t: unknown) => typeof t === "string").slice(0, 20) : null)
    : null;
  const result = await query(
    `UPDATE projects SET
       name=COALESCE($1, name),
       description=COALESCE($2, description),
       scene_js=COALESCE($3, scene_js),
       household_deduction_joint=COALESCE($4, household_deduction_joint),
       tags=COALESCE($5, tags),
       status=COALESCE($6, status),
       updated_at=now()
     WHERE id=$7 AND user_id=$8 RETURNING *`,
    [name?.trim(), description, scene_js, household_deduction_joint ?? null, safeTags, status ?? null, req.params.id, req.user!.id]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ error: "Project not found" });
  res.json(result.rows[0]);
});

router.delete("/:id", async (req, res) => {
  await query(
    "UPDATE projects SET deleted_at = NOW() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
    [req.params.id, req.user!.id]
  );
  logAuditEvent(req.user!.id, "project.delete", { targetId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

router.post("/:id/restore", async (req, res) => {
  const result = await query(
    "UPDATE projects SET deleted_at = NULL, updated_at = NOW() WHERE id=$1 AND user_id=$2 AND deleted_at IS NOT NULL RETURNING id",
    [req.params.id, req.user!.id]
  );
  if (result.rows.length === 0)
    return res.status(404).json({ error: "Project not found in trash" });
  res.json({ ok: true });
});

router.delete("/:id/permanent", async (req, res) => {
  await query(
    "DELETE FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NOT NULL",
    [req.params.id, req.user!.id]
  );
  logAuditEvent(req.user!.id, "project.permanent_delete", { targetId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

// --------------------------------------------------------------------------
// Share / Unshare endpoints
// --------------------------------------------------------------------------
router.post("/:id/share", requirePermission("project:share"), async (req, res) => {
  // Check ownership
  const proj = await query(
    "SELECT id, share_token FROM projects WHERE id=$1 AND user_id=$2",
    [req.params.id, req.user!.id]
  );
  if (proj.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }

  // If already shared, return existing token
  if (proj.rows[0].share_token) {
    return res.json({ share_token: proj.rows[0].share_token });
  }

  // Generate a new share token (UUID v4)
  const shareToken = crypto.randomUUID();
  await query(
    "UPDATE projects SET share_token = $1, updated_at = now() WHERE id = $2",
    [shareToken, req.params.id]
  );

  res.json({ share_token: shareToken });
});

router.delete("/:id/share", async (req, res) => {
  const result = await query(
    "UPDATE projects SET share_token = NULL, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING id",
    [req.params.id, req.user!.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json({ ok: true });
});

router.post("/:id/bom/substitute", async (req, res) => {
  const fromMaterialId = typeof req.body.from_material_id === "string"
    ? req.body.from_material_id.trim()
    : "";
  const toMaterialId = typeof req.body.to_material_id === "string"
    ? req.body.to_material_id.trim()
    : "";

  if (!fromMaterialId || !toMaterialId) {
    return res.status(400).json({ error: "from_material_id and to_material_id are required" });
  }
  if (fromMaterialId === toMaterialId) {
    return res.status(400).json({ error: "from_material_id and to_material_id must differ" });
  }

  const proj = await query(
    "SELECT id FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
    [req.params.id, req.user!.id],
  );
  if (proj.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }

  const sourceItem = await query(
    "SELECT material_id, quantity, unit FROM project_bom WHERE project_id=$1 AND material_id=$2",
    [req.params.id, fromMaterialId],
  );
  if (sourceItem.rows.length === 0) {
    return res.status(404).json({ error: "Source BOM item not found" });
  }

  const mapping = await query(
    `SELECT substitution_type, confidence, notes
     FROM material_substitutions
     WHERE material_id=$1 AND substitute_id=$2`,
    [fromMaterialId, toMaterialId],
  );
  if (mapping.rows.length === 0) {
    return res.status(400).json({ error: "Requested material is not a mapped substitute" });
  }

  const substitute = await query(
    `SELECT m.id, m.name, p.unit
     FROM materials m
     LEFT JOIN pricing p ON p.material_id = m.id AND p.is_primary = true
     WHERE m.id=$1`,
    [toMaterialId],
  );
  if (substitute.rows.length === 0) {
    return res.status(404).json({ error: "Substitute material not found" });
  }

  const source = sourceItem.rows[0] as { quantity: number | string; unit: string };
  const targetUnit = substitute.rows[0].unit || source.unit || "kpl";
  const existingTarget = await query(
    "SELECT material_id FROM project_bom WHERE project_id=$1 AND material_id=$2",
    [req.params.id, toMaterialId],
  );

  if (existingTarget.rows.length > 0) {
    await query(
      "UPDATE project_bom SET quantity = quantity + $1 WHERE project_id=$2 AND material_id=$3",
      [Number(source.quantity), req.params.id, toMaterialId],
    );
    await query(
      "DELETE FROM project_bom WHERE project_id=$1 AND material_id=$2",
      [req.params.id, fromMaterialId],
    );
  } else {
    await query(
      "UPDATE project_bom SET material_id=$1, unit=$2 WHERE project_id=$3 AND material_id=$4",
      [toMaterialId, targetUnit, req.params.id, fromMaterialId],
    );
  }

  const updated = await query(
    `SELECT pb.*, m.name AS material_name, c.display_name AS category_name,
      p.unit_price, p.link, s.name AS supplier_name,
      p.in_stock, p.stock_level, p.store_location, p.last_checked_at AS stock_last_checked_at,
      (pb.quantity * p.unit_price * m.waste_factor) AS total
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     JOIN categories c ON m.category_id = c.id
     LEFT JOIN pricing p ON m.id = p.material_id AND p.is_primary = true
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE pb.project_id = $1 AND pb.material_id = $2
     ORDER BY pb.created_at DESC
     LIMIT 1`,
    [req.params.id, toMaterialId],
  );

  res.json({
    ok: true,
    from_material_id: fromMaterialId,
    to_material_id: toMaterialId,
    item: updated.rows[0] ?? null,
    substitution: mapping.rows[0],
  });
});

router.put("/:id/bom", async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items))
    return res.status(400).json({ error: "items must be an array" });

  const proj = await query(
    "SELECT id FROM projects WHERE id=$1 AND user_id=$2",
    [req.params.id, req.user!.id]
  );
  if (proj.rows.length === 0)
    return res.status(404).json({ error: "Project not found" });

  // Validate all items before modifying anything
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const idx = i + 1;

    if (
      item.material_id == null ||
      typeof item.material_id !== "string" ||
      item.material_id.trim().length === 0
    ) {
      return res.status(400).json({
        error: `Item ${idx}: material_id must be a non-empty string`,
      });
    }

    const qty = Number(item.quantity);
    if (item.quantity == null || !Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({
        error: `Item ${idx}: quantity must be a positive finite number`,
      });
    }

    // Cap quantity at a sensible upper bound to prevent abuse
    if (qty > 1_000_000) {
      return res.status(400).json({
        error: `Item ${idx}: quantity must not exceed 1,000,000`,
      });
    }
  }

  try {
    await query("DELETE FROM project_bom WHERE project_id=$1", [req.params.id]);
    let inserted = 0;
    for (const item of items) {
      const matExists = await query("SELECT id FROM materials WHERE id=$1", [item.material_id]);
      if (matExists.rows.length === 0) continue;
      await query(
        `INSERT INTO project_bom (project_id, material_id, quantity, unit)
         VALUES ($1, $2, $3, $4)`,
        [req.params.id, item.material_id, item.quantity, item.unit || "kpl"]
      );
      inserted++;
    }
    res.json({ ok: true, count: inserted, skipped: items.length - inserted });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to save BOM", detail: err.message });
  }
});

router.put("/:id/thumbnail", async (req, res) => {
  const { thumbnail } = req.body;
  if (!thumbnail || typeof thumbnail !== "string") {
    return res.status(400).json({ error: "thumbnail (base64 data URL) is required" });
  }
  // Limit thumbnail size to 200KB of base64 data
  if (thumbnail.length > 200 * 1024) {
    return res.status(400).json({ error: "Thumbnail too large (max 200KB)" });
  }
  const result = await query(
    "UPDATE projects SET thumbnail_url = $1, updated_at = now() WHERE id = $2 AND user_id = $3 RETURNING id",
    [thumbnail, req.params.id, req.user!.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }
  res.json({ ok: true });
});

router.post("/:id/duplicate", requirePermission("project:create"), async (req, res) => {
  const src = await query(
    "SELECT * FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
    [req.params.id, req.user!.id]
  );
  if (src.rows.length === 0)
    return res.status(404).json({ error: "Project not found" });
  const p = src.rows[0];

  // Use locale header to determine copy suffix
  const acceptLang = req.headers["accept-language"] || "";
  const suffix = acceptLang.toLowerCase().startsWith("fi") ? "(kopio)" : "(copy)";

  const dup = await query(
    `INSERT INTO projects (user_id, name, description, scene_js)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [req.user!.id, `${p.name} ${suffix}`, p.description, p.scene_js]
  );
  const newId = dup.rows[0].id;

  // Copy BOM items to the new project
  const bomItems = await query(
    "SELECT material_id, quantity, unit FROM project_bom WHERE project_id = $1",
    [req.params.id]
  );
  for (const item of bomItems.rows) {
    await query(
      "INSERT INTO project_bom (project_id, material_id, quantity, unit) VALUES ($1, $2, $3, $4)",
      [newId, item.material_id, item.quantity, item.unit]
    );
  }

  res.status(201).json(dup.rows[0]);
});

// ---------------------------------------------------------------------------
// PDF cost-estimate export
// ---------------------------------------------------------------------------

const pdfStrings = {
  fi: {
    header: "Helscoop \u2014 Kustannusarvio",
    projectName: "Projekti",
    description: "Kuvaus",
    date: "P\u00e4iv\u00e4m\u00e4\u00e4r\u00e4",
    bomTitle: "Materiaalilista",
    colMaterial: "Materiaali",
    colQty: "M\u00e4\u00e4r\u00e4",
    colUnit: "Yksikk\u00f6",
    colUnitPrice: "Yks.hinta",
    colTotal: "Yhteens\u00e4",
    colSupplier: "Toimittaja",
    total: "YHTEENS\u00c4",
    inclVat: "sis. ALV 25,5 %",
    footer: "Luotu Helscoop.fi -palvelulla",
    noDescription: "Ei kuvausta",
    page: "Sivu",
  },
  en: {
    header: "Helscoop \u2014 Cost Estimate",
    projectName: "Project",
    description: "Description",
    date: "Date",
    bomTitle: "Bill of Materials",
    colMaterial: "Material",
    colQty: "Qty",
    colUnit: "Unit",
    colUnitPrice: "Unit price",
    colTotal: "Total",
    colSupplier: "Supplier",
    total: "TOTAL",
    inclVat: "incl. VAT 25.5%",
    footer: "Generated with Helscoop.fi",
    noDescription: "No description",
    page: "Page",
  },
};

router.get("/:id/pdf", async (req, res) => {
  const lang = (req.query.lang === "en" ? "en" : "fi") as keyof typeof pdfStrings;
  const s = pdfStrings[lang];

  // Fetch project
  const projResult = await query(
    "SELECT * FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
    [req.params.id, req.user!.id]
  );
  if (projResult.rows.length === 0) {
    return res.status(404).json({ error: "Project not found" });
  }
  const project = projResult.rows[0];

  // Fetch BOM with pricing
  const bomResult = await query(
    `SELECT pb.*, m.name AS material_name, m.waste_factor,
      p.unit_price, p.unit,
      (pb.quantity * p.unit_price * m.waste_factor) AS line_cost,
      s.name AS supplier_name
     FROM project_bom pb
     JOIN materials m ON pb.material_id = m.id
     LEFT JOIN pricing p ON m.id = p.material_id AND p.is_primary = true
     LEFT JOIN suppliers s ON p.supplier_id = s.id
     WHERE pb.project_id = $1
     ORDER BY m.name`,
    [req.params.id]
  );

  const bomRows = bomResult.rows;
  const grandTotal = bomRows.reduce(
    (sum: number, r: { line_cost: string | null }) => sum + Number(r.line_cost || 0),
    0
  );

  // Build PDF
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });

  // Stream to response
  res.setHeader("Content-Type", "application/pdf");
  const safeName = (project.name || "project").replace(/[^a-zA-Z0-9_\-]/g, "_");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="helscoop_${safeName}.pdf"`
  );
  doc.pipe(res);

  // --- Header ---
  doc
    .fontSize(22)
    .font("Helvetica-Bold")
    .text(s.header, { align: "center" });
  doc.moveDown(0.3);
  doc
    .moveTo(50, doc.y)
    .lineTo(doc.page.width - 50, doc.y)
    .strokeColor("#c4915c")
    .lineWidth(2)
    .stroke();
  doc.moveDown(1);

  // --- Project info ---
  const infoLabelX = 50;
  const infoValueX = 170;

  doc.fontSize(11).font("Helvetica-Bold").text(`${s.projectName}:`, infoLabelX, doc.y);
  doc.font("Helvetica").text(project.name || "", infoValueX, doc.y - doc.currentLineHeight());
  doc.moveDown(0.3);

  doc.font("Helvetica-Bold").text(`${s.description}:`, infoLabelX, doc.y);
  doc.font("Helvetica").text(project.description || s.noDescription, infoValueX, doc.y - doc.currentLineHeight());
  doc.moveDown(0.3);

  const dateStr = new Date().toLocaleDateString(lang === "fi" ? "fi-FI" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  doc.font("Helvetica-Bold").text(`${s.date}:`, infoLabelX, doc.y);
  doc.font("Helvetica").text(dateStr, infoValueX, doc.y - doc.currentLineHeight());
  doc.moveDown(1.5);

  // --- BOM table ---
  doc
    .fontSize(14)
    .font("Helvetica-Bold")
    .text(s.bomTitle)
    .moveDown(0.5);

  // Table layout
  const tableLeft = 50;
  const colWidths = [180, 45, 40, 70, 70, 90];
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const headers = [s.colMaterial, s.colQty, s.colUnit, s.colUnitPrice, s.colTotal, s.colSupplier];
  const rowHeight = 22;

  function drawTableHeader(yPos: number) {
    doc
      .rect(tableLeft, yPos, tableWidth, rowHeight)
      .fill("#3d3831");

    let x = tableLeft;
    doc.fontSize(9).font("Helvetica-Bold").fillColor("#e0dcd4");
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x + 4, yPos + 6, { width: colWidths[i] - 8, align: i >= 1 && i <= 4 ? "right" : "left" });
      x += colWidths[i];
    }
    doc.fillColor("#1a1816");
    return yPos + rowHeight;
  }

  let y = drawTableHeader(doc.y);

  // Data rows
  for (let rowIdx = 0; rowIdx < bomRows.length; rowIdx++) {
    if (y + rowHeight > doc.page.height - 80) {
      doc.addPage();
      y = drawTableHeader(50);
    }

    const row = bomRows[rowIdx];
    const isAlt = rowIdx % 2 === 1;

    if (isAlt) {
      doc.rect(tableLeft, y, tableWidth, rowHeight).fill("#f5f2ed");
    }

    const unitPrice = Number(row.unit_price || 0);
    const lineCost = Number(row.line_cost || 0);

    let x = tableLeft;
    doc.fontSize(9).font("Helvetica").fillColor("#1a1816");

    doc.text(row.material_name || "", x + 4, y + 6, { width: colWidths[0] - 8, align: "left" });
    x += colWidths[0];

    doc.text(String(row.quantity), x + 4, y + 6, { width: colWidths[1] - 8, align: "right" });
    x += colWidths[1];

    doc.text(row.unit || "kpl", x + 4, y + 6, { width: colWidths[2] - 8, align: "right" });
    x += colWidths[2];

    doc.text(unitPrice.toFixed(2), x + 4, y + 6, { width: colWidths[3] - 8, align: "right" });
    x += colWidths[3];

    doc.font("Helvetica-Bold").text(lineCost.toFixed(2), x + 4, y + 6, { width: colWidths[4] - 8, align: "right" });
    x += colWidths[4];

    doc.font("Helvetica").text(row.supplier_name || "", x + 4, y + 6, { width: colWidths[5] - 8, align: "left" });

    doc
      .moveTo(tableLeft, y + rowHeight)
      .lineTo(tableLeft + tableWidth, y + rowHeight)
      .strokeColor("#d4d0c8")
      .lineWidth(0.5)
      .stroke();

    y += rowHeight;
  }

  // Grand total row
  if (y + rowHeight + 8 > doc.page.height - 80) {
    doc.addPage();
    y = 50;
  }
  y += 4;
  doc
    .rect(tableLeft, y, tableWidth, rowHeight + 4)
    .fill("#c4915c");

  const totalColX = tableLeft + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3];
  doc
    .fontSize(11)
    .font("Helvetica-Bold")
    .fillColor("#ffffff");
  doc.text(s.total, tableLeft + 4, y + 7);
  doc.text(
    grandTotal.toLocaleString(lang === "fi" ? "fi-FI" : "en-GB", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " EUR",
    totalColX + 4,
    y + 7,
    { width: colWidths[4] - 8, align: "right" }
  );

  doc
    .fontSize(8)
    .font("Helvetica")
    .fillColor("#1a1816")
    .text(s.inclVat, tableLeft, y + rowHeight + 10);

  // --- Supplier attributions ---
  const suppliers = [...new Set(
    bomRows
      .map((r: { supplier_name?: string }) => r.supplier_name)
      .filter((name): name is string => Boolean(name))
  )];
  if (suppliers.length > 0) {
    const suppY = Math.max(doc.y, y + rowHeight + 28);
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#8a857d")
      .text(
        (lang === "fi" ? "Hintatiedot: " : "Pricing from: ") + suppliers.join(", "),
        tableLeft,
        suppY
      );
  }

  // --- Footer on each page ---
  const range = doc.bufferedPageRange();
  const pageCount = range.count;
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .font("Helvetica")
      .fillColor("#8a857d");
    doc.text(
      `${s.footer} \u2014 ${timestamp}`,
      50,
      doc.page.height - 40,
      { width: doc.page.width - 100, align: "left" }
    );
    doc.text(
      `${s.page} ${i + 1} / ${pageCount}`,
      50,
      doc.page.height - 40,
      { width: doc.page.width - 100, align: "right" }
    );
  }

  doc.end();
});

export default router;
