import { Router } from "express";
import { query } from "../db";
import { requireAuth } from "../auth";
import { requirePermission, isValidRole, normalizeRole, ROLES } from "../permissions";
import { logAuditEvent } from "../audit";

const router = Router();

// All admin routes require authentication + admin:access permission
router.use(requireAuth);

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
// GET /admin/stats — dashboard stats (user count, project count, recent signups)
// ---------------------------------------------------------------------------
router.get("/stats", requirePermission("admin:access"), async (_req, res) => {
  try {
    const [userCountResult, projectCountResult, recentSignupsResult, roleDistributionResult] =
      await Promise.all([
        query("SELECT COUNT(*) AS total FROM users"),
        query("SELECT COUNT(*) AS total FROM projects"),
        query(
          `SELECT id, email, name, role, created_at
           FROM users
           WHERE created_at >= NOW() - INTERVAL '30 days'
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

    res.json({
      user_count: parseInt(userCountResult.rows[0].total),
      project_count: parseInt(projectCountResult.rows[0].total),
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

export default router;
