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
