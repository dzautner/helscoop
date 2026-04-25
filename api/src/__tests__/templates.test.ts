process.env.NODE_ENV = "test";

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

import { query } from "../db";
const mockQuery = vi.mocked(query);
import app from "../index";

function authToken(userId = "user-1", role = "homeowner") {
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

beforeEach(() => {
  vi.clearAllMocks();
  mockQuery.mockResolvedValue({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
});

describe("GET /templates", () => {
  it("serves approved templates from the database with filters, sorting, and localization", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "pihasauna",
          name: "Pihasauna 3x4m",
          name_fi: "Pihasauna 3x4m",
          name_en: "Yard sauna 3x4m",
          description: "Perinteinen sauna",
          description_fi: "Perinteinen sauna",
          description_en: "Traditional sauna",
          category: "sauna",
          icon: "sauna",
          scene_js: "scene.add(box(1,1,1));",
          bom: [{ material_id: "pine", quantity: 1, unit: "jm" }],
          thumbnail_url: "data:image/svg+xml;utf8,<svg />",
          estimated_cost: 8500,
          difficulty: "intermediate",
          area_m2: 12,
          is_featured: true,
          is_community: false,
          use_count: 7,
          created_at: "2026-04-01T10:00:00Z",
          updated_at: "2026-04-01T10:00:00Z",
          author_name: null,
        },
      ],
      command: "SELECT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("GET", "/templates?category=sauna&sort=price&q=sauna&lang=en");

    expect(res.status).toBe(200);
    expect((res.body as Array<{ name: string; description: string; use_count: number }>)[0]).toMatchObject({
      name: "Yard sauna 3x4m",
      description: "Traditional sauna",
      use_count: 7,
    });
    expect(mockQuery.mock.calls[0][0]).toContain("FROM templates t");
    expect(mockQuery.mock.calls[0][0]).toContain("t.category");
    expect(mockQuery.mock.calls[0][0]).toContain("ILIKE");
    expect(mockQuery.mock.calls[0][0]).toContain("estimated_cost");
    expect(mockQuery.mock.calls[0][1]).toEqual(["sauna", "%sauna%", 60]);
  });
});

describe("PUT /templates/:id/use", () => {
  it("increments the template use count", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "pihasauna", use_count: 8 }],
      command: "UPDATE",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("PUT", "/templates/pihasauna/use");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, id: "pihasauna", use_count: 8 });
    expect(mockQuery.mock.calls[0][0]).toContain("use_count = use_count + 1");
    expect(mockQuery.mock.calls[0][1]).toEqual(["pihasauna"]);
  });
});

describe("POST /templates/submit", () => {
  it("requires authentication", async () => {
    const res = await makeRequest("POST", "/templates/submit", {
      body: { name: "Shared shed", scene_js: "scene.add(box(1,1,1));" },
    });

    expect(res.status).toBe(401);
  });

  it("creates a pending community template for review", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "shared-shed-abcdef",
          name: "Shared shed",
          description: "Useful shed",
          category: "shed",
          icon: "shed",
          scene_js: "scene.add(box(1,1,1));",
          bom: [],
          estimated_cost: 1000,
          difficulty: "beginner",
          area_m2: 4,
          is_featured: false,
          is_community: true,
          moderation_status: "pending",
          author_id: "user-1",
          use_count: 0,
        },
      ],
      command: "INSERT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("POST", "/templates/submit", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        name: "Shared shed",
        description: "Useful shed",
        category: "shed",
        icon: "shed",
        scene_js: "scene.add(box(1,1,1));",
        estimated_cost: 1000,
        difficulty: "beginner",
        area_m2: 4,
      },
    });

    expect(res.status).toBe(201);
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toMatch(/^shared-shed-/);
    expect(params[16]).toBe(true);
    expect(params[17]).toBe("pending");
    expect(params[18]).toBe("user-1");
  });
});

describe("POST /templates", () => {
  it("requires admin access", async () => {
    const res = await makeRequest("POST", "/templates", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { name: "Admin template", scene_js: "scene.add(box(1,1,1));" },
    });

    expect(res.status).toBe(403);
  });

  it("allows admins to create approved curated templates", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: "admin-template",
          name: "Admin template",
          description: "",
          category: "other",
          scene_js: "scene.add(box(1,1,1));",
          bom: [],
          estimated_cost: null,
          difficulty: "intermediate",
          area_m2: null,
          is_featured: true,
          is_community: false,
          moderation_status: "approved",
          author_id: "admin-1",
          use_count: 0,
        },
      ],
      command: "INSERT",
      rowCount: 1,
      oid: 0,
      fields: [],
    });

    const res = await makeRequest("POST", "/templates", {
      headers: { Authorization: `Bearer ${authToken("admin-1", "admin")}` },
      body: {
        id: "admin-template",
        name: "Admin template",
        scene_js: "scene.add(box(1,1,1));",
        is_featured: true,
      },
    });

    expect(res.status).toBe(201);
    const params = mockQuery.mock.calls[0][1] as unknown[];
    expect(params[0]).toBe("admin-template");
    expect(params[15]).toBe(true);
    expect(params[16]).toBe(false);
    expect(params[17]).toBe("approved");
  });
});
