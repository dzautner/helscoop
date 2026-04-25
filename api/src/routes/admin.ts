import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { requirePermission, isValidRole, normalizeRole, ROLES } from "../permissions";
import { logAuditEvent } from "../audit";

const router = Router();

// All admin routes require authentication + admin:access permission
router.use(requireAuth);

function parseIntMetric(value: unknown): number {
  const parsed = parseInt(String(value ?? "0"), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseNumberMetric(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ---------------------------------------------------------------------------
// GET /admin/users — list users (paginated, admin only)
// ---------------------------------------------------------------------------
router.get("/users", requirePermission("admin:access", "user:read_any"), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;
  const search = (req.query.search as string) || "";
  const role = (req.query.role as string) || "";

  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`(email ILIKE $${paramIdx} OR name ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    if (role && isValidRole(role)) {
      conditions.push(`role = $${paramIdx}`);
      params.push(role);
      paramIdx++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await query(
      `SELECT id, email, name, role, email_verified, created_at
       FROM users
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, limit, offset]
    );

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM users ${whereClause}`,
      params
    );

    res.json({
      users: result.rows.map((u) => ({
        ...u,
        role: normalizeRole(u.role),
      })),
      total: parseInt(countResult.rows[0].total),
      limit,
      offset,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/users/:id — user detail with project count
// ---------------------------------------------------------------------------
router.get("/users/:id", requirePermission("admin:access", "user:read_any"), async (req, res) => {
  const { id } = req.params;

  try {
    const userResult = await query(
      `SELECT id, email, name, role, email_verified, created_at
       FROM users WHERE id = $1`,
      [id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    const projectCountResult = await query(
      "SELECT COUNT(*) AS project_count FROM projects WHERE user_id = $1",
      [id]
    );

    res.json({
      ...user,
      role: normalizeRole(user.role),
      project_count: parseInt(projectCountResult.rows[0].project_count),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/users/:id/role — update user role (admin only)
// ---------------------------------------------------------------------------
router.patch(
  "/users/:id/role",
  requirePermission("admin:access", "user:update_role"),
  async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || typeof role !== "string") {
      return res.status(400).json({ error: "Role is required" });
    }

    if (!isValidRole(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${ROLES.join(", ")}`,
      });
    }

    // Prevent admins from demoting themselves
    if (id === req.user!.id && role !== "admin") {
      return res.status(400).json({
        error: "Cannot change your own role away from admin",
      });
    }

    try {
      const existing = await query(
        "SELECT id, role FROM users WHERE id = $1",
        [id]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const oldRole = normalizeRole(existing.rows[0].role);

      const result = await query(
        "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role",
        [role, id]
      );

      logAuditEvent(req.user!.id, "admin.user.role_change", {
        targetId: id,
        oldRole,
        newRole: role,
        ip: req.ip,
      });

      const updatedUser = result.rows[0];
      res.json({
        ...updatedUser,
        role: normalizeRole(updatedUser.role),
      });
    } catch (err) {
      res.status(500).json({ error: "Failed to update role" });
    }
  }
);

