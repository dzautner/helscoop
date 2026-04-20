import { Router } from "express";
import { query } from "../db";
import { requireAuth, signToken } from "../auth";
import { requirePermission, requireRole, ROLES, isValidRole, normalizeRole, getPermissionsForRole } from "../permissions";
import { logAuditEvent } from "../audit";

const router = Router();

router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /roles — list all available roles with their permissions (public info)
// ---------------------------------------------------------------------------
router.get("/", (_req, res) => {
  res.json({
    roles: ROLES,
  });
});

// ---------------------------------------------------------------------------
// GET /roles/me — return the current user's role and normalized permissions
// ---------------------------------------------------------------------------
router.get("/me", async (req, res) => {
  const result = await query(
    "SELECT id, email, name, role FROM users WHERE id = $1",
    [req.user!.id]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ error: "User not found" });
  }
  const user = result.rows[0];
  const role = normalizeRole(user.role);

  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role,
    permissions: getPermissionsForRole(role),
  });
});

// ---------------------------------------------------------------------------
// GET /roles/users — admin: list all users with roles
// ---------------------------------------------------------------------------
router.get("/users", requirePermission("user:read_any"), async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
  const offset = parseInt(req.query.offset as string) || 0;

  const result = await query(
    `SELECT id, email, name, role, email_verified, created_at
     FROM users
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const countResult = await query("SELECT COUNT(*) AS total FROM users");

  res.json({
    users: result.rows.map((u) => ({
      ...u,
      role: normalizeRole(u.role),
    })),
    total: parseInt(countResult.rows[0].total),
    limit,
    offset,
  });
});

// ---------------------------------------------------------------------------
// PUT /roles/users/:userId — admin: update a user's role
// ---------------------------------------------------------------------------
router.put(
  "/users/:userId",
  requirePermission("user:update_role"),
  async (req, res) => {
    const { role } = req.body;
    const { userId } = req.params;

    if (!role || typeof role !== "string") {
      return res.status(400).json({ error: "Role is required" });
    }

    if (!isValidRole(role)) {
      return res.status(400).json({
        error: `Invalid role. Must be one of: ${ROLES.join(", ")}`,
      });
    }

    // Prevent admins from demoting themselves
    if (userId === req.user!.id && role !== "admin") {
      return res.status(400).json({
        error: "Cannot change your own role away from admin",
      });
    }

    // Check target user exists
    const existing = await query(
      "SELECT id, role FROM users WHERE id = $1",
      [userId]
    );
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const oldRole = normalizeRole(existing.rows[0].role);

    const result = await query(
      "UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, name, role",
      [role, userId]
    );

    logAuditEvent(req.user!.id, "user.role_change", {
      targetId: userId,
      oldRole,
      newRole: role,
      ip: req.ip,
    });

    const updatedUser = result.rows[0];
    res.json({
      ...updatedUser,
      role: normalizeRole(updatedUser.role),
    });
  }
);

export default router;
