/**
 * Tests for Finnish energy subsidy estimation.
 *
 * Covers: POST /subsidies/energy/estimate static ELY/ARA rules,
 * authorization, validation, fixed grant amounts, and net-cost calculation.
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/305
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";
import { estimateEnergySubsidy, OIL_GAS_HEATING_GRANT_CONFIG } from "../routes/subsidies";

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

import app from "../index";

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe("estimateEnergySubsidy", () => {
  const now = new Date("2026-04-21T09:00:00.000Z");

  it("returns 4000 EUR ELY support for oil to ground-source heat pump", () => {
    const result = estimateEnergySubsidy({
      totalCost: 12400,
      currentHeating: "oil",
      targetHeating: "ground_source_heat_pump",
      buildingType: "omakotitalo",
      yearRoundResidential: true,
      buildingYear: 1985,
    }, now);

    expect(result.bestAmount).toBe(4000);
    expect(result.netCost).toBe(8400);
    expect(result.programs[0].status).toBe("eligible");
    expect(result.applicationDeadline).toBe(OIL_GAS_HEATING_GRANT_CONFIG.applicationDeadline);
    expect(result.completionDeadline).toBe(OIL_GAS_HEATING_GRANT_CONFIG.completionDeadline);
    expect(result.daysUntilApplicationDeadline).toBeGreaterThan(0);
    expect(result.programs[0].applicationUrl).toBe(OIL_GAS_HEATING_GRANT_CONFIG.applicationUrl);
    expect(result.programs[0].warnings.join(" ")).toContain("cannot be claimed");
  });

  it("returns 2500 EUR ELY support for oil to other non-fossil heating", () => {
    const result = estimateEnergySubsidy({
      totalCost: 9000,
      currentHeating: "oil",
      targetHeating: "other_non_fossil",
      buildingType: "paritalo",
      yearRoundResidential: true,
    }, now);

    expect(result.bestAmount).toBe(2500);
    expect(result.netCost).toBe(6500);
  });

  it("uses the application deadline, not completion deadline, for the grant countdown", () => {
    const result = estimateEnergySubsidy({
      totalCost: 10000,
      currentHeating: "oil",
      targetHeating: "air_water_heat_pump",
      buildingType: "omakotitalo",
      yearRoundResidential: true,
    }, new Date("2026-05-26T09:00:00.000Z"));

    expect(result.daysUntilApplicationDeadline).toBeLessThan(0);
    expect(result.daysUntilCompletionDeadline).toBeGreaterThan(0);
    expect(result.bestAmount).toBe(0);
    expect(result.programs[0].status).toBe("not_eligible");
    expect(result.programs[0].warnings).toContain("ELY application deadline has passed.");
  });

  it("does not deduct ARA/Varke discretionary support from net cost", () => {
    const result = estimateEnergySubsidy({
      totalCost: 12000,
      currentHeating: "wood",
      targetHeating: "air_water_heat_pump",
      buildingType: "omakotitalo",
      yearRoundResidential: true,
      applicantAgeGroup: "65_plus",
      heatingSystemCondition: "hard_to_maintain",
    }, now);

    const ara = result.programs.find((program) => program.program === "ara_repair_elderly_disabled");
    expect(ara?.status).toBe("maybe");
    expect(ara?.amount).toBe(0);
    expect(result.netCost).toBe(12000);
  });
});

describe("POST /subsidies/energy/estimate", () => {
  it("requires authentication", async () => {
    const res = await makeRequest("POST", "/subsidies/energy/estimate", {
      body: { totalCost: 10000 },
    });

    expect(res.status).toBe(401);
  });

  it("validates totalCost", async () => {
    const res = await makeRequest("POST", "/subsidies/energy/estimate", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { totalCost: -1 },
    });

    expect(res.status).toBe(400);
  });

  it("returns an ELY estimate for authenticated users", async () => {
    const res = await makeRequest("POST", "/subsidies/energy/estimate", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        totalCost: 12400,
        currentHeating: "natural_gas",
        targetHeating: "air_water_heat_pump",
        buildingType: "omakotitalo",
        yearRoundResidential: true,
        buildingYear: 1992,
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as { bestAmount: number; netCost: number; programs: { status: string; sourceUrl: string }[] };
    expect(body.bestAmount).toBe(4000);
    expect(body.netCost).toBe(8400);
    expect(body.programs[0].status).toBe("eligible");
    expect(body.programs[0].sourceUrl).toBe(OIL_GAS_HEATING_GRANT_CONFIG.gasSourceUrl);
  });
});
