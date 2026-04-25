process.env.NODE_ENV = "test";

import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";
import JSZip from "jszip";
import { generatePermitPack, PERMIT_PACK_FORMAT } from "../permit-pack";

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

function pgRows(rows: unknown[]) {
  return { rows, command: "", rowCount: rows.length, oid: 0, fields: [] };
}

function makeRequest(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: Buffer; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: method.toUpperCase(),
          headers: {
            "Content-Type": "application/json",
            ...opts.headers,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          res.on("end", () => {
            server.close();
            resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks), headers: res.headers });
          });
        },
      );
      req.on("error", (err) => {
        server.close();
        reject(err);
      });
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  });
}

const saunaScene = `
const floor = box(4, 0.2, 3);
const wall_back = translate(box(4, 2.4, 0.12), 0, 1.3, -1.44);
const wall_front = translate(box(4, 2.4, 0.12), 0, 1.3, 1.44);
const roof = translate(box(4.4, 0.08, 3.4), 0, 2.7, 0);
scene.add(floor, { material: "foundation" });
scene.add(wall_back, { material: "lumber" });
scene.add(wall_front, { material: "lumber" });
scene.add(roof, { material: "roofing" });
`;

const project = {
  id: "project-1",
  name: "Pihasauna 3x4m",
  description: "Backyard sauna permit pack",
  scene_js: saunaScene,
  building_info: {
    address: "Testikatu 1",
    area_m2: 12,
    floors: 1,
    municipalityNumber: "091",
    permanentBuildingIdentifier: "103456789A",
  },
  permit_metadata: {
    municipalityNumber: "091",
    propertyIdentifier: "91-1-2-3",
    descriptionOfAction: "Build backyard sauna",
    floorAreaM2: 12,
    suomiFiAuthenticated: true,
  },
};

const bomRows = [
  {
    material_id: "pine_48x148_c24",
    material_name: "48x148 Runkopuu C24",
    category_name: "Puutavara",
    structural_grade_class: "C24",
    supplier_name: "K-Rauta",
    quantity: "42",
    unit: "jm",
    unit_price: "3.5",
  },
];

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue(pgRows([]) as never);
});

describe("generatePermitPack", () => {
  it("creates a ZIP containing A3 1:100 drawing PDFs, RH prefill, and manifest", async () => {
    const result = await generatePermitPack({
      project,
      bom: [{
        material_id: "pine_48x148_c24",
        material_name: "48x148 Runkopuu C24",
        category_name: "Puutavara",
        structural_grade_class: "C24",
        supplier_name: "K-Rauta",
        quantity: 42,
        unit: "jm",
        unit_price: 3.5,
      }],
      generatedAt: "2026-04-23T08:00:00.000Z",
    });

    const zip = await JSZip.loadAsync(result.buffer);
    const fileNames = Object.keys(zip.files);

    expect(result.manifest.format).toBe(PERMIT_PACK_FORMAT);
    expect(result.manifest.paper).toBe("A3");
    expect(result.manifest.drawingScale).toBe("1:100");
    expect(result.manifest.drawings).toHaveLength(5);
    expect(fileNames).toContain("manifest.json");
    expect(fileNames.some((name) => name.includes("floor_plan_A3_1-100.pdf"))).toBe(true);
    expect(fileNames.some((name) => name.includes("elevations_A3_1-100.pdf"))).toBe(true);
    expect(fileNames.some((name) => name.includes("cross_section_A3_1-100.pdf"))).toBe(true);
    expect(fileNames.some((name) => name.includes("RH_lomake_prefill.pdf"))).toBe(true);

    const floorName = fileNames.find((name) => name.includes("floor_plan_A3_1-100.pdf"));
    expect(floorName).toBeTruthy();
    const floorPdf = await zip.file(floorName!)!.async("nodebuffer");
    expect(floorPdf.subarray(0, 4).toString("utf8")).toBe("%PDF");
  });

  it("falls back to parametric dimensions for the kanala template scene", async () => {
    const result = await generatePermitPack({
      project: {
        id: "kanala-1",
        name: "Kanala 2x1.5m",
        scene_js: "const coop_len = 1526;\nconst coop_w = 4841;\nconst wall_h = 2630;\nexport const scene = [];",
        building_info: {},
      },
      bom: [],
      generatedAt: "2026-04-23T08:00:00.000Z",
    });

    expect(result.manifest.geometrySource).toBe("parametric scene dimensions");
    const zip = await JSZip.loadAsync(result.buffer);
    expect(Object.keys(zip.files).some((name) => name.includes("material_specification.pdf"))).toBe(true);
  });
});

describe("GET /permit-pack/projects/:id/export", () => {
  it("requires authentication", async () => {
    const res = await makeRequest("GET", "/permit-pack/projects/project-1/export");
    expect(res.status).toBe(401);
  });

  it("returns 404 when the project is not owned by the user", async () => {
    mockQuery.mockResolvedValueOnce(pgRows([]) as never);

    const res = await makeRequest("GET", "/permit-pack/projects/missing/export", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(404);
    expect(JSON.parse(res.body.toString("utf8")).error).toContain("Project not found");
  });

  it("returns a downloadable permit ZIP for owned projects", async () => {
    mockQuery
      .mockResolvedValueOnce(pgRows([project]) as never)
      .mockResolvedValueOnce(pgRows(bomRows) as never);

    const res = await makeRequest("GET", "/permit-pack/projects/project-1/export", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/zip");
    expect(res.headers["content-disposition"]).toContain("Pihasauna_3x4m_permit_pack.zip");
    expect(res.headers["x-helscoop-permit-pack"]).toBe(PERMIT_PACK_FORMAT);
    expect(res.headers["x-helscoop-permit-pack-drawings"]).toBe("5");

    const zip = await JSZip.loadAsync(res.body);
    const manifestRaw = await zip.file("manifest.json")!.async("string");
    const manifest = JSON.parse(manifestRaw) as { projectId: string; drawings: unknown[] };
    expect(manifest.projectId).toBe("project-1");
    expect(manifest.drawings).toHaveLength(5);
  });
});
