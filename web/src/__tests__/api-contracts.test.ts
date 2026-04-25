/**
 * API contract tests: verify that every frontend API client function constructs
 * the correct HTTP request (URL, method, headers, body) and handles error
 * responses properly.
 *
 * These tests mock the global `fetch` function and inspect the arguments passed
 * to it, ensuring the frontend-to-backend contract is correct without needing a
 * running server.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api, setToken, getToken, hasAuthSession, ApiError, stopRefreshTimer } from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const API_URL = "http://localhost:3001";
const tokenExpiry = () => Math.floor(Date.now() / 1000) + 3600;

/** Create a mock Response that resolves with the given JSON body. */
function mockResponse(body: unknown, status = 200, statusText = "OK"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob(["fake"])),
    headers: new Headers(),
    redirected: false,
    type: "basic" as ResponseType,
    url: "",
    clone: () => mockResponse(body, status, statusText),
    body: null,
    bodyUsed: false,
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    formData: () => Promise.resolve(new FormData()),
    text: () => Promise.resolve(JSON.stringify(body)),
    bytes: () => Promise.resolve(new Uint8Array()),
  } as Response;
}

/** Extract the last call to fetch. */
function lastFetchCall(): [string, RequestInit] {
  const calls = vi.mocked(fetch).mock.calls;
  const last = calls[calls.length - 1];
  return [last[0] as string, last[1] as RequestInit];
}

/** Extract all calls to fetch. */
function allFetchCalls(): [string, RequestInit][] {
  return vi.mocked(fetch).mock.calls.map((c) => [c[0] as string, c[1] as RequestInit]);
}

function mockDownloadAnchor() {
  const anchor = document.createElement("a");
  const click = vi.spyOn(anchor, "click").mockImplementation(() => {});
  vi.spyOn(document, "createElement").mockReturnValue(anchor);
  return { anchor, click };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockResponse({})));
  // Set a valid token for most tests (individual tests can override)
  setToken("test-jwt-token-abc");
  // Prevent scheduled timers from interfering
  stopRefreshTimer();
});

afterEach(() => {
  setToken(null);
  stopRefreshTimer();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------

describe("Auth endpoints", () => {
  it("login: POST /auth/login with email and password", async () => {
    const body = { token: "jwt", token_expires_at: tokenExpiry(), user: { id: "1", email: "a@b.fi" } };
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

    const result = await api.login("test@example.fi", "password123");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/auth/login`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual({ email: "test@example.fi", password: "password123" });
    expect(result).toEqual(body);
  });

  it("register: POST /auth/register with email, password, name", async () => {
    const body = { token: "jwt", token_expires_at: tokenExpiry(), user: { id: "1" } };
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(body));

    await api.register("u@test.fi", "secure123", "Test User");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/auth/register`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual({
      email: "u@test.fi",
      password: "secure123",
      name: "Test User",
    });
  });

  it("googleLogin: POST /auth/google with credential", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ token: "jwt" }));

    await api.googleLogin("google-id-token");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/auth/google`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual({ credential: "google-id-token" });
  });

  it("me: GET /auth/me with auth header", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ id: "1", email: "a@b.fi" }));

    await api.me();

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/auth/me`);
    expect(opts.method).toBeUndefined(); // GET is the default
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-jwt-token-abc");
  });

  it("updateProfile: PUT /auth/profile", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ user: { id: "1" } }));

    await api.updateProfile({ name: "New Name", email: "new@test.fi" });

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/auth/profile`);
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body as string)).toEqual({ name: "New Name", email: "new@test.fi" });
  });

  it("changePassword: PUT /auth/password", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ message: "ok" }));

    await api.changePassword("old123", "new456");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/auth/password`);
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body as string)).toEqual({
      currentPassword: "old123",
      newPassword: "new456",
    });
  });

  it("deleteAccount: DELETE /auth/account", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ message: "deleted" }));

    await api.deleteAccount();

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/auth/account`);
    expect(opts.method).toBe("DELETE");
  });

  it("exportData: GET /auth/export-data", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ profile: {} }));

    await api.exportData();

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/auth/export-data`);
  });

  it("forgotPassword: POST /auth/forgot-password", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ message: "sent" }));

    await api.forgotPassword("user@test.fi");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/auth/forgot-password`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual({ email: "user@test.fi" });
  });

  it("resetPassword: POST /auth/reset-password", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ message: "reset" }));

    await api.resetPassword("reset-token-123", "newpass123");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/auth/reset-password`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual({ token: "reset-token-123", password: "newpass123" });
  });

  it("verifyEmail: GET /auth/verify-email?token=<encoded>", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ message: "verified" }));

    await api.verifyEmail("verify-tok-123");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/auth/verify-email?token=verify-tok-123`);
  });

  it("verifyEmail: encodes special characters in token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ message: "verified" }));

    await api.verifyEmail("token with spaces&special=chars");

    const [url] = lastFetchCall();
    expect(url).toContain("token=token%20with%20spaces%26special%3Dchars");
  });

  it("resendVerification: POST /auth/resend-verification", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ message: "sent" }));

    await api.resendVerification();

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/auth/resend-verification`);
    expect(opts.method).toBe("POST");
  });
});

