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
    `SELECT id, name, description, is_public, created_at, updated_at, thumbnail_url,
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

router.post("/", requirePermission("project:create"), async (req, res) => {
  const { name, description, scene_js, building_info } = req.body;
  if (!name || typeof name !== "string") {
    return res.status(400).json({ error: "Project name is required" });
  }
  if (name.length > 200) {
    return res.status(400).json({ error: "Project name must be 200 characters or fewer" });
  }
  if (scene_js !== undefined && typeof scene_js === "string" && scene_js.length > 512 * 1024) {
    return res.status(400).json({ error: "Scene script exceeds maximum size of 512 KB" });
  }
  const result = await query(
    `INSERT INTO projects (user_id, name, description, scene_js, building_info)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user!.id, name.trim(), description, scene_js, building_info ? JSON.stringify(building_info) : null]
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
  const { name, description, scene_js } = req.body;
  if (name !== undefined && (typeof name !== "string" || name.length > 200)) {
    return res.status(400).json({ error: "Project name must be 200 characters or fewer" });
  }
  if (scene_js !== undefined && typeof scene_js === "string" && scene_js.length > 512 * 1024) {
    return res.status(400).json({ error: "Scene script exceeds maximum size of 512 KB" });
  }
  const result = await query(
    `UPDATE projects SET name=COALESCE($1, name), description=COALESCE($2, description), scene_js=COALESCE($3, scene_js), updated_at=now()
     WHERE id=$4 AND user_id=$5 RETURNING *`,
    [name?.trim(), description, scene_js, req.params.id, req.user!.id]
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
