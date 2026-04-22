/**
 * Unit tests for the suppliers route.
 *
 * Tests: GET /suppliers (list), GET /suppliers/:id (detail),
 *        PUT /suppliers/:id (update), GET /suppliers/:id/scrape-history
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/762
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

// ---------------------------------------------------------------------------
// Mock DB and email modules BEFORE importing app
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

import { query } from "../db";
const mockQuery = vi.mocked(query);

import app from "../index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authToken(userId = "user-1", role = "user") {
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

function partnerToken(userId = "partner-1") {
  return jwt.sign(
    { id: userId, email: "partner@test.com", role: "partner" },
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
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] } as never);
});

// ---------------------------------------------------------------------------
// 1. GET /suppliers — list all suppliers
// ---------------------------------------------------------------------------
describe("GET /suppliers — list all", () => {
  it("rejects unauthenticated requests", async () => {
    const { status } = await makeRequest("GET", "/suppliers");
    expect(status).toBe(401);
  });

  it("returns supplier list with product count and oldest price", async () => {
    const suppliers = [
      { id: "s1", name: "K-Rauta", product_count: 42, oldest_price: "2025-01-01T00:00:00Z" },
      { id: "s2", name: "Stark", product_count: 18, oldest_price: "2025-03-15T00:00:00Z" },
    ];
    mockQuery.mockResolvedValueOnce({ rows: suppliers } as never);

    const { status, body } = await makeRequest("GET", "/suppliers", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(status).toBe(200);
    const items = body as typeof suppliers;
    expect(items).toHaveLength(2);
    expect(items[0].name).toBe("K-Rauta");
    expect(items[0].product_count).toBe(42);
    expect(items[1].name).toBe("Stark");
  });

  it("returns empty array when no suppliers exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const { status, body } = await makeRequest("GET", "/suppliers", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. GET /suppliers/:id — single supplier detail
// ---------------------------------------------------------------------------
describe("GET /suppliers/:id — single supplier", () => {
  it("rejects unauthenticated requests", async () => {
    const { status } = await makeRequest("GET", "/suppliers/s1");
    expect(status).toBe(401);
  });

  it("returns 404 for non-existent supplier", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const { status, body } = await makeRequest("GET", "/suppliers/nonexistent", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe("Supplier not found");
  });

  it("returns supplier with products sub-query", async () => {
    const supplier = { id: "s1", name: "K-Rauta", url: "https://k-rauta.fi" };
    const products = [
      { id: "p1", material_id: "pine_48x148", material_name: "Mänty 48x148", category_id: "lumber" },
      { id: "p2", material_id: "osb_9mm", material_name: "OSB 9mm", category_id: "sheets" },
    ];

    mockQuery
      .mockResolvedValueOnce({ rows: [supplier] } as never)
      .mockResolvedValueOnce({ rows: products } as never);

    const { status, body } = await makeRequest("GET", "/suppliers/s1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(status).toBe(200);
    const result = body as typeof supplier & { products: typeof products };
    expect(result.name).toBe("K-Rauta");
    expect(result.products).toHaveLength(2);
    expect(result.products[0].material_name).toBe("Mänty 48x148");
  });
});

// ---------------------------------------------------------------------------
// 3. PUT /suppliers/:id — update supplier
// ---------------------------------------------------------------------------
describe("PUT /suppliers/:id — update supplier", () => {
  const updatePayload = {
    name: "K-Rauta Updated",
    url: "https://k-rauta.fi/new",
    scrape_enabled: true,
    scrape_config: { interval: "daily", selectors: [".price"] },
  };

  it("rejects unauthenticated requests", async () => {
    const { status } = await makeRequest("PUT", "/suppliers/s1", {
      body: updatePayload,
    });
    expect(status).toBe(401);
  });

  it("rejects regular user (no supplier:update permission)", async () => {
    const { status } = await makeRequest("PUT", "/suppliers/s1", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: updatePayload,
    });
    expect(status).toBe(403);
  });

  it("returns 404 for non-existent supplier", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const { status, body } = await makeRequest("PUT", "/suppliers/nonexistent", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: updatePayload,
    });

    expect(status).toBe(404);
    expect((body as { error: string }).error).toBe("Supplier not found");
  });

  it("updates supplier with admin credentials", async () => {
    const updated = { id: "s1", ...updatePayload, updated_at: new Date().toISOString() };
    mockQuery.mockResolvedValueOnce({ rows: [updated] } as never);

    const { status, body } = await makeRequest("PUT", "/suppliers/s1", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: updatePayload,
    });

    expect(status).toBe(200);
    const result = body as typeof updated;
    expect(result.name).toBe("K-Rauta Updated");
    expect(result.scrape_enabled).toBe(true);
  });

  it("allows partner role to update supplier", async () => {
    const updated = { id: "s1", ...updatePayload, updated_at: new Date().toISOString() };
    mockQuery.mockResolvedValueOnce({ rows: [updated] } as never);

    const { status } = await makeRequest("PUT", "/suppliers/s1", {
      headers: { Authorization: `Bearer ${partnerToken()}` },
      body: updatePayload,
    });

    expect(status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// 4. GET /suppliers/:id/scrape-history — scrape run history (admin only)
// ---------------------------------------------------------------------------
describe("GET /suppliers/:id/scrape-history — admin only", () => {
  it("rejects unauthenticated requests", async () => {
    const { status } = await makeRequest("GET", "/suppliers/s1/scrape-history");
    expect(status).toBe(401);
  });

  it("rejects non-admin user", async () => {
    const { status } = await makeRequest("GET", "/suppliers/s1/scrape-history", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(status).toBe(403);
  });

  it("rejects partner user (no admin:access permission)", async () => {
    const { status } = await makeRequest("GET", "/suppliers/s1/scrape-history", {
      headers: { Authorization: `Bearer ${partnerToken()}` },
    });
    expect(status).toBe(403);
  });

  it("returns scrape history for admin", async () => {
    const runs = [
      { id: "r1", supplier_id: "s1", started_at: "2025-06-01T10:00:00Z", status: "completed", items_scraped: 42 },
      { id: "r2", supplier_id: "s1", started_at: "2025-05-31T10:00:00Z", status: "failed", error: "timeout" },
    ];
    mockQuery.mockResolvedValueOnce({ rows: runs } as never);

    const { status, body } = await makeRequest("GET", "/suppliers/s1/scrape-history", {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    expect(status).toBe(200);
    const items = body as typeof runs;
    expect(items).toHaveLength(2);
    expect(items[0].status).toBe("completed");
    expect(items[1].status).toBe("failed");
  });

  it("returns empty array for unknown supplier", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const { status, body } = await makeRequest("GET", "/suppliers/unknown/scrape-history", {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });

    expect(status).toBe(200);
    expect(body).toEqual([]);
  });
});
