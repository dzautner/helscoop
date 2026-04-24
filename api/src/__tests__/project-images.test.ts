process.env.NODE_ENV = "test";
process.env.PROJECT_IMAGE_STORAGE_DIR = `/tmp/helscoop-project-images-test-${Date.now()}`;

import { describe, it, expect, vi, beforeEach } from "vitest";
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

vi.mock("../audit", () => ({
  logAuditEvent: vi.fn(),
}));

import { query } from "../db";
import { logAuditEvent } from "../audit";
import app from "../index";

const mockQuery = vi.mocked(query);
const mockLogAuditEvent = vi.mocked(logAuditEvent);

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

function authToken(userId = "user-1", role = "homeowner") {
  return jwt.sign(
    { id: userId, email: "test@test.com", role },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function multipartImageBody(boundary: string, filename = "house.png") {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\nContent-Type: image/png\r\n\r\n`),
    tinyPng,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

function makeRequest(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown; rawBody?: Buffer } = {},
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
      const reqBody = opts.rawBody ?? (bodyStr ? Buffer.from(bodyStr) : undefined);
      const reqOpts: http.RequestOptions = {
        hostname: "127.0.0.1",
        port,
        path,
        method: method.toUpperCase(),
        headers: {
          "Content-Type": "application/json",
          ...(reqBody ? { "Content-Length": reqBody.length } : {}),
          ...opts.headers,
        },
      };

      const req = http.request(reqOpts, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on("end", () => {
          server.close();
          const data = Buffer.concat(chunks).toString("utf8");
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

      if (reqBody) req.write(reqBody);
      req.end();
    });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
});

describe("project reference image routes", () => {
  it("lists private project images for the owner", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "proj-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: "img-1",
          project_id: "proj-1",
          original_filename: "house.jpg",
          content_type: "image/jpeg",
          byte_size: 1234,
          width: 800,
          height: 600,
          uploaded_at: "2026-04-24T12:00:00Z",
          storage_key: "proj-1/img-1/original.jpg",
          thumbnail_200_key: "proj-1/img-1/thumb_200.jpg",
          thumbnail_800_key: "proj-1/img-1/thumb_800.jpg",
        }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

    const res = await makeRequest("GET", "/projects/proj-1/images", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
    });

    expect(res.status).toBe(200);
    expect((res.body as { images: Array<{ urls: { thumb_200: string } }> }).images[0].urls.thumb_200)
      .toBe("/projects/proj-1/images/img-1/assets/thumb200");
  });

  it("uploads an image, strips metadata by re-encoding, and creates thumbnails", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "proj-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }], command: "SELECT", rowCount: 1, oid: 0, fields: [] })
      .mockImplementationOnce(async (_sql, params) => ({
        rows: [{
          id: params?.[0],
          project_id: params?.[1],
          original_filename: params?.[6],
          content_type: params?.[7],
          byte_size: params?.[8],
          width: params?.[9],
          height: params?.[10],
          uploaded_at: "2026-04-24T12:00:00Z",
          storage_key: params?.[3],
          thumbnail_200_key: params?.[4],
          thumbnail_800_key: params?.[5],
        }],
        command: "INSERT",
        rowCount: 1,
        oid: 0,
        fields: [],
      }));

    const boundary = "----helscoop-test-boundary";
    const res = await makeRequest("POST", "/projects/proj-1/images", {
      headers: {
        Authorization: `Bearer ${authToken("user-1")}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      rawBody: multipartImageBody(boundary),
    });

    expect(res.status).toBe(201);
    const image = (res.body as { image: { content_type: string; byte_size: number; urls: { thumb_800: string } } }).image;
    expect(image.content_type).toBe("image/jpeg");
    expect(image.byte_size).toBeGreaterThan(0);
    expect(image.urls.thumb_800).toContain("/assets/thumb800");
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      "user-1",
      "project_image.uploaded",
      expect.objectContaining({ targetId: "proj-1", originalFilename: "house.png" }),
    );
  });

  it("enforces the 10 image project limit", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "proj-1" }], command: "SELECT", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [{ count: 10 }], command: "SELECT", rowCount: 1, oid: 0, fields: [] });

    const boundary = "----helscoop-test-boundary";
    const res = await makeRequest("POST", "/projects/proj-1/images", {
      headers: {
        Authorization: `Bearer ${authToken("user-1")}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      rawBody: multipartImageBody(boundary),
    });

    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("at most 10");
  });

  it("deletes image metadata and private objects", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: "img-1",
          project_id: "proj-1",
          original_filename: "house.jpg",
          content_type: "image/jpeg",
          byte_size: 1234,
          width: 800,
          height: 600,
          uploaded_at: "2026-04-24T12:00:00Z",
          storage_key: "proj-1/img-1/original.jpg",
          thumbnail_200_key: "proj-1/img-1/thumb_200.jpg",
          thumbnail_800_key: "proj-1/img-1/thumb_800.jpg",
        }],
        command: "SELECT",
        rowCount: 1,
        oid: 0,
        fields: [],
      })
      .mockResolvedValueOnce({ rows: [], command: "DELETE", rowCount: 1, oid: 0, fields: [] });

    const res = await makeRequest("DELETE", "/projects/proj-1/images/img-1", {
      headers: { Authorization: `Bearer ${authToken("user-1")}` },
    });

    expect(res.status).toBe(200);
    expect((res.body as { ok: boolean }).ok).toBe(true);
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      "user-1",
      "project_image.deleted",
      expect.objectContaining({ targetId: "proj-1", imageId: "img-1" }),
    );
  });
});
