/**
 * Error Propagation Tests
 *
 * Verifies that each major API endpoint:
 *   - Database connection failure is handled (routes with try/catch return 500 with generic message)
 *   - Missing required fields return 400 with field names
 *   - Auth failures return 401
 *   - Permission failures return 403
 *   - Not found returns 404
 *   - Error responses have consistent format
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../db", () => ({
  query: vi.fn().mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] }),
  pool: { query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }) },
}));

vi.mock("../email", () => ({
  sendEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendPriceAlertEmail: vi.fn(),
}));

vi.mock("../audit", () => ({
  logAuditEvent: vi.fn(),
  createAuditLog: vi.fn().mockResolvedValue(null),
}));

import { query } from "../db";
import app from "../index";

const mockQuery = vi.mocked(query);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authToken(userId = "user-1", role = "user") {
  return jwt.sign({ id: userId, email: "test@test.com", role }, JWT_SECRET, { expiresIn: "7d" });
}

function adminToken(userId = "admin-1") {
  return jwt.sign({ id: userId, email: "admin@test.com", role: "admin" }, JWT_SECRET, { expiresIn: "7d" });
}

function makeRequest(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown; rawBody?: string } = {},
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      const bodyStr = opts.rawBody ?? (opts.body ? JSON.stringify(opts.body) : undefined);
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
          resolve({
            status: res.statusCode || 0,
            body: parsed,
            headers: res.headers as Record<string, string>,
          });
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

const AUTH = { Authorization: `Bearer ${authToken()}` };
const ADMIN_AUTH = { Authorization: `Bearer ${adminToken()}` };

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
});

// ---------------------------------------------------------------------------
// 1. Database failure handling in explicit and generic route error paths
// ---------------------------------------------------------------------------

describe("database failure handling", () => {
  it("GET /projects forwards async DB failures to the generic error handler", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection pool exhausted at pg:5432"));

    const res = await makeRequest("GET", "/projects", {
      headers: AUTH,
    });

    expect(res.status).toBe(500);
    const body = res.body as { error: string };
    expect(body.error).toBe("Internal server error");
    expect(body.error).not.toContain("pool");
    expect(body.error).not.toContain("5432");
  });

  it("PUT /auth/password returns 500 with generic message on DB failure", async () => {
    // First query (user lookup) fails
    mockQuery.mockRejectedValueOnce(new Error("connection pool exhausted at pg:5432"));

    const res = await makeRequest("PUT", "/auth/password", {
      headers: AUTH,
      body: { currentPassword: "old123456", newPassword: "new1234567" },
    });

    expect(res.status).toBe(500);
    const body = res.body as { error: string };
    expect(body.error).toBeDefined();
    // Should NOT contain database connection details
    expect(body.error).not.toContain("pool");
    expect(body.error).not.toContain("5432");
  });

  it("DELETE /auth/account returns 500 with generic message on DB failure", async () => {
    mockQuery.mockRejectedValueOnce(new Error("ENOTFOUND database.internal:5432"));

    const res = await makeRequest("DELETE", "/auth/account", {
      headers: AUTH,
    });

    expect(res.status).toBe(500);
    const body = res.body as { error: string };
    expect(body.error).toBeDefined();
    expect(body.error).not.toContain("ENOTFOUND");
    expect(body.error).not.toContain("database.internal");
  });

  it("PUT /projects/:id/bom returns 500 on DB failure during BOM save", async () => {
    // Ownership check succeeds
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1" }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // DELETE succeeds
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "DELETE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });
    // Material check succeeds
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "pine_48x98_c24" }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // INSERT fails with DB error
    mockQuery.mockRejectedValueOnce(new Error("deadlock detected on table project_bom"));

    const res = await makeRequest("PUT", "/projects/proj-1/bom", {
      headers: AUTH,
      body: { items: [{ material_id: "pine_48x98_c24", quantity: 5, unit: "jm" }] },
    });

    expect(res.status).toBe(500);
    const body = res.body as { error: string };
    expect(body.error).toContain("Failed to save BOM");
  });

  it("POST /auth/reset-password returns 500 on DB failure with generic message", async () => {
    mockQuery.mockRejectedValueOnce(new Error("SSL certificate error at /etc/ssl/certs"));

    const res = await makeRequest("POST", "/auth/reset-password", {
      body: { token: "some-token", password: "newpassword123" },
    });

    expect(res.status).toBe(500);
    const body = res.body as { error: string };
    expect(body.error).not.toContain("/etc/ssl");
    expect(body.error).not.toContain("certificate");
  });
});

// ---------------------------------------------------------------------------
// 2. Missing required fields — 400 with field information
// ---------------------------------------------------------------------------

describe("missing required fields", () => {
  it("POST /auth/login without email returns 400 mentioning required fields", async () => {
    const res = await makeRequest("POST", "/auth/login", {
      body: { password: "password123" },
    });

    expect(res.status).toBe(400);
    const body = res.body as { error: string };
    expect(body.error.toLowerCase()).toContain("email");
  });

  it("POST /auth/login without password returns 400 mentioning required fields", async () => {
    const res = await makeRequest("POST", "/auth/login", {
      body: { email: "test@test.com" },
    });

    expect(res.status).toBe(400);
    const body = res.body as { error: string };
    expect(body.error.toLowerCase()).toContain("password");
  });

  it("POST /auth/register without name returns 400", async () => {
    const res = await makeRequest("POST", "/auth/register", {
      body: { email: "test@test.com", password: "password123" },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error.toLowerCase()).toContain("name");
  });

  it("POST /auth/register with short password returns 400", async () => {
    const res = await makeRequest("POST", "/auth/register", {
      body: { email: "test@test.com", password: "short", name: "Test" },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error.toLowerCase()).toContain("8 characters");
  });

  it("POST /auth/register with invalid email returns 400", async () => {
    const res = await makeRequest("POST", "/auth/register", {
      body: { email: "not-an-email", password: "password123", name: "Test" },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error.toLowerCase()).toContain("email");
  });

  it("POST /auth/register with name > 200 chars returns 400", async () => {
    const res = await makeRequest("POST", "/auth/register", {
      body: { email: "test@test.com", password: "password123", name: "A".repeat(201) },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("200");
  });

  it("POST /projects without name returns 400", async () => {
    const res = await makeRequest("POST", "/projects", {
      headers: AUTH,
      body: { description: "Missing name" },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error.toLowerCase()).toContain("name");
  });

  it("PUT /auth/profile without name or email returns 400", async () => {
    const res = await makeRequest("PUT", "/auth/profile", {
      headers: AUTH,
      body: {},
    });

    expect(res.status).toBe(400);
    const body = res.body as { error: string };
    expect(body.error.toLowerCase()).toMatch(/name|email/);
  });

  it("PUT /auth/password without required fields returns 400", async () => {
    const res = await makeRequest("PUT", "/auth/password", {
      headers: AUTH,
      body: { currentPassword: "old123456" },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error.toLowerCase()).toContain("password");
  });

  it("POST /auth/forgot-password without email returns 400", async () => {
    const res = await makeRequest("POST", "/auth/forgot-password", {
      body: {},
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error.toLowerCase()).toContain("email");
  });

  it("POST /auth/forgot-password with invalid email returns 400", async () => {
    const res = await makeRequest("POST", "/auth/forgot-password", {
      body: { email: "not-valid" },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error.toLowerCase()).toContain("email");
  });

  it("POST /auth/reset-password without token returns 400", async () => {
    const res = await makeRequest("POST", "/auth/reset-password", {
      body: { password: "newpassword123" },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error.toLowerCase()).toContain("token");
  });

  it("POST /auth/reset-password with short password returns 400", async () => {
    const res = await makeRequest("POST", "/auth/reset-password", {
      body: { token: "some-token", password: "short" },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error.toLowerCase()).toContain("8 characters");
  });

  it("PUT /projects/:id/bom with non-array items returns 400", async () => {
    const res = await makeRequest("PUT", "/projects/proj-1/bom", {
      headers: AUTH,
      body: { items: "not-an-array" },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("array");
  });

  it("PUT /projects/:id/thumbnail without thumbnail returns 400", async () => {
    const res = await makeRequest("PUT", "/projects/proj-1/thumbnail", {
      headers: AUTH,
      body: {},
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error.toLowerCase()).toContain("thumbnail");
  });

  it("POST /auth/google without credential returns 400", async () => {
    const res = await makeRequest("POST", "/auth/google", {
      body: {},
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error.toLowerCase()).toContain("credential");
  });

  it("GET /auth/verify-email without token returns 400", async () => {
    const res = await makeRequest("GET", "/auth/verify-email");

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error.toLowerCase()).toContain("token");
  });
});

// ---------------------------------------------------------------------------
// 3. Authentication failures — 401
// ---------------------------------------------------------------------------

describe("authentication failures", () => {
  it("GET /projects without auth returns 401", async () => {
    const res = await makeRequest("GET", "/projects");
    expect(res.status).toBe(401);
  });

  it("GET /auth/me without auth returns 401", async () => {
    const res = await makeRequest("GET", "/auth/me");
    expect(res.status).toBe(401);
  });

  it("PUT /projects/:id without auth returns 401", async () => {
    const res = await makeRequest("PUT", "/projects/proj-1", {
      body: { name: "Updated" },
    });
    expect(res.status).toBe(401);
  });

  it("DELETE /projects/:id without auth returns 401", async () => {
    const res = await makeRequest("DELETE", "/projects/proj-1");
    expect(res.status).toBe(401);
  });

  it("PUT /projects/:id/bom without auth returns 401", async () => {
    const res = await makeRequest("PUT", "/projects/proj-1/bom", {
      body: { items: [] },
    });
    expect(res.status).toBe(401);
  });

  it("POST /projects/:id/share without auth returns 401", async () => {
    const res = await makeRequest("POST", "/projects/proj-1/share");
    expect(res.status).toBe(401);
  });

  it("DELETE /auth/account without auth returns 401", async () => {
    const res = await makeRequest("DELETE", "/auth/account");
    expect(res.status).toBe(401);
  });

  it("expired token returns 401", async () => {
    const expiredToken = jwt.sign(
      { id: "user-1", email: "test@test.com", role: "user" },
      JWT_SECRET,
      { expiresIn: "-1h" },
    );

    const res = await makeRequest("GET", "/projects", {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });

    expect(res.status).toBe(401);
  });

  it("invalid token signature returns 401", async () => {
    const badToken = jwt.sign(
      { id: "user-1", email: "test@test.com", role: "user" },
      "wrong-secret",
      { expiresIn: "7d" },
    );

    const res = await makeRequest("GET", "/projects", {
      headers: { Authorization: `Bearer ${badToken}` },
    });

    expect(res.status).toBe(401);
  });

  it("malformed authorization header returns 401", async () => {
    const res = await makeRequest("GET", "/projects", {
      headers: { Authorization: "NotBearer xyz" },
    });

    expect(res.status).toBe(401);
  });

  it("POST /auth/login with wrong password returns 401", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "user-1",
        email: "test@test.com",
        name: "Test",
        // bcrypt hash for "correct-password"
        password_hash: "$2a$10$invalid",
        role: "user",
      }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("POST", "/auth/login", {
      body: { email: "test@test.com", password: "wrong-password" },
    });

    expect(res.status).toBe(401);
    expect((res.body as { error: string }).error).toContain("Invalid");
  });

  it("POST /auth/refresh without auth header returns 401", async () => {
    const res = await makeRequest("POST", "/auth/refresh");

    expect(res.status).toBe(401);
    expect((res.body as { error: string }).error).toMatch(/authorization|authentication/i);
  });
});

// ---------------------------------------------------------------------------
// 4. Permission failures — 403
// ---------------------------------------------------------------------------

describe("permission failures", () => {
  it("POST /materials without admin role returns 403", async () => {
    const res = await makeRequest("POST", "/materials", {
      headers: AUTH, // regular user
      body: { id: "new_mat", name: "New Material", category_id: "lumber" },
    });

    expect(res.status).toBe(403);
    expect((res.body as { error: string }).error).toContain("ermission");
  });

  it("PUT /materials/:id without admin role returns 403", async () => {
    const res = await makeRequest("PUT", "/materials/some-mat", {
      headers: AUTH,
      body: { name: "Updated" },
    });

    expect(res.status).toBe(403);
  });

  it("DELETE /materials/:id without admin role returns 403", async () => {
    const res = await makeRequest("DELETE", "/materials/some-mat", {
      headers: AUTH,
    });

    expect(res.status).toBe(403);
  });

  it("admin can access POST /materials", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "new_mat", name: "New Material" }],
      command: "INSERT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("POST", "/materials", {
      headers: ADMIN_AUTH,
      body: {
        id: "new_mat",
        name: "New Material",
        category_id: "lumber",
        waste_factor: 1.05,
      },
    });

    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// 5. Not found — 404
// ---------------------------------------------------------------------------

describe("not found handling", () => {
  it("GET /projects/:id returns 404 for nonexistent project", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [],
        command: "SELECT",
        rowCount: 0,
        oid: 0,
        fields: [],
      });

    const res = await makeRequest("GET", "/projects/nonexistent", {
      headers: AUTH,
    });

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("not found");
  });

  it("PUT /projects/:id returns 404 for nonexistent project", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "UPDATE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("PUT", "/projects/nonexistent", {
      headers: AUTH,
      body: { name: "Updated" },
    });

    expect(res.status).toBe(404);
  });

  it("GET /materials/:id returns 404 for nonexistent material", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", "/materials/nonexistent", {
      headers: AUTH,
    });

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("not found");
  });

  it("GET /shared/:token returns 404 for nonexistent share token", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", "/shared/nonexistent-token");

    expect(res.status).toBe(404);
  });

  it("POST /projects/:id/restore returns 404 for project not in trash", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "UPDATE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("POST", "/projects/nonexistent/restore", {
      headers: AUTH,
    });

    expect(res.status).toBe(404);
  });

  it("GET /auth/me returns 404 when user no longer exists", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", "/auth/me", {
      headers: AUTH,
    });

    expect(res.status).toBe(404);
  });

  it("GET /shared/:token returns 400 for excessively long token", async () => {
    const res = await makeRequest("GET", "/shared/" + "x".repeat(65));
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// 6. Error response format consistency
// ---------------------------------------------------------------------------

describe("error response format", () => {
  it("all error responses include an 'error' field", async () => {
    // 401
    const res401 = await makeRequest("GET", "/projects");
    expect((res401.body as { error: string }).error).toBeDefined();

    // 400
    const res400 = await makeRequest("POST", "/auth/login", {
      body: {},
    });
    expect((res400.body as { error: string }).error).toBeDefined();

    // 404
    mockQuery.mockResolvedValueOnce({ rows: [], command: "SELECT", rowCount: 0, oid: 0, fields: [] });
    const res404 = await makeRequest("GET", "/projects/x", { headers: AUTH });
    expect((res404.body as { error: string }).error).toBeDefined();

    // 403
    const res403 = await makeRequest("POST", "/materials", {
      headers: AUTH,
      body: { id: "x", name: "x", category_id: "x" },
    });
    expect((res403.body as { error: string }).error).toBeDefined();
  });

  it("error messages are strings, not objects", async () => {
    const res = await makeRequest("POST", "/auth/login", {
      body: { email: "x", password: "y" },
    });

    // Invalid email format
    expect(res.status).toBe(400);
    expect(typeof (res.body as { error: string }).error).toBe("string");
  });

  it("successful health check does not require auth", async () => {
    const res = await makeRequest("GET", "/health");
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("ok");
  });
});
