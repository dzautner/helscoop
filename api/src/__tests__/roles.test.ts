/**
 * Unit tests for the roles route.
 *
 * Tests: GET /roles, GET /roles/me, GET /roles/users (admin),
 *        PUT /roles/users/:userId (admin role update)
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

// ---------------------------------------------------------------------------
// Mock DB, email, and audit modules BEFORE importing app
// ---------------------------------------------------------------------------
vi.mock("../db", () => ({
  query: vi.fn().mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] }),
  pool: { query: vi.fn() },
}));

vi.mock("../email", () => ({
  sendEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendPriceAlertEmail: vi.fn(),
}));

vi.mock("../audit", () => ({
  logAuditEvent: vi.fn(),
}));

import { query } from "../db";
import { logAuditEvent } from "../audit";
const mockQuery = vi.mocked(query);
const mockAudit = vi.mocked(logAuditEvent);

import app from "../index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authToken(userId = "user-1", role = "homeowner") {
  return jwt.sign(
    { id: userId, email: "test@test.com", role },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function adminToken(userId = "admin-1") {
  return jwt.sign(
    { id: userId, email: "admin@test.com", role: "admin" },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function makeRequest(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
      const reqOpts: http.RequestOptions = {
        hostname: "127.0.0.1",
        port,
        path,
        method: method.toUpperCase(),
        headers: {
          "Content-Type": "application/json",
          ...opts.headers,
        },
      };

      const req = http.request(reqOpts, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          server.close();
          let parsed: unknown;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = data;
          }
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      });

      req.on("error", (err) => {
        server.close();
        reject(err);
      });

      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

beforeEach(() => {
  mockQuery.mockReset();
  mockAudit.mockReset();
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] } as never);
});

// ---------------------------------------------------------------------------
// 1. GET /roles — list available roles
// ---------------------------------------------------------------------------
describe("GET /roles — list roles", () => {
  it("rejects unauthenticated requests", async () => {
    const { status } = await makeRequest("GET", "/roles");
    expect(status).toBe(401);
  });

  it("returns list of available roles", async () => {
    const { status, body } = await makeRequest("GET", "/roles", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(status).toBe(200);
    const result = body as { roles: string[] };
    expect(result.roles).toContain("homeowner");
    expect(result.roles).toContain("admin");
  });
});

// ---------------------------------------------------------------------------
// 2. GET /roles/me — current user's role and permissions
// ---------------------------------------------------------------------------
describe("GET /roles/me — current user", () => {
  it("rejects unauthenticated requests", async () => {
    const { status } = await makeRequest("GET", "/roles/me");
    expect(status).toBe(401);
  });

  it("returns current user with role and permissions", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1", email: "test@test.com", name: "Test User", role: "homeowner" }],
    } as never);

    const { status, body } = await makeRequest("GET", "/roles/me", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(status).toBe(200);
    const result = body as { id: string; role: string; permissions: string[] };
    expect(result.id).toBe("user-1");
    expect(result.role).toBe("homeowner");
    expect(result.permissions).toContain("project:create");
    expect(result.permissions).toContain("material:read");
  });

  it("returns 404 if user not found in DB", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const { status } = await makeRequest("GET", "/roles/me", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// 3. GET /roles/users — admin: list all users
// ---------------------------------------------------------------------------
describe("GET /roles/users — admin list users", () => {
  it("rejects unauthenticated requests", async () => {
    const { status } = await makeRequest("GET", "/roles/users");
    expect(status).toBe(401);
  });

  it("rejects non-admin user", async () => {
    const { status } = await makeRequest("GET", "/roles/users", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(status).toBe(403);
  });

  it("returns paginated user list for admin", async () => {
    const users = [
      { id: "u1", email: "a@test.com", name: "A", role: "homeowner", email_verified: true, created_at: "2025-01-01" },
      { id: "u2", email: "b@test.com", name: "B", role: "contractor", email_verified: false, created_at: "2025-02-01" },
    ];
    mockQuery
      .mockResolvedValueOnce({ rows: users } as never)
      .mockResolvedValueOnce({ rows: [{ total: "2" }] } as never);

    const { status, body } = await makeRequest("GET", "/roles/users", {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    expect(status).toBe(200);
    const result = body as { users: typeof users; total: number; limit: number; offset: number };
    expect(result.users).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it("respects limit and offset query params", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ total: "100" }] } as never);

    const { status, body } = await makeRequest("GET", "/roles/users?limit=10&offset=20", {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    expect(status).toBe(200);
    const result = body as { limit: number; offset: number };
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(20);
  });

  it("caps limit at 100", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ total: "0" }] } as never);

    const { status, body } = await makeRequest("GET", "/roles/users?limit=999", {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    expect(status).toBe(200);
    expect((body as { limit: number }).limit).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 4. PUT /roles/users/:userId — admin: update user role
// ---------------------------------------------------------------------------
describe("PUT /roles/users/:userId — update role", () => {
  it("rejects unauthenticated requests", async () => {
    const { status } = await makeRequest("PUT", "/roles/users/user-1", {
      body: { role: "contractor" },
    });
    expect(status).toBe(401);
  });

  it("rejects non-admin user", async () => {
    const { status } = await makeRequest("PUT", "/roles/users/user-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { role: "contractor" },
    });
    expect(status).toBe(403);
  });

  it("rejects missing role field", async () => {
    const { status, body } = await makeRequest("PUT", "/roles/users/user-1", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: {},
    });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toContain("required");
  });

  it("rejects invalid role", async () => {
    const { status, body } = await makeRequest("PUT", "/roles/users/user-1", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: { role: "superuser" },
    });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toContain("Invalid role");
  });

  it("prevents admin from demoting themselves", async () => {
    const { status, body } = await makeRequest("PUT", "/roles/users/admin-1", {
      headers: { Authorization: `Bearer ${adminToken("admin-1")}` },
      body: { role: "homeowner" },
    });
    expect(status).toBe(400);
    expect((body as { error: string }).error).toContain("Cannot change your own role");
  });

  it("returns 404 for non-existent user", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const { status } = await makeRequest("PUT", "/roles/users/nonexistent", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: { role: "contractor" },
    });
    expect(status).toBe(404);
  });

  it("updates user role and logs audit event", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "user-1", role: "homeowner" }] } as never)
      .mockResolvedValueOnce({
        rows: [{ id: "user-1", email: "test@test.com", name: "Test", role: "contractor" }],
      } as never);

    const { status, body } = await makeRequest("PUT", "/roles/users/user-1", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: { role: "contractor" },
    });

    expect(status).toBe(200);
    const result = body as { id: string; role: string };
    expect(result.role).toBe("contractor");
    expect(mockAudit).toHaveBeenCalledWith(
      "admin-1",
      "user.role_change",
      expect.objectContaining({
        targetId: "user-1",
        oldRole: "homeowner",
        newRole: "contractor",
      }),
    );
  });
});
