/**
 * Tests for IFC export — generator library and API endpoint.
 *
 * Covers IFC structure validity, element classification, scene parsing,
 * material assignments, auth requirements, and error handling.
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/360
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
import {
  IFC_PERMIT_EXPORT_PURPOSE,
  IFC_SCHEMA,
  generateIFC,
  parseSceneObjects,
  classifyElement,
} from "../ifc-generator";

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
): Promise<{ status: number; body: unknown; headers: http.IncomingHttpHeaders }> {
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
          resolve({ status: res.statusCode || 0, body: parsed, headers: res.headers });
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
// 1. IFC Generator — structure validity
// ---------------------------------------------------------------------------
describe("generateIFC", () => {
  it("produces valid IFC4x3 STEP file structure", () => {
    const ifc = generateIFC({
      project: { id: "p1", name: "Test Project" },
      bom: [],
    });

    expect(ifc).toContain("ISO-10303-21;");
    expect(ifc).toContain(`FILE_SCHEMA(('${IFC_SCHEMA}'));`);
    expect(ifc).toContain("ViewDefinition [ReferenceView_V1.2]");
    expect(ifc).toContain("HEADER;");
    expect(ifc).toContain("DATA;");
    expect(ifc).toContain("ENDSEC;");
    expect(ifc).toContain("END-ISO-10303-21;");
  });

  it("includes project name in IFCPROJECT entity", () => {
    const ifc = generateIFC({
      project: { id: "p1", name: "Pihasauna 3x4m" },
      bom: [],
    });

    expect(ifc).toContain("IFCPROJECT");
    expect(ifc).toContain("Pihasauna 3x4m");
  });

  it("includes spatial hierarchy: site, building, storey", () => {
    const ifc = generateIFC({
      project: { id: "p1", name: "Test" },
      bom: [],
      buildingInfo: { address: "Testikatu 1" },
    });

    expect(ifc).toContain("IFCSITE");
    expect(ifc).toContain("IFCBUILDING");
    expect(ifc).toContain("IFCBUILDINGSTOREY");
    expect(ifc).toContain("IFCRELAGGREGATES");
    expect(ifc).toContain("Testikatu 1");
  });

  it("includes permit metadata required by digital permit workflows", () => {
    const ifc = generateIFC({
      project: { id: "p1", name: "Permit Sauna" },
      bom: [],
      buildingInfo: {
        address: "Testikatu 1",
        buildingType: "omakotitalo",
        yearBuilt: 1985,
        floorAreaM2: 95,
      },
      permitMetadata: {
        permanentBuildingIdentifier: "103456789A",
        propertyIdentifier: "91-1-2-3",
        municipalityNumber: "091",
        latitude: 60.1699,
        longitude: 24.9384,
        grossAreaM2: 120,
        floors: 2,
        energyClass: "B",
        constructionActionType: "renovation",
        permitApplicationType: "building-permit",
      },
    });

    expect(ifc).toContain("IFCPROPERTYSET");
    expect(ifc).toContain("Pset_HelscoopPermitMetadata");
    expect(ifc).toContain(IFC_PERMIT_EXPORT_PURPOSE);
    expect(ifc).toContain("PermanentBuildingIdentifier");
    expect(ifc).toContain("103456789A");
    expect(ifc).toContain("PropertyIdentifier");
    expect(ifc).toContain("91-1-2-3");
    expect(ifc).toContain("MunicipalityNumber");
    expect(ifc).toContain("091");
    expect(ifc).toContain("GrossAreaM2");
    expect(ifc).toContain("IFCREAL(60.1699)");
    expect(ifc).toContain("IFCREAL(24.9384)");
    expect(ifc).toContain("EnergyClass");
  });

  it("maps scene objects to correct IFC element types", () => {
    const sceneJs = `
const floor = box(4, 0.2, 3);
const wall1 = translate(box(4, 2.4, 0.12), 0, 1.3, -1.44);
const roof1 = translate(box(2.3, 0.05, 4.4), -1.0, 2.9, 0);

scene.add(floor, { material: "foundation", color: [0.65, 0.65, 0.65] });
scene.add(wall1, { material: "lumber", color: [0.82, 0.68, 0.47] });
scene.add(roof1, { material: "roofing", color: [0.35, 0.32, 0.30] });
`;

    const ifc = generateIFC({
      project: { id: "p1", name: "Sauna", scene_js: sceneJs },
      bom: [],
    });

    expect(ifc).toContain("IFCSLAB");  // floor
    expect(ifc).toContain("IFCWALL");  // wall1
    expect(ifc).toContain("IFCROOF");  // roof1
  });

  it("includes material assignments from BOM", () => {
    const sceneJs = `
const wall1 = translate(box(4, 2.4, 0.12), 0, 1.3, -1.44);
scene.add(wall1, { material: "lumber" });
`;

    const ifc = generateIFC({
      project: { id: "p1", name: "Test", scene_js: sceneJs },
      bom: [
        {
          material_id: "lumber",
          material_name: "M\u00e4nty 48x148 C24",
          quantity: 42,
          unit: "jm",
        },
      ],
    });

    expect(ifc).toContain("IFCMATERIAL");
    expect(ifc).toContain("IFCRELASSOCIATESMATERIAL");
    expect(ifc).toContain("M\u00e4nty 48x148 C24");
  });

  it("handles empty scene_js gracefully", () => {
    const ifc = generateIFC({
      project: { id: "p1", name: "Empty" },
      bom: [],
    });

    // Should still have valid structure without any building elements
    expect(ifc).toContain("IFCPROJECT");
    expect(ifc).toContain("IFCSITE");
    expect(ifc).not.toContain("IFCRELCONTAINEDINSPATIALSTRUCTURE");
  });
});

// ---------------------------------------------------------------------------
// 2. Scene parser and element classifier
// ---------------------------------------------------------------------------
describe("parseSceneObjects", () => {
  it("extracts objects with dimensions and positions", () => {
    const sceneJs = `
const wall1 = translate(box(4, 2.4, 0.12), 0, 1.3, -1.44);
scene.add(wall1, { material: "lumber" });
`;

    const objects = parseSceneObjects(sceneJs);
    expect(objects).toHaveLength(1);
    expect(objects[0].name).toBe("wall1");
    expect(objects[0].type).toBe("wall");
    expect(objects[0].dimensions).toEqual({ x: 4, y: 2.4, z: 0.12 });
    expect(objects[0].position).toEqual({ x: 0, y: 1.3, z: -1.44 });
    expect(objects[0].material).toBe("lumber");
  });

  it("handles box without translate", () => {
    const sceneJs = `
const floor = box(4, 0.2, 3);
scene.add(floor, { material: "foundation" });
`;

    const objects = parseSceneObjects(sceneJs);
    expect(objects).toHaveLength(1);
    expect(objects[0].position).toEqual({ x: 0, y: 0, z: 0 });
  });
});

describe("classifyElement", () => {
  it("classifies wall elements", () => {
    expect(classifyElement("wall1")).toBe("wall");
    expect(classifyElement("wall_back")).toBe("wall");
    expect(classifyElement("seina")).toBe("wall");
  });

  it("classifies roof elements", () => {
    expect(classifyElement("roof1")).toBe("roof");
    expect(classifyElement("katto")).toBe("roof");
  });

  it("classifies door elements", () => {
    expect(classifyElement("door")).toBe("door");
    expect(classifyElement("ovi")).toBe("door");
    expect(classifyElement("gate")).toBe("door");
  });

  it("classifies window elements", () => {
    expect(classifyElement("window1")).toBe("window");
    expect(classifyElement("ikkuna")).toBe("window");
  });

  it("classifies slab/floor elements", () => {
    expect(classifyElement("floor")).toBe("slab");
    expect(classifyElement("deck")).toBe("slab");
    expect(classifyElement("foundation")).toBe("slab");
  });

  it("falls back to material-based classification", () => {
    expect(classifyElement("some_element", "roofing")).toBe("roof");
    expect(classifyElement("base", "foundation")).toBe("slab");
  });

  it("defaults to wall for unclassified elements", () => {
    expect(classifyElement("beam1")).toBe("wall");
    expect(classifyElement("post1")).toBe("wall");
  });
});

// ---------------------------------------------------------------------------
// 3. API endpoint — GET /ifc-export/generate
// ---------------------------------------------------------------------------
describe("GET /ifc-export/generate", () => {
  it("rejects unauthenticated request", async () => {
    const res = await makeRequest("GET", "/ifc-export/generate?projectId=p1");
    expect(res.status).toBe(401);
  });

  it("returns 400 when projectId is missing", async () => {
    const res = await makeRequest("GET", "/ifc-export/generate", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("projectId");
  });

  it("returns 404 when project does not exist", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("GET", "/ifc-export/generate?projectId=nonexistent", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("not found");
  });

  it("generates and returns IFC file with correct headers", async () => {
    // First query: project lookup
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "p1",
        name: "Pihasauna",
        description: "Test sauna project",
        scene_js: `
const floor = box(4, 0.2, 3);
const wall1 = translate(box(4, 2.4, 0.12), 0, 1.3, -1.44);
scene.add(floor, { material: "foundation" });
scene.add(wall1, { material: "lumber" });
`,
        building_info: {
          address: "Testikatu 1",
          buildingType: "Omakotitalo",
          yearBuilt: 1985,
          area_m2: 120,
          coordinates: { lat: 60.1699, lon: 24.9384 },
          permanentBuildingIdentifier: "103456789A",
        },
        permit_metadata: {
          propertyIdentifier: "91-1-2-3",
          municipalityNumber: "091",
          grossAreaM2: 128,
          energyClass: "B",
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
          material_name: "M\u00e4nty 48x98 C24",
          category_name: "Puutavara",
        },
      ],
    } as never);

    const res = await makeRequest("GET", "/ifc-export/generate?projectId=p1", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("application/x-step");
    expect(res.headers["content-disposition"]).toContain("Pihasauna.ifc");
    expect(res.headers["x-helscoop-ifc-schema"]).toBe(IFC_SCHEMA);
    expect(res.headers["x-helscoop-permit-export"]).toBe(IFC_PERMIT_EXPORT_PURPOSE);

    const ifcContent = res.body as string;
    expect(ifcContent).toContain("ISO-10303-21;");
    expect(ifcContent).toContain(`FILE_SCHEMA(('${IFC_SCHEMA}'));`);
    expect(ifcContent).toContain("IFCPROJECT");
    expect(ifcContent).toContain("Pihasauna");
    expect(ifcContent).toContain("IFCWALL");
    expect(ifcContent).toContain("IFCSLAB");
    expect(ifcContent).toContain("Pset_HelscoopPermitMetadata");
    expect(ifcContent).toContain("103456789A");
    expect(ifcContent).toContain("91-1-2-3");
  });
});
