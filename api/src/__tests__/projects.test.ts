/**
 * API Route Unit Tests for Project Authorization Boundaries and Input Validation
 *
 * These tests exercise the project routes (and related shared endpoints)
 * by importing the full Express app with the database layer mocked out.
 * They verify authorization boundaries, input validation, and edge cases
 * that cannot be caught by the structural tests in api.test.ts.
 *
 * Uses Node http.request against the Express app — no supertest dependency.
 */

// Prevent the imported app from calling app.listen() on a fixed port
// (it checks IS_TEST but doesn't guard listen — we listen on :0 ourselves)
process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

// Mock the database module BEFORE any app import
vi.mock("../db", () => ({
  query: vi.fn().mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] }),
  pool: { query: vi.fn() },
}));

// Mock email to avoid Resend initialization
vi.mock("../email", () => ({
  sendEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendPriceAlertEmail: vi.fn(),
}));

// Import after mocks are set up
import { query } from "../db";
import { sendEmail } from "../email";
const mockQuery = vi.mocked(query);
const mockSendEmail = vi.mocked(sendEmail);

// Import the express app
import app from "../index";

// Helper: create a JWT auth token
function authToken(userId = "user-1", role = "user") {
  return jwt.sign(
    { id: userId, email: "test@test.com", role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Helper: make HTTP requests against the Express app without supertest
function makeRequest(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {}
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

beforeEach(() => {
  vi.clearAllMocks();
  // Reset default mock to return empty results
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
  mockSendEmail.mockResolvedValue(true);
});

// --------------------------------------------------------------------------
// POST /projects — create
// --------------------------------------------------------------------------

describe("POST /projects", () => {
  it("rejects request without auth", async () => {
    const res = await makeRequest("POST", "/projects", {
      body: { name: "Test" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects empty project name", async () => {
    const res = await makeRequest("POST", "/projects", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { name: "" },
    });
    expect(res.status).toBe(400);
  });

  it("rejects project name > 200 characters", async () => {
    const longName = "A".repeat(201);
    const res = await makeRequest("POST", "/projects", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { name: longName },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("200");
  });

  it("creates a project with valid data", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", name: "My House", user_id: "user-1" }],
      command: "INSERT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("POST", "/projects", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { name: "My House", description: "A test house" },
    });
    expect(res.status).toBe(201);
    expect((res.body as { name: string }).name).toBe("My House");
  });

  it("rejects non-string project name", async () => {
    const res = await makeRequest("POST", "/projects", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { name: 12345 },
    });
    expect(res.status).toBe(400);
  });
});

// --------------------------------------------------------------------------
// GET /projects/:id — read single project (cross-user boundary)
// --------------------------------------------------------------------------

describe("GET /projects/:id", () => {
  it("rejects request without auth", async () => {
    const res = await makeRequest("GET", "/projects/proj-1");
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-existent project", async () => {
    // First query returns no rows (project not found for this user)
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", "/projects/nonexistent", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when user-2 tries to access user-1's project (cross-user boundary)", async () => {
    // SQL has AND user_id=$2 — returns empty for wrong user
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", "/projects/proj-1", {
      headers: { Authorization: `Bearer ${authToken("user-2")}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns project with BOM for the owner", async () => {
    // Project fetch
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", name: "My House", user_id: "user-1", scene_js: "" }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // BOM fetch
    mockQuery.mockResolvedValueOnce({
      rows: [{ material_id: "pine_48x98_c24", quantity: 10, material_name: "Pine 48x98" }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", "/projects/proj-1", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as { name: string; bom: unknown[] };
    expect(body.name).toBe("My House");
    expect(body.bom).toHaveLength(1);
  });
});

// --------------------------------------------------------------------------
// Project version history
// --------------------------------------------------------------------------

describe("project version history", () => {
  const snapshot = {
    name: "Roof option",
    description: "New roof",
    scene_js: "scene.add(box(1,1,1));",
    bom: [{ material_id: "roof_tile", quantity: 12, unit: "m2" }],
  };

  it("creates a named project version on the default branch", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "proj-1" }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "11111111-1111-1111-1111-111111111111", name: "Main", is_default: true }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({
        rows: [{
          id: "22222222-2222-2222-2222-222222222222",
          branch_id: "11111111-1111-1111-1111-111111111111",
          name: "Option A",
          event_type: "named",
          snapshot,
        }],
      } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("POST", "/projects/proj-1/versions", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
      body: { snapshot, name: "Option A", event_type: "named" },
    });

    expect(res.status).toBe(201);
    const body = res.body as { version: { name: string; event_type: string } };
    expect(body.version.name).toBe("Option A");
    expect(body.version.event_type).toBe("named");
  });

  it("lists branches and versions for an owned project", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "proj-1" }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "branch-1", name: "Main", is_default: true }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "branch-1", name: "Main", is_default: true }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "v1", branch_id: "branch-1", event_type: "auto", delta: {} }] } as never);

    const res = await makeRequest("GET", "/projects/proj-1/versions", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { branches: unknown[]; versions: unknown[] };
    expect(body.branches).toHaveLength(1);
    expect(body.versions).toHaveLength(1);
  });

  it("restores a version and records the restore as a new version", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "22222222-2222-2222-2222-222222222222",
          branch_id: "11111111-1111-1111-1111-111111111111",
          name: "Option A",
          snapshot,
          thumbnail_url: null,
        }],
      } as never)
      .mockResolvedValueOnce({ rows: [{ id: "proj-1", name: snapshot.name }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "roof_tile" }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "latest", snapshot: { ...snapshot, name: "Before" } }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "restore-1", event_type: "restore", snapshot }] } as never)
      .mockResolvedValueOnce({ rows: [] } as never);

    const res = await makeRequest("POST", "/projects/proj-1/versions/22222222-2222-2222-2222-222222222222/restore", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { snapshot: typeof snapshot; version: { event_type: string } };
    expect(body.snapshot.name).toBe("Roof option");
    expect(body.version.event_type).toBe("restore");
  });

  it("compares two versions with material and cost deltas", async () => {
    const base = { ...snapshot, bom: [{ material_id: "roof_tile", quantity: 10, unit: "m2" }] };
    const target = { ...snapshot, scene_js: "scene.add(box(2,1,1));", bom: [{ material_id: "roof_tile", quantity: 14, unit: "m2" }] };
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: "11111111-1111-1111-1111-111111111111", name: "Base", created_at: "2026-04-22T00:00:00.000Z", snapshot: base },
          { id: "22222222-2222-2222-2222-222222222222", name: "Target", created_at: "2026-04-22T00:01:00.000Z", snapshot: target },
        ],
      } as never)
      .mockResolvedValueOnce({ rows: [{ id: "roof_tile", unit_price: 20, waste_factor: 1.05 }] } as never)
      .mockResolvedValueOnce({ rows: [{ id: "roof_tile", unit_price: 20, waste_factor: 1.05 }] } as never);

    const res = await makeRequest(
      "GET",
      "/projects/proj-1/versions/compare?base=11111111-1111-1111-1111-111111111111&target=22222222-2222-2222-2222-222222222222",
      { headers: { Authorization: `Bearer ${authToken("user-1")}` } },
    );

    expect(res.status).toBe(200);
    const body = res.body as { delta: { changedFields: string[]; bom: { quantityChanged: number } }; cost_delta: number };
    expect(body.delta.changedFields).toContain("scene_js");
    expect(body.delta.changedFields).toContain("bom");
    expect(body.delta.bom.quantityChanged).toBe(1);
    expect(body.cost_delta).toBe(84);
  });
});

// --------------------------------------------------------------------------
// POST /projects/:id/quote-request — homeowner contractor lead
// --------------------------------------------------------------------------

describe("POST /projects/:id/quote-request", () => {
  it("stores the request and emails the homeowner a PDF BOM summary", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: "proj-1", name: "Kitchen Reno", description: "Helsinki kitchen", user_id: "user-1" }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{
          material_id: "pine_48x98_c24",
          material_name: "Pine 48x98",
          quantity: 10,
          unit: "jm",
          unit_price: 3.2,
          line_cost: 32,
          supplier_name: "K-Rauta",
        }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({
        rows: [{ id: "quote-1", status: "submitted", created_at: "2026-04-21T10:00:00Z" }],
        command: "INSERT",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

    const res = await makeRequest("POST", "/projects/proj-1/quote-request", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
      body: {
        contact_name: "Matti Meikalainen",
        contact_email: "matti@example.com",
        contact_phone: "+358401234567",
        postcode: "00100",
        work_scope: "Kitchen renovation and cabinet installation",
        locale: "en",
      },
    });

    expect(res.status).toBe(201);
    expect((res.body as { id: string; bom_line_count: number }).id).toBe("quote-1");
    expect((res.body as { bom_line_count: number }).bom_line_count).toBe(1);
    expect(mockQuery.mock.calls[2][0]).toContain("INSERT INTO quote_requests");
    expect(mockQuery.mock.calls[2][1]).toEqual(expect.arrayContaining([
      "proj-1",
      "user-1",
      "Matti Meikalainen",
      "matti@example.com",
      "00100",
    ]));
    expect(mockSendEmail).toHaveBeenCalledOnce();
    const emailArgs = mockSendEmail.mock.calls[0];
    expect(emailArgs[0]).toBe("matti@example.com");
    expect(emailArgs[1]).toContain("quote request");
    expect(emailArgs[3]?.[0]).toMatchObject({
      filename: expect.stringContaining("helscoop_quote_Kitchen_Reno"),
      contentType: "application/pdf",
    });
  });

  it("rejects quote requests for empty BOMs", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: "proj-1", name: "Empty Project", user_id: "user-1" }],
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

    const res = await makeRequest("POST", "/projects/proj-1/quote-request", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
      body: {
        contact_name: "Matti Meikalainen",
        contact_email: "matti@example.com",
        postcode: "00100",
        work_scope: "Please quote this work",
      },
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("empty BOM");
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});

// --------------------------------------------------------------------------
// PUT /projects/:id — update
// --------------------------------------------------------------------------

describe("PUT /projects/:id", () => {
  it("rejects request without auth", async () => {
    const res = await makeRequest("PUT", "/projects/proj-1", {
      body: { name: "Updated" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects project name > 200 characters on update", async () => {
    const res = await makeRequest("PUT", "/projects/proj-1", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { name: "B".repeat(201) },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("200");
  });

  it("returns 404 when updating another user's project", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "UPDATE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("PUT", "/projects/proj-1", {
      headers: { Authorization: `Bearer ${authToken("user-2")}` },
      body: { name: "Hacked", description: "", scene_js: "" },
    });
    expect(res.status).toBe(404);
  });

  it("persists household deduction couple mode", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", household_deduction_joint: true }],
      command: "UPDATE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("PUT", "/projects/proj-1", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
      body: { household_deduction_joint: true },
    });

    expect(res.status).toBe(200);
    expect((res.body as { household_deduction_joint: boolean }).household_deduction_joint).toBe(true);
    expect(mockQuery.mock.calls[0][0]).toContain("household_deduction_joint=COALESCE");
    expect(mockQuery.mock.calls[0][1]).toEqual([undefined, undefined, undefined, true, "proj-1", "user-1"]);
  });
});

// --------------------------------------------------------------------------
// DELETE /projects/:id
// --------------------------------------------------------------------------

describe("DELETE /projects/:id", () => {
  it("rejects request without auth", async () => {
    const res = await makeRequest("DELETE", "/projects/proj-1");
    expect(res.status).toBe(401);
  });

  it("deletes a project (returns ok)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "DELETE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("DELETE", "/projects/proj-1", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
    });
    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });
});

// --------------------------------------------------------------------------
// PUT /projects/:id/bom — BOM update
// --------------------------------------------------------------------------

describe("PUT /projects/:id/bom", () => {
  it("rejects non-array items", async () => {
    const res = await makeRequest("PUT", "/projects/proj-1/bom", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { items: "not-an-array" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("array");
  });

  it("rejects request without auth", async () => {
    const res = await makeRequest("PUT", "/projects/proj-1/bom", {
      body: { items: [] },
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-owned project", async () => {
    // Project ownership check returns empty
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("PUT", "/projects/proj-1/bom", {
      headers: { Authorization: `Bearer ${authToken("user-2")}` },
      body: { items: [{ material_id: "pine_48x98_c24", quantity: 5 }] },
    });
    expect(res.status).toBe(404);
  });

  it("skips unknown material IDs gracefully", async () => {
    // Project ownership check
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1" }],
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
    // Material existence check — not found
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("PUT", "/projects/proj-1/bom", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
      body: { items: [{ material_id: "nonexistent_material", quantity: 5 }] },
    });
    expect(res.status).toBe(200);
    const body = res.body as { ok: boolean; count: number; skipped: number };
    expect(body.ok).toBe(true);
    expect(body.count).toBe(0);
    expect(body.skipped).toBe(1);
  });
});

// --------------------------------------------------------------------------
// POST /projects/:id/share — share token
// --------------------------------------------------------------------------

describe("POST /projects/:id/share", () => {
  it("rejects request without auth", async () => {
    const res = await makeRequest("POST", "/projects/proj-1/share");
    expect(res.status).toBe(401);
  });

  it("returns 404 for non-owned project", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("POST", "/projects/proj-1/share", {
      headers: { Authorization: `Bearer ${authToken("user-2")}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns existing share token if already shared (idempotent)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", share_token: "existing-token-123" }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("POST", "/projects/proj-1/share", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
    });
    expect(res.status).toBe(200);
    expect((res.body as { share_token: string }).share_token).toBe("existing-token-123");
  });

  it("generates a new share token when not already shared", async () => {
    // Project lookup — no existing token
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", share_token: null }],
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

    const res = await makeRequest("POST", "/projects/proj-1/share", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
    });
    expect(res.status).toBe(200);
    expect((res.body as { share_token: string }).share_token).toBeTruthy();
  });
});

// --------------------------------------------------------------------------
// DELETE /projects/:id/share — revoke share
// --------------------------------------------------------------------------

describe("DELETE /projects/:id/share", () => {
  it("returns 404 for non-owned project", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "UPDATE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("DELETE", "/projects/proj-1/share", {
      headers: { Authorization: `Bearer ${authToken("user-2")}` },
    });
    expect(res.status).toBe(404);
  });

  it("removes share token successfully", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1" }],
      command: "UPDATE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("DELETE", "/projects/proj-1/share", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
    });
    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
  });
});

