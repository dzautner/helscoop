/**
 * Tests for admin backoffice API endpoints.
 *
 * Covers:
 *   - GET /admin/users (paginated list, search, role filter)
 *   - GET /admin/users/:id (user detail with project count)
 *   - PATCH /admin/users/:id/role (role update)
 *   - GET /admin/stats (dashboard statistics)
 *   - POST /admin/suppliers/:id/rescrape (supplier refresh marker)
 *   - Auth and permission checks for all endpoints
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

// Mock the database module BEFORE any app import
vi.mock("../db", () => ({
  query: vi.fn().mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] }),
  pool: { query: vi.fn() },
}));

// Mock email to avoid Resend initialization
vi.mock("../email", () => ({
  sendEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendPriceAlertEmail: vi.fn(),
}));

import { query } from "../db";
const mockQuery = vi.mocked(query);

import app from "../index";

// ---------------------------------------------------------------------------
// Helper: create a JWT auth token
// ---------------------------------------------------------------------------
function authToken(userId = "user-1", role = "admin") {
  return jwt.sign(
    { id: userId, email: "test@helscoop.fi", role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ---------------------------------------------------------------------------
// Helper: make HTTP requests against the Express app
// ---------------------------------------------------------------------------
function makeRequest(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {}
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
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

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
});

// ---------------------------------------------------------------------------
// GET /admin/users
// ---------------------------------------------------------------------------
describe("GET /admin/users", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("GET", "/admin/users");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users", async () => {
    const token = authToken("user-1", "homeowner");
    const res = await makeRequest("GET", "/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("returns paginated user list for admin", async () => {
    const fakeUsers = [
      {
        id: "user-1",
        email: "alice@test.com",
        name: "Alice",
        role: "homeowner",
        email_verified: true,
        created_at: "2025-01-01T00:00:00Z",
      },
      {
        id: "user-2",
        email: "bob@test.com",
        name: "Bob",
        role: "contractor",
        email_verified: false,
        created_at: "2025-01-02T00:00:00Z",
      },
    ];

    mockQuery
      .mockResolvedValueOnce({ rows: fakeUsers } as any)
      .mockResolvedValueOnce({ rows: [{ total: "2" }] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/admin/users?limit=10&offset=0", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { users: unknown[]; total: number; limit: number; offset: number };
    expect(body.users).toHaveLength(2);
    expect(body.total).toBe(2);
    expect(body.limit).toBe(10);
    expect(body.offset).toBe(0);
  });

  it("normalizes roles in response", async () => {
    const fakeUsers = [
      {
        id: "user-1",
        email: "legacy@test.com",
        name: "Legacy",
        role: "user",
        email_verified: true,
        created_at: "2025-01-01T00:00:00Z",
      },
    ];

    mockQuery
      .mockResolvedValueOnce({ rows: fakeUsers } as any)
      .mockResolvedValueOnce({ rows: [{ total: "1" }] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { users: Array<{ role: string }> };
    expect(body.users[0].role).toBe("homeowner");
  });

  it("applies search filter", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [{ total: "0" }] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/admin/users?search=alice", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    // Verify the search parameter was passed to the query
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("ILIKE"),
      expect.arrayContaining(["%alice%"])
    );
  });

  it("applies role filter", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [{ total: "0" }] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/admin/users?role=contractor", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("role = $"),
      expect.arrayContaining(["contractor"])
    );
  });

  it("caps limit at 100", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [{ total: "0" }] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/admin/users?limit=500", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { limit: number };
    expect(body.limit).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/users/:id
// ---------------------------------------------------------------------------
describe("GET /admin/users/:id", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("GET", "/admin/users/user-1");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users", async () => {
    const token = authToken("user-1", "homeowner");
    const res = await makeRequest("GET", "/admin/users/user-1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent user", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/admin/users/nonexistent", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });

  it("returns user detail with project count", async () => {
    const fakeUser = {
      id: "user-1",
      email: "alice@test.com",
      name: "Alice",
      role: "homeowner",
      email_verified: true,
      created_at: "2025-01-01T00:00:00Z",
    };

    mockQuery
      .mockResolvedValueOnce({ rows: [fakeUser] } as any)
      .mockResolvedValueOnce({ rows: [{ project_count: "5" }] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/admin/users/user-1", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { id: string; project_count: number; role: string };
    expect(body.id).toBe("user-1");
    expect(body.project_count).toBe(5);
    expect(body.role).toBe("homeowner");
  });
});

// ---------------------------------------------------------------------------
// PATCH /admin/users/:id/role
// ---------------------------------------------------------------------------
describe("PATCH /admin/users/:id/role", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("PATCH", "/admin/users/user-1/role", {
      body: { role: "contractor" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users", async () => {
    const token = authToken("user-1", "homeowner");
    const res = await makeRequest("PATCH", "/admin/users/user-1/role", {
      headers: { Authorization: `Bearer ${token}` },
      body: { role: "contractor" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects missing role", async () => {
    const token = authToken("admin-1", "admin");
    const res = await makeRequest("PATCH", "/admin/users/user-1/role", {
      headers: { Authorization: `Bearer ${token}` },
      body: {},
    });
    expect(res.status).toBe(400);
    expect((res.body as any).error).toContain("Role is required");
  });

  it("rejects invalid role", async () => {
    const token = authToken("admin-1", "admin");
    const res = await makeRequest("PATCH", "/admin/users/user-1/role", {
      headers: { Authorization: `Bearer ${token}` },
      body: { role: "superuser" },
    });
    expect(res.status).toBe(400);
    expect((res.body as any).error).toContain("Invalid role");
  });

  it("prevents admin from demoting themselves", async () => {
    const token = authToken("admin-1", "admin");
    const res = await makeRequest("PATCH", "/admin/users/admin-1/role", {
      headers: { Authorization: `Bearer ${token}` },
      body: { role: "homeowner" },
    });
    expect(res.status).toBe(400);
    expect((res.body as any).error).toContain("Cannot change your own role");
  });

  it("returns 404 for non-existent user", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("PATCH", "/admin/users/nonexistent/role", {
      headers: { Authorization: `Bearer ${token}` },
      body: { role: "contractor" },
    });
    expect(res.status).toBe(404);
  });

  it("updates user role successfully", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "user-1", role: "homeowner" }] } as any)
      .mockResolvedValueOnce({
        rows: [{ id: "user-1", email: "alice@test.com", name: "Alice", role: "contractor" }],
      } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("PATCH", "/admin/users/user-1/role", {
      headers: { Authorization: `Bearer ${token}` },
      body: { role: "contractor" },
    });

    expect(res.status).toBe(200);
    const body = res.body as { id: string; role: string };
    expect(body.id).toBe("user-1");
    expect(body.role).toBe("contractor");
  });

  it("allows admin to keep their own admin role", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "admin-1", role: "admin" }] } as any)
      .mockResolvedValueOnce({
        rows: [{ id: "admin-1", email: "admin@test.com", name: "Admin", role: "admin" }],
      } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("PATCH", "/admin/users/admin-1/role", {
      headers: { Authorization: `Bearer ${token}` },
      body: { role: "admin" },
    });

    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /admin/stats
// ---------------------------------------------------------------------------
describe("GET /admin/stats", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("GET", "/admin/stats");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users", async () => {
    const token = authToken("user-1", "homeowner");
    const res = await makeRequest("GET", "/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("returns dashboard stats for admin", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ users_total: "42", users_new_30d: "7" }] } as any)
      .mockResolvedValueOnce({
        rows: [{
          projects_total: "15",
          users_active_24h: "3",
          users_active_7d: "8",
          users_active_30d: "12",
        }],
      } as any)
      .mockResolvedValueOnce({ rows: [{ bom_total_value: "12345.67" }] } as any)
      .mockResolvedValueOnce({
        rows: [{ total: "100", fresh: "60", aging: "20", stale: "15", never: "5" }],
      } as any)
      .mockResolvedValueOnce({
        rows: [{
          material_id: "pine",
          material_name: "Pine",
          supplier_id: "k-rauta",
          supplier_name: "K-Rauta",
          unit_price: "3.50",
          last_scraped_at: "2026-02-01",
          days_stale: 80,
        }],
      } as any)
      .mockResolvedValueOnce({
        rows: [{
          id: "project-1",
          name: "Roof refresh",
          source: "address",
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-02T00:00:00Z",
        }],
      } as any)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "user-new",
            role: "homeowner",
            created_at: "2025-04-01T00:00:00Z",
          },
        ],
      } as any) // recent signups
      .mockResolvedValueOnce({
        rows: [
          { role: "homeowner", count: "35" },
          { role: "contractor", count: "5" },
          { role: "admin", count: "2" },
        ],
      } as any); // role distribution

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      user_count: number;
      users_new_30d: number;
      users_active_24h: number;
      users_active_7d: number;
      users_active_30d: number;
      project_count: number;
      projects_total: number;
      bom_total_value: number;
      price_freshness: { stale_percent: number; alert: boolean };
      stale_prices: Array<{ unit_price: number; days_stale: number | null }>;
      recent_projects: Array<{ source: string }>;
      recent_signups: unknown[];
      role_distribution: Array<{ role: string; count: number }>;
    };
    expect(body.user_count).toBe(42);
    expect(body.users_new_30d).toBe(7);
    expect(body.users_active_24h).toBe(3);
    expect(body.users_active_7d).toBe(8);
    expect(body.users_active_30d).toBe(12);
    expect(body.project_count).toBe(15);
    expect(body.projects_total).toBe(15);
    expect(body.bom_total_value).toBe(12345.67);
    expect(body.price_freshness.stale_percent).toBe(20);
    expect(body.price_freshness.alert).toBe(false);
    expect(body.stale_prices[0].unit_price).toBe(3.5);
    expect(body.stale_prices[0].days_stale).toBe(80);
    expect(body.recent_projects[0].source).toBe("address");
    expect(body.recent_signups).toHaveLength(1);
    expect(body.role_distribution).toHaveLength(3);
    expect(body.role_distribution[0].role).toBe("homeowner");
    expect(body.role_distribution[0].count).toBe(35);
  });

  it("normalizes roles in recent signups", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ users_total: "1", users_new_30d: "1" }] } as any)
      .mockResolvedValueOnce({
        rows: [{
          projects_total: "0",
          users_active_24h: "0",
          users_active_7d: "0",
          users_active_30d: "0",
        }],
      } as any)
      .mockResolvedValueOnce({ rows: [{ bom_total_value: "0" }] } as any)
      .mockResolvedValueOnce({ rows: [{ total: "0", fresh: "0", aging: "0", stale: "0", never: "0" }] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({ rows: [] } as any)
      .mockResolvedValueOnce({
        rows: [
          {
            id: "legacy-user",
            role: "user",
            created_at: "2025-04-01T00:00:00Z",
          },
        ],
      } as any)
      .mockResolvedValueOnce({ rows: [{ role: "user", count: "1" }] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      recent_signups: Array<{ role: string }>;
      role_distribution: Array<{ role: string }>;
    };
    expect(body.recent_signups[0].role).toBe("homeowner");
    expect(body.role_distribution[0].role).toBe("homeowner");
  });
});

// ---------------------------------------------------------------------------
// POST /admin/suppliers/:id/rescrape
// ---------------------------------------------------------------------------
describe("POST /admin/suppliers/:id/rescrape", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("POST", "/admin/suppliers/k-rauta/rescrape");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users", async () => {
    const token = authToken("user-1", "homeowner");
    const res = await makeRequest("POST", "/admin/suppliers/k-rauta/rescrape", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("marks a supplier for re-scrape", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "k-rauta", name: "K-Rauta", rescrape_requested_at: "2026-04-22T12:00:00Z" }],
    } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("POST", "/admin/suppliers/k-rauta/rescrape", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("rescrape_requested_at"), ["k-rauta"]);
    expect(res.body).toMatchObject({
      ok: true,
      supplier: { id: "k-rauta", name: "K-Rauta" },
    });
  });

  it("returns 404 for unknown supplier", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("POST", "/admin/suppliers/missing/rescrape", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Contractor role access tests
// ---------------------------------------------------------------------------
describe("contractor cannot access admin endpoints", () => {
  it("rejects contractor from GET /admin/users", async () => {
    const token = authToken("contractor-1", "contractor");
    const res = await makeRequest("GET", "/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("rejects contractor from GET /admin/stats", async () => {
    const token = authToken("contractor-1", "contractor");
    const res = await makeRequest("GET", "/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("rejects contractor from PATCH /admin/users/:id/role", async () => {
    const token = authToken("contractor-1", "contractor");
    const res = await makeRequest("PATCH", "/admin/users/user-1/role", {
      headers: { Authorization: `Bearer ${token}` },
      body: { role: "admin" },
    });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Partner role access tests
// ---------------------------------------------------------------------------
describe("partner cannot access admin endpoints", () => {
  it("rejects partner from GET /admin/users", async () => {
    const token = authToken("partner-1", "partner");
    const res = await makeRequest("GET", "/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("rejects partner from GET /admin/stats", async () => {
    const token = authToken("partner-1", "partner");
    const res = await makeRequest("GET", "/admin/stats", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});