// ---------------------------------------------------------------------------
// Project endpoints
// ---------------------------------------------------------------------------

describe("Project endpoints", () => {
  it("getProjects: GET /projects", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.getProjects();

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects`);
  });

  it("getProject: GET /projects/:id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ id: "p1" }));

    await api.getProject("p1");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects/p1`);
  });

  it("createProject: POST /projects with correct body shape", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ id: "new" }));

    await api.createProject({
      name: "Test Project",
      description: "A description",
      scene_js: "// scene",
      building_info: { type: "omakotitalo", year_built: 1990 },
    });

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects`);
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.name).toBe("Test Project");
    expect(body.description).toBe("A description");
    expect(body.scene_js).toBe("// scene");
    expect(body.building_info).toEqual({ type: "omakotitalo", year_built: 1990 });
  });

  it("updateProject: PUT /projects/:id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ id: "p1" }));

    await api.updateProject("p1", { name: "Updated", scene_js: "// new" });

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects/p1`);
    expect(opts.method).toBe("PUT");
    const body = JSON.parse(opts.body as string);
    expect(body.name).toBe("Updated");
    expect(body.scene_js).toBe("// new");
  });

  it("deleteProject: DELETE /projects/:id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.deleteProject("p1");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects/p1`);
    expect(opts.method).toBe("DELETE");
  });

  it("getTrashProjects: GET /projects/trash", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.getTrashProjects();

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects/trash`);
  });

  it("restoreProject: POST /projects/:id/restore", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.restoreProject("p1");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects/p1/restore`);
    expect(opts.method).toBe("POST");
  });

  it("permanentDeleteProject: DELETE /projects/:id/permanent", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.permanentDeleteProject("p1");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects/p1/permanent`);
    expect(opts.method).toBe("DELETE");
  });

  it("duplicateProject: POST /projects/:id/duplicate", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ id: "dup1" }));

    await api.duplicateProject("p1");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects/p1/duplicate`);
    expect(opts.method).toBe("POST");
  });

  it("saveThumbnail: PUT /projects/:id/thumbnail", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.saveThumbnail("p1", "data:image/png;base64,abc");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects/p1/thumbnail`);
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body as string)).toEqual({ thumbnail: "data:image/png;base64,abc" });
  });

  it("saveBOM: PUT /projects/:id/bom with items array", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true, count: 2 }));
    const items = [
      { material_id: "pine_48x98_c24", quantity: 10, unit: "jm" },
      { material_id: "osb_9mm", quantity: 5, unit: "m2" },
    ];

    await api.saveBOM("p1", items);

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects/p1/bom`);
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body as string)).toEqual({ items });
  });

  it("shareProject: POST /projects/:id/share", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ share_token: "abc" }));

    await api.shareProject("p1");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects/p1/share`);
    expect(opts.method).toBe("POST");
  });

  it("unshareProject: DELETE /projects/:id/share", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ ok: true }));

    await api.unshareProject("p1");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects/p1/share`);
    expect(opts.method).toBe("DELETE");
  });

  it("getSharedProject: GET /shared/:token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ id: "p1", name: "Shared" }));

    await api.getSharedProject("share-token-abc");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/shared/share-token-abc`);
  });

  it("exportBOM: GET /bom/export/:projectId", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.exportBOM("p1");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/bom/export/p1`);
  });
});

// ---------------------------------------------------------------------------
// Materials, Suppliers, Pricing endpoints
// ---------------------------------------------------------------------------