// --------------------------------------------------------------------------
// PUT /projects/:id/thumbnail — thumbnail upload
// --------------------------------------------------------------------------

describe("PUT /projects/:id/thumbnail", () => {
  it("rejects missing thumbnail", async () => {
    const res = await makeRequest("PUT", "/projects/proj-1/thumbnail", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {},
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("thumbnail");
  });

  it("rejects non-string thumbnail", async () => {
    const res = await makeRequest("PUT", "/projects/proj-1/thumbnail", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { thumbnail: 12345 },
    });
    expect(res.status).toBe(400);
  });

  it("rejects thumbnail > 200KB", async () => {
    const largeThumbnail = "data:image/png;base64," + "A".repeat(200 * 1024 + 1);
    const res = await makeRequest("PUT", "/projects/proj-1/thumbnail", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { thumbnail: largeThumbnail },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("large");
  });

  it("returns 404 for non-owned project", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "UPDATE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("PUT", "/projects/proj-1/thumbnail", {
      headers: { Authorization: `Bearer ${authToken("user-2")}` },
      body: { thumbnail: "data:image/png;base64,abc123" },
    });
    expect(res.status).toBe(404);
  });
});

// --------------------------------------------------------------------------
// GET /shared/:token — public shared project (no auth required)
// --------------------------------------------------------------------------

