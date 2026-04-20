/**
 * Unit and integration tests for the compliance export audit trail.
 *
 * Tests cover:
 *   - The audit helper functions (hashArtifact, createAuditLog)
 *   - The /audit REST endpoints (auth, authorization, pagination)
 *
 * All tests run without a real database — the db module is mocked.
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";
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

import { query } from "../db";
const mockQuery = vi.mocked(query);

import {
  hashArtifact,
  createAuditLog,
  logAuditEvent,
} from "../audit";

import app from "../index";

// ---------------------------------------------------------------------------
// Helper: create a JWT auth token
// ---------------------------------------------------------------------------
function authToken(userId = "user-1", role = "admin") {
  return jwt.sign(
    { id: userId, email: "test@helscoop.fi", role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ---------------------------------------------------------------------------
// Helper: make HTTP requests against the Express app
// ---------------------------------------------------------------------------
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
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
});

// ---------------------------------------------------------------------------
// 1. hashArtifact
// ---------------------------------------------------------------------------
describe("hashArtifact", () => {
  it("returns a 64-character hex SHA-256 hash for a string", () => {
    const hash = hashArtifact("hello world");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a 64-character hex SHA-256 hash for a Buffer", () => {
    const hash = hashArtifact(Buffer.from("hello world"));
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same hash for string and Buffer with same content", () => {
    const content = "test content for hashing";
    expect(hashArtifact(content)).toBe(hashArtifact(Buffer.from(content)));
  });

  it("produces different hashes for different content", () => {
    expect(hashArtifact("content A")).not.toBe(hashArtifact("content B"));
  });

  it("produces the known SHA-256 for an empty string", () => {
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(hashArtifact("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
    );
  });
});

// ---------------------------------------------------------------------------
// 2. createAuditLog
// ---------------------------------------------------------------------------
describe("createAuditLog", () => {
  it("inserts a row into audit_logs and returns it", async () => {
    const fakeRow = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      user_id: "user-1",
      project_id: "proj-1",
      action: "export_pdf",
      artifact_type: "pdf_quote",
      artifact_hash: "abc123",
      source_snapshot: {},
      metadata: {},
      created_at: new Date().toISOString(),
    };
    mockQuery.mockResolvedValueOnce({ rows: [fakeRow] } as any);

    const result = await createAuditLog(
      "user-1",
      "proj-1",
      "export_pdf",
      "pdf_quote",
      "abc123",
      {},
      {}
    );

    expect(result).toEqual(fakeRow);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_logs"),
      expect.arrayContaining(["user-1", "proj-1", "export_pdf", "pdf_quote", "abc123"])
    );
  });

  it("returns null gracefully when the table does not exist", async () => {
    mockQuery.mockImplementationOnce(() => {
      throw new Error('relation "audit_logs" does not exist');
    });

    const result = await createAuditLog("user-1", null, "export_csv", null, null);
    expect(result).toBeNull();
  });

  it("accepts null project_id", async () => {
    const fakeRow = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      user_id: "user-1",
      project_id: null,
      action: "account.delete",
      artifact_type: null,
      artifact_hash: null,
      source_snapshot: {},
      metadata: {},
      created_at: new Date().toISOString(),
    };
    mockQuery.mockResolvedValueOnce({ rows: [fakeRow] } as any);

    const result = await createAuditLog("user-1", null, "account.delete", null, null);
    expect(result).not.toBeNull();
    expect(result!.project_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. logAuditEvent (structured logger — backwards compat)
// ---------------------------------------------------------------------------
describe("logAuditEvent", () => {
  it("does not throw and completes synchronously", () => {
    expect(() => logAuditEvent("u1", "test.action", { ip: "127.0.0.1" })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 4. GET /audit/logs — admin list
// ---------------------------------------------------------------------------
describe("GET /audit/logs", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("GET", "/audit/logs");
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users", async () => {
    const token = authToken("user-1", "homeowner");
    const res = await makeRequest("GET", "/audit/logs", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("returns paginated audit logs for admin", async () => {
    const fakeLogs = [
      {
        id: "log-1",
        user_id: "user-1",
        project_id: "proj-1",
        action: "export_pdf",
        artifact_type: "pdf_quote",
        artifact_hash: "abc",
        source_snapshot: {},
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ];

    // First call: SELECT * FROM audit_logs ... LIMIT/OFFSET
    // Second call: SELECT COUNT(*)
    mockQuery
      .mockResolvedValueOnce({ rows: fakeLogs } as any)
      .mockResolvedValueOnce({ rows: [{ total: "1" }] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/audit/logs?limit=10&offset=0", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { logs: unknown[]; total: number };
    expect(body.logs).toHaveLength(1);
    expect(body.total).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 5. GET /audit/logs/:id — single entry
// ---------------------------------------------------------------------------
describe("GET /audit/logs/:id", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("GET", "/audit/logs/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(res.status).toBe(401);
  });

  it("rejects invalid UUID format", async () => {
    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/audit/logs/not-a-uuid", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent audit log", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/audit/logs/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns the audit log entry for admin", async () => {
    const fakeLog = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      user_id: "user-1",
      project_id: "proj-1",
      action: "export_pdf",
      artifact_type: "pdf_quote",
      artifact_hash: "abc",
      source_snapshot: { bom: [] },
      metadata: { format: "A4" },
      created_at: new Date().toISOString(),
    };
    mockQuery.mockResolvedValueOnce({ rows: [fakeLog] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", "/audit/logs/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect((res.body as any).id).toBe(fakeLog.id);
    expect((res.body as any).source_snapshot).toEqual({ bom: [] });
  });
});

// ---------------------------------------------------------------------------
// 6. GET /audit/project/:projectId — project-scoped logs
// ---------------------------------------------------------------------------
describe("GET /audit/project/:projectId", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("GET", "/audit/project/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(res.status).toBe(401);
  });

  it("rejects invalid project ID format", async () => {
    const token = authToken("user-1", "homeowner");
    const res = await makeRequest("GET", "/audit/project/bad-id", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for non-existent project (non-admin)", async () => {
    // Project lookup returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] } as any);

    const token = authToken("user-1", "homeowner");
    const res = await makeRequest("GET", "/audit/project/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 when non-admin requests another user's project", async () => {
    // Project belongs to a different user
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: "other-user" }] } as any);

    const token = authToken("user-1", "homeowner");
    const res = await makeRequest("GET", "/audit/project/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  it("returns audit logs for project owner", async () => {
    const projectId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    // 1st call: project ownership check
    mockQuery.mockResolvedValueOnce({ rows: [{ user_id: "user-1" }] } as any);
    // 2nd call: audit logs
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "log-1", action: "export_pdf", project_id: projectId }],
    } as any);
    // 3rd call: count
    mockQuery.mockResolvedValueOnce({ rows: [{ total: "1" }] } as any);

    const token = authToken("user-1", "homeowner");
    const res = await makeRequest("GET", `/audit/project/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = res.body as { logs: unknown[]; total: number };
    expect(body.logs).toHaveLength(1);
    expect(body.total).toBe(1);
  });

  it("admin can access any project's audit logs without ownership check", async () => {
    const projectId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

    // Admin skips ownership check — goes straight to audit logs query
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ id: "log-1", action: "generate_quote", project_id: projectId }],
      } as any)
      .mockResolvedValueOnce({ rows: [{ total: "1" }] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("GET", `/audit/project/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    expect((res.body as any).logs).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 7. POST /audit/log — create audit entry
// ---------------------------------------------------------------------------
describe("POST /audit/log", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await makeRequest("POST", "/audit/log", {
      body: { action: "export_pdf" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects non-admin users", async () => {
    const token = authToken("user-1", "homeowner");
    const res = await makeRequest("POST", "/audit/log", {
      headers: { Authorization: `Bearer ${token}` },
      body: { action: "export_pdf" },
    });
    expect(res.status).toBe(403);
  });

  it("rejects requests without action", async () => {
    const token = authToken("admin-1", "admin");
    const res = await makeRequest("POST", "/audit/log", {
      headers: { Authorization: `Bearer ${token}` },
      body: {},
    });
    expect(res.status).toBe(400);
    expect((res.body as any).error).toContain("action");
  });

  it("creates audit log entry for admin", async () => {
    const fakeLog = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      user_id: "admin-1",
      project_id: "proj-1",
      action: "export_pdf",
      artifact_type: "pdf_quote",
      artifact_hash: "def456",
      source_snapshot: { items: [1, 2, 3] },
      metadata: { format: "A4" },
      created_at: new Date().toISOString(),
    };
    mockQuery.mockResolvedValueOnce({ rows: [fakeLog] } as any);

    const token = authToken("admin-1", "admin");
    const res = await makeRequest("POST", "/audit/log", {
      headers: { Authorization: `Bearer ${token}` },
      body: {
        projectId: "proj-1",
        action: "export_pdf",
        artifactType: "pdf_quote",
        artifactHash: "def456",
        sourceSnapshot: { items: [1, 2, 3] },
        metadata: { format: "A4" },
      },
    });

    expect(res.status).toBe(201);
    expect((res.body as any).id).toBe(fakeLog.id);
    expect((res.body as any).action).toBe("export_pdf");
  });
});
