process.env.NODE_ENV = "test";

import { beforeEach, describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";
import { Duplex, Readable, Writable } from "stream";

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

function pgRows(rows: unknown[]) {
  return { rows, command: "", rowCount: rows.length, oid: 0, fields: [] };
}

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
    const bodyStr = opts.body ? JSON.stringify(opts.body) : "";
    let bodyPushed = false;
    const req = new Readable({
      read() {
        if (!bodyPushed) {
          bodyPushed = true;
          if (bodyStr) this.push(bodyStr);
        }
        this.push(null);
      },
    }) as Readable & {
      method?: string;
      url?: string;
      headers: Record<string, string>;
      socket?: Duplex & { remoteAddress?: string };
      connection?: Duplex & { remoteAddress?: string };
    };
    const normalizedHeaders = Object.fromEntries(
      Object.entries(opts.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value])
    );
    req.method = method.toUpperCase();
    req.url = path;
    req.headers = {
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(bodyStr)),
      ...normalizedHeaders,
    };
    const socket = new Duplex({
      read() {
        this.push(null);
      },
      write(_chunk, _encoding, callback) {
        callback();
      },
    }) as Duplex & { remoteAddress?: string };
    socket.remoteAddress = "127.0.0.1";
    req.socket = socket;
    req.connection = socket;

    const chunks: Buffer[] = [];
    const headers: Record<string, string | number | readonly string[]> = {};
    let resolved = false;
    let headersSent = false;

    const res = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
        callback();
      },
    }) as Writable & {
      statusCode: number;
      statusMessage: string;
      setHeader: (name: string, value: string | number | readonly string[]) => void;
      getHeader: (name: string) => string | number | readonly string[] | undefined;
      getHeaders: () => Record<string, string | number | readonly string[]>;
      removeHeader: (name: string) => void;
      writeHead: (statusCode: number, headers?: Record<string, string | number | readonly string[]>) => Writable;
      end: (chunk?: unknown, encoding?: BufferEncoding | (() => void), cb?: () => void) => Writable;
    };

    Object.defineProperty(res, "headersSent", { get: () => headersSent });
    res.statusCode = 200;
    res.statusMessage = "OK";
    res.setHeader = (name, value) => {
      headers[name.toLowerCase()] = value;
    };
    res.getHeader = (name) => headers[name.toLowerCase()];
    res.getHeaders = () => headers;
    res.removeHeader = (name) => {
      delete headers[name.toLowerCase()];
    };
    res.writeHead = (statusCode, extraHeaders) => {
      res.statusCode = statusCode;
      if (extraHeaders) {
        for (const [name, value] of Object.entries(extraHeaders)) {
          res.setHeader(name, value);
        }
      }
      headersSent = true;
      return res;
    };
    res.end = (chunk, encoding, cb) => {
      if (chunk !== undefined) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      headersSent = true;
      if (!resolved) {
        resolved = true;
        const raw = Buffer.concat(chunks).toString("utf8");
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
        resolve({ status: res.statusCode, body: parsed });
      }
      if (typeof encoding === "function") encoding();
      if (typeof cb === "function") cb();
      Writable.prototype.end.call(res);
      return res;
    };

    try {
      app.handle(req, res, (err) => {
        if (err) reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

const completeProject = {
  id: "project-1",
  name: "Sauna permit",
  description: "Renovate backyard sauna envelope",
  scene_js: "const floor = box(4, 0.2, 3);\nscene.add(floor, { material: \"foundation\" });",
  building_info: {
    address: "Testikatu 1",
    area_m2: 24,
    floors: 1,
    municipalityNumber: "091",
    permanentBuildingIdentifier: "103456789A",
  },
  permit_metadata: {
    municipalityNumber: "091",
    propertyIdentifier: "91-1-2-3",
    descriptionOfAction: "Renovate backyard sauna envelope",
    suomiFiAuthenticated: true,
  },
};

const bomRows = [
  {
    material_id: "pine_48x148_c24",
    material_name: "Pine C24",
    category_name: "Lumber",
    quantity: 20,
    unit: "jm",
  },
];

beforeEach(() => {
  delete process.env.RYHTI_SUBMISSION_MODE;
  delete process.env.RYHTI_API_BASE_URL;
  delete process.env.RYHTI_ACCESS_TOKEN;
  mockQuery.mockReset();
  mockQuery.mockResolvedValue(pgRows([]) as never);
});

describe("Ryhti routes", () => {
  it("requires authentication", async () => {
    const res = await makeRequest("GET", "/ryhti/projects/project-1/package");
    expect(res.status).toBe(401);
  });

  it("returns package validation for incomplete project metadata", async () => {
    mockQuery
      .mockResolvedValueOnce(pgRows([{ ...completeProject, building_info: {}, permit_metadata: {} }]) as never)
      .mockResolvedValueOnce(pgRows([]) as never)
      .mockResolvedValueOnce(pgRows([]) as never);

    const res = await makeRequest("GET", "/ryhti/projects/project-1/package", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(200);
    expect((res.body as { validation: { ready: boolean; summary: { errors: number } } }).validation.ready).toBe(false);
    expect((res.body as { validation: { summary: { errors: number } } }).validation.summary.errors).toBeGreaterThan(0);
  });

  it("merges and persists permit metadata", async () => {
    mockQuery
      .mockResolvedValueOnce(pgRows([{ ...completeProject, permit_metadata: { municipalityNumber: "091" } }]) as never)
      .mockResolvedValueOnce(pgRows([{ ...completeProject }]) as never)
      .mockResolvedValueOnce(pgRows(bomRows) as never)
      .mockResolvedValueOnce(pgRows([]) as never);

    const res = await makeRequest("PUT", "/ryhti/projects/project-1/metadata", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        metadata: {
          propertyIdentifier: "91-1-2-3",
          descriptionOfAction: "Renovate backyard sauna envelope",
          suomiFiAuthenticated: true,
          personalIdentityCode: "010101-123A",
        },
      },
    });

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls[1][1]?.[0]).toContain("propertyIdentifier");
    expect(mockQuery.mock.calls[1][1]?.[0]).not.toContain("personalIdentityCode");
    expect((res.body as { permitMetadata: { propertyIdentifier: string } }).permitMetadata.propertyIdentifier).toBe("91-1-2-3");
  });

  it("blocks submission when local Ryhti validation fails", async () => {
    mockQuery
      .mockResolvedValueOnce(pgRows([{ ...completeProject, building_info: {}, permit_metadata: {} }]) as never)
      .mockResolvedValueOnce(pgRows([]) as never);

    const res = await makeRequest("POST", "/ryhti/projects/project-1/submit", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(422);
    expect((res.body as { error: string }).error).toContain("not ready");
  });

  it("creates a trackable authority handoff submission in dry-run mode", async () => {
    mockQuery
      .mockResolvedValueOnce(pgRows([completeProject]) as never)
      .mockResolvedValueOnce(pgRows(bomRows) as never)
      .mockResolvedValueOnce(pgRows([{
        id: "submission-1",
        project_id: "project-1",
        mode: "dry_run",
        status: "ready_for_authority",
        permit_identifier: null,
        ryhti_tracking_id: "dry-ryhti-abc123",
        validation: {},
        payload: {},
        response: {},
        error: null,
        created_at: "2026-04-21T09:00:00.000Z",
        updated_at: "2026-04-21T09:00:00.000Z",
      }]) as never);

    const res = await makeRequest("POST", "/ryhti/projects/project-1/submit", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });

    expect(res.status).toBe(201);
    expect((res.body as { result: { mode: string; status: string; trackingId: string } }).result.mode).toBe("dry_run");
    expect((res.body as { result: { status: string } }).result.status).toBe("ready_for_authority");
    expect((res.body as { result: { trackingId: string } }).result.trackingId).toMatch(/^dry-ryhti-/);
  });
});
