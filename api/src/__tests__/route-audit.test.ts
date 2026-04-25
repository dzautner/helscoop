/**
 * Route Audit Tests
 *
 * Comprehensive API audit verifying:
 *   1. Every route file is mounted in index.ts
 *   2. SQL queries reference only tables/columns that exist in migrations
 *   3. Route handlers have proper auth, validation, and error handling
 *   4. Response shapes are consistent
 *   5. Bug regressions for issues found during audit
 */

process.env.NODE_ENV = "test";

import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import http from "http";
import type { AddressInfo } from "net";
import * as fs from "fs";
import * as path from "path";

const JWT_SECRET = process.env.JWT_SECRET || "helscoop-dev-secret";

// Mock DB before any app import
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

import { query } from "../db";
const mockQuery = vi.mocked(query);

import app from "../index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function authToken(userId = "user-1", role = "homeowner") {
  return jwt.sign(
    { id: userId, email: "test@test.com", role },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function adminToken(userId = "admin-1") {
  return jwt.sign(
    { id: userId, email: "admin@test.com", role: "admin" },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

function makeRequest(
  method: string,
  reqPath: string,
  opts: { headers?: Record<string, string>; body?: unknown } = {},
): Promise<{ status: number; body: unknown; headers: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
      const reqOpts: http.RequestOptions = {
        hostname: "127.0.0.1",
        port,
        path: reqPath,
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

// ===========================================================================
// 1. Route Mounting Verification
// ===========================================================================

describe("Route mounting audit", () => {
  it("index.ts imports and mounts every route file in routes/", () => {
    const routesDir = path.resolve(__dirname, "../routes");
    const routeFiles = fs.readdirSync(routesDir).filter((f) => f.endsWith(".ts"));

    const indexSource = fs.readFileSync(
      path.resolve(__dirname, "../index.ts"),
      "utf-8",
    );

    const unmounted: string[] = [];

    for (const file of routeFiles) {
      const baseName = file.replace(".ts", "");
      // Check that the route file is imported (camelCase or kebab-case)
      const importPattern = new RegExp(
        `from\\s+["']\\./routes/${baseName}["']`,
      );
      if (!importPattern.test(indexSource)) {
        unmounted.push(baseName);
      }

      // Check that it's mounted with app.use
      const mountPattern = new RegExp(`app\\.use\\([^)]*${baseName.replace(/-/g, ".")}Router`);
      // More flexible: just check any app.use referencing the import name
      const importNameMatch = indexSource.match(
        new RegExp(`import\\s+(\\w+)\\s+from\\s+["']\\./routes/${baseName}["']`),
      );
      if (importNameMatch) {
        const varName = importNameMatch[1];
        const usePattern = new RegExp(`app\\.use\\([^)]*${varName}`);
        if (!usePattern.test(indexSource)) {
          unmounted.push(`${baseName} (imported as ${varName} but not mounted)`);
        }
      }
    }

    expect(unmounted).toEqual([]);
  });

  it("all route files export a default Router", async () => {
    const routeFiles = [
      "admin", "affiliates", "ara-grant", "audit", "building-registry",
      "building", "carbon", "chat", "compliance", "entitlements",
      "huoltokirja", "ifc-export", "kesko", "materials", "pricing",
      "projects", "roles", "stock", "subsidies", "suppliers", "waste",
    ];

    for (const name of routeFiles) {
      const mod = await import(`../routes/${name}`);
      expect(mod.default).toBeDefined();
      // Express Router is a function
      expect(typeof mod.default).toBe("function");
    }
  });
});

// ===========================================================================
// 2. SQL Schema Consistency
// ===========================================================================

describe("SQL schema consistency", () => {
  const migrationsDir = path.resolve(__dirname, "../../../db/migrations");
  let allSql: string;

  // Build the complete schema from all migration files
  const migrationFiles = fs.readdirSync(migrationsDir).sort();
  allSql = migrationFiles
    .map((f) => fs.readFileSync(path.join(migrationsDir, f), "utf-8"))
    .join("\n");

  it("all tables referenced in route SQL exist in migrations", () => {
    // Tables that must exist in migrations
    const requiredTables = [
      "users", "suppliers", "categories", "materials", "pricing",
      "pricing_history", "projects", "project_bom", "scrape_runs",
      "audit_logs", "affiliate_partners", "affiliate_clicks",
      "affiliate_commissions", "stock_status",
    ];

    for (const table of requiredTables) {
      const createPattern = new RegExp(
        `CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${table}\\s`,
        "i",
      );
      expect(createPattern.test(allSql)).toBe(true);
    }
  });

  it("users table has all columns referenced in queries", () => {
    const requiredColumns = [
      "id", "email", "name", "password_hash", "role",
      "created_at", "updated_at",
      "reset_token", "reset_token_expires",
      "email_verified", "verification_token", "verification_token_expires",
      "accepted_terms_at",
      "google_id", "auth_provider",
    ];

    for (const col of requiredColumns) {
      // Check the column is either in CREATE TABLE or ALTER TABLE ADD COLUMN
      const pattern = new RegExp(
        `(${col}\\s+(UUID|TEXT|BOOLEAN|TIMESTAMPTZ|INTEGER|REAL|NUMERIC|BIGSERIAL|JSONB))|` +
        `(ADD\\s+COLUMN\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${col}\\s)`,
        "i",
      );
      expect(
        pattern.test(allSql),
      ).toBe(true);
    }
  });

  it("projects table has all columns referenced in queries", () => {
    const requiredColumns = [
      "id", "user_id", "name", "description", "scene_js",
      "created_at", "updated_at", "deleted_at",
      "share_token", "building_info", "thumbnail_url",
      "is_public", "display_scale",
    ];

    for (const col of requiredColumns) {
      const pattern = new RegExp(
        `(${col}\\s+(UUID|TEXT|BOOLEAN|TIMESTAMPTZ|REAL|JSONB))|` +
        `(ADD\\s+COLUMN\\s+(IF\\s+NOT\\s+EXISTS\\s+)?${col}\\s)`,
        "i",
      );
      expect(
        pattern.test(allSql),
      ).toBe(true);
    }
  });

  it("materials table has co2_factor_kg column (used by carbon route)", () => {
    expect(allSql).toContain("co2_factor_kg");
  });

  it("materials table has localization columns (used by BOM export)", () => {
    expect(allSql).toContain("name_fi");
    expect(allSql).toContain("name_en");
  });

  it("materials table has image_url column", () => {
    expect(allSql).toContain("image_url");
  });

  it("entitlements references plan_tier column that does NOT exist in migrations (known issue)", () => {
    // This documents a known schema gap: entitlements.ts references plan_tier
    // on the users table, but no migration adds it. The code handles this
    // gracefully with try/catch, but it means getUserPlan() always returns "free"
    // for non-admin users until a migration is added.
    const hasPlanTier = /ADD\s+COLUMN.*plan_tier/i.test(allSql) ||
                        /plan_tier\s+(TEXT|VARCHAR)/i.test(allSql);
    expect(hasPlanTier).toBe(false); // Documenting this is MISSING
  });

  it("entitlements references ai_message_log table that does NOT exist (known issue)", () => {
    const hasAiMessageLog = /CREATE\s+TABLE.*ai_message_log/i.test(allSql);
    expect(hasAiMessageLog).toBe(false); // Documenting this is MISSING
  });

  it("entitlements references plan_overrides table that does NOT exist (known issue)", () => {
    const hasPlanOverrides = /CREATE\s+TABLE.*plan_overrides/i.test(allSql);
    expect(hasPlanOverrides).toBe(false); // Documenting this is MISSING
  });
});

// ===========================================================================
// 3. Auth middleware enforcement
// ===========================================================================

describe("Auth middleware enforcement", () => {
  it("GET /projects requires auth", async () => {
    const res = await makeRequest("GET", "/projects");
    expect(res.status).toBe(401);
  });

  it("POST /projects requires auth", async () => {
    const res = await makeRequest("POST", "/projects", {
      body: { name: "Test" },
    });
    expect(res.status).toBe(401);
  });

  it("GET /materials is public (no auth required)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
    const res = await makeRequest("GET", "/materials");
    // 200 with empty array means no auth was enforced
    expect(res.status).toBe(200);
  });

  it("POST /materials requires auth", async () => {
    const res = await makeRequest("POST", "/materials", {
      body: { id: "test", name: "Test", category_id: "lumber" },
    });
    expect(res.status).toBe(401);
  });

  it("GET /roles requires auth", async () => {
    const res = await makeRequest("GET", "/roles");
    expect(res.status).toBe(401);
  });

  it("GET /audit/logs requires auth", async () => {
    const res = await makeRequest("GET", "/audit/logs");
    expect(res.status).toBe(401);
  });

  it("POST /chat requires auth", async () => {
    const res = await makeRequest("POST", "/chat", {
      body: { messages: [{ role: "user", content: "hello" }] },
    });
    expect(res.status).toBe(401);
  });

  it("GET /admin/users requires auth", async () => {
    const res = await makeRequest("GET", "/admin/users");
    expect(res.status).toBe(401);
  });

  it("POST /affiliates/click requires auth", async () => {
    const res = await makeRequest("POST", "/affiliates/click", {
      body: { material_id: "x", supplier_id: "y", click_url: "https://example.com" },
    });
    expect(res.status).toBe(401);
  });

  it("GET /carbon/calculate requires auth", async () => {
    const res = await makeRequest("GET", "/carbon/calculate?projectId=test");
    expect(res.status).toBe(401);
  });

  it("GET /huoltokirja/generate requires auth", async () => {
    const res = await makeRequest("GET", "/huoltokirja/generate?projectId=test");
    expect(res.status).toBe(401);
  });

  it("GET /waste/estimate requires auth", async () => {
    const res = await makeRequest("GET", "/waste/estimate?projectId=test");
    expect(res.status).toBe(401);
  });

  it("GET /ifc-export/generate requires auth", async () => {
    const res = await makeRequest("GET", "/ifc-export/generate?projectId=test");
    expect(res.status).toBe(401);
  });

  it("POST /subsidies/energy/estimate requires auth", async () => {
    const res = await makeRequest("POST", "/subsidies/energy/estimate", {
      body: {},
    });
    expect(res.status).toBe(401);
  });

  it("GET /ara-grant/package requires auth", async () => {
    const res = await makeRequest("GET", "/ara-grant/package?projectId=test");
    expect(res.status).toBe(401);
  });

  it("GET /kesko/products/search requires auth", async () => {
    const res = await makeRequest("GET", "/kesko/products/search?q=test");
    expect(res.status).toBe(401);
  });

  it("GET /stock/some-material requires auth", async () => {
    const res = await makeRequest("GET", "/stock/pine_48x98_c24");
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 4. Permission enforcement
// ===========================================================================

describe("Permission enforcement", () => {
  it("POST /materials requires material:create permission (homeowner denied)", async () => {
    const res = await makeRequest("POST", "/materials", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { id: "test", name: "Test", category_id: "lumber" },
    });
    expect(res.status).toBe(403);
  });

  it("PUT /materials/:id requires material:update permission (homeowner denied)", async () => {
    const res = await makeRequest("PUT", "/materials/pine_48x98_c24", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { name: "Updated", category_id: "lumber", tags: [], waste_factor: 1.1 },
    });
    expect(res.status).toBe(403);
  });

  it("GET /suppliers requires supplier:read permission (homeowner allowed)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
    const res = await makeRequest("GET", "/suppliers", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
  });

  it("PUT /suppliers/:id requires supplier:update permission (homeowner denied)", async () => {
    const res = await makeRequest("PUT", "/suppliers/k-rauta", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { name: "K-Rauta", url: "https://k-rauta.fi", scrape_enabled: true },
    });
    expect(res.status).toBe(403);
  });

  it("GET /admin/users requires admin:access (homeowner denied)", async () => {
    const res = await makeRequest("GET", "/admin/users", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(403);
  });

  it("GET /admin/users allows admin", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "u1", email: "a@b.com", name: "Test", role: "admin", email_verified: true, created_at: new Date() }],
      command: "", rowCount: 1, oid: 0, fields: [],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [{ total: "1" }],
      command: "", rowCount: 1, oid: 0, fields: [],
    });
    const res = await makeRequest("GET", "/admin/users", {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    expect(res.status).toBe(200);
  });

  it("GET /audit/logs requires admin:access (homeowner denied)", async () => {
    const res = await makeRequest("GET", "/audit/logs", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(403);
  });
});

// ===========================================================================
// 5. Input validation
// ===========================================================================

describe("Input validation", () => {
  it("POST /auth/login requires email and password", async () => {
    const res = await makeRequest("POST", "/auth/login", {
      body: {},
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("required");
  });

  it("POST /auth/login rejects invalid email", async () => {
    const res = await makeRequest("POST", "/auth/login", {
      body: { email: "not-an-email", password: "password123" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("email");
  });

  it("POST /auth/register rejects short password", async () => {
    const res = await makeRequest("POST", "/auth/register", {
      body: { email: "test@test.com", password: "short", name: "Test" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("8 characters");
  });

  it("POST /auth/register rejects long name", async () => {
    const res = await makeRequest("POST", "/auth/register", {
      body: { email: "test@test.com", password: "password123", name: "A".repeat(201) },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("200");
  });

  it("POST /auth/google requires credential", async () => {
    const res = await makeRequest("POST", "/auth/google", {
      body: {},
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("credential");
  });

  it("GET /building rejects short address", async () => {
    const res = await makeRequest("GET", "/building?address=ab");
    expect(res.status).toBe(400);
  });

  it("GET /building rejects excessively long address", async () => {
    const longAddr = "A".repeat(201);
    const res = await makeRequest("GET", `/building?address=${encodeURIComponent(longAddr)}`);
    expect(res.status).toBe(400);
  });

  it("POST /compliance/check requires sceneJs", async () => {
    const res = await makeRequest("POST", "/compliance/check", {
      body: {},
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("sceneJs");
  });

  it("POST /compliance/check rejects oversized sceneJs", async () => {
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs: "x".repeat(500_001) },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("500 KB");
  });

  it("GET /carbon/calculate requires projectId", async () => {
    const res = await makeRequest("GET", "/carbon/calculate", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(400);
  });

  it("GET /huoltokirja/generate requires projectId", async () => {
    const res = await makeRequest("GET", "/huoltokirja/generate", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(400);
  });

  it("GET /waste/estimate requires projectId", async () => {
    const res = await makeRequest("GET", "/waste/estimate", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(400);
  });

  it("GET /waste/estimate rejects invalid UUID format", async () => {
    const res = await makeRequest("GET", "/waste/estimate?projectId=not-a-uuid", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("Invalid");
  });

  it("PUT /projects/:id/bom rejects non-array items", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "proj-1" }],
      command: "", rowCount: 1, oid: 0, fields: [],
    });
    const res = await makeRequest("PUT", "/projects/proj-1/bom", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { items: "not-an-array" },
    });
    expect(res.status).toBe(400);
  });

  it("POST /materials/catalog/convert rejects empty items", async () => {
    const res = await makeRequest("POST", "/materials/catalog/convert", {
      body: { items: [] },
    });
    expect(res.status).toBe(400);
  });

  it("POST /materials/catalog/convert rejects > 200 items", async () => {
    const items = Array.from({ length: 201 }, (_, i) => ({
      materialId: `mat_${i}`,
      designQty: 10,
    }));
    const res = await makeRequest("POST", "/materials/catalog/convert", {
      body: { items },
    });
    expect(res.status).toBe(400);
  });

  it("POST /subsidies/energy/estimate rejects negative totalCost", async () => {
    const res = await makeRequest("POST", "/subsidies/energy/estimate", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { totalCost: -100 },
    });
    expect(res.status).toBe(400);
  });

  it("GET /kesko/products/search rejects short query", async () => {
    const res = await makeRequest("GET", "/kesko/products/search?q=a", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(400);
  });

  it("GET /kesko/products/search rejects long query", async () => {
    const longQ = "x".repeat(101);
    const res = await makeRequest("GET", `/kesko/products/search?q=${longQ}`, {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 6. Happy path responses
// ===========================================================================

describe("Happy path response shapes", () => {
  it("GET /health returns status, db, version, uptime", async () => {
    const res = await makeRequest("GET", "/health");
    const body = res.body as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body).toHaveProperty("status");
    expect(body).toHaveProperty("db");
    expect(body).toHaveProperty("version");
    expect(body).toHaveProperty("uptime");
  });

  it("GET /api/health also works", async () => {
    const res = await makeRequest("GET", "/api/health");
    expect(res.status).toBe(200);
    expect((res.body as Record<string, unknown>)).toHaveProperty("status");
  });

  it("GET /templates returns array of templates", async () => {
    const res = await makeRequest("GET", "/templates");
    expect(res.status).toBe(200);
    const templates = res.body as Array<{ id: string; name: string; scene_js: string; bom: unknown[] }>;
    expect(Array.isArray(templates)).toBe(true);
    expect(templates.length).toBeGreaterThan(0);
    for (const t of templates) {
      expect(t).toHaveProperty("id");
      expect(t).toHaveProperty("name");
      expect(t).toHaveProperty("scene_js");
      expect(t).toHaveProperty("bom");
    }
  });

  it("GET /categories returns array", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "lumber", display_name: "Lumber", display_name_fi: "Sahatavara", sort_order: 1, hidden: false }],
      command: "", rowCount: 1, oid: 0, fields: [],
    });
    const res = await makeRequest("GET", "/categories");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /materials returns array with pricing subquery", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "pine_48x98_c24",
        name: "48x98 Runkopuu C24",
        category_id: "lumber",
        category_name: "Lumber",
        pricing: null,
      }],
      command: "", rowCount: 1, oid: 0, fields: [],
    });
    const res = await makeRequest("GET", "/materials");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /entitlements/plans returns plan configs (no auth required)", async () => {
    const res = await makeRequest("GET", "/entitlements/plans");
    expect(res.status).toBe(200);
    const plans = res.body as Array<{ tier: string; name: string }>;
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBe(3); // free, pro, enterprise
    const tiers = plans.map((p) => p.tier);
    expect(tiers).toContain("free");
    expect(tiers).toContain("pro");
    expect(tiers).toContain("enterprise");
  });

  it("POST /compliance/check returns warnings and checkedRules", async () => {
    const sceneJs = `
const floor = box(4, 0.2, 3);
scene.add(floor, { material: "foundation", color: [0.65, 0.65, 0.65] });
    `;
    const res = await makeRequest("POST", "/compliance/check", {
      body: { sceneJs },
    });
    expect(res.status).toBe(200);
    const body = res.body as { warnings: unknown[]; checkedRules: number; passedRules: number };
    expect(body).toHaveProperty("warnings");
    expect(body).toHaveProperty("checkedRules");
    expect(body).toHaveProperty("passedRules");
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(body.checkedRules).toBeGreaterThan(0);
  });

  it("GET /building-registry/lookup returns building data", async () => {
    const res = await makeRequest("GET", "/building-registry/lookup?address=Mannerheimintie+1+Helsinki");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("type");
    expect(body).toHaveProperty("year_built");
    expect(body).toHaveProperty("area_m2");
    expect(body).toHaveProperty("heating");
    expect(body).toHaveProperty("material");
    expect(body).toHaveProperty("confidence");
  });

  it("GET /building returns building data for valid address", async () => {
    const res = await makeRequest("GET", "/building?address=Helsinki+00100");
    expect(res.status).toBe(200);
    const body = res.body as Record<string, unknown>;
    expect(body).toHaveProperty("address");
    expect(body).toHaveProperty("building_info");
    expect(body).toHaveProperty("confidence");
  });

  it("GET /roles returns available roles (authed)", async () => {
    const res = await makeRequest("GET", "/roles", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as { roles: string[] };
    expect(body).toHaveProperty("roles");
    expect(body.roles).toContain("homeowner");
    expect(body.roles).toContain("admin");
  });

  it("GET /roles/me returns current user role and permissions", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: "user-1", email: "test@test.com", name: "Test", role: "homeowner" }],
      command: "", rowCount: 1, oid: 0, fields: [],
    });
    const res = await makeRequest("GET", "/roles/me", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as { role: string; permissions: string[] };
    expect(body).toHaveProperty("role");
    expect(body).toHaveProperty("permissions");
    expect(Array.isArray(body.permissions)).toBe(true);
  });
});

// ===========================================================================
// 7. Error paths
// ===========================================================================

describe("Error paths", () => {
  it("GET /projects with valid auth returns a response", async () => {
    // The project listing should return whatever the DB query returns.
    // With all queries returning empty rows, the response should be []
    // or possibly another shape if an internal query is involved.
    const res = await makeRequest("GET", "/projects", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    // The handler is async and queries the DB — with mocked empty rows,
    // it should return 200 with an empty array.
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /materials/:id returns 404 for non-existent material", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
    const res = await makeRequest("GET", "/materials/nonexistent");
    expect(res.status).toBe(404);
  });

  it("GET /suppliers/:id returns 404 for non-existent supplier", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
    const res = await makeRequest("GET", "/suppliers/nonexistent", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(404);
  });

  it("GET /carbon/calculate returns 404 for non-existent project", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
    const res = await makeRequest("GET", "/carbon/calculate?projectId=00000000-0000-0000-0000-000000000000", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(404);
  });

  it("GET /shared/:token returns 404 for invalid share token", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] });
    const res = await makeRequest("GET", "/shared/invalid-token-here");
    expect(res.status).toBe(404);
  });

  it("GET /shared/:token rejects token > 64 chars", async () => {
    const longToken = "a".repeat(65);
    const res = await makeRequest("GET", `/shared/${longToken}`);
    expect(res.status).toBe(400);
  });

  it("POST /auth/reset-password requires token and password", async () => {
    const res = await makeRequest("POST", "/auth/reset-password", {
      body: {},
    });
    expect(res.status).toBe(400);
  });

  it("POST /auth/reset-password rejects short password", async () => {
    const res = await makeRequest("POST", "/auth/reset-password", {
      body: { token: "some-token", password: "short" },
    });
    expect(res.status).toBe(400);
    expect((res.body as { error: string }).error).toContain("8 characters");
  });

  it("PUT /auth/password requires currentPassword and newPassword", async () => {
    const res = await makeRequest("PUT", "/auth/password", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {},
    });
    expect(res.status).toBe(400);
  });

  it("PUT /auth/profile rejects empty body", async () => {
    const res = await makeRequest("PUT", "/auth/profile", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {},
    });
    expect(res.status).toBe(400);
  });

  it("PUT /auth/profile rejects invalid email", async () => {
    const res = await makeRequest("PUT", "/auth/profile", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { email: "not-valid" },
    });
    expect(res.status).toBe(400);
  });
});

// ===========================================================================
// 8. Bug regressions — issues found during audit
// ===========================================================================

describe("Bug regressions", () => {
  it("BUG FIX: waste estimate filters soft-deleted projects", async () => {
    // The waste route should include AND deleted_at IS NULL
    const wasteSource = fs.readFileSync(
      path.resolve(__dirname, "../routes/waste.ts"),
      "utf-8",
    );
    expect(wasteSource).toContain("deleted_at IS NULL");
  });

  it("BUG FIX: stock project endpoint checks ownership and soft-delete", async () => {
    const stockSource = fs.readFileSync(
      path.resolve(__dirname, "../routes/stock.ts"),
      "utf-8",
    );
    // Must filter by user_id AND deleted_at IS NULL
    expect(stockSource).toContain("user_id = $2");
    expect(stockSource).toContain("deleted_at IS NULL");
  });

  it("BUG FIX: carbon route reads area_m2 from building_info", async () => {
    const carbonSource = fs.readFileSync(
      path.resolve(__dirname, "../routes/carbon.ts"),
      "utf-8",
    );
    // Must try area_m2 first since that's the schema key name
    expect(carbonSource).toContain("area_m2");
  });

  it("KNOWN ISSUE: entitlements getUserPlan catches missing plan_tier column", async () => {
    // The entitlements module references users.plan_tier which doesn't exist
    // in migrations, but handles this gracefully with try/catch returning "free"
    const { getUserPlan } = await import("../entitlements");
    // When the query fails (column doesn't exist), it returns "free"
    mockQuery.mockRejectedValueOnce(new Error('column "plan_tier" does not exist'));
    const plan = await getUserPlan("some-user");
    expect(plan).toBe("free");
  });

  it("KNOWN ISSUE: entitlements getDailyAiMessageCount catches missing table", async () => {
    const { getDailyAiMessageCount, _resetStores } = await import("../entitlements");
    _resetStores();
    // When the ai_message_log table doesn't exist, it returns 0
    mockQuery.mockRejectedValueOnce(new Error('relation "ai_message_log" does not exist'));
    const count = await getDailyAiMessageCount("some-user");
    expect(count).toBe(0);
  });

  it("all project-scoped endpoints check deleted_at IS NULL", () => {
    const projectRoutes = fs.readFileSync(
      path.resolve(__dirname, "../routes/projects.ts"),
      "utf-8",
    );
    // GET /:id, PUT /:id should filter deleted projects
    // The listing endpoints already filter
    expect(projectRoutes).toContain("deleted_at IS NULL");
  });

  it("index.ts auth endpoints validate email format", () => {
    const indexSource = fs.readFileSync(
      path.resolve(__dirname, "../index.ts"),
      "utf-8",
    );
    // Login and register should check EMAIL_RE
    expect(indexSource).toContain("EMAIL_RE.test(email)");
  });
});

// ===========================================================================
// 9. Route-specific happy paths with DB mocking
// ===========================================================================

describe("Route-specific happy paths", () => {
  it("GET /projects lists user projects with estimated_cost", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "proj-1",
        name: "My Project",
        description: "Test",
        is_public: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        thumbnail_url: null,
        estimated_cost: "150.00",
      }],
      command: "", rowCount: 1, oid: 0, fields: [],
    });

    const res = await makeRequest("GET", "/projects", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
    const projects = res.body as Array<{ id: string; estimated_cost: string }>;
    expect(projects).toHaveLength(1);
    expect(projects[0].id).toBe("proj-1");
    expect(projects[0]).toHaveProperty("estimated_cost");
  });

  it("POST /projects creates project and returns 201", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "proj-new",
        user_id: "user-1",
        name: "New Project",
        description: null,
        scene_js: null,
        building_info: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }],
      command: "", rowCount: 1, oid: 0, fields: [],
    });

    const res = await makeRequest("POST", "/projects", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: { name: "New Project" },
    });
    expect(res.status).toBe(201);
    expect((res.body as { id: string }).id).toBe("proj-new");
  });

  it("POST /affiliates/click records click and returns 201", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "click-1",
        user_id: "user-1",
        material_id: "pine_48x98_c24",
        supplier_id: "k-rauta",
        click_url: "https://k-rauta.fi/product",
        created_at: new Date().toISOString(),
      }],
      command: "", rowCount: 1, oid: 0, fields: [],
    });

    const res = await makeRequest("POST", "/affiliates/click", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        material_id: "pine_48x98_c24",
        supplier_id: "k-rauta",
        click_url: "https://k-rauta.fi/product",
      },
    });
    expect(res.status).toBe(201);
  });

  it("GET /entitlements returns plan and usage for authed user", async () => {
    // getUserPlan will query users table - mock it
    mockQuery.mockResolvedValueOnce({
      rows: [{ role: "homeowner", plan_tier: null }],
      command: "", rowCount: 1, oid: 0, fields: [],
    });

    const res = await makeRequest("GET", "/entitlements", {
      headers: { Authorization: `Bearer ${authToken()}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      plan: string;
      planConfig: { tier: string };
      usage: { aiMessagesToday: number };
    };
    expect(body).toHaveProperty("plan");
    expect(body).toHaveProperty("planConfig");
    expect(body).toHaveProperty("usage");
  });

  it("GET /admin/stats returns dashboard statistics", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "42" }], command: "", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [{ total: "100" }], command: "", rowCount: 1, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [], command: "", rowCount: 0, oid: 0, fields: [] })
      .mockResolvedValueOnce({ rows: [{ role: "homeowner", count: "40" }], command: "", rowCount: 1, oid: 0, fields: [] });

    const res = await makeRequest("GET", "/admin/stats", {
      headers: { Authorization: `Bearer ${adminToken()}` },
    });
    expect(res.status).toBe(200);
    const body = res.body as { user_count: number; project_count: number };
    expect(body).toHaveProperty("user_count");
    expect(body).toHaveProperty("project_count");
    expect(body).toHaveProperty("recent_signups");
    expect(body).toHaveProperty("role_distribution");
  });

  it("POST /subsidies/energy/estimate returns subsidy calculation", async () => {
    const res = await makeRequest("POST", "/subsidies/energy/estimate", {
      headers: { Authorization: `Bearer ${authToken()}` },
      body: {
        totalCost: 15000,
        currentHeating: "oil",
        targetHeating: "ground_source_heat_pump",
        buildingType: "omakotitalo",
        yearRoundResidential: true,
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      totalCost: number;
      bestAmount: number;
      programs: unknown[];
      disclaimer: string;
    };
    expect(body).toHaveProperty("totalCost");
    expect(body).toHaveProperty("bestAmount");
    expect(body).toHaveProperty("programs");
    expect(body).toHaveProperty("disclaimer");
    expect(body.bestAmount).toBeGreaterThan(0);
  });
});
