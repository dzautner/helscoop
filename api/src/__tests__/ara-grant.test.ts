/**
 * Unit tests for the ARA energy grant application package endpoint
 * and the energy class calculator.
 *
 * Tests: energy class calculation, grant eligibility tiers, cost
 * formatting with VAT, checklist generation, BOM upgrade detection,
 * authentication, and edge cases.
 *
 * Covers: GET /ara-grant/package?projectId=<id>
 *         calculateEnergyClass()
 *         classifyEnergy()
 *         estimateSavingsFromBom()
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/630
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";
import {
  classifyEnergy,
  estimateBaselineEnergy,
  estimateSavingsFromBom,
  calculateEnergyClass,
} from "../energy-class";

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
// 1. Energy class classification (unit tests)
// ---------------------------------------------------------------------------
describe("classifyEnergy", () => {
  it("classifies low consumption as A", () => {
    expect(classifyEnergy(50)).toBe("A");
    expect(classifyEnergy(75)).toBe("A");
  });

  it("classifies mid-range consumption correctly", () => {
    expect(classifyEnergy(76)).toBe("B");
    expect(classifyEnergy(100)).toBe("B");
    expect(classifyEnergy(131)).toBe("D");
    expect(classifyEnergy(160)).toBe("D");
  });

  it("classifies high consumption as G", () => {
    expect(classifyEnergy(241)).toBe("G");
    expect(classifyEnergy(400)).toBe("G");
  });

  it("handles boundary values correctly", () => {
    expect(classifyEnergy(130)).toBe("C");
    expect(classifyEnergy(190)).toBe("E");
    expect(classifyEnergy(240)).toBe("F");
  });
});

// ---------------------------------------------------------------------------
// 2. Baseline energy estimation
// ---------------------------------------------------------------------------
describe("estimateBaselineEnergy", () => {
  it("returns higher energy for older buildings", () => {
    const old = estimateBaselineEnergy(1950);
    const modern = estimateBaselineEnergy(2022);
    expect(old).toBeGreaterThan(modern);
  });

  it("applies heating type multiplier", () => {
    const electric = estimateBaselineEnergy(1990, "sahko");
    const heatPump = estimateBaselineEnergy(1990, "maalampopumppu");
    expect(heatPump).toBeLessThan(electric);
  });

  it("uses multiplier 1.0 for unknown heating type", () => {
    const base = estimateBaselineEnergy(1990);
    const unknown = estimateBaselineEnergy(1990, "unknown_type");
    expect(base).toBe(unknown);
  });
});

// ---------------------------------------------------------------------------
// 3. BOM upgrade savings estimation
// ---------------------------------------------------------------------------
describe("estimateSavingsFromBom", () => {
  it("returns 0 for empty BOM", () => {
    expect(estimateSavingsFromBom([])).toBe(0);
  });

  it("detects insulation upgrades", () => {
    const savings = estimateSavingsFromBom(["insulation_100mm", "pine_48x98_c24"]);
    expect(savings).toBeGreaterThan(0);
  });

  it("stacks multiple upgrade types", () => {
    const single = estimateSavingsFromBom(["insulation_100mm"]);
    const double = estimateSavingsFromBom(["insulation_100mm", "triple_window_ikkuna"]);
    expect(double).toBeGreaterThan(single);
  });

  it("caps savings at 60%", () => {
    const everything = estimateSavingsFromBom([
      "insulation_100mm",
      "triple_window",
      "heat_pump_unit",
      "solar_panel",
      "led_lighting",
      "new_door",
    ]);
    expect(everything).toBeLessThanOrEqual(60);
  });

  it("does not double-count same pattern", () => {
    const one = estimateSavingsFromBom(["insulation_100mm"]);
    const two = estimateSavingsFromBom(["insulation_100mm", "insulation_200mm"]);
    expect(one).toBe(two);
  });
});

// ---------------------------------------------------------------------------
// 4. Full energy class calculation
// ---------------------------------------------------------------------------
describe("calculateEnergyClass", () => {
  it("returns before and after classes with savings", () => {
    const result = calculateEnergyClass(
      { year_built: 1970, heating: "oljy" },
      [
        { material_id: "insulation_150mm", quantity: 50, unit: "m2" },
        { material_id: "triple_ikkuna", quantity: 8, unit: "kpl" },
      ],
    );
    expect(result.before).toBeTruthy();
    expect(result.after).toBeTruthy();
    expect(result.savingsPercent).toBeGreaterThan(0);
    expect(result.kwhAfter).toBeLessThan(result.kwhBefore);
  });

  it("returns same class when no upgrades in BOM", () => {
    const result = calculateEnergyClass(
      { year_built: 2020 },
      [{ material_id: "pine_48x98_c24", quantity: 10, unit: "jm" }],
    );
    expect(result.savingsPercent).toBe(0);
    expect(result.before).toBe(result.after);
    expect(result.kwhBefore).toBe(result.kwhAfter);
  });

  it("defaults to 1980 when year_built is missing", () => {
    const result = calculateEnergyClass({}, []);
    // 1980 -> 190 kWh/m2 -> class E
    expect(result.kwhBefore).toBe(190);
    expect(result.before).toBe("E");
  });
});

// ---------------------------------------------------------------------------
// 5. ARA grant endpoint — authentication
// ---------------------------------------------------------------------------
describe("GET /ara-grant/package — authentication", () => {
  it("rejects unauthenticated request with 401", async () => {
    const res = await makeRequest("GET", "/ara-grant/package?projectId=proj-1");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// 6. ARA grant endpoint — validation
// ---------------------------------------------------------------------------
describe("GET /ara-grant/package — validation", () => {
  it("returns 400 when projectId is missing", async () => {
    const res = await makeRequest("GET", "/ara-grant/package", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("projectId");
  });

  it("returns 404 when project does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/ara-grant/package?projectId=nonexistent", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// 7. ARA grant endpoint — full package generation
// ---------------------------------------------------------------------------
describe("GET /ara-grant/package — package generation", () => {
  it("generates a complete grant package with eligible upgrades", async () => {
    // Project with 1970s oil-heated building
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "proj-1",
        building_info: JSON.stringify({
          year_built: 1975,
          heating: "oljy",
          area_m2: 120,
          type: "omakotitalo",
        }),
      }],
    } as never);

    // BOM with insulation and window upgrades + pricing
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          material_id: "insulation_150mm",
          quantity: 80,
          unit: "m2",
          material_name: "Mineraalivilla 150mm",
          unit_price: "5.50",
          waste_factor: "1.05",
        },
        {
          material_id: "triple_ikkuna_1200x1400",
          quantity: 6,
          unit: "kpl",
          material_name: "3-lasinen ikkuna 1200x1400",
          unit_price: "450.00",
          waste_factor: "1.0",
        },
      ],
    } as never);

    const res = await makeRequest("GET", "/ara-grant/package?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as {
      energyClassBefore: string;
      energyClassAfter: string;
      savingsPercent: number;
      kwhBefore: number;
      kwhAfter: number;
      costEstimate: {
        items: unknown[];
        totalWithoutVat: number;
        totalWithVat: number;
        vatRate: number;
      };
      checklist: string[];
      eligibility: boolean;
      estimatedGrantPercent: number;
      estimatedGrantAmount: number;
    };

    // Energy classes
    expect(body.energyClassBefore).toBeTruthy();
    expect(body.energyClassAfter).toBeTruthy();
    expect(body.savingsPercent).toBeGreaterThan(0);
    expect(body.kwhAfter).toBeLessThan(body.kwhBefore);

    // Cost estimate
    expect(body.costEstimate.items.length).toBe(2);
    expect(body.costEstimate.totalWithoutVat).toBeGreaterThan(0);
    expect(body.costEstimate.totalWithVat).toBeGreaterThan(body.costEstimate.totalWithoutVat);
    expect(body.costEstimate.vatRate).toBe(0.255);

    // Grant eligibility
    expect(body.eligibility).toBe(true);
    expect(body.estimatedGrantPercent).toBeGreaterThan(0);
    expect(body.estimatedGrantAmount).toBeGreaterThan(0);

    // Checklist includes extra docs for eligible projects
    expect(body.checklist.length).toBeGreaterThanOrEqual(5);
    expect(body.checklist.some((c: string) => c.includes("Energiatodistus"))).toBe(true);
    expect(body.checklist.some((c: string) => c.includes("Urakoitsijan"))).toBe(true);
  });

  it("returns ineligible when no energy upgrades in BOM", async () => {
    // Modern building
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", building_info: JSON.stringify({ year_built: 2020 }) }],
    } as never);

    // BOM with only structural materials
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          material_id: "pine_48x98_c24",
          quantity: 20,
          unit: "jm",
          material_name: "Runkopuu 48x98 C24",
          unit_price: "3.50",
          waste_factor: "1.1",
        },
      ],
    } as never);

    const res = await makeRequest("GET", "/ara-grant/package?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as {
      eligibility: boolean;
      estimatedGrantPercent: number;
      estimatedGrantAmount: number;
      checklist: string[];
    };

    expect(body.eligibility).toBe(false);
    expect(body.estimatedGrantPercent).toBe(0);
    expect(body.estimatedGrantAmount).toBe(0);

    // Shorter checklist without energy-specific documents
    expect(body.checklist.length).toBe(5);
    expect(body.checklist.some((c: string) => c.includes("Urakoitsijan"))).toBe(false);
  });

  it("handles empty BOM gracefully", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", building_info: null }],
    } as never);
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/ara-grant/package?projectId=proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);

    const body = res.body as {
      costEstimate: { items: unknown[]; totalWithoutVat: number; totalWithVat: number };
      eligibility: boolean;
    };

    expect(body.costEstimate.items).toEqual([]);
    expect(body.costEstimate.totalWithoutVat).toBe(0);
    expect(body.costEstimate.totalWithVat).toBe(0);
    expect(body.eligibility).toBe(false);
  });
});