describe("Materials endpoints", () => {
  it("getMaterials: GET /materials", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.getMaterials();

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/materials`);
  });

  it("getMaterial: GET /materials/:id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ id: "pine_48x98_c24" }));

    await api.getMaterial("pine_48x98_c24");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/materials/pine_48x98_c24`);
  });

  it("getMaterialPrices: GET /materials/:id/prices", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ prices: [] }));

    await api.getMaterialPrices("pine_48x98_c24");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/materials/pine_48x98_c24/prices`);
  });
});

describe("Suppliers endpoints", () => {
  it("getSuppliers: GET /suppliers", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.getSuppliers();

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/suppliers`);
  });

  it("getSupplier: GET /suppliers/:id", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ id: "k-rauta" }));

    await api.getSupplier("k-rauta");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/suppliers/k-rauta`);
  });
});

describe("Pricing endpoints", () => {
  it("comparePrices: GET /pricing/compare/:materialId", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.comparePrices("pine_48x98_c24");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/pricing/compare/pine_48x98_c24`);
  });

  it("getStock: GET /pricing/stock/:materialId", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ stock: [] }));

    await api.getStock("pine_48x98_c24");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/pricing/stock/pine_48x98_c24`);
  });

  it("getPriceHistory: GET /pricing/history/:materialId", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.getPriceHistory("pine_48x98_c24");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/pricing/history/pine_48x98_c24`);
  });

  it("getStalePrices: GET /pricing/stale", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.getStalePrices();

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/pricing/stale`);
  });
});

// ---------------------------------------------------------------------------
// Kesko endpoints
// ---------------------------------------------------------------------------

describe("Kesko endpoints", () => {
  it("searchKeskoProducts: GET /kesko/products/search with query params", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ products: [] }));

    await api.searchKeskoProducts("timber");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/kesko/products/search?q=timber`);
  });

  it("searchKeskoProducts: includes branchCode when provided", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ products: [] }));

    await api.searchKeskoProducts("timber", "0123");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/kesko/products/search?q=timber&branchCode=0123`);
  });

  it("importKeskoProduct: POST /kesko/products/import with productId and product", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ material: {}, bom_item: {} }));

    const product = {
      id: "kesko-123",
      materialId: "kesko_timber",
      name: "Timber 48x98",
      ean: null,
      sku: "SKU-1",
      unitPrice: 12.5,
      priceText: "12,50 EUR",
      regularUnitPrice: 12.5,
      regularPriceText: "12,50 EUR",
      currency: "EUR",
      unit: "jm",
      imageUrl: null,
      productUrl: null,
      campaignLabel: null,
      campaignEndsAt: null,
      stockLevel: "in_stock" as const,
      stockQuantity: null,
      storeName: null,
      storeLocation: null,
      categoryName: null,
      branchCode: "0123",
      lastCheckedAt: "2026-01-01T00:00:00Z",
    };

    await api.importKeskoProduct(product);

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/kesko/products/import`);
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.productId).toBe("kesko-123");
    expect(body.product).toEqual(product);
  });
});

// ---------------------------------------------------------------------------
// Subsidy, Waste, Building endpoints
// ---------------------------------------------------------------------------

describe("Subsidy endpoints", () => {
  it("estimateEnergySubsidy: POST /subsidies/energy/estimate", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ totalCost: 10000, bestAmount: 4000 }));

    const request = {
      totalCost: 10000,
      currentHeating: "oil" as const,
      targetHeating: "ground_source_heat_pump" as const,
      buildingType: "omakotitalo" as const,
      yearRoundResidential: true,
      applicantAgeGroup: "under_65" as const,
      applicantDisabled: false,
      heatingSystemCondition: "ok" as const,
    };

    await api.estimateEnergySubsidy(request);

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/subsidies/energy/estimate`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual(request);
  });
});

describe("Waste endpoints", () => {
  it("getWasteEstimate: GET /waste/estimate?projectId=<encoded>", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ totalWeightKg: 100 }));

    await api.getWasteEstimate("project-uuid-123");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/waste/estimate?projectId=project-uuid-123`);
  });
});

