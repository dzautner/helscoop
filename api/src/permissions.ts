/**
 * Roles & Permissions model for Helscoop.
 *
 * Roles:
 *   - homeowner: default role for new users. Can create/manage own projects.
 *   - contractor: can receive shared projects, submit quotes, access lead features.
 *   - partner: material suppliers / affiliate partners. Can manage own supplier data.
 *   - admin: full access to all resources and admin operations.
 *
 * Each role maps to a set of permissions (capabilities). Middleware checks
 * whether the authenticated user's role grants the required permission.
 */

import { Request, Response, NextFunction } from "express";

// ---------------------------------------------------------------------------
// Role definitions
// ---------------------------------------------------------------------------

export const ROLES = ["homeowner", "contractor", "partner", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** Backwards-compatible mapping: old "user" role maps to "homeowner". */
export function normalizeRole(role: string): Role {
  if (role === "user") return "homeowner";
  if (ROLES.includes(role as Role)) return role as Role;
  return "homeowner"; // safe default
}

// ---------------------------------------------------------------------------
// Permission definitions
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  // Project permissions
  "project:create",
  "project:read_own",
  "project:update_own",
  "project:delete_own",
  "project:share",
  "project:read_any",     // admin: read any user's project
  "project:update_any",   // admin: update any project
  "project:delete_any",   // admin: delete any project

  // Quote / cost-estimate permissions
  "quote:view_own",
  "quote:create",         // contractor: submit quotes
  "quote:view_any",       // admin

  // Material / catalog permissions
  "material:read",
  "material:create",      // admin
  "material:update",      // admin
  "material:delete",      // admin

  // Supplier permissions
  "supplier:read",
  "supplier:create",      // admin
  "supplier:update",      // admin / partner (own)
  "supplier:delete",      // admin

  // Pricing permissions
  "pricing:read",
  "pricing:update",       // admin / partner

  // Lead / contact permissions (future)
  "lead:receive",         // contractor
  "lead:manage",          // admin

  // User / role management
  "user:read_any",        // admin
  "user:update_role",     // admin
  "user:delete_any",      // admin

  // Admin panel
  "admin:access",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

// ---------------------------------------------------------------------------
// Role -> Permission mapping
// ---------------------------------------------------------------------------

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  homeowner: [
    "project:create",
    "project:read_own",
    "project:update_own",
    "project:delete_own",
    "project:share",
    "quote:view_own",
    "material:read",
    "supplier:read",
    "pricing:read",
  ],

  contractor: [
    "project:create",
    "project:read_own",
    "project:update_own",
    "project:delete_own",
    "project:share",
    "quote:view_own",
    "quote:create",
    "material:read",
    "supplier:read",
    "pricing:read",
    "lead:receive",
  ],

  partner: [
    "project:create",
    "project:read_own",
    "project:update_own",
    "project:delete_own",
    "project:share",
    "quote:view_own",
    "material:read",
    "supplier:read",
    "supplier:update",   // own supplier data
    "pricing:read",
    "pricing:update",    // own pricing data
  ],

  admin: PERMISSIONS as unknown as Permission[],
};

// ---------------------------------------------------------------------------
// Permission checking helpers
// ---------------------------------------------------------------------------

/** Check whether a role grants a specific permission. */
export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/** Get all permissions for a role. */
export function getPermissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** Check whether a role string is valid. */
export function isValidRole(role: string): role is Role {
  return ROLES.includes(role as Role);
}

// ---------------------------------------------------------------------------
// Express middleware
// ---------------------------------------------------------------------------

/**
 * Middleware factory: require the authenticated user to have a specific
 * permission. Must be placed after `requireAuth`.
 *
 * Usage:
 *   router.post("/quotes", requireAuth, requirePermission("quote:create"), handler);
 */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const role = normalizeRole(req.user.role);

    for (const permission of permissions) {
      if (!roleHasPermission(role, permission)) {
        return res.status(403).json({
          error: "Insufficient permissions",
          required: permission,
        });
      }
    }

    next();
  };
}

/**
 * Middleware factory: require the user to have one of the listed roles.
 * Simpler alternative to permission-based checks when you just want
 * role gating.
 *
 * Usage:
 *   router.get("/admin", requireAuth, requireRole("admin"), handler);
 *   router.get("/pro", requireAuth, requireRole("contractor", "partner", "admin"), handler);
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userRole = normalizeRole(req.user.role);

    if (!roles.includes(userRole)) {
      return res.status(403).json({
        error: "Insufficient role",
        required: roles,
      });
    }

    next();
  };
}

// ---------------------------------------------------------------------------
// Object-level ownership middleware
// ---------------------------------------------------------------------------

/**
 * Middleware factory: verify the authenticated user owns the project
 * identified by `:id` in the route params, OR the user is an admin
 * (admins can access any project).
 *
 * Must be placed after `requireAuth`. The project row is attached to
 * `req.project` so downstream handlers can re-use it without a second query.
 *
 * Usage:
 *   router.get("/:id", requireAuth, requireProjectOwnership(dbQuery), handler);
 */
export function requireProjectOwnership(
  dbQuery: (text: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const projectId = req.params.id;
    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required" });
    }

    const role = normalizeRole(req.user.role);

    // Admins can access any project
    if (role === "admin") {
      return next();
    }

    // For non-admins, verify ownership
    const result = await dbQuery(
      "SELECT id, user_id FROM projects WHERE id = $1",
      [projectId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (result.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: "You do not have access to this project" });
    }

    next();
  };
}
