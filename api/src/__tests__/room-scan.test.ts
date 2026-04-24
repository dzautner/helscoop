process.env.NODE_ENV = "test";

import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";
import JSZip from "jszip";

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
      entry: { balanceAfter: 12 },
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

const materialRows = [
  { id: "pine_48x98_c24", name: "48x98 Runkopuu C24", category_name: "Lumber", unit_price: "2.6", unit: "jm", supplier_name: "Sarokas", link: null },
  { id: "gypsum_board_13mm", name: "Kipsilevy 13mm", category_name: "Interior", unit_price: "5.8", unit: "m2", supplier_name: "K-Rauta", link: null },
  { id: "osb_18mm", name: "OSB 18mm Lattia", category_name: "Sheathing", unit_price: "32", unit: "sheet", supplier_name: "K-Rauta", link: null },
  { id: "vapor_barrier", name: "Hoyrynsulku PE", category_name: "Membrane", unit_price: "0.8", unit: "sqm", supplier_name: "K-Rauta", link: null },
  { id: "trim_21x45", name: "Lista 21x45", category_name: "Trim", unit_price: "1.2", unit: "jm", supplier_name: "Sarokas", link: null },
  { id: "door_thermal_bridge", name: "Ovi", category_name: "Opening", unit_price: "45", unit: "kpl", supplier_name: "K-Rauta", link: null },
  { id: "exterior_paint_white", name: "Valkoinen maali", category_name: "Finish", unit_price: "15", unit: "liter", supplier_name: "Tikkurila", link: null },
];

const usdaScan = `#usda 1.0
def Xform "LivingRoom" {
  string category = "room"
  double3 xformOp:translate = (0, 0, 0)
  double3 xformOp:scale = (4.2, 0.05, 5.1)
}
def Xform "KitchenRoom" {
  string category = "room"
  double3 xformOp:translate = (4.2, 0, 0)
  double3 xformOp:scale = (2.7, 0.05, 5.1)
}
def Xform "NorthWall" {
  string category = "wall"
  double3 xformOp:translate = (1.5, 0, -2.55)
  double3 xformOp:scale = (6.9, 2.7, 0.16)
}
def Xform "FrontDoor" {
  string category = "door"
  double3 xformOp:translate = (-2.4, 0, 2.55)
  double3 xformOp:scale = (0.9, 2.1, 0.08)
}
def Xform "LivingWindow" {
  string category = "window"
  double3 xformOp:translate = (1.2, 1.2, -2.55)
  double3 xformOp:scale = (1.4, 1.1, 0.08)
}
`;

function scanDataUrl(text: string) {
  return `data:model/vnd.usd;base64,${Buffer.from(text).toString("base64")}`;
}

async function usdzDataUrl(text: string) {
  const zip = new JSZip();
  zip.file("RoomPlanExport.usda", text);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return `data:model/vnd.usdz+zip;base64,${buffer.toString("base64")}`;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockDeductCredits.mockClear();
});

describe("POST /room-scan/projects/:projectId/import", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("POST", "/room-scan/projects/proj-1/import", {
      body: { scans: [{ name: "scan.usda", mime_type: "model/vnd.usd" }] },
    });

    expect(res.status).toBe(401);
  });

  it("validates scan file extensions", async () => {
    const res = await makeRequest("POST", "/room-scan/projects/proj-1/import", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { scans: [{ name: "scan.obj", mime_type: "text/plain" }] },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("USDZ");
  });

  it("extracts rooms, walls, openings, scene geometry, and BOM rows from an ASCII USD scan", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "proj-1",
          name: "As-built scan",
          building_info: { area_m2: 120, floors: 2, year_built: 1980, type: "omakotitalo" },
        }],
      } as never)
      .mockResolvedValueOnce({ rows: materialRows } as never);

    const res = await makeRequest("POST", "/room-scan/projects/proj-1/import", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        scans: [{
          name: "ground-floor.usda",
          mime_type: "model/vnd.usd",
          size: 4000,
          data_url: scanDataUrl(usdaScan),
        }],
        options: {
          floor_label: "Ground floor",
          notes: "iPhone RoomPlan scan with kitchen",
        },
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      source_format: string;
      quality: { coverage_percent: number; parser: string };
      rooms: { name: string; area_m2: number }[];
      walls: { length_m: number }[];
      openings: { type: string }[];
      scene_js: string;
      bom_suggestions: { material_id: string; quantity: number }[];
      estimate: { mid: number };
      credits: { cost: number; balance: number };
    };
    expect(body.source_format).toBe("usda");
    expect(body.quality.parser).toBe("roomplan_text");
    expect(body.quality.coverage_percent).toBeGreaterThan(50);
    expect(body.rooms.map((room) => room.name)).toEqual(expect.arrayContaining(["LivingRoom", "KitchenRoom"]));
    expect(body.rooms.every((room) => room.area_m2 > 0)).toBe(true);
    expect(body.walls[0].length_m).toBeGreaterThan(6);
    expect(body.openings.map((opening) => opening.type)).toEqual(expect.arrayContaining(["door", "window"]));
    expect(body.scene_js).toContain("room_scan_floor");
    expect(body.scene_js).toContain("livingroom_zone");
    expect(body.bom_suggestions.map((item) => item.material_id)).toEqual(expect.arrayContaining([
      "pine_48x98_c24",
      "gypsum_board_13mm",
      "osb_18mm",
    ]));
    expect(body.bom_suggestions.every((item) => item.quantity > 0)).toBe(true);
    expect(body.estimate.mid).toBeGreaterThan(0);
    expect(body.credits).toEqual({ cost: 10, balance: 12 });
    expect(mockDeductCredits).toHaveBeenCalledWith("user-1", "quantityTakeoff", expect.objectContaining({
      projectId: "proj-1",
      sourceFormat: "usda",
      parser: "roomplan_text",
      roomCount: 2,
      bomLineCount: body.bom_suggestions.length,
    }));
  });

  it("opens USDZ archives that contain ASCII RoomPlan geometry", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "proj-1",
          name: "USDZ scan",
          building_info: { area_m2: 100, floors: 1 },
        }],
      } as never)
      .mockResolvedValueOnce({ rows: materialRows } as never);

    const res = await makeRequest("POST", "/room-scan/projects/proj-1/import", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        scans: [{
          name: "roomplan.usdz",
          mime_type: "model/vnd.usdz+zip",
          size: 5000,
          data_url: await usdzDataUrl(usdaScan),
        }],
      },
    });

    expect(res.status).toBe(200);
    const body = res.body as {
      source_format: string;
      source_detail: string;
      quality: { parser: string };
      rooms: unknown[];
    };
    expect(body.source_format).toBe("usdz");
    expect(body.source_detail).toContain("RoomPlanExport.usda");
    expect(body.quality.parser).toBe("roomplan_text");
    expect(body.rooms).toHaveLength(2);
  });
});
