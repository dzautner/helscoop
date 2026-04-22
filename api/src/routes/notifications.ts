import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../auth";
import { query } from "../db";
import { normalizeRole } from "../permissions";
import { getVapidPublicKey } from "../push";

const router = Router();

router.use(requireAuth);

const frequencySchema = z.enum(["off", "daily", "weekly"]);
const watchSchema = z.object({
  project_id: z.string().uuid(),
  material_id: z.string().min(1).max(160),
  target_price: z.number().positive().nullable().optional(),
  watch_any_decrease: z.boolean().optional(),
  notify_email: z.boolean().optional(),
  notify_push: z.boolean().optional(),
});

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(10),
    auth: z.string().min(10),
  }),
});

function isAdmin(role: string | undefined): boolean {
  return normalizeRole(role ?? "user") === "admin";
}

async function canAccessProject(projectId: string, userId: string, role: string | undefined): Promise<boolean> {
  const result = await query(
    `SELECT id
     FROM projects
     WHERE id = $1
       AND ($2::boolean OR user_id = $3)
       AND deleted_at IS NULL`,
    [projectId, isAdmin(role), userId],
  );
  return result.rows.length > 0;
}

function parseLimit(value: unknown): number {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return 20;
  return Math.min(100, Math.max(1, Math.floor(limit)));
}

router.get("/", async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const unreadOnly = req.query.unread === "true";
  const result = await query(
    `SELECT id, type, title, body, read, metadata_json, created_at
     FROM notifications
     WHERE user_id = $1
       AND ($2::boolean = false OR read = false)
     ORDER BY created_at DESC
     LIMIT $3`,
    [req.user!.id, unreadOnly, limit],
  );
  res.json(result.rows);
});

router.get("/unread-count", async (req, res) => {
  const result = await query(
    "SELECT COUNT(*)::int AS unread FROM notifications WHERE user_id = $1 AND read = false",
    [req.user!.id],
  );
  res.json({ unread: result.rows[0]?.unread ?? 0 });
});

router.post("/mark-all-read", async (req, res) => {
  const result = await query(
    "UPDATE notifications SET read = true WHERE user_id = $1 AND read = false",
    [req.user!.id],
  );
  res.json({ updated: result.rowCount ?? 0 });
});

router.patch("/:id/read", async (req, res) => {
  const read = req.body?.read !== false;
  const result = await query(
    `UPDATE notifications
     SET read = $1
     WHERE id = $2 AND user_id = $3
     RETURNING id, type, title, body, read, metadata_json, created_at`,
    [read, req.params.id, req.user!.id],
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Notification not found" });
  res.json(result.rows[0]);
});

router.get("/price-watches", async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : null;
  const result = await query(
    `SELECT pw.id, pw.project_id, pw.material_id, pw.target_price,
            pw.watch_any_decrease, pw.notify_email, pw.notify_push,
            pw.last_notified_price, pw.created_at, pw.updated_at,
            m.name AS material_name,
            p.name AS project_name
     FROM price_watches pw
     JOIN materials m ON m.id = pw.material_id
     JOIN projects p ON p.id = pw.project_id
     WHERE pw.user_id = $1
       AND ($2::uuid IS NULL OR pw.project_id = $2::uuid)
     ORDER BY pw.created_at DESC`,
    [req.user!.id, projectId],
  );
  res.json(result.rows);
});

router.put("/price-watches", async (req, res) => {
  const parsed = watchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid price watch payload", details: parsed.error.flatten() });
  }

  const data = parsed.data;
  if (!(await canAccessProject(data.project_id, req.user!.id, req.user!.role))) {
    return res.status(404).json({ error: "Project not found" });
  }

  const material = await query("SELECT id FROM materials WHERE id = $1", [data.material_id]);
  if (material.rows.length === 0) {
    return res.status(404).json({ error: "Material not found" });
  }

  const result = await query(
    `INSERT INTO price_watches (
       user_id, project_id, material_id, target_price,
       watch_any_decrease, notify_email, notify_push
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, project_id, material_id) DO UPDATE SET
       target_price = EXCLUDED.target_price,
       watch_any_decrease = EXCLUDED.watch_any_decrease,
       notify_email = EXCLUDED.notify_email,
       notify_push = EXCLUDED.notify_push,
       updated_at = now()
     RETURNING id, project_id, material_id, target_price, watch_any_decrease,
       notify_email, notify_push, last_notified_price, created_at, updated_at`,
    [
      req.user!.id,
      data.project_id,
      data.material_id,
      data.target_price ?? null,
      data.watch_any_decrease ?? true,
      data.notify_email ?? true,
      data.notify_push ?? false,
    ],
  );

  res.status(201).json(result.rows[0]);
});