// ---------------------------------------------------------------------------
// GET /admin/stats — dashboard stats and operational health signals
// ---------------------------------------------------------------------------
router.get("/stats", requirePermission("admin:access"), async (_req, res) => {
  try {
    const [
      userMetricsResult,
      projectMetricsResult,
      bomValueResult,
      priceFreshnessResult,
      stalePricesResult,
      recentProjectsResult,
      recentSignupsResult,
      roleDistributionResult,
    ] =
      await Promise.all([
        query(
          `SELECT
             COUNT(*) AS users_total,
             COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '30 days') AS users_new_30d
           FROM users`
        ),
        query(
          `SELECT
             COUNT(*) AS projects_total,
             COUNT(DISTINCT user_id) FILTER (WHERE updated_at >= NOW() - INTERVAL '24 hours') AS users_active_24h,
             COUNT(DISTINCT user_id) FILTER (WHERE updated_at >= NOW() - INTERVAL '7 days') AS users_active_7d,
             COUNT(DISTINCT user_id) FILTER (WHERE updated_at >= NOW() - INTERVAL '30 days') AS users_active_30d
           FROM projects`
        ),
        query(
          `SELECT COALESCE(SUM(pb.quantity * COALESCE(p.unit_price, 0) * COALESCE(m.waste_factor, 1)), 0) AS bom_total_value
           FROM project_bom pb
           JOIN materials m ON pb.material_id = m.id
           LEFT JOIN pricing p ON p.material_id = pb.material_id AND p.is_primary = true`
        ),
        query(
          `SELECT
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE last_scraped_at >= NOW() - INTERVAL '7 days') AS fresh,
             COUNT(*) FILTER (
               WHERE last_scraped_at < NOW() - INTERVAL '7 days'
                 AND last_scraped_at >= NOW() - INTERVAL '30 days'
             ) AS aging,
             COUNT(*) FILTER (WHERE last_scraped_at < NOW() - INTERVAL '30 days') AS stale,
             COUNT(*) FILTER (WHERE last_scraped_at IS NULL) AS never
           FROM pricing
           WHERE is_primary = true`
        ),
        query(
          `SELECT m.id AS material_id, m.name AS material_name, p.supplier_id, s.name AS supplier_name,
             p.unit_price, p.last_scraped_at,
             CASE
               WHEN p.last_scraped_at IS NULL THEN NULL
               ELSE FLOOR(EXTRACT(EPOCH FROM (now() - p.last_scraped_at))/86400)::int
             END AS days_stale
           FROM pricing p
           JOIN materials m ON p.material_id = m.id
           JOIN suppliers s ON p.supplier_id = s.id
           WHERE p.is_primary = true
             AND (p.last_scraped_at IS NULL OR p.last_scraped_at < now() - interval '30 days')
           ORDER BY p.last_scraped_at ASC NULLS FIRST
           LIMIT 10`
        ),
        query(
          `SELECT id, name, created_at, updated_at,
             CASE
               WHEN building_info->>'address' IS NOT NULL AND building_info->>'address' <> '' THEN 'address'
               WHEN scene_js IS NULL OR btrim(scene_js) = '' THEN 'blank'
               ELSE 'template'
             END AS source
           FROM projects
           ORDER BY created_at DESC
           LIMIT 10`
        ),
        query(
          `SELECT id, role, created_at
           FROM users
           ORDER BY created_at DESC
           LIMIT 10`
        ),
        query(
          `SELECT role, COUNT(*) AS count
           FROM users
           GROUP BY role
          ORDER BY count DESC`
        ),
      ]);

    const userMetrics = userMetricsResult.rows[0] ?? {};
    const projectMetrics = projectMetricsResult.rows[0] ?? {};
    const priceFreshnessRow = priceFreshnessResult.rows[0] ?? {};
    const priceFreshness = {
      total: parseIntMetric(priceFreshnessRow.total),
      fresh: parseIntMetric(priceFreshnessRow.fresh),
      aging: parseIntMetric(priceFreshnessRow.aging),
      stale: parseIntMetric(priceFreshnessRow.stale),
      never: parseIntMetric(priceFreshnessRow.never),
    };
    const staleOrMissing = priceFreshness.stale + priceFreshness.never;
    const stalePercent = priceFreshness.total > 0
      ? Math.round((staleOrMissing / priceFreshness.total) * 100)
      : 0;
    const usersTotal = parseIntMetric(userMetrics.users_total);
    const projectsTotal = parseIntMetric(projectMetrics.projects_total);

    res.json({
      api_health: {
        status: "ok",
        uptime_seconds: Math.round(process.uptime()),
        checked_at: new Date().toISOString(),
      },
      users_total: usersTotal,
      user_count: usersTotal,
      users_new_30d: parseIntMetric(userMetrics.users_new_30d),
      users_active_24h: parseIntMetric(projectMetrics.users_active_24h),
      users_active_7d: parseIntMetric(projectMetrics.users_active_7d),
      users_active_30d: parseIntMetric(projectMetrics.users_active_30d),
      projects_total: projectsTotal,
      project_count: projectsTotal,
      bom_total_value: parseNumberMetric(bomValueResult.rows[0]?.bom_total_value),
      price_freshness: {
        ...priceFreshness,
        stale_percent: stalePercent,
        alert: priceFreshness.total > 0 && stalePercent > 20,
      },
      stale_prices: stalePricesResult.rows.map((row) => ({
        ...row,
        unit_price: parseNumberMetric(row.unit_price),
        days_stale: row.days_stale === null ? null : parseIntMetric(row.days_stale),
      })),
      recent_projects: recentProjectsResult.rows.map((project) => ({
        ...project,
        source: ["address", "template", "blank"].includes(project.source) ? project.source : "blank",
      })),
      recent_signups: recentSignupsResult.rows.map((u) => ({
        ...u,
        role: normalizeRole(u.role),
      })),
      role_distribution: roleDistributionResult.rows.map((r) => ({
        role: normalizeRole(r.role),
        count: parseInt(r.count),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ---------------------------------------------------------------------------
// POST /admin/suppliers/:id/rescrape — flag a supplier for the scraping queue
// ---------------------------------------------------------------------------
router.post(
  "/suppliers/:id/rescrape",
  requirePermission("admin:access", "pricing:update"),
  async (req, res) => {
    const { id } = req.params;

    try {
      const result = await query(
        `UPDATE suppliers
         SET rescrape_requested_at = now(), updated_at = now()
         WHERE id = $1
         RETURNING id, name, rescrape_requested_at`,
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Supplier not found" });
      }

      logAuditEvent(req.user!.id, "admin.supplier.rescrape_requested", {
        supplierId: id,
        ip: req.ip,
      });

      res.json({ ok: true, supplier: result.rows[0] });
    } catch (err) {
      res.status(500).json({ error: "Failed to request supplier re-scrape" });
    }
  }
);

export default router;