describe("Building endpoints", () => {
  it("getBuilding: GET /building?address=<encoded>", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ address: "Test 1" }));

    await api.getBuilding("Mannerheimintie 1, Helsinki");

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/building?address=Mannerheimintie%201%2C%20Helsinki`);
  });
});

// ---------------------------------------------------------------------------
// Chat endpoint
// ---------------------------------------------------------------------------

describe("Chat endpoint", () => {
  it("chat: POST /chat with messages, currentScene, and context", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ role: "assistant", content: "Hello" }));

    const messages = [{ role: "user", content: "Add a roof" }];
    const currentScene = "// scene code";
    const context = {
      bomSummary: [{ material: "Pine", qty: 10, unit: "jm", total: 50 }],
      buildingInfo: { address: "Test 1", type: "omakotitalo", year_built: 1990 },
      projectInfo: { name: "Test Project" },
    };

    await api.chat(messages, currentScene, context);

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/chat`);
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string);
    expect(body.messages).toEqual(messages);
    expect(body.currentScene).toBe(currentScene);
    expect(body.bomSummary).toEqual(context.bomSummary);
    expect(body.buildingInfo).toEqual(context.buildingInfo);
    expect(body.projectInfo).toEqual(context.projectInfo);
  });

  it("chat: omits undefined context fields", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ role: "assistant", content: "Hi" }));

    await api.chat([{ role: "user", content: "Hello" }], "// scene");

    const [, opts] = lastFetchCall();
    const body = JSON.parse(opts.body as string);
    expect(body.bomSummary).toBeUndefined();
    expect(body.buildingInfo).toBeUndefined();
    expect(body.projectInfo).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Catalog / Template endpoints
// ---------------------------------------------------------------------------

describe("Catalog endpoints", () => {
  it("getCategories: GET /categories", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.getCategories();

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/categories`);
  });

  it("getTemplates: GET /templates", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.getTemplates();

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/templates`);
  });
});

// ---------------------------------------------------------------------------
// Entitlement endpoints
// ---------------------------------------------------------------------------

