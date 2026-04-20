import { describe, it, expect, vi } from "vitest";
import {
  ROLES,
  PERMISSIONS,
  normalizeRole,
  roleHasPermission,
  getPermissionsForRole,
  isValidRole,
  requirePermission,
  requireRole,
  requireProjectOwnership,
} from "../permissions";
import type { Role, Permission } from "../permissions";
import { signToken } from "../auth";
import type { AuthUser } from "../auth";

// ---------------------------------------------------------------------------
// Helpers: mock Express req / res / next
// ---------------------------------------------------------------------------

function createMockReqRes(user?: AuthUser) {
  const req = { user } as import("express").Request;
  const res = {
    _status: 0,
    _body: null as unknown,
    status(code: number) {
      this._status = code;
      return this;
    },
    json(body: unknown) {
      this._body = body;
      return this;
    },
  } as unknown as import("express").Response & { _status: number; _body: unknown };
  const next = vi.fn();
  return { req, res, next };
}

// ---------------------------------------------------------------------------
// normalizeRole
// ---------------------------------------------------------------------------

describe("normalizeRole", () => {
  it('maps legacy "user" role to "homeowner"', () => {
    expect(normalizeRole("user")).toBe("homeowner");
  });

  it("passes through valid roles unchanged", () => {
    for (const role of ROLES) {
      expect(normalizeRole(role)).toBe(role);
    }
  });

  it('defaults unknown roles to "homeowner"', () => {
    expect(normalizeRole("superuser")).toBe("homeowner");
    expect(normalizeRole("")).toBe("homeowner");
    expect(normalizeRole("ADMIN")).toBe("homeowner"); // case-sensitive
  });
});

// ---------------------------------------------------------------------------
// isValidRole
// ---------------------------------------------------------------------------

