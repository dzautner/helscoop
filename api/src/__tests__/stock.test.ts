/**
 * Unit tests for stock availability endpoints.
 *
 * Tests: single-material stock lookup, unknown material handling,
 * project BOM stock check, empty BOM, missing project, grouping by
 * material, authentication, and materials with no stock data.
 *
 * Covers:
 *   GET /stock/:materialId
 *   GET /stock/project/:projectId
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/333
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
function authToken(userId = "user-1") {
  return jwt.sign(
    { id: userId, email: "test@test.com", role: "user" },
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
// 1. Authentication
// ---------------------------------------------------------------------------
describe("GET /stock/:materialId — authentication", () => {
  it("rejects unauthenticated request with 401", async () => {
    const res = await makeRequest("GET", "/stock/pine_48x98_c24");
    expect(res.status).toBe(401);
  });
});

describe("GET /stock/project/:projectId — authentication", () => {
  it("rejects unauthenticated request with 401", async () => {
    const res = await makeRequest("GET", "/stock/project/proj-1");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 2. Single material stock lookup
// ---------------------------------------------------------------------------
describe("GET /stock/:materialId — stock lookup", () => {
  it("returns stock status across multiple suppliers/stores", async () => {
    // Material exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "pine_48x98_c24" }],
    } as never);
    // Stock status rows
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          supplier_id: "k-rauta",
          store_name: "K-Rauta",
          stock_level: "in_stock",
          store_location: "Helsinki Konala",
          last_checked_at: "2026-04-20T10:00:00Z",
        },
        {
          supplier_id: "k-rauta",
          store_name: "K-Rauta",
          stock_level: "low_stock",
          store_location: "Espoo Lommila",
          last_checked_at: "2026-04-20T10:00:00Z",
        },
        {
          supplier_id: "sarokas",
          store_name: "Sarokas",
          stock_level: "in_stock",
          store_location: "Verkkokauppa",
          last_checked_at: "2026-04-20T09:00:00Z",
        },
      ],
    } as never);

    const res = await makeRequest("GET", "/stock/pine_48x98_c24", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      materialId: string;
      suppliers: Array<{
        supplierId: string;
        storeName: string;
        storeLocation: string;
        stockLevel: string;
        lastChecked: string;
      }>;
    };
    expect(body.materialId).toBe("pine_48x98_c24");
    expect(body.suppliers).toHaveLength(3);
    expect(body.suppliers[0].stockLevel).toBe("in_stock");
    expect(body.suppliers[1].stockLevel).toBe("low_stock");
    expect(body.suppliers[2].supplierId).toBe("sarokas");
  });

  it("returns 404 for unknown material", async () => {
    // Material does not exist
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/stock/nonexistent_material", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("Material not found");
  });

  it("returns empty suppliers array when material has no stock data", async () => {
    // Material exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "custom_material" }],
    } as never);
    // No stock status rows
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/stock/custom_material", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { materialId: string; suppliers: unknown[] };
    expect(body.materialId).toBe("custom_material");
    expect(body.suppliers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 3. Project BOM stock check
// ---------------------------------------------------------------------------
describe("GET /stock/project/:projectId — project stock", () => {
  it("returns stock status grouped by material for BOM items", async () => {
    // Project exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1" }],
    } as never);
    // BOM + stock joined query
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          material_id: "pine_48x98_c24",
          material_name: "48x98 Runkopuu C24",
          supplier_id: "k-rauta",
          store_name: "K-Rauta",
          stock_level: "in_stock",
          store_location: "Helsinki Konala",
          last_checked_at: "2026-04-20T10:00:00Z",
        },
        {
          material_id: "pine_48x98_c24",
          material_name: "48x98 Runkopuu C24",
          supplier_id: "sarokas",
          store_name: "Sarokas",
          stock_level: "in_stock",
          store_location: "Verkkokauppa",
          last_checked_at: "2026-04-20T09:00:00Z",
        },
        {
          material_id: "osb_9mm",
          material_name: "OSB 9mm Levy",
          supplier_id: "k-rauta",
          store_name: "K-Rauta",
          stock_level: "out_of_stock",
          store_location: "Helsinki Konala",
          last_checked_at: "2026-04-20T10:00:00Z",
        },
      ],
    } as never);

    const res = await makeRequest("GET", "/stock/project/proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      projectId: string;
      materials: Array<{
        materialId: string;
        materialName: string;
        suppliers: Array<{ supplierId: string; stockLevel: string }>;
      }>;
    };
    expect(body.projectId).toBe("proj-1");
    expect(body.materials).toHaveLength(2);

    const pine = body.materials.find((m) => m.materialId === "pine_48x98_c24");
    expect(pine).toBeDefined();
    expect(pine!.suppliers).toHaveLength(2);

    const osb = body.materials.find((m) => m.materialId === "osb_9mm");
    expect(osb).toBeDefined();
    expect(osb!.suppliers).toHaveLength(1);
    expect(osb!.suppliers[0].stockLevel).toBe("out_of_stock");
  });

  it("returns 404 when project does not exist", async () => {
    // Project query returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/stock/project/nonexistent", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("Project not found");
  });

  it("returns empty materials array for project with no BOM", async () => {
    // Project exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-empty" }],
    } as never);
    // BOM query returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/stock/project/proj-empty", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { projectId: string; materials: unknown[] };
    expect(body.projectId).toBe("proj-empty");
    expect(body.materials).toEqual([]);
  });

  it("handles BOM materials with no stock data (null supplier_id)", async () => {
    // Project exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-2" }],
    } as never);
    // BOM item with LEFT JOIN producing null stock fields
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          material_id: "exotic_wood",
          material_name: "Exotic Wood",
          supplier_id: null,
          store_name: null,
          stock_level: null,
          store_location: null,
          last_checked_at: null,
        },
      ],
    } as never);

    const res = await makeRequest("GET", "/stock/project/proj-2", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      projectId: string;
      materials: Array<{ materialId: string; suppliers: unknown[] }>;
    };
    expect(body.materials).toHaveLength(1);
    expect(body.materials[0].materialId).toBe("exotic_wood");
    expect(body.materials[0].suppliers).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 4. Response shape validation
// ---------------------------------------------------------------------------
describe("Stock endpoint response shape", () => {
  it("includes all required fields in supplier entries", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "pine_48x98_c24" }],
    } as never);
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          supplier_id: "k-rauta",
          store_name: "K-Rauta",
          stock_level: "in_stock",
          store_location: "Helsinki Konala",
          last_checked_at: "2026-04-20T10:00:00Z",
        },
      ],
    } as never);

    const res = await makeRequest("GET", "/stock/pine_48x98_c24", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { suppliers: Array<Record<string, unknown>> };
    const entry = body.suppliers[0];
    expect(entry).toHaveProperty("supplierId");
    expect(entry).toHaveProperty("storeName");
    expect(entry).toHaveProperty("storeLocation");
    expect(entry).toHaveProperty("stockLevel");
    expect(entry).toHaveProperty("lastChecked");
  });
});
