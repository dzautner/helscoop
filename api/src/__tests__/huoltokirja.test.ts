/**
 * Unit tests for the huoltokirja (maintenance manual) generator.
 *
 * Tests the generation endpoint, empty project handling, schedule mapping,
 * maintenance program deduplication, and error conditions.
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/514
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
import { buildMaintenanceProgram, type HuoltokirjaComponent } from "../routes/huoltokirja";
import { getScheduleForCategory, defaultSchedule, maintenanceSchedules } from "../maintenance-schedules";

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
// 1. GET /huoltokirja/generate — requires auth
// ---------------------------------------------------------------------------
describe("GET /huoltokirja/generate", () => {
  it("rejects unauthenticated request", async () => {
    const res = await makeRequest("GET", "/huoltokirja/generate?projectId=p1");
    expect(res.status).toBe(401);
  });

  it("returns 400 when projectId is missing", async () => {
    const res = await makeRequest("GET", "/huoltokirja/generate", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("projectId");
  });

  it("returns 404 when project does not exist", async () => {
    // Project query returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/huoltokirja/generate?projectId=nonexistent", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("not found");
  });

  it("generates huoltokirja for project with BOM items", async () => {
    // First query: project lookup
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "p1",
        name: "Test Project",
        building_info: {
          address: "Testikatu 1",
          buildingType: "Omakotitalo",
          yearBuilt: 1985,
          area: 120,
        },
      }],
    } as never);

    // Second query: BOM items
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          material_id: "pine_48x98_c24",
          quantity: "42",
          unit: "jm",
          material_name: "Mänty 48x98 C24",
          category_id: "lumber",
          category_name: "Puutavara",
          unit_price: "3.50",
          supplier_name: "K-Rauta",
        },
        {
          material_id: "galvanized_roofing",
          quantity: "16",
          unit: "m2",
          material_name: "Pelti, sinkitty",
          category_id: "roofing",
          category_name: "Kattomateriaalit",
          unit_price: "12.90",
          supplier_name: "Ruukki",
        },
      ],
    } as never);

    const res = await makeRequest("GET", "/huoltokirja/generate?projectId=p1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const doc = res.body as {
      projectName: string;
      generatedAt: string;
      buildingInfo: { address: string; buildingType: string; yearBuilt: number; area: number };
      components: Array<{
        materialId: string;
        materialName: string;
        category: string;
        quantity: number;
        unit: string;
        supplier: string;
        unitPrice: number;
        maintenanceSchedule: { inspectionIntervalMonths: number; expectedLifeYears: number };
        expectedLifeYears: number;
      }>;
      maintenanceProgram: Array<{
        task_fi: string;
        task_en: string;
        intervalMonths: number;
        category: string;
        materials: string[];
      }>;
    };

    expect(doc.projectName).toBe("Test Project");
    expect(doc.generatedAt).toBeDefined();
    expect(doc.buildingInfo.address).toBe("Testikatu 1");
    expect(doc.buildingInfo.yearBuilt).toBe(1985);
    expect(doc.buildingInfo.area).toBe(120);
    expect(doc.components).toHaveLength(2);
    expect(doc.components[0].materialId).toBe("pine_48x98_c24");
    expect(doc.components[0].quantity).toBe(42);
    expect(doc.components[0].maintenanceSchedule.inspectionIntervalMonths).toBe(12);
    expect(doc.components[1].expectedLifeYears).toBe(40); // roofing
    expect(doc.maintenanceProgram.length).toBeGreaterThanOrEqual(2);
  });

  it("handles empty BOM gracefully", async () => {
    // Project exists but has no BOM
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "p2", name: "Empty Project", building_info: null }],
    } as never);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/huoltokirja/generate?projectId=p2", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const doc = res.body as {
      projectName: string;
      components: unknown[];
      maintenanceProgram: unknown[];
      buildingInfo: Record<string, unknown>;
    };
    expect(doc.projectName).toBe("Empty Project");
    expect(doc.components).toEqual([]);
    expect(doc.maintenanceProgram).toEqual([]);
    expect(doc.buildingInfo).toEqual({});
  });

  it("uses empty building info when stored building_info JSON is malformed", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "p-bad-info", name: "Bad Metadata", building_info: "{not valid json" }],
    } as never);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/huoltokirja/generate?projectId=p-bad-info", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const doc = res.body as {
      projectName: string;
      buildingInfo: Record<string, unknown>;
      components: unknown[];
    };
    expect(doc.projectName).toBe("Bad Metadata");
    expect(doc.buildingInfo).toEqual({});
    expect(doc.components).toEqual([]);
  });

  it("parses Finnish-keyed building_info correctly", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "p3",
        name: "FI Keys Project",
        building_info: {
          osoite: "Mannerheimintie 1",
          kayttotarkoitus: "Kerrostalo",
          valmistumisvuosi: 1960,
          kerrosala: 250,
        },
      }],
    } as never);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/huoltokirja/generate?projectId=p3", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const doc = res.body as {
      buildingInfo: { address: string; buildingType: string; yearBuilt: number; area: number };
    };
    expect(doc.buildingInfo.address).toBe("Mannerheimintie 1");
    expect(doc.buildingInfo.buildingType).toBe("Kerrostalo");
    expect(doc.buildingInfo.yearBuilt).toBe(1960);
    expect(doc.buildingInfo.area).toBe(250);
  });
});

// ---------------------------------------------------------------------------
// 2. Maintenance schedule lookup
// ---------------------------------------------------------------------------
describe("getScheduleForCategory", () => {
  it("returns correct schedule for known categories", () => {
    const lumber = getScheduleForCategory("lumber");
    expect(lumber.inspectionIntervalMonths).toBe(12);
    expect(lumber.expectedLifeYears).toBe(30);
    expect(lumber.maintenanceNotes_fi).toContain("lahoisuus");

    const roofing = getScheduleForCategory("roofing");
    expect(roofing.inspectionIntervalMonths).toBe(12);
    expect(roofing.expectedLifeYears).toBe(40);
  });

  it("returns default schedule for unknown category", () => {
    const unknown = getScheduleForCategory("unknown_category_xyz");
    expect(unknown).toEqual(defaultSchedule);
    expect(unknown.inspectionIntervalMonths).toBe(24);
    expect(unknown.expectedLifeYears).toBe(30);
  });

  it("covers all expected categories", () => {
    const expectedCategories = [
      "lumber", "panels", "concrete", "steel", "insulation",
      "roofing", "windows", "doors", "plumbing", "electrical",
      "hvac", "foundation", "fasteners", "paint", "waterproofing",
    ];
    for (const cat of expectedCategories) {
      expect(maintenanceSchedules[cat]).toBeDefined();
      expect(maintenanceSchedules[cat].inspectionIntervalMonths).toBeGreaterThan(0);
      expect(maintenanceSchedules[cat].expectedLifeYears).toBeGreaterThan(0);
      expect(maintenanceSchedules[cat].maintenanceNotes_fi.length).toBeGreaterThan(0);
      expect(maintenanceSchedules[cat].maintenanceNotes_en.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. buildMaintenanceProgram — deduplication & sorting
// ---------------------------------------------------------------------------
describe("buildMaintenanceProgram", () => {
  it("deduplicates entries per category", () => {
    const schedule = getScheduleForCategory("lumber");
    const components: HuoltokirjaComponent[] = [
      {
        materialId: "pine_48x98",
        materialName: "Pine 48x98",
        category: "Lumber",
        quantity: 10,
        unit: "jm",
        supplier: "K-Rauta",
        unitPrice: 3.50,
        maintenanceSchedule: schedule,
        expectedLifeYears: 30,
      },
      {
        materialId: "pine_48x148",
        materialName: "Pine 48x148",
        category: "Lumber",
        quantity: 20,
        unit: "jm",
        supplier: "K-Rauta",
        unitPrice: 5.00,
        maintenanceSchedule: schedule,
        expectedLifeYears: 30,
      },
    ];

    const program = buildMaintenanceProgram(components);
    expect(program).toHaveLength(1);
    expect(program[0].category).toBe("Lumber");
    expect(program[0].materials).toContain("Pine 48x98");
    expect(program[0].materials).toContain("Pine 48x148");
  });

  it("sorts entries by interval ascending", () => {
    const lumberSchedule = getScheduleForCategory("lumber"); // 12 months
    const concreteSchedule = getScheduleForCategory("concrete"); // 60 months
    const components: HuoltokirjaComponent[] = [
      {
        materialId: "concrete_block",
        materialName: "Concrete Block",
        category: "Concrete",
        quantity: 24,
        unit: "kpl",
        supplier: null,
        unitPrice: null,
        maintenanceSchedule: concreteSchedule,
        expectedLifeYears: 80,
      },
      {
        materialId: "pine_48x98",
        materialName: "Pine 48x98",
        category: "Lumber",
        quantity: 10,
        unit: "jm",
        supplier: null,
        unitPrice: null,
        maintenanceSchedule: lumberSchedule,
        expectedLifeYears: 30,
      },
    ];

    const program = buildMaintenanceProgram(components);
    expect(program).toHaveLength(2);
    // Lumber (12 months) should come before Concrete (60 months)
    expect(program[0].intervalMonths).toBe(12);
    expect(program[1].intervalMonths).toBe(60);
  });

  it("returns empty array for empty components", () => {
    const program = buildMaintenanceProgram([]);
    expect(program).toEqual([]);
  });
});