describe("isValidRole", () => {
  it("returns true for all defined roles", () => {
    for (const role of ROLES) {
      expect(isValidRole(role)).toBe(true);
    }
  });

  it("returns false for invalid roles", () => {
    expect(isValidRole("user")).toBe(false);
    expect(isValidRole("superadmin")).toBe(false);
    expect(isValidRole("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// roleHasPermission
// ---------------------------------------------------------------------------

describe("roleHasPermission", () => {
  // Homeowner permissions
  it("grants homeowner project:create", () => {
    expect(roleHasPermission("homeowner", "project:create")).toBe(true);
  });

  it("grants homeowner project:read_own", () => {
    expect(roleHasPermission("homeowner", "project:read_own")).toBe(true);
  });

  it("denies homeowner project:read_any", () => {
    expect(roleHasPermission("homeowner", "project:read_any")).toBe(false);
  });

  it("denies homeowner material:create", () => {
    expect(roleHasPermission("homeowner", "material:create")).toBe(false);
  });

  it("denies homeowner admin:access", () => {
    expect(roleHasPermission("homeowner", "admin:access")).toBe(false);
  });

  it("denies homeowner quote:create", () => {
    expect(roleHasPermission("homeowner", "quote:create")).toBe(false);
  });

  // Contractor permissions
  it("grants contractor quote:create", () => {
    expect(roleHasPermission("contractor", "quote:create")).toBe(true);
  });

  it("grants contractor lead:receive", () => {
    expect(roleHasPermission("contractor", "lead:receive")).toBe(true);
  });

  it("denies contractor admin:access", () => {
    expect(roleHasPermission("contractor", "admin:access")).toBe(false);
  });

  it("denies contractor material:create", () => {
    expect(roleHasPermission("contractor", "material:create")).toBe(false);
  });

  // Partner permissions
  it("grants partner supplier:update", () => {
    expect(roleHasPermission("partner", "supplier:update")).toBe(true);
  });

  it("grants partner pricing:update", () => {
    expect(roleHasPermission("partner", "pricing:update")).toBe(true);
  });

  it("denies partner admin:access", () => {
    expect(roleHasPermission("partner", "admin:access")).toBe(false);
  });

  // Admin permissions
  it("grants admin every defined permission", () => {
    for (const perm of PERMISSIONS) {
      expect(roleHasPermission("admin", perm)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// getPermissionsForRole
// ---------------------------------------------------------------------------

describe("getPermissionsForRole", () => {
  it("returns non-empty arrays for all roles", () => {
    for (const role of ROLES) {
      const perms = getPermissionsForRole(role);
      expect(perms.length).toBeGreaterThan(0);
    }
  });

  it("admin has the most permissions", () => {
    const adminPerms = getPermissionsForRole("admin");
    for (const role of ROLES) {
      expect(adminPerms.length).toBeGreaterThanOrEqual(
        getPermissionsForRole(role).length
      );
    }
  });

  it("homeowner has fewer permissions than contractor", () => {
    expect(getPermissionsForRole("homeowner").length).toBeLessThan(
      getPermissionsForRole("contractor").length
    );
  });
});

// ---------------------------------------------------------------------------
// requirePermission middleware
// ---------------------------------------------------------------------------

describe("requirePermission middleware", () => {
  it("allows request when user has the required permission", () => {
    const { req, res, next } = createMockReqRes({
      id: "user-1",
      email: "home@test.com",
      role: "homeowner",
    });
    const middleware = requirePermission("project:create");
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(0);
  });

  it("rejects request when user lacks the required permission", () => {
    const { req, res, next } = createMockReqRes({
      id: "user-1",
      email: "home@test.com",
      role: "homeowner",
    });
    const middleware = requirePermission("admin:access");
    middleware(req, res, next);
    expect(res._status).toBe(403);
    expect((res._body as { error: string }).error).toContain("Insufficient");
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when no user is present", () => {
    const { req, res, next } = createMockReqRes();
    const middleware = requirePermission("project:create");
    middleware(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("handles legacy 'user' role via normalizeRole", () => {
    const { req, res, next } = createMockReqRes({
      id: "user-1",
      email: "legacy@test.com",
      role: "user", // old role
    });
    const middleware = requirePermission("project:create");
    middleware(req, res, next);
    expect(next).toHaveBeenCalled(); // should pass because user -> homeowner
  });

  it("checks multiple permissions (all must pass)", () => {
    const { req, res, next } = createMockReqRes({
      id: "user-1",
      email: "home@test.com",
      role: "homeowner",
    });
    const middleware = requirePermission("project:create", "admin:access");
    middleware(req, res, next);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows admin for any permission", () => {
    const { req, res, next } = createMockReqRes({
      id: "admin-1",
      email: "admin@helscoop.fi",
      role: "admin",
    });
    const middleware = requirePermission("user:update_role", "admin:access");
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("includes required permission in error response", () => {
    const { req, res, next } = createMockReqRes({
      id: "user-1",
      email: "home@test.com",
      role: "homeowner",
    });
    const middleware = requirePermission("admin:access");
    middleware(req, res, next);
    expect((res._body as { required: string }).required).toBe("admin:access");
  });
});

// ---------------------------------------------------------------------------
// requireRole middleware
// ---------------------------------------------------------------------------

describe("requireRole middleware", () => {
  it("allows request when user has one of the required roles", () => {
    const { req, res, next } = createMockReqRes({
      id: "user-1",
      email: "contractor@test.com",
      role: "contractor",
    });
    const middleware = requireRole("contractor", "admin");
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("rejects request when user does not have the required role", () => {
    const { req, res, next } = createMockReqRes({
      id: "user-1",
      email: "home@test.com",
      role: "homeowner",
    });
    const middleware = requireRole("contractor", "admin");
    middleware(req, res, next);
    expect(res._status).toBe(403);
    expect((res._body as { error: string }).error).toContain("Insufficient");
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when no user is present", () => {
    const { req, res, next } = createMockReqRes();
    const middleware = requireRole("homeowner");
    middleware(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("normalizes legacy 'user' role before checking", () => {
    const { req, res, next } = createMockReqRes({
      id: "user-1",
      email: "legacy@test.com",
      role: "user",
    });
    const middleware = requireRole("homeowner");
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("includes required roles in error response", () => {
    const { req, res, next } = createMockReqRes({
      id: "user-1",
      email: "home@test.com",
      role: "homeowner",
    });
    const middleware = requireRole("contractor", "admin");
    middleware(req, res, next);
    expect((res._body as { required: string[] }).required).toEqual([
      "contractor",
      "admin",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Role hierarchy and permission boundary tests
// ---------------------------------------------------------------------------

describe("permission boundaries", () => {
  it("only admin can manage users", () => {
    const userPerms: Permission[] = ["user:read_any", "user:update_role", "user:delete_any"];
    for (const perm of userPerms) {
      expect(roleHasPermission("homeowner", perm)).toBe(false);
      expect(roleHasPermission("contractor", perm)).toBe(false);
      expect(roleHasPermission("partner", perm)).toBe(false);
      expect(roleHasPermission("admin", perm)).toBe(true);
    }
  });

  it("only admin can access admin panel", () => {
    expect(roleHasPermission("homeowner", "admin:access")).toBe(false);
    expect(roleHasPermission("contractor", "admin:access")).toBe(false);
    expect(roleHasPermission("partner", "admin:access")).toBe(false);
    expect(roleHasPermission("admin", "admin:access")).toBe(true);
  });

  it("only admin can create/delete materials", () => {
    const crudPerms: Permission[] = ["material:create", "material:update", "material:delete"];
    for (const perm of crudPerms) {
      expect(roleHasPermission("homeowner", perm)).toBe(false);
      expect(roleHasPermission("contractor", perm)).toBe(false);
      expect(roleHasPermission("partner", perm)).toBe(false);
      expect(roleHasPermission("admin", perm)).toBe(true);
    }
  });

  it("all roles can read materials and pricing", () => {
    for (const role of ROLES) {
      expect(roleHasPermission(role, "material:read")).toBe(true);
      expect(roleHasPermission(role, "pricing:read")).toBe(true);
    }
  });

  it("all roles can create and manage own projects", () => {
    const ownProjectPerms: Permission[] = [
      "project:create",
      "project:read_own",
      "project:update_own",
      "project:delete_own",
    ];
    for (const role of ROLES) {
      for (const perm of ownProjectPerms) {
        expect(roleHasPermission(role, perm)).toBe(true);
      }
    }
  });

  it("only contractor can create quotes", () => {
    expect(roleHasPermission("homeowner", "quote:create")).toBe(false);
    expect(roleHasPermission("contractor", "quote:create")).toBe(true);
    expect(roleHasPermission("partner", "quote:create")).toBe(false);
    expect(roleHasPermission("admin", "quote:create")).toBe(true);
  });

  it("only contractor can receive leads", () => {
    expect(roleHasPermission("homeowner", "lead:receive")).toBe(false);
    expect(roleHasPermission("contractor", "lead:receive")).toBe(true);
    expect(roleHasPermission("partner", "lead:receive")).toBe(false);
    expect(roleHasPermission("admin", "lead:receive")).toBe(true);
  });

  it("partner and admin can update pricing", () => {
    expect(roleHasPermission("homeowner", "pricing:update")).toBe(false);
    expect(roleHasPermission("contractor", "pricing:update")).toBe(false);
    expect(roleHasPermission("partner", "pricing:update")).toBe(true);
    expect(roleHasPermission("admin", "pricing:update")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// requireProjectOwnership middleware
// ---------------------------------------------------------------------------

describe("requireProjectOwnership middleware", () => {
  function createMockReqRes(user?: AuthUser, params: Record<string, string> = {}) {
    const req = { user, params } as unknown as import("express").Request;
    const res = {
      _status: 0,
      _body: null as unknown,
      status(code: number) {
        this._status = code;
        return this;
      },
      json(body: unknown) {
        this._body = body;
        return this;
      },
    } as unknown as import("express").Response & { _status: number; _body: unknown };
    const next = vi.fn();
    return { req, res, next };
  }

  const mockDbQuery = vi.fn();

  it("returns 401 when no user is present", async () => {
    const { req, res, next } = createMockReqRes(undefined, { id: "proj-1" });
    const middleware = requireProjectOwnership(mockDbQuery);
    await middleware(req, res, next);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 when no project ID is in params", async () => {
    const { req, res, next } = createMockReqRes(
      { id: "user-1", email: "test@test.com", role: "homeowner" },
      {}
    );
    const middleware = requireProjectOwnership(mockDbQuery);
    await middleware(req, res, next);
    expect(res._status).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows admin access to any project without querying DB for ownership", async () => {
    const dbQuery = vi.fn();
    const { req, res, next } = createMockReqRes(
      { id: "admin-1", email: "admin@helscoop.fi", role: "admin" },
      { id: "proj-1" }
    );
    const middleware = requireProjectOwnership(dbQuery);
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(dbQuery).not.toHaveBeenCalled(); // Admin skips ownership check
  });

  it("allows owner to access their own project", async () => {
    const dbQuery = vi.fn().mockResolvedValue({
      rows: [{ id: "proj-1", user_id: "user-1" }],
    });
    const { req, res, next } = createMockReqRes(
      { id: "user-1", email: "test@test.com", role: "homeowner" },
      { id: "proj-1" }
    );
    const middleware = requireProjectOwnership(dbQuery);
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res._status).toBe(0);
  });

  it("returns 403 when user tries to access another user's project", async () => {
    const dbQuery = vi.fn().mockResolvedValue({
      rows: [{ id: "proj-1", user_id: "other-user" }],
    });
    const { req, res, next } = createMockReqRes(
      { id: "user-1", email: "test@test.com", role: "homeowner" },
      { id: "proj-1" }
    );
    const middleware = requireProjectOwnership(dbQuery);
    await middleware(req, res, next);
    expect(res._status).toBe(403);
    expect((res._body as { error: string }).error).toContain("do not have access");
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 404 when project does not exist", async () => {
    const dbQuery = vi.fn().mockResolvedValue({ rows: [] });
    const { req, res, next } = createMockReqRes(
      { id: "user-1", email: "test@test.com", role: "homeowner" },
      { id: "nonexistent" }
    );
    const middleware = requireProjectOwnership(dbQuery);
    await middleware(req, res, next);
    expect(res._status).toBe(404);
    expect(next).not.toHaveBeenCalled();
  });

  it("normalizes legacy 'user' role and checks ownership", async () => {
    const dbQuery = vi.fn().mockResolvedValue({
      rows: [{ id: "proj-1", user_id: "user-1" }],
    });
    const { req, res, next } = createMockReqRes(
      { id: "user-1", email: "test@test.com", role: "user" }, // legacy role
      { id: "proj-1" }
    );
    const middleware = requireProjectOwnership(dbQuery);
    await middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Route-level permission matrix tests
// ---------------------------------------------------------------------------

describe("route permission matrix", () => {
  // These tests verify the ROLE_PERMISSIONS mapping captures the intended
  // access policy for every route category in the application.

  describe("project routes", () => {
    it("all roles can create and manage own projects", () => {
      const ownPerms: Permission[] = [
        "project:create", "project:read_own", "project:update_own",
        "project:delete_own", "project:share",
      ];
      for (const role of ROLES) {
        for (const perm of ownPerms) {
          expect(roleHasPermission(role, perm)).toBe(true);
        }
      }
    });

    it("only admin can read/update/delete any project", () => {
      const anyPerms: Permission[] = [
        "project:read_any", "project:update_any", "project:delete_any",
      ];
      for (const perm of anyPerms) {
        expect(roleHasPermission("homeowner", perm)).toBe(false);
        expect(roleHasPermission("contractor", perm)).toBe(false);
        expect(roleHasPermission("partner", perm)).toBe(false);
        expect(roleHasPermission("admin", perm)).toBe(true);
      }
    });
  });

  describe("material routes", () => {
    it("all roles can read materials", () => {
      for (const role of ROLES) {
        expect(roleHasPermission(role, "material:read")).toBe(true);
      }
    });

    it("only admin can create/update/delete materials", () => {
      const mutPerms: Permission[] = [
        "material:create", "material:update", "material:delete",
      ];
      for (const perm of mutPerms) {
        expect(roleHasPermission("homeowner", perm)).toBe(false);
        expect(roleHasPermission("contractor", perm)).toBe(false);
        expect(roleHasPermission("partner", perm)).toBe(false);
        expect(roleHasPermission("admin", perm)).toBe(true);
      }
    });
  });

  describe("supplier routes", () => {
    it("all roles can read suppliers", () => {
      for (const role of ROLES) {
        expect(roleHasPermission(role, "supplier:read")).toBe(true);
      }
    });

    it("only admin can create/delete suppliers", () => {
      expect(roleHasPermission("homeowner", "supplier:create")).toBe(false);
      expect(roleHasPermission("contractor", "supplier:create")).toBe(false);
      expect(roleHasPermission("partner", "supplier:create")).toBe(false);
      expect(roleHasPermission("admin", "supplier:create")).toBe(true);

      expect(roleHasPermission("homeowner", "supplier:delete")).toBe(false);
      expect(roleHasPermission("contractor", "supplier:delete")).toBe(false);
      expect(roleHasPermission("partner", "supplier:delete")).toBe(false);
      expect(roleHasPermission("admin", "supplier:delete")).toBe(true);
    });

    it("partner and admin can update suppliers", () => {
      expect(roleHasPermission("homeowner", "supplier:update")).toBe(false);
      expect(roleHasPermission("contractor", "supplier:update")).toBe(false);
      expect(roleHasPermission("partner", "supplier:update")).toBe(true);
      expect(roleHasPermission("admin", "supplier:update")).toBe(true);
    });
  });

  describe("pricing routes", () => {
    it("all roles can read pricing", () => {
      for (const role of ROLES) {
        expect(roleHasPermission(role, "pricing:read")).toBe(true);
      }
    });

    it("only partner and admin can update pricing", () => {
      expect(roleHasPermission("homeowner", "pricing:update")).toBe(false);
      expect(roleHasPermission("contractor", "pricing:update")).toBe(false);
      expect(roleHasPermission("partner", "pricing:update")).toBe(true);
      expect(roleHasPermission("admin", "pricing:update")).toBe(true);
    });
  });

  describe("quote routes", () => {
    it("all roles can view own quotes", () => {
      for (const role of ROLES) {
        expect(roleHasPermission(role, "quote:view_own")).toBe(true);
      }
    });

    it("only contractor and admin can create quotes", () => {
      expect(roleHasPermission("homeowner", "quote:create")).toBe(false);
      expect(roleHasPermission("contractor", "quote:create")).toBe(true);
      expect(roleHasPermission("partner", "quote:create")).toBe(false);
      expect(roleHasPermission("admin", "quote:create")).toBe(true);
    });

    it("only admin can view any quote", () => {
      expect(roleHasPermission("homeowner", "quote:view_any")).toBe(false);
      expect(roleHasPermission("contractor", "quote:view_any")).toBe(false);
      expect(roleHasPermission("partner", "quote:view_any")).toBe(false);
      expect(roleHasPermission("admin", "quote:view_any")).toBe(true);
    });
  });

  describe("lead routes", () => {
    it("only contractor and admin can receive leads", () => {
      expect(roleHasPermission("homeowner", "lead:receive")).toBe(false);
      expect(roleHasPermission("contractor", "lead:receive")).toBe(true);
      expect(roleHasPermission("partner", "lead:receive")).toBe(false);
      expect(roleHasPermission("admin", "lead:receive")).toBe(true);
    });

    it("only admin can manage leads", () => {
      expect(roleHasPermission("homeowner", "lead:manage")).toBe(false);
      expect(roleHasPermission("contractor", "lead:manage")).toBe(false);
      expect(roleHasPermission("partner", "lead:manage")).toBe(false);
      expect(roleHasPermission("admin", "lead:manage")).toBe(true);
    });
  });

  describe("user management routes", () => {
    it("only admin can read/update/delete users", () => {
      const userPerms: Permission[] = [
        "user:read_any", "user:update_role", "user:delete_any",
      ];
      for (const perm of userPerms) {
        expect(roleHasPermission("homeowner", perm)).toBe(false);
        expect(roleHasPermission("contractor", perm)).toBe(false);
        expect(roleHasPermission("partner", perm)).toBe(false);
        expect(roleHasPermission("admin", perm)).toBe(true);
      }
    });
  });

  describe("admin panel", () => {
    it("only admin can access admin panel", () => {
      expect(roleHasPermission("homeowner", "admin:access")).toBe(false);
      expect(roleHasPermission("contractor", "admin:access")).toBe(false);
      expect(roleHasPermission("partner", "admin:access")).toBe(false);
      expect(roleHasPermission("admin", "admin:access")).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-cutting permission coverage tests
// ---------------------------------------------------------------------------

describe("permission coverage", () => {
  it("every permission in PERMISSIONS is assigned to at least one role", () => {
    for (const perm of PERMISSIONS) {
      const assignedToAny = ROLES.some((role) => roleHasPermission(role, perm));
      expect(assignedToAny).toBe(true);
    }
  });

  it("admin role includes every permission defined in PERMISSIONS", () => {
    for (const perm of PERMISSIONS) {
      expect(roleHasPermission("admin", perm)).toBe(true);
    }
  });

  it("non-admin roles never have admin:access", () => {
    const nonAdmin: Role[] = ["homeowner", "contractor", "partner"];
    for (const role of nonAdmin) {
      expect(roleHasPermission(role, "admin:access")).toBe(false);
    }
  });

  it("non-admin roles never have user management permissions", () => {
    const nonAdmin: Role[] = ["homeowner", "contractor", "partner"];
    const userPerms: Permission[] = ["user:read_any", "user:update_role", "user:delete_any"];
    for (const role of nonAdmin) {
      for (const perm of userPerms) {
        expect(roleHasPermission(role, perm)).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Middleware chaining tests (multiple permissions)
// ---------------------------------------------------------------------------

describe("requirePermission chaining", () => {
  it("passes when user has all required permissions", () => {
    const { req, res, next } = createMockReqRes({
      id: "partner-1",
      email: "partner@test.com",
      role: "partner",
    });
    const middleware = requirePermission("supplier:update", "pricing:update");
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("fails on first missing permission", () => {
    const { req, res, next } = createMockReqRes({
      id: "contractor-1",
      email: "contractor@test.com",
      role: "contractor",
    });
    // contractor has lead:receive but not supplier:update
    const middleware = requirePermission("lead:receive", "supplier:update");
    middleware(req, res, next);
    expect(res._status).toBe(403);
    expect((res._body as { required: string }).required).toBe("supplier:update");
    expect(next).not.toHaveBeenCalled();
  });

  it("admin passes any combination of permissions", () => {
    const { req, res, next } = createMockReqRes({
      id: "admin-1",
      email: "admin@helscoop.fi",
      role: "admin",
    });
    const middleware = requirePermission(
      "admin:access", "user:update_role", "material:create",
      "supplier:delete", "lead:manage"
    );
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
