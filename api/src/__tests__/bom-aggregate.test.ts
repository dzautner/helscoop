/**
 * Tests for multi-project BOM aggregation.
 *
 * Covers POST /bom/aggregate: auth, input validation, project ownership, and
 * quantity/cost deduplication across selected projects.
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

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
      const bodyStr = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
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

describe("POST /bom/aggregate", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("POST", "/bom/aggregate", {
      body: { project_ids: ["p1", "p2"] },
    });

    expect(res.status).toBe(401);
  });

  it("requires at least two distinct projects", async () => {
    const res = await makeRequest("POST", "/bom/aggregate", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { project_ids: ["p1", "p1"] },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("at least two");
  });

  it("returns 404 when any selected project is not owned by the user", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "p1", name: "Sauna", estimated_cost: "120", bom_rows: 1 }],
    } as never);

    const res = await makeRequest("POST", "/bom/aggregate", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { project_ids: ["p1", "p2"] },
    });

    expect(res.status).toBe(404);
  });

  it("merges duplicate materials with per-project attribution and bulk candidates", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: "p1", name: "Sauna", building_info: { area_m2: 25 }, estimated_cost: "250", bom_rows: 2 },
          { id: "p2", name: "Terrace", building_info: { area_m2: 30 }, estimated_cost: "180", bom_rows: 1 },
        ],
      } as never)
      .mockResolvedValueOnce({
        rows: [
          {
            project_id: "p1",
            project_name: "Sauna",
            material_id: "pine_48x148_c24",
            material_name: "Pine 48x148 C24",
            category_name: "Lumber",
            quantity: "40",
            unit: "jm",
            unit_price: "2.5",
            waste_factor: "1.1",
            supplier_name: "K-Rauta",
          },
          {
            project_id: "p2",
            project_name: "Terrace",
            material_id: "pine_48x148_c24",
            material_name: "Pine 48x148 C24",
            category_name: "Lumber",
            quantity: "70",
            unit: "jm",
            unit_price: "2.5",
            waste_factor: "1.1",
            supplier_name: "K-Rauta",
          },
          {
            project_id: "p1",
            project_name: "Sauna",
            material_id: "osb_9mm",
            material_name: "OSB 9mm",
            category_name: "Sheets",
            quantity: "5",
            unit: "sheet",
            unit_price: "9",
            waste_factor: "1",
            supplier_name: "Stark",
          },
        ],
      } as never);

    const res = await makeRequest("POST", "/bom/aggregate", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { project_ids: ["p1", "p2"] },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      project_count: number;
      item_count: number;
      total_cost: number;
      bulk_opportunity_count: number;
      projects: Array<{ id: string; area_m2: number | null; cost_per_m2: number | null }>;
      items: Array<{
        material_id: string;
        quantity: number;
        total: number;
        source_project_count: number;
        bulk_discount: { eligible: boolean; threshold: number; estimated_savings_eur: number } | null;
        project_breakdown: Array<{ project_id: string; quantity: number; total: number }>;
      }>;
    };

    expect(body.project_count).toBe(2);
    expect(body.item_count).toBe(2);
    expect(body.total_cost).toBe(347.5);
    expect(body.bulk_opportunity_count).toBe(1);
    expect(body.projects).toEqual([
      expect.objectContaining({ id: "p1", area_m2: 25, cost_per_m2: 10 }),
      expect.objectContaining({ id: "p2", area_m2: 30, cost_per_m2: 6 }),
    ]);

    const pine = body.items.find((item) => item.material_id === "pine_48x148_c24");
    expect(pine).toMatchObject({
      quantity: 110,
      total: 302.5,
      source_project_count: 2,
      bulk_discount: { eligible: true, threshold: 100 },
    });
    expect(pine?.bulk_discount?.estimated_savings_eur).toBe(15.13);
    expect(pine?.project_breakdown).toEqual([
      { project_id: "p2", project_name: "Terrace", quantity: 70, total: 192.5 },
      { project_id: "p1", project_name: "Sauna", quantity: 40, total: 110 },
    ]);
  });

  it("uses shared building area fallbacks for legacy and Finnish project metadata", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "p1",
            name: "Legacy area",
            building_info: { area: 125 },
            estimated_cost: "250",
            bom_rows: 0,
          },
          {
            id: "p2",
            name: "Floor area",
            building_info: JSON.stringify({ floorAreaM2: "80,5" }),
            estimated_cost: "161",
            bom_rows: 0,
          },
          {
            id: "p3",
            name: "Finnish area",
            building_info: { kerrosala: 50 },
            estimated_cost: "75",
            bom_rows: 0,
          },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("POST", "/bom/aggregate", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { project_ids: ["p1", "p2", "p3"] },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      projects: Array<{ id: string; area_m2: number | null; cost_per_m2: number | null }>;
    };
    expect(body.projects).toEqual([
      expect.objectContaining({ id: "p1", area_m2: 125, cost_per_m2: 2 }),
      expect.objectContaining({ id: "p2", area_m2: 80.5, cost_per_m2: 2 }),
      expect.objectContaining({ id: "p3", area_m2: 50, cost_per_m2: 1.5 }),
    ]);
  });

  it("keeps aggregate summaries available when stored building_info is malformed", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            id: "p1",
            name: "Bad Metadata",
            building_info: "{not valid json",
            estimated_cost: "250",
            bom_rows: 0,
          },
          {
            id: "p2",
            name: "Missing Metadata",
            building_info: null,
            estimated_cost: "180",
            bom_rows: 0,
          },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("POST", "/bom/aggregate", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { project_ids: ["p1", "p2"] },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      projects: Array<{ id: string; area_m2: number | null; cost_per_m2: number | null }>;
    };
    expect(body.projects).toEqual([
      expect.objectContaining({ id: "p1", area_m2: null, cost_per_m2: null }),
      expect.objectContaining({ id: "p2", area_m2: null, cost_per_m2: null }),
    ]);
  });
});
