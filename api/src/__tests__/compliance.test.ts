/**
 * Tests for the Finnish building code compliance checker.
 *
 * Tests the POST /compliance/check endpoint and the underlying rule logic
 * using scene snippets that trigger or pass each of the 5 rules.
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

vi.mock("../db", () => ({
  query: vi
    .fn()
    .mockResolvedValue({
      rows: [],
      command: "",
      rowCount: 0,
      oid: 0,
      fields: [],
    }),
  pool: { query: vi.fn() },
}));

vi.mock("../email", () => ({
  sendEmail: vi.fn(),
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendPriceAlertEmail: vi.fn(),
}));

import app from "../index";

function authToken(userId = "user-1") {
  return jwt.sign(
    { id: userId, email: "test@test.com", role: "user" },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function makeRequest(
  method: string,
  path: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
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
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(data);
          } catch {
            parsed = { raw: data } as Record<string, unknown>;
          }
          resolve({ status: res.statusCode || 0, body: parsed });
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
});

// ---------------------------------------------------------------------------
// API validation
// ---------------------------------------------------------------------------

describe("POST /compliance/check — input validation", () => {
  it("returns 400 when sceneJs is missing", async () => {
    const res = await makeRequest("POST", "/compliance/check", {
      body: {},
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("sceneJs");
  });

  it("returns 400 when sceneJs is not a string", async () => {
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: 42 },
    });
    expect(res.status).toBe(400);
  });

  it("returns empty warnings for an empty scene", async () => {
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: "// empty scene" },
    });
    expect(res.status).toBe(200);
    expect(res.body.warnings).toEqual([]);
    expect(res.body.checkedRules).toBe(5);
    expect(res.body.passedRules).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Rule 1: Minimum ceiling height (2500mm for residential)
// ---------------------------------------------------------------------------

describe("Rule FI-RakMK-G1-2.1 — min ceiling height", () => {
  it("flags wall height below 2500mm", async () => {
    const scene = `
      const wall = translate(box(4, 2.2, 0.12), 0, 1.1, 0);
      scene.add(wall, { material: "lumber", color: [0.8, 0.7, 0.5] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: scene, buildingInfo: { type: "omakotitalo" } },
    });
    expect(res.status).toBe(200);
    const warnings = res.body.warnings as Array<Record<string, unknown>>;
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
    expect((rule!.params as Record<string, number>).height).toBe(2200);
  });

  it("passes when wall height is 2500mm or more", async () => {
    const scene = `
      const wall = translate(box(4, 2.6, 0.12), 0, 1.3, 0);
      scene.add(wall, { material: "lumber", color: [0.8, 0.7, 0.5] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: scene, buildingInfo: { type: "omakotitalo" } },
    });
    const warnings = res.body.warnings as Array<Record<string, unknown>>;
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(rule).toBeUndefined();
  });

  it("skips ceiling height check for kerrostalo (apartment)", async () => {
    const scene = `
      const wall = translate(box(4, 2.2, 0.12), 0, 1.1, 0);
      scene.add(wall, { material: "lumber", color: [0.8, 0.7, 0.5] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: scene, buildingInfo: { type: "kerrostalo" } },
    });
    const warnings = res.body.warnings as Array<Record<string, unknown>>;
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.1");
    expect(rule).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 2: Minimum door opening width (800mm)
// ---------------------------------------------------------------------------

describe("Rule FI-RakMK-F1-2.3 — min door width", () => {
  it("flags door opening below 800mm", async () => {
    const scene = `
      const wall = translate(box(4, 2.5, 0.12), 0, 1.25, 0);
      const doorVoid = translate(box(0.7, 2.0, 0.12), 0.5, 1.0, 0);
      const wallWithDoor = subtract(wall, doorVoid);
      scene.add(wallWithDoor, { material: "lumber", color: [0.8, 0.7, 0.5] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: scene },
    });
    const warnings = res.body.warnings as Array<Record<string, unknown>>;
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-F1-2.3");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
    expect((rule!.params as Record<string, number>).width).toBe(700);
  });

  it("passes when door opening is 800mm or wider", async () => {
    const scene = `
      const wall = translate(box(4, 2.5, 0.12), 0, 1.25, 0);
      const doorVoid = translate(box(0.9, 2.1, 0.12), 0.5, 1.05, 0);
      const wallWithDoor = subtract(wall, doorVoid);
      scene.add(wallWithDoor, { material: "lumber", color: [0.8, 0.7, 0.5] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: scene },
    });
    const warnings = res.body.warnings as Array<Record<string, unknown>>;
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-F1-2.3");
    expect(rule).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 3: Handrail required for elevated platforms (>500mm)
// ---------------------------------------------------------------------------

describe("Rule FI-RakMK-F2-3.2 — handrail required", () => {
  it("warns when elevated deck has no posts/handrail", async () => {
    const scene = `
      const deck = translate(box(4, 0.08, 3), 0, 0.7, 0);
      scene.add(deck, { material: "lumber", color: [0.78, 0.65, 0.45] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: scene },
    });
    const warnings = res.body.warnings as Array<Record<string, unknown>>;
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-F2-3.2");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
    expect((rule!.params as Record<string, number>).elevation).toBe(700);
  });

  it("passes when elevated deck has posts nearby", async () => {
    const scene = `
      const deck = translate(box(4, 0.08, 3), 0, 0.7, 0);
      const post1 = translate(box(0.12, 1.0, 0.12), -1.8, 1.2, -1.3);
      const post2 = translate(box(0.12, 1.0, 0.12), 1.8, 1.2, -1.3);
      const post3 = translate(box(0.12, 1.0, 0.12), -1.8, 1.2, 1.3);
      const post4 = translate(box(0.12, 1.0, 0.12), 1.8, 1.2, 1.3);
      scene.add(deck, { material: "lumber", color: [0.78, 0.65, 0.45] });
      scene.add(post1, { material: "lumber", color: [0.7, 0.58, 0.38] });
      scene.add(post2, { material: "lumber", color: [0.7, 0.58, 0.38] });
      scene.add(post3, { material: "lumber", color: [0.7, 0.58, 0.38] });
      scene.add(post4, { material: "lumber", color: [0.7, 0.58, 0.38] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: scene },
    });
    const warnings = res.body.warnings as Array<Record<string, unknown>>;
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-F2-3.2");
    expect(rule).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 4: Maximum building height (12m for residential)
// ---------------------------------------------------------------------------

describe("Rule FI-MRL-115 — max building height", () => {
  it("flags building exceeding 12m height", async () => {
    const scene = `
      const tower = translate(box(4, 14, 4), 0, 7, 0);
      scene.add(tower, { material: "lumber", color: [0.8, 0.7, 0.5] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: scene },
    });
    const warnings = res.body.warnings as Array<Record<string, unknown>>;
    const rule = warnings.find((w) => w.ruleId === "FI-MRL-115");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("error");
    // Top = 7 + 14/2 = 14m = 14000mm
    expect((rule!.params as Record<string, number>).height).toBe(14000);
    expect((rule!.params as Record<string, number>).limit).toBe(12000);
  });

  it("passes when building is within 12m", async () => {
    const scene = `
      const wall = translate(box(6, 2.8, 0.15), 0, 1.55, 0);
      const roof = translate(box(6.6, 0.05, 4.6), 0, 3.0, 0);
      scene.add(wall, { material: "lumber", color: [0.85, 0.75, 0.55] });
      scene.add(roof, { material: "roofing", color: [0.3, 0.3, 0.3] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: scene },
    });
    const warnings = res.body.warnings as Array<Record<string, unknown>>;
    const rule = warnings.find((w) => w.ruleId === "FI-MRL-115");
    expect(rule).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Rule 5: Minimum room area (7m²)
// ---------------------------------------------------------------------------

describe("Rule FI-RakMK-G1-2.2 — min room area", () => {
  it("warns when floor area is below 7m2", async () => {
    const scene = `
      const floor = box(2, 0.15, 3);
      scene.add(floor, { material: "foundation", color: [0.7, 0.7, 0.7] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: scene },
    });
    const warnings = res.body.warnings as Array<Record<string, unknown>>;
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.2");
    expect(rule).toBeDefined();
    expect(rule!.severity).toBe("warning");
    expect((rule!.params as Record<string, number>).area).toBe(6);
  });

  it("passes when floor area meets 7m2", async () => {
    const scene = `
      const floor = box(4, 0.15, 3);
      scene.add(floor, { material: "foundation", color: [0.7, 0.7, 0.7] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: scene },
    });
    const warnings = res.body.warnings as Array<Record<string, unknown>>;
    const rule = warnings.find((w) => w.ruleId === "FI-RakMK-G1-2.2");
    expect(rule).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Integration: full scene with multiple rules
// ---------------------------------------------------------------------------

describe("Full scene compliance check", () => {
  it("returns correct checkedRules and passedRules counts", async () => {
    // Pihasauna-like scene with 2.4m walls (below 2.5m min)
    const scene = `
      const floor = box(4, 0.2, 3);
      const wall1 = translate(box(4, 2.4, 0.12), 0, 1.3, -1.44);
      const wall2 = translate(box(4, 2.4, 0.12), 0, 1.3, 1.44);
      scene.add(floor, { material: "foundation", color: [0.65, 0.65, 0.65] });
      scene.add(wall1, { material: "lumber", color: [0.82, 0.68, 0.47] });
      scene.add(wall2, { material: "lumber", color: [0.82, 0.68, 0.47] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: scene, buildingInfo: { type: "omakotitalo" } },
    });
    expect(res.status).toBe(200);
    expect(res.body.checkedRules).toBe(5);
    // The 2.4m walls will trigger the ceiling height rule
    const warnings = res.body.warnings as Array<Record<string, unknown>>;
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    // passedRules + failed rules should equal checkedRules
    const failedRuleIds = new Set(warnings.map((w) => w.ruleId));
    expect((res.body.passedRules as number) + failedRuleIds.size).toBe(5);
  });
});
