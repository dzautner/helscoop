/**
 * BOM Management Lifecycle Tests
 *
 * Full BOM workflow:
 *   create project → add material → update quantity → pricing check →
 *   waste factor application → delete material → verify empty →
 *   add multiple materials → export CSV → export PDF
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../db", () => ({
  query: vi.fn().mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] }),
  pool: { query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }) },
}));

vi.mock("../email", () => ({
  sendEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendPriceAlertEmail: vi.fn(),
}));

vi.mock("../audit", () => ({
  logAuditEvent: vi.fn(),
  createAuditLog: vi.fn().mockResolvedValue(null),
}));

import { query } from "../db";
import app from "../index";

const mockQuery = vi.mocked(query);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authToken(userId = "user-1", role = "user") {
  return jwt.sign({ id: userId, email: "test@test.com", role }, JWT_SECRET, { expiresIn: "7d" });
}

function makeRequest(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown; raw?: boolean } = {},
): Promise<{ status: number; body: unknown; rawBody?: string; headers: Record<string, string> }> {
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
          resolve({
            status: res.statusCode || 0,
            body: parsed,
            rawBody: data,
            headers: res.headers as Record<string, string>,
          });
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

const AUTH = { Authorization: `Bearer ${authToken()}` };
const PROJECT_ID = "proj-bom-1";

const MATERIALS = {
  pine: {
    id: "pine_48x98_c24",
    name: "Pine 48x98 C24",
    name_fi: "Manty 48x98 C24",
    name_en: "Pine 48x98 C24",
    category_id: "lumber",
    waste_factor: 1.05,
  },
  insulation: {
    id: "insulation_100mm",
    name: "Insulation 100mm",
    name_fi: "Eriste 100mm",
    name_en: "Insulation 100mm",
    category_id: "insulation",
    waste_factor: 1.10,
  },
  roofing: {
    id: "galvanized_roofing",
    name: "Galvanized Roofing",
    name_fi: "Galvanoitu kattopelti",
    name_en: "Galvanized Roofing",
    category_id: "roofing",
    waste_factor: 1.03,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
});

// ---------------------------------------------------------------------------
// Full BOM lifecycle
// ---------------------------------------------------------------------------

describe("BOM management flow", () => {
  it("full BOM lifecycle: add → update → pricing → waste → delete → multi-add → csv export", async () => {
    // -----------------------------------------------------------------------
    // Step 1: Add single material to BOM
    // -----------------------------------------------------------------------
    // Ownership check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: PROJECT_ID }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // DELETE existing BOM
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "DELETE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });
    // Material existence check — pine exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: MATERIALS.pine.id }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // INSERT BOM item
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "INSERT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const addRes = await makeRequest("PUT", `/projects/${PROJECT_ID}/bom`, {
      headers: AUTH,
      body: {
        items: [{ material_id: "pine_48x98_c24", quantity: 42, unit: "jm" }],
      },
    });

    expect(addRes.status).toBe(200);
    const addBody = addRes.body as { ok: boolean; count: number; skipped: number };
    expect(addBody.ok).toBe(true);
    expect(addBody.count).toBe(1);
    expect(addBody.skipped).toBe(0);

    // -----------------------------------------------------------------------
    // Step 2: Update quantity (re-save BOM with new quantity)
    // -----------------------------------------------------------------------
    // Ownership check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: PROJECT_ID }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // DELETE existing
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "DELETE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // Material check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: MATERIALS.pine.id }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // INSERT
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "INSERT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const updateRes = await makeRequest("PUT", `/projects/${PROJECT_ID}/bom`, {
      headers: AUTH,
      body: {
        items: [{ material_id: "pine_48x98_c24", quantity: 80, unit: "jm" }],
      },
    });

    expect(updateRes.status).toBe(200);
    expect((updateRes.body as { count: number }).count).toBe(1);

    // -----------------------------------------------------------------------
    // Step 3: Read project with BOM — verify pricing calculation
    // -----------------------------------------------------------------------
    mockQuery
      // Project fetch
      .mockResolvedValueOnce({
        rows: [{
          id: PROJECT_ID,
          name: "Test House",
          user_id: "user-1",
          scene_js: "",
          deleted_at: null,
        }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      })
      // BOM fetch with pricing and waste factor
      .mockResolvedValueOnce({
        rows: [{
          material_id: "pine_48x98_c24",
          material_name: "Pine 48x98 C24",
          category_name: "Lumber",
          quantity: 80,
          unit: "jm",
          unit_price: "2.50",
          link: "https://k-rauta.fi/pine",
          supplier_name: "K-Rauta",
          in_stock: true,
          stock_level: "high",
          store_location: "Helsinki",
          stock_last_checked_at: "2024-01-15",
          // total = quantity * unit_price * waste_factor = 80 * 2.50 * 1.05 = 210.00
          total: "210.00",
        }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

    const readRes = await makeRequest("GET", `/projects/${PROJECT_ID}`, {
      headers: AUTH,
    });

    expect(readRes.status).toBe(200);
    const proj = readRes.body as { bom: Array<{ quantity: number; total: string; unit_price: string }> };
    expect(proj.bom).toHaveLength(1);
    expect(proj.bom[0].quantity).toBe(80);
    expect(parseFloat(proj.bom[0].unit_price)).toBe(2.5);
    // Verify waste factor is applied: 80 * 2.50 * 1.05 = 210.00
    expect(parseFloat(proj.bom[0].total)).toBe(210.0);

    // -----------------------------------------------------------------------
    // Step 4: Delete material from BOM (save empty BOM)
    // -----------------------------------------------------------------------
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: PROJECT_ID }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "DELETE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const emptyRes = await makeRequest("PUT", `/projects/${PROJECT_ID}/bom`, {
      headers: AUTH,
      body: { items: [] },
    });

    expect(emptyRes.status).toBe(200);
    expect((emptyRes.body as { ok: boolean; count: number }).count).toBe(0);

    // -----------------------------------------------------------------------
    // Step 5: Verify BOM is empty when reading project
    // -----------------------------------------------------------------------
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: PROJECT_ID,
          name: "Test House",
          user_id: "user-1",
          scene_js: "",
          deleted_at: null,
        }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [],
        command: "SELECT",
        rowCount: 0,
        oid: 0,
        fields: [],
      });

    const emptyReadRes = await makeRequest("GET", `/projects/${PROJECT_ID}`, {
      headers: AUTH,
    });

    expect(emptyReadRes.status).toBe(200);
    expect((emptyReadRes.body as { bom: unknown[] }).bom).toEqual([]);

    // -----------------------------------------------------------------------
    // Step 6: Add multiple materials
    // -----------------------------------------------------------------------
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: PROJECT_ID }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "DELETE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });
    // Material checks: all 3 exist
    for (const mat of Object.values(MATERIALS)) {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: mat.id }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      });
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: "INSERT",
        rowCount: 1,
        oid: 0,
        fields: [],
      });
    }

    const multiRes = await makeRequest("PUT", `/projects/${PROJECT_ID}/bom`, {
      headers: AUTH,
      body: {
        items: [
          { material_id: "pine_48x98_c24", quantity: 42, unit: "jm" },
          { material_id: "insulation_100mm", quantity: 12, unit: "m2" },
          { material_id: "galvanized_roofing", quantity: 16, unit: "m2" },
        ],
      },
    });

    expect(multiRes.status).toBe(200);
    expect((multiRes.body as { count: number }).count).toBe(3);
    expect((multiRes.body as { skipped: number }).skipped).toBe(0);

    // -----------------------------------------------------------------------
    // Step 7: Export as CSV — verify format
    // -----------------------------------------------------------------------
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          name: "Pine 48x98 C24",
          name_fi: "Manty 48x98 C24",
          name_en: "Pine 48x98 C24",
          category: "Lumber",
          category_fi: "Puutavara",
          quantity: 42,
          unit: "jm",
          unit_price: "2.50",
          total: "110.25",
          supplier: "K-Rauta",
          link: "https://k-rauta.fi/pine",
        },
        {
          name: "Insulation 100mm",
          name_fi: "Eriste 100mm",
          name_en: "Insulation 100mm",
          category: "Insulation",
          category_fi: "Eristeet",
          quantity: 12,
          unit: "m2",
          unit_price: "8.00",
          total: "105.60",
          supplier: "Stark",
          link: "https://stark.fi/insulation",
        },
        {
          name: "Galvanized Roofing",
          name_fi: "Galvanoitu kattopelti",
          name_en: "Galvanized Roofing",
          category: "Roofing",
          category_fi: "Katteet",
          quantity: 16,
          unit: "m2",
          unit_price: "12.00",
          total: "197.76",
          supplier: "K-Rauta",
          link: "https://k-rauta.fi/roofing",
        },
      ],
      command: "SELECT",
      rowCount: 3,
      oid: 0,
      fields: [],
    });

    const csvRes = await makeRequest("GET", `/bom/export/${PROJECT_ID}?format=csv`, {
      headers: AUTH,
    });

    expect(csvRes.status).toBe(200);
    expect(csvRes.headers["content-type"]).toContain("text/csv");
    expect(csvRes.headers["content-disposition"]).toContain("attachment");

    const csvBody = csvRes.rawBody as string;
    // BOM with UTF-8 BOM marker
    expect(csvBody.charCodeAt(0)).toBe(0xfeff);

    // Verify header row
    const lines = csvBody.replace(/^\uFEFF/, "").split("\n");
    expect(lines[0]).toBe("Material,Category,Qty,Unit,Price,Total,Supplier,Link");

    // Verify data rows (default lang=fi, so Finnish names are used)
    expect(lines.length).toBeGreaterThanOrEqual(4); // header + 3 data rows
    expect(lines[1]).toContain("Manty");
    expect(lines[1]).toContain("42");
    expect(lines[2]).toContain("Eriste");
    expect(lines[3]).toContain("Galvanoitu");
  });

  // -----------------------------------------------------------------------
  // Step 8: Export as PDF — verify it generates
  // -----------------------------------------------------------------------
  it("exports BOM as PDF successfully", async () => {
    // Project fetch
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: PROJECT_ID,
        name: "Test House",
        description: "A test house for BOM export",
        user_id: "user-1",
        scene_js: "",
        deleted_at: null,
      }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    // BOM fetch for PDF
    mockQuery.mockResolvedValueOnce({
      rows: [{
        material_id: "pine_48x98_c24",
        material_name: "Pine 48x98 C24",
        waste_factor: 1.05,
        quantity: 42,
        unit: "jm",
        unit_price: "2.50",
        line_cost: "110.25",
        supplier_name: "K-Rauta",
      }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const pdfRes = await makeRequest("GET", `/projects/${PROJECT_ID}/pdf?lang=fi`, {
      headers: AUTH,
    });

    expect(pdfRes.status).toBe(200);
    // PDF response starts with %PDF signature
    const rawBody = pdfRes.rawBody as string;
    expect(rawBody).toContain("%PDF");
  });
});

// ---------------------------------------------------------------------------
// BOM validation edge cases
// ---------------------------------------------------------------------------

describe("BOM validation", () => {
  // The BOM route checks project ownership first, so we need the ownership mock
  function mockProjectOwnership() {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: PROJECT_ID }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
  }

  it("rejects negative quantity", async () => {
    mockProjectOwnership();

    const res = await makeRequest("PUT", `/projects/${PROJECT_ID}/bom`, {
      headers: AUTH,
      body: {
        items: [{ material_id: "pine_48x98_c24", quantity: -5, unit: "jm" }],
      },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("positive");
  });

  it("rejects zero quantity", async () => {
    mockProjectOwnership();

    const res = await makeRequest("PUT", `/projects/${PROJECT_ID}/bom`, {
      headers: AUTH,
      body: {
        items: [{ material_id: "pine_48x98_c24", quantity: 0, unit: "jm" }],
      },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("positive");
  });

  it("rejects quantity exceeding 1,000,000", async () => {
    mockProjectOwnership();

    const res = await makeRequest("PUT", `/projects/${PROJECT_ID}/bom`, {
      headers: AUTH,
      body: {
        items: [{ material_id: "pine_48x98_c24", quantity: 1_000_001, unit: "jm" }],
      },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("1,000,000");
  });

  it("rejects empty material_id", async () => {
    mockProjectOwnership();

    const res = await makeRequest("PUT", `/projects/${PROJECT_ID}/bom`, {
      headers: AUTH,
      body: {
        items: [{ material_id: "", quantity: 5, unit: "jm" }],
      },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("material_id");
  });

  it("rejects NaN quantity", async () => {
    mockProjectOwnership();

    const res = await makeRequest("PUT", `/projects/${PROJECT_ID}/bom`, {
      headers: AUTH,
      body: {
        items: [{ material_id: "pine_48x98_c24", quantity: "not-a-number", unit: "jm" }],
      },
    });

    expect(res.status).toBe(400);
  });

  it("rejects Infinity quantity", async () => {
    mockProjectOwnership();

    const res = await makeRequest("PUT", `/projects/${PROJECT_ID}/bom`, {
      headers: AUTH,
      body: {
        items: [{ material_id: "pine_48x98_c24", quantity: Infinity, unit: "jm" }],
      },
    });

    // Infinity gets serialized as null in JSON, so effectively it's missing
    expect(res.status).toBe(400);
  });

  it("defaults unit to kpl when not provided", async () => {
    // Ownership check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: PROJECT_ID }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // DELETE
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "DELETE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });
    // Material exists
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "pine_48x98_c24" }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // INSERT
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "INSERT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("PUT", `/projects/${PROJECT_ID}/bom`, {
      headers: AUTH,
      body: {
        items: [{ material_id: "pine_48x98_c24", quantity: 5 }], // no unit
      },
    });

    expect(res.status).toBe(200);

    // Verify the INSERT was called with "kpl" as default unit
    const insertCall = mockQuery.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("INSERT INTO project_bom"),
    );
    expect(insertCall).toBeTruthy();
    expect(insertCall![1]).toContain("kpl");
  });
});

// ---------------------------------------------------------------------------
// BOM JSON export (non-CSV)
// ---------------------------------------------------------------------------

describe("BOM JSON export", () => {
  it("exports BOM as JSON with locale-aware names", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          name: "Pine 48x98 C24",
          name_fi: "Manty 48x98 C24",
          name_en: "Pine 48x98 C24",
          category: "Lumber",
          category_fi: "Puutavara",
          quantity: 42,
          unit: "jm",
          unit_price: "2.50",
          total: "110.25",
          supplier: "K-Rauta",
          link: "https://k-rauta.fi/pine",
        },
      ],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", `/bom/export/${PROJECT_ID}?lang=fi`, {
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    const rows = res.body as Array<{ name: string; category: string }>;
    expect(rows).toHaveLength(1);
    // Finnish locale should use name_fi
    expect(rows[0].name).toBe("Manty 48x98 C24");
    expect(rows[0].category).toBe("Puutavara");
  });
});
