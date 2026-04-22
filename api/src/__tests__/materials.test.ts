/**
 * Unit tests for the materials route.
 *
 * Tests CRUD operations, authorization boundaries, input validation,
 * price aggregation via sub-queries, and 404 handling.
 *
 * Covers: GET /materials, GET /materials/:id, GET /materials/:id/prices,
 *         POST /materials, PUT /materials/:id, DELETE /materials/:id
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/684
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
// 1. GET /materials — list all materials
// ---------------------------------------------------------------------------
describe("GET /materials", () => {
  it("returns materials list (no auth required)", async () => {
    const sampleRows = [
      { id: "pine_48x98_c24", name: "Pine 48x98 C24", category_name: "Lumber", pricing: null },
      { id: "osb_9mm", name: "OSB 9mm", category_name: "Panels", pricing: null },
    ];
    mockQuery.mockResolvedValueOnce({ rows: sampleRows } as never);

    const res = await makeRequest("GET", "/materials");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect((res.body as unknown[]).length).toBe(2);
  });

  it("returns empty array when no materials exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/materials");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("includes pricing sub-query data in response", async () => {
    const rows = [{
      id: "pine_48x98_c24",
      name: "Pine 48x98 C24",
      category_name: "Lumber",
      pricing: [{ supplier_name: "K-Rauta", unit_price: 3.50, currency: "EUR" }],
    }];
    mockQuery.mockResolvedValueOnce({ rows } as never);

    const res = await makeRequest("GET", "/materials");
    expect(res.status).toBe(200);
    const materials = res.body as typeof rows;
    expect(materials[0].pricing).toBeDefined();
    expect(materials[0].pricing![0].supplier_name).toBe("K-Rauta");
  });
});

// ---------------------------------------------------------------------------
// 2. GET /materials/:id/substitutions — mapped substitutes with live signals
// ---------------------------------------------------------------------------
describe("GET /materials/:id/substitutions", () => {
  it("rejects request without auth", async () => {
    const res = await makeRequest("GET", "/materials/pine_48x98_c24/substitutions");
    expect(res.status).toBe(401);
  });

  it("returns 404 for a missing material", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/materials/missing/substitutions", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns substitution suggestions with price, stock, and trigger reasons", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "pine_48x148_c24",
        name: "48x148 C24",
        current_unit_price: "4.00",
        previous_unit_price: "3.00",
        current_stock_level: "low_stock",
      }],
    } as never);
    mockQuery.mockResolvedValueOnce({
      rows: [{
        material_id: "pine_48x148_c24",
        substitute_id: "pressure_treated_48x148",
        substitute_name: "Kestopuu 48x148",
        category_name: "Lumber",
        substitution_type: "budget",
        confidence: "verified",
        notes: "Dry-location substitute",
        current_unit_price: "4.00",
        previous_unit_price: "3.00",
        current_stock_level: "low_stock",
        unit_price: "3.20",
        unit: "jm",
        link: "https://example.com",
        stock_level: "in_stock",
        supplier_id: "sarokas",
        supplier_name: "Sarokas",
      }],
    } as never);

    const res = await makeRequest("GET", "/materials/pine_48x148_c24/substitutions", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      material_id: string;
      suggestions: Array<{
        material_id: string;
        savings_per_unit: number;
        savings_percent: number;
        trigger_reasons: string[];
      }>;
    };
    expect(body.material_id).toBe("pine_48x148_c24");
    expect(body.suggestions[0].material_id).toBe("pressure_treated_48x148");
    expect(body.suggestions[0].savings_per_unit).toBeCloseTo(0.8);
    expect(body.suggestions[0].savings_percent).toBeCloseTo(20);
    expect(body.suggestions[0].trigger_reasons).toEqual([
      "current_stock_risk",
      "price_spike",
      "cheaper_equivalent",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3. GET /materials/:id — single material with pricing + history
// ---------------------------------------------------------------------------
describe("GET /materials/:id", () => {
  it("returns 404 for non-existent material", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/materials/nonexistent");
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("not found");
  });

  it("returns material with pricing and price history", async () => {
    // First query: material itself
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "pine_48x98_c24", name: "Pine 48x98 C24", category_name: "Lumber" }],
    } as never);
    // Second query: pricing
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "p1", unit_price: 3.50, supplier_name: "K-Rauta" }],
    } as never);
    // Third query: pricing history
    mockQuery.mockResolvedValueOnce({
      rows: [{ pricing_id: "p1", unit_price: 3.20, scraped_at: "2026-03-01" }],
    } as never);

    const res = await makeRequest("GET", "/materials/pine_48x98_c24");
    expect(res.status).toBe(200);
    const body = res.body as {
      id: string;
      name: string;
      pricing: unknown[];
      price_history: unknown[];
    };
    expect(body.id).toBe("pine_48x98_c24");
    expect(body.pricing).toBeDefined();
    expect(body.pricing.length).toBe(1);
    expect(body.price_history).toBeDefined();
    expect(body.price_history.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 3. GET /materials/:id/prices — price comparison
// ---------------------------------------------------------------------------
describe("GET /materials/:id/prices", () => {
  it("returns 404 when material does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/materials/nonexistent/prices");
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("not found");
  });

  it("returns price comparison with savings calculation", async () => {
    // First query: material lookup
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "pine_48x98_c24", name: "Pine 48x98 C24" }],
    } as never);
    // Second query: pricing ordered by unit_price ASC
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "p1", unit_price: "3.20", is_primary: false, supplier_name: "Bauhaus" },
        { id: "p2", unit_price: "3.50", is_primary: true, supplier_name: "K-Rauta" },
        { id: "p3", unit_price: "4.10", is_primary: false, supplier_name: "Stark" },
      ],
    } as never);

    const res = await makeRequest("GET", "/materials/pine_48x98_c24/prices");
    expect(res.status).toBe(200);
    const body = res.body as {
      material_id: string;
      material_name: string;
      prices: unknown[];
      cheapest_price: number;
      primary_price: number;
      savings_per_unit: number;
    };
    expect(body.material_id).toBe("pine_48x98_c24");
    expect(body.cheapest_price).toBe(3.20);
    expect(body.primary_price).toBe(3.50);
    expect(body.savings_per_unit).toBeCloseTo(0.30, 2);
    expect(body.prices.length).toBe(3);
  });

  it("returns zero savings when cheapest is primary", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "mat1", name: "Material" }],
    } as never);
    mockQuery.mockResolvedValueOnce({
      rows: [
        { id: "p1", unit_price: "3.20", is_primary: true, supplier_name: "K-Rauta" },
        { id: "p2", unit_price: "4.10", is_primary: false, supplier_name: "Stark" },
      ],
    } as never);

    const res = await makeRequest("GET", "/materials/mat1/prices");
    expect(res.status).toBe(200);
    const body = res.body as { savings_per_unit: number };
    expect(body.savings_per_unit).toBe(0);
  });

  it("handles empty pricing list", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "mat1", name: "Material" }],
    } as never);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/materials/mat1/prices");
    expect(res.status).toBe(200);
    const body = res.body as {
      cheapest_price: number | null;
      primary_price: number | null;
      savings_per_unit: number;
    };
    expect(body.cheapest_price).toBeNull();
    expect(body.primary_price).toBeNull();
    expect(body.savings_per_unit).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 4. POST /materials — create material (admin only)
// ---------------------------------------------------------------------------
describe("POST /materials", () => {
  it("rejects unauthenticated request", async () => {
    const res = await makeRequest("POST", "/materials", {
      body: { id: "test", name: "Test Material", category_id: "cat1" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-admin user", async () => {
    const res = await makeRequest("POST", "/materials", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { id: "test", name: "Test Material", category_id: "cat1" },
    });
    expect(res.status).toBe(403);
  });

  it("creates material with admin credentials", async () => {
    const newMaterial = {
      id: "new_mat",
      name: "New Material",
      category_id: "lumber",
      tags: ["wood", "structural"],
      description: "A test material",
      visual_albedo: 0.7,
      visual_roughness: 0.5,
      visual_metallic: 0.0,
      thermal_conductivity: 0.12,
      thermal_thickness: 0.048,
      waste_factor: 1.05,
    };
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...newMaterial, created_at: "2026-04-20" }],
    } as never);

    const res = await makeRequest("POST", "/materials", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: newMaterial,
    });
    expect(res.status).toBe(201);
    const body = res.body as { id: string; name: string };
    expect(body.id).toBe("new_mat");
    expect(body.name).toBe("New Material");
  });

  it("applies default waste_factor when not provided", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "mat1", waste_factor: 1.05 }],
    } as never);

    const res = await makeRequest("POST", "/materials", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: { id: "mat1", name: "Mat", category_id: "cat1" },
    });
    expect(res.status).toBe(201);

    // Verify the query was called with the default waste_factor
    const queryCall = mockQuery.mock.calls[0];
    const params = queryCall[1] as unknown[];
    // waste_factor is the 11th parameter
    expect(params[10]).toBe(1.05);
  });
});

// ---------------------------------------------------------------------------
// 5. PUT /materials/:id — update material (admin only)
// ---------------------------------------------------------------------------
describe("PUT /materials/:id", () => {
  it("rejects unauthenticated request", async () => {
    const res = await makeRequest("PUT", "/materials/mat1", {
      body: { name: "Updated" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-admin user", async () => {
    const res = await makeRequest("PUT", "/materials/mat1", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { name: "Updated" },
    });
    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent material", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("PUT", "/materials/nonexistent", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: { name: "Updated", category_id: "cat1", tags: [], description: "", waste_factor: 1.05 },
    });
    expect(res.status).toBe(404);
  });

  it("updates material with admin credentials", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "mat1", name: "Updated Name", category_id: "cat1", updated_at: "2026-04-20" }],
    } as never);

    const res = await makeRequest("PUT", "/materials/mat1", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: { name: "Updated Name", category_id: "cat1", tags: ["wood"], description: "Updated", waste_factor: 1.10 },
    });
    expect(res.status).toBe(200);
    const body = res.body as { name: string };
    expect(body.name).toBe("Updated Name");
  });
});

// ---------------------------------------------------------------------------
// 6. DELETE /materials/:id — delete material (admin only)
// ---------------------------------------------------------------------------
describe("DELETE /materials/:id", () => {
  it("rejects unauthenticated request", async () => {
    const res = await makeRequest("DELETE", "/materials/mat1");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin user", async () => {
    const res = await makeRequest("DELETE", "/materials/mat1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(403);
  });

  it("deletes material with admin credentials", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("DELETE", "/materials/mat1", {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });
});
