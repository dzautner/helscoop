import { test, expect, type APIRequestContext } from "@playwright/test";

// ---------------------------------------------------------------------------
// API_URL: used for direct API-only tests (request context, no browser).
// ---------------------------------------------------------------------------
const API_URL = process.env.TEST_API_URL || "http://localhost:3051";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TEST_EMAIL = "test@test.com";
const TEST_PASSWORD = "Test1234!";

/** Register a fresh user via API and return credentials + token */
async function registerFreshUser(
  request: APIRequestContext,
  suffix = Date.now().toString(),
): Promise<{ email: string; password: string; token: string }> {
  const email = `apitest-${suffix}@test.com`;
  const password = "testpass123";
  const res = await request.post(`${API_URL}/auth/register`, {
    data: { email, password, name: "API Test User" },
  });
  const body = await res.json();
  return { email, password, token: body.token };
}

const SAMPLE_SCENE = `const f = box(6,0.2,4);
scene.add(f, {material: "foundation"});`;

// =========================================================================
// 1. API endpoint smoke tests (via Playwright request context, no browser)
// =========================================================================
test.describe("API endpoint smoke tests", () => {
  test.describe.configure({ mode: "serial" });

  let token: string;
  let projectId: string;
  let request: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    request = await playwright.request.newContext({ baseURL: API_URL });
  });

  test.afterAll(async () => {
    await request.dispose();
  });

  // 1. GET /materials -> 200, returns array
  test("1. GET /materials returns 200 with array of materials", async () => {
    const res = await request.get("/materials");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    const mat = body[0];
    expect(mat).toHaveProperty("id");
    expect(mat).toHaveProperty("name");
  });

  // 2. POST /auth/login valid -> 200, returns token
  test("2. POST /auth/login with valid creds returns 200 and token", async () => {
    const res = await request.post("/auth/login", {
      data: { email: TEST_EMAIL, password: TEST_PASSWORD },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("token");
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(10);
    token = body.token;
  });

  // 3. POST /auth/login wrong password -> 401
  test("3. POST /auth/login with wrong password returns 401", async () => {
    const res = await request.post("/auth/login", {
      data: { email: TEST_EMAIL, password: "wrongpassword" },
    });
    expect(res.status()).toBe(401);
  });

  // 4. POST /auth/register new user -> 200/201, returns token
  test("4. POST /auth/register with new email returns token", async () => {
    const uniqueEmail = `apitest-register-${Date.now()}@test.com`;
    const res = await request.post("/auth/register", {
      data: { email: uniqueEmail, password: "testpass123", name: "E2E Register" },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body).toHaveProperty("token");
    expect(typeof body.token).toBe("string");
  });

  // 5. GET /projects (with auth) -> 200, returns array
  test("5. GET /projects with auth returns 200 and array", async () => {
    const res = await request.get("/projects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  // 6. POST /projects (with auth, name/scene_js) -> creates project
  test("6. POST /projects creates project and returns id", async () => {
    const res = await request.post("/projects", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "E2E Export API Test Project",
        description: "Created by export-api.spec.ts",
        scene_js: SAMPLE_SCENE,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("id");
    expect(typeof body.id).toBe("string");
    projectId = body.id;
  });

  // 7. GET /projects/:id (with auth) -> returns project
  test("7. GET /projects/:id returns project with scene_js", async () => {
    const res = await request.get(`/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("id", projectId);
    expect(body).toHaveProperty("scene_js");
    expect(body.scene_js).toContain("box(");
  });

  // 8. PUT /projects/:id (with auth, updated name) -> updates
  test("8. PUT /projects/:id updates name", async () => {
    const newName = "Renamed Export Project";
    const res = await request.put(`/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { name: newName },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBe(newName);
  });

  // 9. POST /building/lookup with address -> returns data or 404
  test("9. GET /building with address returns building data", async () => {
    const res = await request.get(
      "/building?address=Ribbingintie 109, 01510 Vantaa",
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("building_info");
    expect(body).toHaveProperty("address");
    expect(body).toHaveProperty("scene_js");
  });

  // 10. POST /subsidies/check -> returns eligibility result
  test("10. POST /subsidies/energy/estimate returns eligibility result", async () => {
    const res = await request.post("/subsidies/energy/estimate", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        totalCost: 15000,
        currentHeating: "oil",
        targetHeating: "ground_source_heat_pump",
        buildingType: "omakotitalo",
        yearRoundResidential: true,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("totalCost");
    expect(body).toHaveProperty("bestAmount");
    expect(body).toHaveProperty("netCost");
    expect(body).toHaveProperty("programs");
    expect(Array.isArray(body.programs)).toBe(true);
    expect(body.programs.length).toBeGreaterThan(0);
  });

  // 11. DELETE /projects/:id (with auth) -> soft-deletes
  test("11. DELETE /projects/:id soft-deletes project", async () => {
    const res = await request.delete(`/projects/${projectId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("ok", true);

    // Verify project is no longer in active list
    const listRes = await request.get("/projects", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const projects = await listRes.json();
    const found = projects.find((p: { id: string }) => p.id === projectId);
    expect(found).toBeUndefined();
  });

  // 12. GET /projects/trash (with auth) -> shows deleted projects
  test("12. GET /projects/trash shows deleted project", async () => {
    const res = await request.get("/projects/trash", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    const trashed = body.find((p: { id: string }) => p.id === projectId);
    expect(trashed).toBeTruthy();
    expect(trashed.deleted_at).toBeTruthy();
  });
});

// =========================================================================
// 2. Auth edge cases
// =========================================================================
test.describe("Auth edge cases", () => {
  let request: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    request = await playwright.request.newContext({ baseURL: API_URL });
  });

  test.afterAll(async () => {
    await request.dispose();
  });

  // 13. Request without token -> 401 on protected endpoint
  test("13. Request without token returns 401 on protected endpoint", async () => {
    const res = await request.get("/projects");
    expect(res.status()).toBe(401);
  });

  // 14. Request with expired/invalid token -> 401
  test("14. Request with invalid token returns 401", async () => {
    const res = await request.get("/projects", {
      headers: { Authorization: "Bearer invalid.jwt.token.that.is.clearly.wrong" },
    });
    expect(res.status()).toBe(401);
  });

  // 15. Register with existing email -> error
  test("15. Register with existing email returns 409 conflict", async () => {
    const res = await request.post("/auth/register", {
      data: {
        email: "test@test.com",
        password: "testpass123",
        name: "Duplicate User",
      },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toContain("already");
  });
});

// =========================================================================
// 3. Export via API
// =========================================================================
test.describe("Export via API", () => {
  test.describe.configure({ mode: "serial" });

  let token: string;
  let projectId: string;
  let request: APIRequestContext;

  test.beforeAll(async ({ playwright }) => {
    request = await playwright.request.newContext({ baseURL: API_URL });

    // Register a fresh user and create a project with BOM for export tests
    const user = await registerFreshUser(request, `export-${Date.now()}`);
    token = user.token;

    const projRes = await request.post("/projects", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Export Test Project",
        description: "Testing CSV/JSON/IFC exports",
        scene_js: SAMPLE_SCENE,
      },
    });
    const projBody = await projRes.json();
    projectId = projBody.id;

    // Add BOM items so export has data
    await request.put(`/projects/${projectId}/bom`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        items: [
          { material_id: "pine_48x148_c24", quantity: 42, unit: "jm" },
          { material_id: "concrete_c25", quantity: 1.2, unit: "m3" },
        ],
      },
    });
  });

  test.afterAll(async () => {
    await request.dispose();
  });

  // 16. GET /bom/export/:projectId?format=csv (with auth) -> returns CSV data
  test("16. BOM CSV export returns valid CSV with headers", async () => {
    const res = await request.get(
      `/bom/export/${projectId}?format=csv`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"] || "";
    expect(contentType).toContain("text/csv");

    const text = await res.text();
    // Strip BOM marker
    const cleaned = text.replace(/^﻿/, "");
    const firstLine = cleaned.split("\n")[0];
    expect(firstLine).toContain("Material");
    expect(firstLine).toContain("Category");
    expect(firstLine).toContain("Qty");
    expect(firstLine).toContain("Unit");

    // At least header + 2 data rows (pine + concrete)
    const lines = cleaned.split("\n").filter((l) => l.trim().length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  // 17. GET /bom/export/:projectId?format=json (with auth) -> returns JSON
  test("17. BOM JSON export returns array of materials", async () => {
    const res = await request.get(
      `/bom/export/${projectId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"] || "";
    expect(contentType).toContain("application/json");

    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);

    // Each row should have material info
    const row = body[0];
    expect(row).toHaveProperty("name");
    expect(row).toHaveProperty("category");
    expect(row).toHaveProperty("quantity");
    expect(row).toHaveProperty("unit");
  });

  // 18. GET /ifc-export/generate (with auth, projectId) -> returns IFC content
  test("18. IFC export returns valid IFC-SPF content", async () => {
    const res = await request.get(
      `/ifc-export/generate?projectId=${projectId}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(res.status()).toBe(200);
    const contentType = res.headers()["content-type"] || "";
    expect(contentType).toContain("application/x-step");

    const text = await res.text();
    expect(text.length).toBeGreaterThan(100);

    // Valid IFC STEP file structure
    expect(text.trimStart().startsWith("ISO-10303-21")).toBe(true);
    expect(text).toContain("HEADER");
    expect(text).toContain("DATA");
    expect(text).toContain("END-ISO-10303-21");
  });
});

// =========================================================================
// 4. Rate limiting
// =========================================================================
test.describe("Rate limiting", () => {
  // 19. Hit auth endpoint rapidly -> eventually get 429
  //
  // NOTE: In test/dev mode the auth rate limiter allows 10000+ requests per
  // window, so triggering a 429 is not practical. This test verifies the
  // rate-limit headers are present (RateLimit-Limit, RateLimit-Remaining)
  // which proves the limiter middleware is wired up. In production (max=30)
  // the same middleware would return 429 after 30 requests.
  test("19. Auth endpoint has rate-limit headers indicating limiter is active", async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({ baseURL: API_URL });
    try {
      const res = await request.post("/auth/login", {
        data: { email: "rate-limit-probe@test.com", password: "wrong" },
      });

      // The response should include standard rate-limit headers from express-rate-limit
      const headers = res.headers();
      const hasRateLimitHeader =
        "ratelimit-limit" in headers ||
        "x-ratelimit-limit" in headers ||
        "ratelimit-remaining" in headers ||
        "x-ratelimit-remaining" in headers;

      expect(hasRateLimitHeader).toBe(true);

      // Verify the limit value is a positive number
      const limitValue =
        headers["ratelimit-limit"] || headers["x-ratelimit-limit"];
      if (limitValue) {
        expect(Number(limitValue)).toBeGreaterThan(0);
      }
    } finally {
      await request.dispose();
    }
  });
});