describe("Entitlement endpoints", () => {
  it("getEntitlements: GET /entitlements", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ plan: "free" }));

    await api.getEntitlements();

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/entitlements`);
  });

  it("getEntitlementUsage: GET /entitlements/usage", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ quota: {} }));

    await api.getEntitlementUsage();

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/entitlements/usage`);
  });

  it("getPlans: GET /entitlements/plans", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.getPlans();

    const [url] = lastFetchCall();
    expect(url).toBe(`${API_URL}/entitlements/plans`);
  });

  it("setAdminOverride: POST /entitlements/admin/override", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse({ message: "ok" }));

    await api.setAdminOverride("user-1", "aiMessages", true);

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/entitlements/admin/override`);
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body as string)).toEqual({
      userId: "user-1",
      feature: "aiMessages",
      allow: true,
    });
  });
});

// ---------------------------------------------------------------------------
// Auth header inclusion
// ---------------------------------------------------------------------------

describe("Auth header inclusion", () => {
  it("includes Bearer token on authenticated endpoints", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.getProjects();

    const [, opts] = lastFetchCall();
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-jwt-token-abc");
  });

  it("includes Content-Type: application/json on all requests", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.getProjects();

    const [, opts] = lastFetchCall();
    expect((opts.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("does not include auth header when no token is set", async () => {
    setToken(null);
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse([]));

    await api.getTemplates();

    const [, opts] = lastFetchCall();
    expect((opts.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

describe("Error handling", () => {
  it("throws ApiError with status 400", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ error: "Bad request" }, 400, "Bad Request")
    );

    await expect(api.getProjects()).rejects.toThrow(ApiError);
    await expect(
      vi.mocked(fetch).mockResolvedValueOnce(
        mockResponse({ error: "Bad request" }, 400, "Bad Request")
      ) && api.getProjects()
    ).rejects.toMatchObject({ status: 400 });
  });

  it("throws ApiError with server error message when provided", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ error: "Custom error message" }, 422, "Unprocessable Entity")
    );

    try {
      await api.getProjects();
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe("Custom error message");
      expect((err as ApiError).status).toBe(422);
    }
  });

  it("uses fallback error message when server returns no error field", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({}, 500, "Internal Server Error")
    );

    try {
      await api.getProjects();
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(500);
      expect((err as ApiError).message).toContain("Palvelinvirhe");
    }
  });

  it("throws ApiError with status 403", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ error: "Forbidden" }, 403, "Forbidden")
    );

    try {
      await api.getProjects();
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(403);
    }
  });

  it("throws ApiError with status 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ error: "Not found" }, 404, "Not Found")
    );

    try {
      await api.getProject("nonexistent");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(404);
    }
  });

  it("on 401 for non-auth endpoints, attempts token refresh then clears token", async () => {
    // First call returns 401
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ error: "Invalid token" }, 401, "Unauthorized")
    );
    // Refresh attempt also fails
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ error: "Token expired" }, 401, "Unauthorized")
    );

    try {
      await api.getProjects();
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
    }

    // Token should be cleared after failed refresh
    expect(getToken()).toBeNull();
  });

  it("on 401, does NOT attempt refresh for auth endpoints (login)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ error: "Invalid credentials" }, 401, "Unauthorized")
    );

    try {
      await api.login("wrong@test.fi", "badpass");
      expect.fail("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(401);
    }

    // Only one fetch call (the login itself, no refresh attempt)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });

  it("on 401 with successful refresh, retries the original request", async () => {
    // First call returns 401
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ error: "Expired" }, 401, "Unauthorized")
    );
    // Refresh succeeds
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse({ token: "new-token", token_expires_at: tokenExpiry() })
    );
    // Retry succeeds
    vi.mocked(fetch).mockResolvedValueOnce(
      mockResponse([{ id: "p1" }])
    );

    const result = await api.getProjects();

    expect(result).toEqual([{ id: "p1" }]);
    // 3 calls: original, refresh, retry
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });
});

// ---------------------------------------------------------------------------
// Token management
// ---------------------------------------------------------------------------

describe("Token management", () => {
  it("setToken stores and retrieves token", () => {
    setToken("my-token-123");
    expect(getToken()).toBe("my-token-123");
  });

  it("setToken(null) clears the token", () => {
    setToken("my-token-123");
    setToken(null);
    expect(getToken()).toBeNull();
  });

  it("setToken persists only a non-secret session hint to localStorage", () => {
    setToken("persist-token");
    expect(localStorage.getItem("helscoop_session_active")).toBe("true");
    expect(localStorage.getItem("helscoop_token")).toBeNull();
    expect(hasAuthSession()).toBe(true);
  });

  it("setToken(null) removes session hints and legacy token storage", () => {
    setToken("persist-token");
    localStorage.setItem("helscoop_token", "legacy-token");
    setToken(null);
    expect(localStorage.getItem("helscoop_session_active")).toBeNull();
    expect(localStorage.getItem("helscoop_token")).toBeNull();
  });

  it("setToken with expiresAt stores non-secret session expiry hint", () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    setToken("token", expiresAt);
    expect(localStorage.getItem("helscoop_session_expires_at")).toBe(String(expiresAt));
    expect(localStorage.getItem("helscoop_token_expires_at")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PDF and CSV export (bypass apiFetch)
// ---------------------------------------------------------------------------

describe("PDF and CSV export", () => {
  it("exportPdf: GET /projects/:id/pdf?lang=<lang> with auth header", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(null, 200));
    const { anchor } = mockDownloadAnchor();
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn().mockReturnValue("blob:test"), revokeObjectURL: vi.fn() });

    await api.exportPdf("p1", "Test Project", "fi");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/projects/p1/pdf?lang=fi`);
    expect(opts.credentials).toBe("include");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-jwt-token-abc");
    expect(anchor.download).toBe("helscoop_Test_Project.pdf");
  });

  it("exportBOMCsv: GET /bom/export/:projectId?format=csv with auth header", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(null, 200));
    const { anchor } = mockDownloadAnchor();
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn().mockReturnValue("blob:test"), revokeObjectURL: vi.fn() });

    await api.exportBOMCsv("p1", "My Project");

    const [url, opts] = lastFetchCall();
    expect(url).toBe(`${API_URL}/bom/export/p1?format=csv`);
    expect(opts.credentials).toBe("include");
    expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-jwt-token-abc");
    expect(anchor.download).toBe("helscoop_My_Project.csv");
  });

  it("exportBOMCsv: throws ApiError on non-200 response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(null, 404, "Not Found"));

    await expect(api.exportBOMCsv("p1", "Test")).rejects.toThrow(ApiError);
  });

  it("exportPdf: throws ApiError on non-200 response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockResponse(null, 500, "Server Error"));

    await expect(api.exportPdf("p1", "Test", "fi")).rejects.toThrow(ApiError);
  });
});
