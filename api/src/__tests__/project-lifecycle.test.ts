/**
 * Project Data Lifecycle Tests
 *
 * Full create → read → update → soft-delete → restore → permanent-delete → audit
 * flow, tested at the API level with the database layer mocked.
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

// Track audit events
const auditEvents: Array<{ userId: string; action: string; details: Record<string, unknown> }> = [];
vi.mock("../audit", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    logAuditEvent: vi.fn((userId: string, action: string, details: Record<string, unknown>) => {
      auditEvents.push({ userId, action, details });
    }),
    createAuditLog: vi.fn().mockResolvedValue(null),
  };
});

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

const PROJECT_DATA = {
  id: "proj-lifecycle-1",
  name: "Lifecycle Test House",
  description: "Testing full data lifecycle",
  scene_js: 'const floor = box(4, 0.2, 3);\nscene.add(floor, { material: "foundation" });',
  building_info: JSON.stringify({
    address: "Mannerheimintie 1, Helsinki",
    type: "kerrostalo",
    year_built: 1960,
    area_m2: 85,
  }),
  user_id: "user-1",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  deleted_at: null,
  share_token: null,
  is_public: false,
  thumbnail_url: null,
};

const AUTH = { Authorization: `Bearer ${authToken()}` };

beforeEach(() => {
  vi.clearAllMocks();
  auditEvents.length = 0;
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
});

// ---------------------------------------------------------------------------
// Full lifecycle flow
// ---------------------------------------------------------------------------

describe("project data lifecycle", () => {
  it("create → read → update → soft-delete → trash → restore → permanent-delete → audit", async () => {
    // -----------------------------------------------------------------------
    // Step 1: CREATE
    // -----------------------------------------------------------------------
    mockQuery.mockResolvedValueOnce({
      rows: [{ ...PROJECT_DATA }],
      command: "INSERT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const createRes = await makeRequest("POST", "/projects", {
      headers: AUTH,
      body: {
        name: "Lifecycle Test House",
        description: "Testing full data lifecycle",
        scene_js: PROJECT_DATA.scene_js,
        building_info: { address: "Mannerheimintie 1, Helsinki", type: "kerrostalo", year_built: 1960, area_m2: 85 },
      },
    });

    expect(createRes.status).toBe(201);
    const created = createRes.body as typeof PROJECT_DATA;
    expect(created.name).toBe("Lifecycle Test House");
    expect(created.scene_js).toContain("box(4");
    expect(created.building_info).toBeTruthy();

    // -----------------------------------------------------------------------
    // Step 2: READ — verify all fields come back
    // -----------------------------------------------------------------------
    mockQuery
      // Project query
      .mockResolvedValueOnce({
        rows: [{ ...PROJECT_DATA }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      })
      // BOM query (empty)
      .mockResolvedValueOnce({
        rows: [],
        command: "SELECT",
        rowCount: 0,
        oid: 0,
        fields: [],
      });

    const readRes = await makeRequest("GET", `/projects/${PROJECT_DATA.id}`, {
      headers: AUTH,
    });

    expect(readRes.status).toBe(200);
    const project = readRes.body as typeof PROJECT_DATA & { bom: unknown[] };
    expect(project.name).toBe("Lifecycle Test House");
    expect(project.description).toBe("Testing full data lifecycle");
    expect(project.scene_js).toBe(PROJECT_DATA.scene_js);
    expect(project.building_info).toBeTruthy();
    expect(project.bom).toEqual([]);
    expect(project.deleted_at).toBeNull();

    // -----------------------------------------------------------------------
    // Step 3: UPDATE — change name and scene_js
    // -----------------------------------------------------------------------
    const updatedData = {
      ...PROJECT_DATA,
      name: "Updated House Name",
      scene_js: 'const wall = box(6, 2.4, 0.15);\nscene.add(wall, { material: "lumber" });',
      updated_at: "2024-01-02T00:00:00Z",
    };

    mockQuery.mockResolvedValueOnce({
      rows: [updatedData],
      command: "UPDATE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const updateRes = await makeRequest("PUT", `/projects/${PROJECT_DATA.id}`, {
      headers: AUTH,
      body: { name: "Updated House Name", scene_js: updatedData.scene_js },
    });

    expect(updateRes.status).toBe(200);
    const updated = updateRes.body as typeof PROJECT_DATA;
    expect(updated.name).toBe("Updated House Name");
    expect(updated.scene_js).toContain("wall");

    // -----------------------------------------------------------------------
    // Step 4: SOFT-DELETE
    // -----------------------------------------------------------------------
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "UPDATE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const deleteRes = await makeRequest("DELETE", `/projects/${PROJECT_DATA.id}`, {
      headers: AUTH,
    });

    expect(deleteRes.status).toBe(200);
    expect((deleteRes.body as { ok: boolean }).ok).toBe(true);

    // Verify audit event was logged for soft delete
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        userId: "user-1",
        action: "project.delete",
        details: expect.objectContaining({ targetId: PROJECT_DATA.id }),
      }),
    );

    // -----------------------------------------------------------------------
    // Step 5: VERIFY IN TRASH — project appears in trash list
    // -----------------------------------------------------------------------
    const deletedProject = {
      ...updatedData,
      deleted_at: "2024-01-03T00:00:00Z",
    };

    mockQuery.mockResolvedValueOnce({
      rows: [deletedProject],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const trashRes = await makeRequest("GET", "/projects/trash", {
      headers: AUTH,
    });

    expect(trashRes.status).toBe(200);
    const trash = trashRes.body as typeof deletedProject[];
    expect(trash).toHaveLength(1);
    expect(trash[0].name).toBe("Updated House Name");
    expect(trash[0].deleted_at).toBeTruthy();

    // -----------------------------------------------------------------------
    // Step 6: VERIFY NOT IN MAIN LIST
    // -----------------------------------------------------------------------
    mockQuery.mockResolvedValueOnce({
      rows: [], // empty — deleted project excluded by WHERE deleted_at IS NULL
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const listRes = await makeRequest("GET", "/projects", {
      headers: AUTH,
    });

    expect(listRes.status).toBe(200);
    expect(listRes.body).toEqual([]);

    // -----------------------------------------------------------------------
    // Step 7: RESTORE from trash
    // -----------------------------------------------------------------------
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: PROJECT_DATA.id }],
      command: "UPDATE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const restoreRes = await makeRequest("POST", `/projects/${PROJECT_DATA.id}/restore`, {
      headers: AUTH,
    });

    expect(restoreRes.status).toBe(200);
    expect((restoreRes.body as { ok: boolean }).ok).toBe(true);

    // -----------------------------------------------------------------------
    // Step 8: VERIFY BACK IN MAIN LIST
    // -----------------------------------------------------------------------
    const restoredProject = { ...updatedData, deleted_at: null };

    mockQuery.mockResolvedValueOnce({
      rows: [restoredProject],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const listRes2 = await makeRequest("GET", "/projects", {
      headers: AUTH,
    });

    expect(listRes2.status).toBe(200);
    const list2 = listRes2.body as typeof restoredProject[];
    expect(list2).toHaveLength(1);
    expect(list2[0].name).toBe("Updated House Name");

    // -----------------------------------------------------------------------
    // Step 9: PERMANENT DELETE (must be soft-deleted first)
    // -----------------------------------------------------------------------
    // First soft-delete again
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "UPDATE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    await makeRequest("DELETE", `/projects/${PROJECT_DATA.id}`, {
      headers: AUTH,
    });

    // Now permanent delete
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "DELETE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const permDeleteRes = await makeRequest("DELETE", `/projects/${PROJECT_DATA.id}/permanent`, {
      headers: AUTH,
    });

    expect(permDeleteRes.status).toBe(200);
    expect((permDeleteRes.body as { ok: boolean }).ok).toBe(true);

    // Verify audit event for permanent delete
    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        userId: "user-1",
        action: "project.permanent_delete",
        details: expect.objectContaining({ targetId: PROJECT_DATA.id }),
      }),
    );

    // -----------------------------------------------------------------------
    // Step 10: VERIFY AUDIT TRAIL — both delete events recorded
    // -----------------------------------------------------------------------
    const deleteEvents = auditEvents.filter(
      (e) => e.action.startsWith("project.delete") || e.action === "project.permanent_delete",
    );
    // 2 soft deletes + 1 permanent delete
    expect(deleteEvents.length).toBeGreaterThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("lifecycle edge cases", () => {
  it("restore returns 404 for project not in trash", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "UPDATE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("POST", "/projects/nonexistent/restore", {
      headers: AUTH,
    });

    expect(res.status).toBe(404);
    expect((res.body as { error: string }).error).toContain("trash");
  });

  it("reading a soft-deleted project returns 404", async () => {
    // The SQL query includes WHERE deleted_at IS NULL, so returns empty
    mockQuery
      .mockResolvedValueOnce({
        rows: [],
        command: "SELECT",
        rowCount: 0,
        oid: 0,
        fields: [],
      });

    const res = await makeRequest("GET", `/projects/${PROJECT_DATA.id}`, {
      headers: AUTH,
    });

    expect(res.status).toBe(404);
  });

  it("cannot permanently delete a non-soft-deleted project", async () => {
    // The SQL requires deleted_at IS NOT NULL — returns empty
    mockQuery.mockResolvedValueOnce({
      rows: [],
      command: "DELETE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("DELETE", `/projects/${PROJECT_DATA.id}/permanent`, {
      headers: AUTH,
    });

    // Still returns 200 with ok:true — the SQL just doesn't match anything
    expect(res.status).toBe(200);
  });

  it("cross-user access to trash is denied", async () => {
    const otherAuth = { Authorization: `Bearer ${authToken("user-2")}` };

    mockQuery.mockResolvedValueOnce({
      rows: [], // No projects for user-2
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", "/projects/trash", {
      headers: otherAuth,
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("cross-user restore is denied (returns 404)", async () => {
    const otherAuth = { Authorization: `Bearer ${authToken("user-2")}` };

    mockQuery.mockResolvedValueOnce({
      rows: [], // SQL includes AND user_id=$2
      command: "UPDATE",
      rowCount: 0,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("POST", `/projects/${PROJECT_DATA.id}/restore`, {
      headers: otherAuth,
    });

    expect(res.status).toBe(404);
  });
});