describe("GET /shared/:token", () => {
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

  it("returns 400 for empty/invalid token", async () => {
    const res = await makeRequest("GET", "/shared/" + "x".repeat(65));
    expect(res.status).toBe(400);
  });

  it("returns project data without auth for valid token", async () => {
    // Project by share token
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1", name: "Shared House", scene_js: "box(1,1,1);", view_count: 2 }],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // Shared view insert
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "view-1" }],
      command: "INSERT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });
    // BOM for shared project
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", "/shared/valid-share-token-123", {
      headers: { referer: "https://contractor.example/link" },
    });
    expect(res.status).toBe(200);
    expect((res.body as { name: string }).name).toBe("Shared House");
    expect(mockQuery.mock.calls[1][0]).toContain("INSERT INTO project_views");
    expect(mockQuery.mock.calls[1][0]).toContain("NOT EXISTS");
    expect(mockQuery.mock.calls[1][1]).toEqual(expect.arrayContaining(["proj-1", "https://contractor.example/link"]));
  });
});

// --------------------------------------------------------------------------
// GET /auth/unsubscribe/:token — public digest opt-out
// --------------------------------------------------------------------------

describe("GET /auth/unsubscribe/:token", () => {
  it("turns off activity digest emails for a valid token", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1" }],
      command: "UPDATE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", "/auth/unsubscribe/unsub-token-123");
    expect(res.status).toBe(200);
    expect(String(res.body)).toContain("unsubscribed");
    expect(mockQuery.mock.calls[0][0]).toContain("email_notifications = false");
    expect(mockQuery.mock.calls[0][1]).toEqual(["unsub-token-123"]);
  });
});

// --------------------------------------------------------------------------
// Health check
// --------------------------------------------------------------------------

describe("GET /health", () => {
  it("returns status ok without auth", async () => {
    const res = await makeRequest("GET", "/health");
    expect(res.status).toBe(200);
    expect((res.body as { status: string }).status).toBe("ok");
  });
});
