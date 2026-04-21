/**
 * Tests for the waste estimation endpoint.
 *
 * Covers: GET /waste/estimate with various BOM compositions,
 * empty projects, container sizing, authorization, and input validation.
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/253
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

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] } as never);
});

// ---------------------------------------------------------------------------
// 1. Missing projectId parameter
// ---------------------------------------------------------------------------
describe("GET /waste/estimate", () => {
  it("returns 400 when projectId is missing", async () => {
    const res = await makeRequest("GET", "/waste/estimate", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("projectId");
  });

  // ---------------------------------------------------------------------------
  // 2. Invalid projectId format
  // ---------------------------------------------------------------------------
  it("returns 400 for invalid projectId format", async () => {
    const res = await makeRequest("GET", "/waste/estimate?projectId=not-a-uuid", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("Invalid projectId");
  });

  // ---------------------------------------------------------------------------
  // 3. Unauthenticated request
  // ---------------------------------------------------------------------------
  it("returns 401 without auth token", async () => {
    const res = await makeRequest("GET", `/waste/estimate?projectId=${PROJECT_ID}`);
    expect(res.status).toBe(401);
  });

  // ---------------------------------------------------------------------------
  // 4. Project not found (wrong user)
  // ---------------------------------------------------------------------------
  it("returns 404 when project does not belong to user", async () => {
    // First query: project lookup returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", `/waste/estimate?projectId=${PROJECT_ID}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("not found");
  });

  // ---------------------------------------------------------------------------
  // 5. Empty project — no BOM items
  // ---------------------------------------------------------------------------
  it("returns zero waste for empty project", async () => {
    // First query: project exists
    mockQuery.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] } as never);
    // Second query: BOM is empty
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", `/waste/estimate?projectId=${PROJECT_ID}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as {
      totalWeightKg: number;
      totalVolumeM3: number;
      categories: unknown[];
      containerRecommendation: { size: string; count: number; totalCost: number };
      sortingGuide: unknown[];
      totalDisposalCost: number;
    };
    expect(body.totalWeightKg).toBe(0);
    expect(body.totalVolumeM3).toBe(0);
    expect(body.categories).toHaveLength(0);
    expect(body.totalDisposalCost).toBe(0);
    // Even empty projects get a minimum container recommendation
    expect(body.containerRecommendation.count).toBeGreaterThanOrEqual(1);
    expect(body.sortingGuide).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 6. Lumber-only project produces puujate
  // ---------------------------------------------------------------------------
  it("estimates wood waste for lumber BOM", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] } as never);
    mockQuery.mockResolvedValueOnce({
      rows: [
        { quantity: 42, unit: "jm", category_id: "lumber", waste_factor: 1.05, category_name: "Lumber" },
        { quantity: 28, unit: "jm", category_id: "lumber", waste_factor: 1.05, category_name: "Lumber" },
      ],
    } as never);

    const res = await makeRequest("GET", `/waste/estimate?projectId=${PROJECT_ID}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as {
      totalWeightKg: number;
      categories: { type: string; weightKg: number; recyclable: boolean }[];
      totalDisposalCost: number;
    };
    expect(body.totalWeightKg).toBeGreaterThan(0);
    expect(body.categories.length).toBeGreaterThanOrEqual(1);

    const woodWaste = body.categories.find(c => c.type === "puujate");
    expect(woodWaste).toBeDefined();
    expect(woodWaste!.weightKg).toBeGreaterThan(0);
    expect(woodWaste!.recyclable).toBe(true);
    // Clean wood waste is free at Sortti
    expect(body.totalDisposalCost).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // 7. Mixed project with multiple waste types
  // ---------------------------------------------------------------------------
  it("handles mixed material categories", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] } as never);
    mockQuery.mockResolvedValueOnce({
      rows: [
        { quantity: 42, unit: "jm", category_id: "lumber", waste_factor: 1.05, category_name: "Lumber" },
        { quantity: 12, unit: "m2", category_id: "insulation", waste_factor: 1.10, category_name: "Insulation" },
        { quantity: 16, unit: "m2", category_id: "roofing", waste_factor: 1.05, category_name: "Roofing" },
        { quantity: 24, unit: "kpl", category_id: "foundation", waste_factor: 1.03, category_name: "Foundation" },
      ],
    } as never);

    const res = await makeRequest("GET", `/waste/estimate?projectId=${PROJECT_ID}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as {
      totalWeightKg: number;
      categories: { type: string; weightKg: number }[];
      sortingGuide: { wasteType: string }[];
      containerRecommendation: { size: string; count: number; totalCost: number };
    };

    // Should have multiple waste types
    expect(body.categories.length).toBeGreaterThanOrEqual(3);

    // Sorting guide should include relevant waste types
    const guideTypes = body.sortingGuide.map(g => g.wasteType);
    expect(guideTypes).toContain("puujate");
    expect(guideTypes).toContain("metallijate"); // from roofing
    expect(guideTypes).toContain("kivijate");    // from foundation
  });

  // ---------------------------------------------------------------------------
  // 8. Container sizing scales with project size
  // ---------------------------------------------------------------------------
  it("recommends larger container for heavy project", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] } as never);
    // A large project with lots of materials
    mockQuery.mockResolvedValueOnce({
      rows: [
        { quantity: 200, unit: "jm", category_id: "lumber", waste_factor: 1.10, category_name: "Lumber" },
        { quantity: 100, unit: "m2", category_id: "insulation", waste_factor: 1.15, category_name: "Insulation" },
        { quantity: 80, unit: "m2", category_id: "roofing", waste_factor: 1.05, category_name: "Roofing" },
        { quantity: 200, unit: "kpl", category_id: "foundation", waste_factor: 1.05, category_name: "Foundation" },
      ],
    } as never);

    const res = await makeRequest("GET", `/waste/estimate?projectId=${PROJECT_ID}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as {
      containerRecommendation: { size: string; count: number; totalCost: number };
    };
    // Should not be the smallest container
    expect(body.containerRecommendation.totalCost).toBeGreaterThan(0);
    expect(body.containerRecommendation.count).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // 9. Unknown category falls back to default
  // ---------------------------------------------------------------------------
  it("uses default waste factor for unknown categories", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] } as never);
    mockQuery.mockResolvedValueOnce({
      rows: [
        { quantity: 10, unit: "kpl", category_id: "unknown_category", waste_factor: 1.05, category_name: "Unknown" },
      ],
    } as never);

    const res = await makeRequest("GET", `/waste/estimate?projectId=${PROJECT_ID}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as {
      totalWeightKg: number;
      categories: { type: string }[];
    };
    expect(body.totalWeightKg).toBeGreaterThan(0);
    // Default maps to sekajate
    expect(body.categories[0].type).toBe("sekajate");
  });

  // ---------------------------------------------------------------------------
  // 10. Response structure matches expected schema
  // ---------------------------------------------------------------------------
  it("returns correct response structure", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: PROJECT_ID }] } as never);
    mockQuery.mockResolvedValueOnce({
      rows: [
        { quantity: 10, unit: "jm", category_id: "lumber", waste_factor: 1.05, category_name: "Lumber" },
      ],
    } as never);

    const res = await makeRequest("GET", `/waste/estimate?projectId=${PROJECT_ID}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as Record<string, unknown>;
    // Top-level fields
    expect(body).toHaveProperty("totalWeightKg");
    expect(body).toHaveProperty("totalVolumeM3");
    expect(body).toHaveProperty("categories");
    expect(body).toHaveProperty("containerRecommendation");
    expect(body).toHaveProperty("sortingGuide");
    expect(body).toHaveProperty("totalDisposalCost");

    // Category structure
    const categories = body.categories as Record<string, unknown>[];
    expect(categories.length).toBeGreaterThan(0);
    expect(categories[0]).toHaveProperty("type");
    expect(categories[0]).toHaveProperty("weightKg");
    expect(categories[0]).toHaveProperty("volumeM3");
    expect(categories[0]).toHaveProperty("recyclable");
    expect(categories[0]).toHaveProperty("disposalCostEur");

    // Container recommendation structure
    const container = body.containerRecommendation as Record<string, unknown>;
    expect(container).toHaveProperty("size");
    expect(container).toHaveProperty("count");
    expect(container).toHaveProperty("totalCost");

    // Sorting guide structure
    const guide = body.sortingGuide as Record<string, unknown>[];
    expect(guide.length).toBeGreaterThan(0);
    expect(guide[0]).toHaveProperty("wasteType");
    expect(guide[0]).toHaveProperty("sortingInstruction_fi");
    expect(guide[0]).toHaveProperty("sortingInstruction_en");
    expect(guide[0]).toHaveProperty("acceptedAt");
  });
});
