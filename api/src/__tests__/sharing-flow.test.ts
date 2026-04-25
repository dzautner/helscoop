/**
 * Project Sharing Flow Tests
 *
 * Tests the complete sharing lifecycle:
 *   - Generate share token
 *   - Access project via share token (no auth required)
 *   - Verify shared view is read-only (cannot mutate)
 *   - Verify shared project shows correct data including BOM
 *   - Revoke share token
 *   - Verify revoked token returns 404
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
  opts: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
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
const PROJECT_ID = "proj-share-1";
const SHARE_TOKEN = "abc12345-share-token-uuid";

const SHARED_PROJECT = {
  id: PROJECT_ID,
  name: "Shared Sauna Build",
  description: "A pihasauna project shared publicly",
  scene_js: 'const floor = box(4, 0.2, 3);\nscene.add(floor, { material: "foundation" });',
  building_info: JSON.stringify({ type: "pihasauna", area_m2: 12 }),
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-15T00:00:00Z",
};

const BOM_DATA = [
  {
    material_id: "pine_48x98_c24",
    material_name: "Pine 48x98 C24",
    category_name: "Lumber",
    quantity: 28,
    unit: "jm",
    unit_price: "2.50",
    link: "https://k-rauta.fi/pine",
    supplier_name: "K-Rauta",
    in_stock: true,
    stock_level: "high",
    store_location: "Helsinki",
    stock_last_checked_at: "2024-01-15",
    total: "73.50",
  },
  {
    material_id: "galvanized_roofing",
    material_name: "Galvanized Roofing",
    category_name: "Roofing",
    quantity: 16,
    unit: "m2",
    unit_price: "12.00",
    link: "https://k-rauta.fi/roofing",
    supplier_name: "K-Rauta",
    in_stock: false,
    stock_level: "none",
    store_location: null,
    stock_last_checked_at: null,
    total: "197.76",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
});

// ---------------------------------------------------------------------------
// Full sharing flow
// ---------------------------------------------------------------------------

describe("project sharing flow", () => {
  it("generate → access → verify data → revoke → verify 404", async () => {
    // -----------------------------------------------------------------------
    // Step 1: Generate share token
    // -----------------------------------------------------------------------
    // Project ownership query — no existing token
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: PROJECT_ID, share_token: null }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // UPDATE to set token
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "UPDATE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const shareRes = await makeRequest("POST", `/projects/${PROJECT_ID}/share`, {
      headers: AUTH,
    });

    expect(shareRes.status).toBe(200);
    const shareBody = shareRes.body as { share_token: string };
    expect(shareBody.share_token).toBeTruthy();
    expect(typeof shareBody.share_token).toBe("string");
    const generatedToken = shareBody.share_token;

    // -----------------------------------------------------------------------
    // Step 2: Access project via share token (no auth required)
    // -----------------------------------------------------------------------
    // Project lookup by share_token
    mockQuery.mockResolvedValueOnce({
      rows: [SHARED_PROJECT],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // BOM lookup
    mockQuery.mockResolvedValueOnce({
      rows: BOM_DATA,
      command: "SELECT",
      rowCount: 2,
      oid: 0,
      fields: [],
    });

    // No Authorization header — public access
    const sharedRes = await makeRequest("GET", `/shared/${generatedToken}`);

    expect(sharedRes.status).toBe(200);

    // -----------------------------------------------------------------------
    // Step 3: Verify shared project shows correct data
    // -----------------------------------------------------------------------
    const shared = sharedRes.body as typeof SHARED_PROJECT & { bom: typeof BOM_DATA };
    expect(shared.name).toBe("Shared Sauna Build");
    expect(shared.description).toBe("A pihasauna project shared publicly");
    expect(shared.scene_js).toContain("box(4");
    expect(shared.bom).toHaveLength(2);
    expect(shared.bom[0].material_name).toBe("Pine 48x98 C24");
    expect(shared.bom[0].quantity).toBe(28);
    expect(shared.bom[0].supplier_name).toBe("K-Rauta");
    expect(shared.bom[1].material_name).toBe("Galvanized Roofing");

    // -----------------------------------------------------------------------
    // Step 4: Verify shared view is read-only — cannot modify via /shared
    // -----------------------------------------------------------------------
    // Attempting to PUT/POST/DELETE on /shared/:token should not exist
    const putRes = await makeRequest("PUT", `/shared/${generatedToken}`, {
      body: { name: "Hacked Name" },
    });
    // Express returns 404 for unmatched routes (no PUT handler on /shared/:token)
    expect(putRes.status).not.toBe(200);

    const deleteRes = await makeRequest("DELETE", `/shared/${generatedToken}`);
    expect(deleteRes.status).not.toBe(200);

    // -----------------------------------------------------------------------
    // Step 5: Revoke share token
    // -----------------------------------------------------------------------
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: PROJECT_ID }],
      command: "UPDATE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const unshareRes = await makeRequest("DELETE", `/projects/${PROJECT_ID}/share`, {
      headers: AUTH,
    });

    expect(unshareRes.status).toBe(200);
    expect((unshareRes.body as { ok: boolean }).ok).toBe(true);

    // -----------------------------------------------------------------------
    // Step 6: Verify revoked token returns 404
    // -----------------------------------------------------------------------
    mockQuery.mockResolvedValueOnce({
      rows: [], // No project matches the revoked token
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const revokedRes = await makeRequest("GET", `/shared/${generatedToken}`);
    expect(revokedRes.status).toBe(404);
    expect((revokedRes.body as { error: string }).error).toContain("not found");
  });
});

// ---------------------------------------------------------------------------
// Share token edge cases
// ---------------------------------------------------------------------------

describe("share token edge cases", () => {
  it("returns existing token if project is already shared (idempotent)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: PROJECT_ID, share_token: SHARE_TOKEN }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("POST", `/projects/${PROJECT_ID}/share`, {
      headers: AUTH,
    });

    expect(res.status).toBe(200);
    expect((res.body as { share_token: string }).share_token).toBe(SHARE_TOKEN);

    // Should NOT have called UPDATE — token already exists
    const updateCalls = mockQuery.mock.calls.filter(
      (call) => typeof call[0] === "string" && call[0].includes("UPDATE"),
    );
    expect(updateCalls).toHaveLength(0);
  });

  it("rejects excessively long share token", async () => {
    const longToken = "x".repeat(65);
    const res = await makeRequest("GET", `/shared/${longToken}`);
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("Invalid");
  });

  it("returns 404 for nonexistent share token", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", "/shared/nonexistent-token");
    expect(res.status).toBe(404);
  });

  it("cannot share another user's project", async () => {
    const otherAuth = { Authorization: `Bearer ${authToken("user-2")}` };

    mockQuery.mockResolvedValueOnce({
      rows: [], // Ownership check fails — no project for user-2
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("POST", `/projects/${PROJECT_ID}/share`, {
      headers: otherAuth,
    });

    expect(res.status).toBe(404);
  });

  it("cannot revoke share on another user's project", async () => {
    const otherAuth = { Authorization: `Bearer ${authToken("user-2")}` };

    mockQuery.mockResolvedValueOnce({
      rows: [], // WHERE user_id=$2 doesn't match
      command: "UPDATE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("DELETE", `/projects/${PROJECT_ID}/share`, {
      headers: otherAuth,
    });

    expect(res.status).toBe(404);
  });

  it("shared project includes BOM with pricing details", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [SHARED_PROJECT],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    mockQuery.mockResolvedValueOnce({
      rows: BOM_DATA,
      command: "SELECT",
      rowCount: 2,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", `/shared/${SHARE_TOKEN}`);

    expect(res.status).toBe(200);
    const body = res.body as typeof SHARED_PROJECT & { bom: typeof BOM_DATA };
    expect(body.bom).toHaveLength(2);
    // Verify pricing data is included
    expect(parseFloat(body.bom[0].unit_price)).toBeGreaterThan(0);
    expect(parseFloat(body.bom[0].total)).toBeGreaterThan(0);
    expect(body.bom[0].supplier_name).toBeTruthy();
    // Verify stock info is included
    expect(body.bom[0].in_stock).toBe(true);
    expect(body.bom[1].in_stock).toBe(false);
  });

  it("shared project with empty BOM returns empty array", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [SHARED_PROJECT],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", `/shared/${SHARE_TOKEN}`);

    expect(res.status).toBe(200);
    expect((res.body as { bom: unknown[] }).bom).toEqual([]);
  });

  it("sharing requires authentication", async () => {
    const res = await makeRequest("POST", `/projects/${PROJECT_ID}/share`);
    expect(res.status).toBe(401);
  });

  it("revoking share requires authentication", async () => {
    const res = await makeRequest("DELETE", `/projects/${PROJECT_ID}/share`);
    expect(res.status).toBe(401);
  });
});
