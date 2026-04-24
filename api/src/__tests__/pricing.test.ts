/**
 * Unit tests for the pricing route.
 *
 * Tests price comparison, price update with history tracking,
 * price history retrieval, stale price detection, and authorization boundaries.
 *
 * Covers: GET /pricing/compare/:materialId, GET /pricing/stock/:materialId,
 *         GET /pricing/trends/project/:projectId,
 *         PUT /pricing/:materialId/:supplierId,
 *         GET /pricing/history/:materialId, GET /pricing/stale
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/685
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
// 1. GET /pricing/compare/:materialId — price comparison across suppliers
// ---------------------------------------------------------------------------
describe("GET /pricing/compare/:materialId", () => {
  it("returns prices sorted by unit_price ascending", async () => {
    const priceRows = [
      { id: "p1", unit_price: 3.20, supplier_name: "Bauhaus", supplier_url: "https://bauhaus.fi" },
      { id: "p2", unit_price: 3.50, supplier_name: "K-Rauta", supplier_url: "https://k-rauta.fi" },
      { id: "p3", unit_price: 4.10, supplier_name: "Stark", supplier_url: "https://stark.fi" },
    ];
    mockQuery.mockResolvedValueOnce({ rows: priceRows } as never);

    const res = await makeRequest("GET", "/pricing/compare/pine_48x98_c24", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as typeof priceRows;
    expect(body.length).toBe(3);
    expect(body[0].supplier_name).toBe("Bauhaus");
    expect(body[0].unit_price).toBe(3.20);
    // Verify ordering
    expect(body[1].unit_price).toBe(3.50);
    expect(body[2].unit_price).toBe(4.10);
  });

  it("returns empty array when no pricing exists for material", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/pricing/compare/nonexistent", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("requires authentication", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/pricing/compare/mat1");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 2. PUT /pricing/:materialId/:supplierId — upsert price (admin only)
// ---------------------------------------------------------------------------
describe("PUT /pricing/:materialId/:supplierId", () => {
  it("rejects unauthenticated request", async () => {
    const res = await makeRequest("PUT", "/pricing/mat1/sup1", {
      body: { unit_price: 5.00, unit: "jm" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-admin user", async () => {
    const res = await makeRequest("PUT", "/pricing/mat1/sup1", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { unit_price: 5.00, unit: "jm" },
    });
    expect(res.status).toBe(403);
  });

  it("creates/updates pricing with admin credentials", async () => {
    const pricingRow = {
      id: "pricing-1",
      material_id: "mat1",
      supplier_id: "sup1",
      unit: "jm",
      unit_price: 5.00,
      sku: "SKU-001",
      ean: null,
      link: "https://k-rauta.fi/pine",
      is_primary: false,
    };
    // First call: upsert pricing
    mockQuery.mockResolvedValueOnce({ rows: [pricingRow] } as never);
    // Second call: insert history
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("PUT", "/pricing/mat1/sup1", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: {
        unit_price: 5.00,
        unit: "jm",
        sku: "SKU-001",
        link: "https://k-rauta.fi/pine",
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as typeof pricingRow;
    expect(body.unit_price).toBe(5.00);
    expect(body.material_id).toBe("mat1");
  });

  it("accepts stock metadata with admin credentials", async () => {
    const pricingRow = {
      id: "pricing-1",
      material_id: "mat1",
      supplier_id: "sup1",
      unit: "jm",
      unit_price: 5.00,
      stock_level: "low_stock",
      in_stock: true,
      store_location: "K-Rauta Vantaa",
      last_checked_at: "2026-04-21T09:00:00.000Z",
    };
    mockQuery.mockResolvedValueOnce({ rows: [pricingRow] } as never);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("PUT", "/pricing/mat1/sup1", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: {
        unit_price: 5.00,
        unit: "jm",
        stock_level: "low_stock",
        in_stock: true,
        store_location: "K-Rauta Vantaa",
        last_checked_at: "2026-04-21T09:00:00.000Z",
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as typeof pricingRow;
    expect(body.stock_level).toBe("low_stock");
    expect(body.store_location).toBe("K-Rauta Vantaa");
  });

  it("stores campaign sale metadata with admin credentials", async () => {
    const pricingRow = {
      id: "pricing-1",
      material_id: "mat1",
      supplier_id: "sup1",
      unit: "jm",
      unit_price: 7.90,
      regular_unit_price: 9.90,
      campaign_label: "Terassikampanja -20%",
      campaign_ends_at: "2026-05-15T00:00:00.000Z",
    };
    mockQuery.mockResolvedValueOnce({ rows: [pricingRow] } as never);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("PUT", "/pricing/mat1/sup1", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: {
        unit_price: 7.90,
        regular_unit_price: 9.90,
        campaign_label: "Terassikampanja -20%",
        campaign_ends_at: "2026-05-15",
        unit: "jm",
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as typeof pricingRow;
    expect(body.regular_unit_price).toBe(9.90);
    expect(body.campaign_label).toBe("Terassikampanja -20%");

    const upsertCall = mockQuery.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("campaign_detected_at"),
    );
    expect(upsertCall?.[1]).toEqual(expect.arrayContaining([9.90, "Terassikampanja -20%"]));
  });

  it("rejects invalid stock metadata", async () => {
    const res = await makeRequest("PUT", "/pricing/mat1/sup1", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: {
        unit_price: 5.00,
        unit: "jm",
        stock_level: "almost_available",
      },
    });

    expect(res.status).toBe(400);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("clears other primary flags when setting is_primary=true", async () => {
    // First call: clear existing primary flags
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);
    // Second call: upsert with is_primary=true
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "pricing-1", is_primary: true, unit_price: 3.50 }],
    } as never);
    // Third call: insert history
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("PUT", "/pricing/mat1/sup1", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: { unit_price: 3.50, unit: "jm", is_primary: true },
    });
    expect(res.status).toBe(200);

    // Verify the primary-clearing query was called
    expect(mockQuery).toHaveBeenCalledWith(
      "UPDATE pricing SET is_primary=false WHERE material_id=$1",
      ["mat1"],
    );
  });

  it("records price in pricing_history with manual source", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "pricing-1", unit_price: 4.20 }],
    } as never);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    await makeRequest("PUT", "/pricing/mat1/sup1", {
      headers: { Authorization: `Bearer ${adminToken()}` },
      body: { unit_price: 4.20, unit: "jm" },
    });

    // Verify history insertion
    const historyCalls = mockQuery.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("pricing_history"),
    );
    expect(historyCalls.length).toBe(1);
    const historyParams = historyCalls[0][1] as unknown[];
    expect(historyParams[0]).toBe("pricing-1"); // pricing_id
    expect(historyParams[1]).toBe(4.20);        // unit_price
  });
});

// ---------------------------------------------------------------------------
// 3. GET /pricing/stock/:materialId — supplier stock availability
// ---------------------------------------------------------------------------
describe("GET /pricing/stock/:materialId", () => {
  it("returns stock rows and available supplier count", async () => {
    const stockRows = [
      {
        material_id: "mat1",
        supplier_id: "sup1",
        supplier_name: "K-Rauta",
        supplier_url: "https://k-rauta.fi",
        link: "https://k-rauta.fi/pine",
        stock_level: "in_stock",
        in_stock: true,
        store_location: "K-Rauta Vantaa",
        last_checked_at: "2026-04-21T09:00:00.000Z",
      },
      {
        material_id: "mat1",
        supplier_id: "sup2",
        supplier_name: "Bauhaus",
        supplier_url: "https://bauhaus.fi",
        link: "https://bauhaus.fi/pine",
        stock_level: "out_of_stock",
        in_stock: false,
        store_location: "Bauhaus Espoo",
        last_checked_at: "2026-04-21T08:30:00.000Z",
      },
    ];
    mockQuery.mockResolvedValueOnce({ rows: stockRows } as never);

    const res = await makeRequest("GET", "/pricing/stock/mat1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { material_id: string; total: number; available: number; stock: typeof stockRows };
    expect(body.material_id).toBe("mat1");
    expect(body.total).toBe(2);
    expect(body.available).toBe(1);
    expect(body.stock[0].stock_level).toBe("in_stock");
  });

  it("requires authentication", async () => {
    const res = await makeRequest("GET", "/pricing/stock/mat1");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 4. GET /pricing/trends/project/:projectId — project material cost trends
// ---------------------------------------------------------------------------
describe("GET /pricing/trends/project/:projectId", () => {
  it("returns BOM-level trend summary for an owned project", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "proj-1" }] } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            material_id: "roof_tile",
            material_name: "Roof tile",
            category_name: "Roofing",
            quantity: "10",
            unit: "m2",
            pricing_id: "11111111-1111-1111-1111-111111111111",
            unit_price: "20",
            line_cost: "210",
          },
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            pricing_id: "11111111-1111-1111-1111-111111111111",
            unit_price: "18",
            scraped_at: "2026-01-15T00:00:00.000Z",
          },
          {
            pricing_id: "11111111-1111-1111-1111-111111111111",
            unit_price: "20",
            scraped_at: "2026-02-15T00:00:00.000Z",
          },
        ],
      } as never);

    const res = await makeRequest("GET", "/pricing/trends/project/proj-1", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      projectId: string;
      totalCurrentCost: number;
      dataSources: string[];
      items: Array<{ materialId: string; source: string; points: unknown[] }>;
    };
    expect(body.projectId).toBe("proj-1");
    expect(body.totalCurrentCost).toBe(210);
    expect(body.dataSources).toEqual(["retailer_history"]);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].materialId).toBe("roof_tile");
    expect(body.items[0].source).toBe("retailer_history");
    expect(body.items[0].points).toHaveLength(2);
  });

  it("returns 404 when the project is not owned by the user", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/pricing/trends/project/proj-1", {
      headers: { Authorization: `Bearer ${authToken("other-user")}` },
    });

    expect(res.status).toBe(404);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("requires authentication", async () => {
    const res = await makeRequest("GET", "/pricing/trends/project/proj-1");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 5. GET /pricing/history/:materialId — price history
// ---------------------------------------------------------------------------
describe("GET /pricing/history/:materialId", () => {
  it("returns price history for material", async () => {
    const historyRows = [
      { id: "h1", unit_price: 3.50, scraped_at: "2026-04-15", supplier_name: "K-Rauta" },
      { id: "h2", unit_price: 3.20, scraped_at: "2026-03-01", supplier_name: "K-Rauta" },
    ];
    mockQuery.mockResolvedValueOnce({ rows: historyRows } as never);

    const res = await makeRequest("GET", "/pricing/history/pine_48x98_c24", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as typeof historyRows;
    expect(body.length).toBe(2);
    // Should be ordered by scraped_at DESC (most recent first)
    expect(body[0].scraped_at).toBe("2026-04-15");
  });

  it("returns empty array when no history exists", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/pricing/history/nonexistent", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("requires authentication", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/pricing/history/mat1");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 6. GET /pricing/stale — stale price detection (admin only)
// ---------------------------------------------------------------------------
describe("GET /pricing/stale", () => {
  it("rejects unauthenticated request", async () => {
    const res = await makeRequest("GET", "/pricing/stale");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin user", async () => {
    const res = await makeRequest("GET", "/pricing/stale", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(403);
  });

  it("returns stale prices for admin", async () => {
    const staleRows = [
      {
        id: "mat1",
        name: "Pine 48x98",
        supplier_name: "K-Rauta",
        unit_price: 3.50,
        last_scraped_at: "2026-02-01",
        days_stale: 78,
      },
    ];
    mockQuery.mockResolvedValueOnce({ rows: staleRows } as never);

    const res = await makeRequest("GET", "/pricing/stale", {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as typeof staleRows;
    expect(body.length).toBe(1);
    expect(body[0].days_stale).toBe(78);
    expect(body[0].name).toBe("Pine 48x98");
  });

  it("returns empty array when no stale prices", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/pricing/stale", {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
