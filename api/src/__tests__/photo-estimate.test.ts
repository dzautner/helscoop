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

vi.mock("../entitlements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../entitlements")>();
  return {
    ...actual,
    checkCredits: () => (_req: unknown, _res: unknown, next: () => void) => next(),
    deductCreditsForFeature: vi.fn().mockResolvedValue({
      ok: true,
      entry: { balanceAfter: 15 },
    }),
  };
});

import { query } from "../db";
import { deductCreditsForFeature } from "../entitlements";
const mockQuery = vi.mocked(query);
const mockDeductCredits = vi.mocked(deductCreditsForFeature);

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

const photo = {
  name: "roof-facade.jpg",
  mime_type: "image/jpeg",
  size: 1200,
  data_url: "data:image/jpeg;base64,AAAA",
};

const materialRows = [
  { id: "galvanized_roofing", name: "Peltikatto Sinkitty", category_name: "Roofing", unit_price: "8.5", unit: "sqm", supplier_name: "K-Rauta", link: "https://k.example/roof" },
  { id: "galvanized_flashing", name: "Pellitys Sinkitty", category_name: "Roofing", unit_price: "12", unit: "jm", supplier_name: "K-Rauta", link: null },
  { id: "screws_50mm", name: "Ruuvit", category_name: "Fasteners", unit_price: "18", unit: "box", supplier_name: "K-Rauta", link: null },
  { id: "exterior_board_yellow", name: "Ulkoverhouslauta", category_name: "Cladding", unit_price: "28", unit: "sheet", supplier_name: "K-Rauta", link: null },
  { id: "exterior_paint_white", name: "Valkoinen Ulkomaali", category_name: "Finish", unit_price: "15", unit: "liter", supplier_name: "K-Rauta", link: null },
  { id: "trim_21x45", name: "Lista 21x45", category_name: "Trim", unit_price: "1.2", unit: "jm", supplier_name: "K-Rauta", link: null },
  { id: "insulation_100mm", name: "Mineraalivilla 100mm", category_name: "Insulation", unit_price: "6.5", unit: "sqm", supplier_name: "K-Rauta", link: null },
  { id: "vapor_barrier", name: "Höyrynsulku PE", category_name: "Membrane", unit_price: "0.8", unit: "sqm", supplier_name: "K-Rauta", link: null },
  { id: "osb_9mm", name: "OSB 9mm Levy", category_name: "Sheathing", unit_price: "12.5", unit: "sheet", supplier_name: "K-Rauta", link: null },
];

beforeEach(() => {
  mockQuery.mockReset();
  mockDeductCredits.mockClear();
});

describe("POST /photo-estimate/projects/:projectId/analyze", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("POST", "/photo-estimate/projects/proj-1/analyze", {
      body: { photos: [photo] },
    });

    expect(res.status).toBe(401);
  });

  it("validates uploaded photo count and types", async () => {
    const res = await makeRequest("POST", "/photo-estimate/projects/proj-1/analyze", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { photos: [{ name: "notes.txt", mime_type: "text/plain" }] },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("JPEG");
  });

  it("returns a catalog-backed range estimate and deducts photo credits", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "proj-1",
          name: "Rintamamiestalo",
          building_info: { area_m2: 120, floors: 2, year_built: 1974, heating: "oil", roof_type: "gable" },
        }],
      } as never)
      .mockResolvedValueOnce({ rows: materialRows } as never);

    const res = await makeRequest("POST", "/photo-estimate/projects/proj-1/analyze", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { photos: [photo] },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      estimate: { low: number; mid: number; high: number };
      scopes: { scope: string; bom_suggestions: { material_id: string }[] }[];
      credits: { cost: number; balance: number };
      subsidy_flags: { id: string }[];
    };
    expect(body.estimate.mid).toBeGreaterThan(0);
    expect(body.estimate.low).toBeLessThan(body.estimate.mid);
    expect(body.estimate.high).toBeGreaterThan(body.estimate.mid);
    expect(body.scopes.map((scope) => scope.scope)).toEqual(expect.arrayContaining(["roof", "facade", "insulation", "heating"]));
    expect(body.scopes.flatMap((scope) => scope.bom_suggestions).map((item) => item.material_id)).toContain("galvanized_roofing");
    expect(body.subsidy_flags[0].id).toBe("fossil_heating_replacement");
    expect(body.credits).toEqual({ cost: 5, balance: 15 });
    expect(mockDeductCredits).toHaveBeenCalledWith("user-1", "photoEstimate", expect.objectContaining({
      projectId: "proj-1",
      photoCount: 1,
    }));
  });
});