router.delete("/price-watches/:id", async (req, res) => {
  const result = await query(
    "DELETE FROM price_watches WHERE id = $1 AND user_id = $2 RETURNING id",
    [req.params.id, req.user!.id],
  );
  if (result.rows.length === 0) return res.status(404).json({ error: "Price watch not found" });
  res.json({ ok: true });
});

router.get("/push/public-key", (_req, res) => {
  const publicKey = getVapidPublicKey();
  res.json({ configured: Boolean(publicKey), publicKey });
});

router.post("/push/subscribe", async (req, res) => {
  const parsed = pushSubscriptionSchema.safeParse(req.body?.subscription ?? req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid push subscription", details: parsed.error.flatten() });
  }

  const subscription = parsed.data;
  const result = await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, enabled)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent,
       enabled = true,
       updated_at = now()
     RETURNING id, endpoint, enabled`,
    [
      req.user!.id,
      subscription.endpoint,
      subscription.keys.p256dh,
      subscription.keys.auth,
      req.get("user-agent") || null,
    ],
  );

  await query("UPDATE users SET push_notifications = true WHERE id = $1", [req.user!.id]);
  res.status(201).json(result.rows[0]);
});

router.delete("/push/subscribe", async (req, res) => {
  const endpoint = typeof req.body?.endpoint === "string" ? req.body.endpoint : null;
  if (!endpoint) return res.status(400).json({ error: "endpoint is required" });
  const result = await query(
    `UPDATE push_subscriptions
     SET enabled = false, updated_at = now()
     WHERE user_id = $1 AND endpoint = $2`,
    [req.user!.id, endpoint],
  );
  res.json({ updated: result.rowCount ?? 0 });
});

router.get("/projects/:projectId/price-change", async (req, res) => {
  const { projectId } = req.params;
  if (!(await canAccessProject(projectId, req.user!.id, req.user!.role))) {
    return res.status(404).json({ error: "Project not found" });
  }

  const totalResult = await query(
    `SELECT COALESCE(SUM(pb.quantity * COALESCE(p.unit_price, 0) * COALESCE(m.waste_factor, 1)), 0)::numeric AS total
     FROM project_bom pb
     JOIN materials m ON m.id = pb.material_id
     LEFT JOIN pricing p ON p.material_id = pb.material_id AND p.is_primary = true
     WHERE pb.project_id = $1`,
    [projectId],
  );
  const currentTotal = Number(totalResult.rows[0]?.total ?? 0);

  const snapshot = await query(
    "SELECT last_total, last_seen_at FROM project_price_visits WHERE user_id = $1 AND project_id = $2",
    [req.user!.id, projectId],
  );
  const previousTotal = snapshot.rows.length > 0 ? Number(snapshot.rows[0].last_total) : null;
  const lastSeenAt = snapshot.rows[0]?.last_seen_at ? new Date(snapshot.rows[0].last_seen_at) : null;
  const daysSinceLastVisit = lastSeenAt
    ? Math.floor((Date.now() - lastSeenAt.getTime()) / 86_400_000)
    : null;
  const delta = previousTotal == null ? 0 : currentTotal - previousTotal;
  const deltaPercent = previousTotal && previousTotal > 0 ? (delta / previousTotal) * 100 : 0;
  const show = previousTotal != null && (daysSinceLastVisit ?? 0) >= 7 && Math.abs(delta) >= 1;

  await query(
    `INSERT INTO project_price_visits (user_id, project_id, last_total, last_seen_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, project_id) DO UPDATE SET
       last_total = EXCLUDED.last_total,
       last_seen_at = EXCLUDED.last_seen_at`,
    [req.user!.id, projectId, currentTotal],
  );

  res.json({
    project_id: projectId,
    current_total: currentTotal,
    previous_total: previousTotal,
    delta,
    delta_percent: deltaPercent,
    days_since_last_visit: daysSinceLastVisit,
    show,
  });
});

router.put("/preferences", async (req, res) => {
  const parsed = z.object({
    price_alert_email_frequency: frequencySchema.optional(),
    push_notifications: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid notification preferences", details: parsed.error.flatten() });
  }

  const result = await query(
    `UPDATE users
     SET price_alert_email_frequency = COALESCE($1, price_alert_email_frequency),
         push_notifications = COALESCE($2, push_notifications)
     WHERE id = $3
     RETURNING id, email_notifications, price_alert_email_frequency, push_notifications`,
    [
      parsed.data.price_alert_email_frequency ?? null,
      parsed.data.push_notifications ?? null,
      req.user!.id,
    ],
  );
  res.json(result.rows[0]);
});

export default router;
