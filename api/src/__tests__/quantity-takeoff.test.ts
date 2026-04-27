process.env.NODE_ENV = "test";

import { beforeEach, describe, expect, it, vi } from "vitest";
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
      entry: { balanceAfter: 10 },
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

const drawing = {
  name: "pohjapiirros-sauna-khh.pdf",
  mime_type: "application/pdf",
  size: 1200,
  data_url: "data:application/pdf;base64,AAAA",
};

const materialRows = [
  { id: "pine_48x98_c24", name: "48x98 Runkopuu C24", category_name: "Lumber", unit_price: "2.6", unit: "jm", supplier_name: "Sarokas", link: null },
  { id: "gypsum_board_13mm", name: "Kipsilevy 13mm", category_name: "Interior", unit_price: "5.8", unit: "m2", supplier_name: "K-Rauta", link: null },
  { id: "osb_18mm", name: "OSB 18mm Lattia", category_name: "Sheathing", unit_price: "32", unit: "sheet", supplier_name: "K-Rauta", link: null },
  { id: "insulation_100mm", name: "Mineraalivilla 100mm", category_name: "Insulation", unit_price: "12.34", unit: "sqm", supplier_name: "K-Rauta", link: null },
  { id: "vapor_barrier", name: "Höyrynsulku PE", category_name: "Membrane", unit_price: "0.8", unit: "sqm", supplier_name: "K-Rauta", link: null },
  { id: "door_thermal_bridge", name: "Ovi", category_name: "Opening", unit_price: "45", unit: "kpl", supplier_name: "K-Rauta", link: null },
  { id: "trim_21x45", name: "Lista 21x45", category_name: "Trim", unit_price: "1.2", unit: "jm", supplier_name: "Sarokas", link: null },
  { id: "exterior_paint_white", name: "Valkoinen maali", category_name: "Finish", unit_price: "15", unit: "liter", supplier_name: "Tikkurila", link: null },
];

beforeEach(() => {
  mockQuery.mockReset();
  mockDeductCredits.mockClear();
});

describe("POST /quantity-takeoff/projects/:projectId/analyze", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("POST", "/quantity-takeoff/projects/proj-1/analyze", {
      body: { drawings: [drawing] },
    });

    expect(res.status).toBe(401);
  });

  it("validates drawing file type", async () => {
    const res = await makeRequest("POST", "/quantity-takeoff/projects/proj-1/analyze", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { drawings: [{ name: "notes.txt", mime_type: "text/plain" }] },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("PDF");
  });

  it("returns a room overlay, catalog BOM suggestions, and deducts quantity takeoff credits", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "proj-1",
          name: "Rintamamiestalo",
          building_info: { area_m2: 120, floors: 2, year_built: 1974, type: "omakotitalo" },
        }],
      } as never)
      .mockResolvedValueOnce({ rows: materialRows } as never);

    const res = await makeRequest("POST", "/quantity-takeoff/projects/proj-1/analyze", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        drawings: [drawing],
        options: {
          width_m: 10,
          depth_m: 8,
          floor_label: "1. kerros",
          notes: "sauna, KHH, 2 bedrooms",
        },
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      drawing_context: { width_m: number; depth_m: number; room_count: number; scale_source: string };
      rooms: { type: string; area_m2: number }[];
      estimate: { mid: number; low: number; high: number };
      bom_suggestions: { material_id: string; quantity: number }[];
      credits: { cost: number; balance: number };
    };
    expect(body.drawing_context).toMatchObject({
      width_m: 10,
      depth_m: 8,
      scale_source: "user_dimensions",
    });
    expect(body.drawing_context.room_count).toBeGreaterThanOrEqual(6);
    expect(body.rooms.map((room) => room.type)).toEqual(expect.arrayContaining(["sauna", "utility", "bedroom"]));
    expect(body.estimate.mid).toBeGreaterThan(0);
    expect(body.estimate.low).toBeLessThan(body.estimate.mid);
    expect(body.estimate.high).toBeGreaterThan(body.estimate.mid);
    expect(body.bom_suggestions.map((item) => item.material_id)).toEqual(expect.arrayContaining([
      "pine_48x98_c24",
      "gypsum_board_13mm",
      "insulation_100mm",
    ]));
    expect(body.bom_suggestions.every((item) => item.quantity > 0)).toBe(true);
    expect(body.credits).toEqual({ cost: 10, balance: 10 });
    expect(mockDeductCredits).toHaveBeenCalledWith("user-1", "quantityTakeoff", expect.objectContaining({
      projectId: "proj-1",
      drawingCount: 1,
      bomLineCount: body.bom_suggestions.length,
    }));
  });

  it("infers drawing scale from shared building area fallbacks", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "proj-1",
          name: "Legacy metadata project",
          building_info: JSON.stringify({ floorAreaM2: "160,5", floors: "2", type: "omakotitalo" }),
        }],
      } as never)
      .mockResolvedValueOnce({ rows: materialRows } as never);

    const res = await makeRequest("POST", "/quantity-takeoff/projects/proj-1/analyze", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        drawings: [drawing],
        options: {
          floor_label: "1. kerros",
          notes: "no explicit dimensions provided",
        },
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      drawing_context: { floor_area_m2: number; scale_source: string };
      bom_suggestions: { quantity: number }[];
    };
    expect(body.drawing_context.scale_source).toBe("building_area");
    expect(body.drawing_context.floor_area_m2).toBeGreaterThan(79);
    expect(body.drawing_context.floor_area_m2).toBeLessThan(81);
    expect(body.bom_suggestions.every((item) => item.quantity > 0)).toBe(true);
  });
});
