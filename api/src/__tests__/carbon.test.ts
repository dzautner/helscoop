/**
 * Unit tests for the carbon footprint calculation endpoint.
 *
 * Tests: calculation logic, rating thresholds, empty BOM, missing project,
 * missing projectId, building_info area extraction, zero-emission materials,
 * and authentication requirements.
 *
 * Covers: GET /carbon/calculate?projectId=<id>
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/632
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
describe("GET /carbon/calculate — authentication", () => {
  it("rejects unauthenticated request with 401", async () => {
    const res = await makeRequest("GET", "/carbon/calculate?projectId=proj-1");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 2. Input validation
// ---------------------------------------------------------------------------
describe("GET /carbon/calculate — validation", () => {
  it("returns 400 when projectId is missing", async () => {
    const res = await makeRequest("GET", "/carbon/calculate", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("projectId");
  });

  it("returns 404 when project does not exist", async () => {
    // Project query returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/carbon/calculate?projectId=nonexistent", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// 3. Empty BOM
// ---------------------------------------------------------------------------
describe("GET /carbon/calculate — empty BOM", () => {
  it("returns zero carbon for project with no BOM items", async () => {
    // Project exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", building_info: null }],
    } as never);
    // BOM query returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/carbon/calculate?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      totalCo2Kg: number;
      breakdown: unknown[];
      rating: string;
      limitKg: number;
    };
    expect(body.totalCo2Kg).toBe(0);
    expect(body.breakdown).toEqual([]);
    expect(body.rating).toBe("green");
    // Default area 120 m² × 16 kg/m²/yr × 50 yr = 96000
    expect(body.limitKg).toBe(96000);
  });
});

// ---------------------------------------------------------------------------
// 4. Calculation correctness
// ---------------------------------------------------------------------------
describe("GET /carbon/calculate — calculation", () => {
  it("calculates total CO₂ from BOM items correctly", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", building_info: null }],
    } as never);
    mockQuery.mockResolvedValueOnce({
      rows: [
        { material_id: "pine_48x98_c24", quantity: 10, unit: "jm", material_name: "48x98 Runkopuu C24", co2_factor_kg: "1.4" },
        { material_id: "concrete_block", quantity: 24, unit: "kpl", material_name: "Betoniharkko 200mm", co2_factor_kg: "8.0" },
      ],
    } as never);

    const res = await makeRequest("GET", "/carbon/calculate?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      totalCo2Kg: number;
      breakdown: Array<{ materialId: string; totalCo2: number; co2PerUnit: number; quantity: number }>;
    };

    // 10 × 1.4 = 14, 24 × 8.0 = 192, total = 206
    expect(body.totalCo2Kg).toBe(206);
    expect(body.breakdown.length).toBe(2);
    expect(body.breakdown[0].totalCo2).toBe(14);
    expect(body.breakdown[1].totalCo2).toBe(192);
  });

  it("handles materials with null co2_factor_kg as zero", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", building_info: null }],
    } as never);
    mockQuery.mockResolvedValueOnce({
      rows: [
        { material_id: "custom_mat", quantity: 50, unit: "kpl", material_name: "Custom Material", co2_factor_kg: null },
      ],
    } as never);

    const res = await makeRequest("GET", "/carbon/calculate?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as { totalCo2Kg: number; breakdown: Array<{ co2PerUnit: number; totalCo2: number }> };
    expect(body.totalCo2Kg).toBe(0);
    expect(body.breakdown[0].co2PerUnit).toBe(0);
    expect(body.breakdown[0].totalCo2).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Rating thresholds
// ---------------------------------------------------------------------------
describe("GET /carbon/calculate — rating", () => {
  it("returns 'green' when CO₂ is well under limit", async () => {
    // Use building area 100 m² → limit = 16 × 100 × 50 = 80000 kg
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", building_info: JSON.stringify({ area: 100 }) }],
    } as never);
    // Total CO₂ = 10 × 1.4 = 14 kg (well under 80% of 80000 = 64000)
    mockQuery.mockResolvedValueOnce({
      rows: [
        { material_id: "pine_48x98_c24", quantity: 10, unit: "jm", material_name: "Pine", co2_factor_kg: "1.4" },
      ],
    } as never);

    const res = await makeRequest("GET", "/carbon/calculate?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    const body = res.body as { rating: string; limitKg: number };
    expect(body.rating).toBe("green");
    expect(body.limitKg).toBe(80000);
  });

  it("returns 'amber' when CO₂ is between 80% and 100% of limit", async () => {
    // Small building: area = 1 m² → limit = 16 × 1 × 50 = 800 kg
    // 80% of 800 = 640 → need 640-800 kg CO₂
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", building_info: JSON.stringify({ area: 1 }) }],
    } as never);
    // 90 × 8.0 = 720 kg → between 640 and 800 → amber
    mockQuery.mockResolvedValueOnce({
      rows: [
        { material_id: "concrete_block", quantity: 90, unit: "kpl", material_name: "Concrete", co2_factor_kg: "8.0" },
      ],
    } as never);

    const res = await makeRequest("GET", "/carbon/calculate?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    const body = res.body as { rating: string; totalCo2Kg: number; limitKg: number };
    expect(body.rating).toBe("amber");
    expect(body.totalCo2Kg).toBe(720);
    expect(body.limitKg).toBe(800);
  });

  it("returns 'red' when CO₂ exceeds limit", async () => {
    // Small building: area = 1 m² → limit = 800 kg
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", building_info: JSON.stringify({ area: 1 }) }],
    } as never);
    // 150 × 8.0 = 1200 kg → over 800 → red
    mockQuery.mockResolvedValueOnce({
      rows: [
        { material_id: "concrete_block", quantity: 150, unit: "kpl", material_name: "Concrete", co2_factor_kg: "8.0" },
      ],
    } as never);

    const res = await makeRequest("GET", "/carbon/calculate?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    const body = res.body as { rating: string; totalCo2Kg: number };
    expect(body.rating).toBe("red");
    expect(body.totalCo2Kg).toBe(1200);
  });

  it("returns 'amber' when CO₂ equals exactly 80% of limit (boundary)", async () => {
    // area = 1 m² → limit = 800 kg, 80% = 640
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", building_info: JSON.stringify({ area: 1 }) }],
    } as never);
    // 80 × 8.0 = 640 → exactly 80% → amber
    mockQuery.mockResolvedValueOnce({
      rows: [
        { material_id: "concrete_block", quantity: 80, unit: "kpl", material_name: "Concrete", co2_factor_kg: "8.0" },
      ],
    } as never);

    const res = await makeRequest("GET", "/carbon/calculate?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    const body = res.body as { rating: string; totalCo2Kg: number };
    expect(body.rating).toBe("amber");
    expect(body.totalCo2Kg).toBe(640);
  });
});

// ---------------------------------------------------------------------------
// 6. Building info area extraction
// ---------------------------------------------------------------------------
describe("GET /carbon/calculate — building area", () => {
  it("uses default 120 m² when building_info is null", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", building_info: null }],
    } as never);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/carbon/calculate?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    const body = res.body as { limitKg: number };
    // 16 × 120 × 50 = 96000
    expect(body.limitKg).toBe(96000);
  });

  it("uses area from building_info when available", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", building_info: { area: 200 } }],
    } as never);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/carbon/calculate?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    const body = res.body as { limitKg: number };
    // 16 × 200 × 50 = 160000
    expect(body.limitKg).toBe(160000);
  });

  it("uses area from stringified building_info", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", building_info: JSON.stringify({ area: 85 }) }],
    } as never);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/carbon/calculate?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    const body = res.body as { limitKg: number };
    // 16 × 85 × 50 = 68000
    expect(body.limitKg).toBe(68000);
  });
});
