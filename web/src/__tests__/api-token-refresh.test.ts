/**
 * Token Refresh Race Condition Tests
 *
 * Exercises the 401 → refresh → retry flow in the API client, covering:
 *   - Two concurrent requests both getting 401: only one refresh occurs
 *   - Refresh succeeds but retry still fails: clean error propagation
 *   - Refresh endpoint returns 401 itself: no infinite loop
 *   - Token expiry detected proactively before the request is sent
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock fetch globally before importing the module under test
// ---------------------------------------------------------------------------
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Mock localStorage
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete store[key];
  }),
};
vi.stubGlobal("localStorage", localStorageMock);

// Prevent window.location.href assignment from erroring in tests
const locationMock = { href: "/" };
vi.stubGlobal("window", { location: locationMock, localStorage: localStorageMock });

// Import after global mocks are set up
import { api, setToken, getToken, ApiError, stopRefreshTimer } from "@/lib/api";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown, statusText = "OK") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    blob: () => Promise.resolve(new Blob()),
    headers: new Headers(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Clear store
  for (const key of Object.keys(store)) delete store[key];
  // Reset token state — set to null clears localStorage and the in-memory var
  setToken(null);
  locationMock.href = "/";
});

afterEach(() => {
  stopRefreshTimer();
});

// ---------------------------------------------------------------------------
// 1. Concurrent 401s — deduplicated refresh
// ---------------------------------------------------------------------------

describe("concurrent 401 handling", () => {
  it("deduplicates refresh when two requests both get 401", async () => {
    // Set a valid token (not expiring soon to skip proactive refresh)
    const now = Math.floor(Date.now() / 1000);
    setToken("old-token", now + 600);

    let refreshCallCount = 0;

    fetchMock.mockImplementation(async (url: string, opts?: RequestInit) => {
      const urlStr = url.toString();

      if (urlStr.includes("/auth/refresh")) {
        refreshCallCount++;
        return jsonResponse(200, {
          token: "new-token",
          token_expires_at: now + 900,
        });
      }

      // First call to any endpoint with old token: 401
      const authHeader = (opts?.headers as Record<string, string>)?.Authorization || "";
      if (authHeader.includes("old-token")) {
        return jsonResponse(401, { error: "Token expired" }, "Unauthorized");
      }

      // Retry with new token succeeds
      if (authHeader.includes("new-token")) {
        if (urlStr.includes("/projects")) {
          return jsonResponse(200, [{ id: "p1", name: "Test" }]);
        }
        if (urlStr.includes("/materials")) {
          return jsonResponse(200, [{ id: "m1", name: "Pine" }]);
        }
      }

      return jsonResponse(500, { error: "Unexpected" });
    });

    // Fire two concurrent requests
    const [projects, materials] = await Promise.all([
      api.getProjects(),
      api.getMaterials(),
    ]);

    // Both should succeed
    expect(projects).toEqual([{ id: "p1", name: "Test" }]);
    expect(materials).toEqual([{ id: "m1", name: "Pine" }]);

    // Refresh should have been called exactly once (deduplication via refreshOnce)
    expect(refreshCallCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 2. Refresh succeeds but retry fails
// ---------------------------------------------------------------------------

describe("refresh succeeds but retry fails", () => {
  it("throws ApiError and clears token when retry also returns 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    setToken("old-token", now + 600);

    fetchMock.mockImplementation(async (url: string, opts?: RequestInit) => {
      const urlStr = url.toString();
      const authHeader = (opts?.headers as Record<string, string>)?.Authorization || "";

      if (urlStr.includes("/auth/refresh")) {
        return jsonResponse(200, {
          token: "new-token",
          token_expires_at: now + 900,
        });
      }

      // First call: 401
      if (authHeader.includes("old-token") && urlStr.includes("/projects")) {
        return jsonResponse(401, { error: "Token expired" }, "Unauthorized");
      }

      // Retry with new token also fails
      if (authHeader.includes("new-token") && urlStr.includes("/projects")) {
        return jsonResponse(401, { error: "Still unauthorized" }, "Unauthorized");
      }

      return jsonResponse(500, { error: "Unexpected" });
    });

    await expect(api.getProjects()).rejects.toThrow(ApiError);

    // Token should be cleared (logged out)
    expect(getToken()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Refresh returns 401 — no infinite loop
// ---------------------------------------------------------------------------

describe("refresh endpoint returns 401", () => {
  it("does not loop and logs the user out", async () => {
    const now = Math.floor(Date.now() / 1000);
    setToken("expired-token", now + 600);

    let refreshAttempts = 0;

    fetchMock.mockImplementation(async (url: string) => {
      const urlStr = url.toString();

      if (urlStr.includes("/auth/refresh")) {
        refreshAttempts++;
        return jsonResponse(401, { error: "Token expired or invalid" }, "Unauthorized");
      }

      if (urlStr.includes("/projects")) {
        return jsonResponse(401, { error: "Unauthorized" }, "Unauthorized");
      }

      return jsonResponse(500, { error: "Unexpected" });
    });

    await expect(api.getProjects()).rejects.toThrow(ApiError);

    // Should only attempt refresh once, not loop
    expect(refreshAttempts).toBe(1);

    // Should be logged out
    expect(getToken()).toBeNull();
    expect(locationMock.href).toBe("/");
  });
});

describe("cookie-backed refresh without local session hint", () => {
  it("attempts refresh after 401 even when the in-memory token and local hint are absent", async () => {
    setToken(null);
    const now = Math.floor(Date.now() / 1000);
    let refreshAttempts = 0;

    fetchMock.mockImplementation(async (url: string, opts?: RequestInit) => {
      const urlStr = url.toString();
      const authHeader = (opts?.headers as Record<string, string>)?.Authorization || "";

      if (urlStr.includes("/auth/refresh")) {
        refreshAttempts++;
        expect(authHeader).toBe("");
        return jsonResponse(200, {
          token: "cookie-refreshed-token",
          token_expires_at: now + 900,
        });
      }

      if (urlStr.includes("/projects") && authHeader.includes("cookie-refreshed-token")) {
        return jsonResponse(200, [{ id: "p1", name: "Recovered" }]);
      }

      if (urlStr.includes("/projects")) {
        return jsonResponse(401, { error: "Cookie token expired" }, "Unauthorized");
      }

      return jsonResponse(500, { error: "Unexpected" });
    });

    await expect(api.getProjects()).resolves.toEqual([{ id: "p1", name: "Recovered" }]);
    expect(refreshAttempts).toBe(1);
    expect(getToken()).toBe("cookie-refreshed-token");
  });
});

// ---------------------------------------------------------------------------
// 4. Proactive refresh when token is about to expire
// ---------------------------------------------------------------------------

describe("proactive token refresh", () => {
  it("refreshes token before the request when it is about to expire", async () => {
    const now = Math.floor(Date.now() / 1000);
    // Token expires in 2 minutes — within the 5-minute threshold
    setToken("about-to-expire", now + 120);

    let refreshCalled = false;

    fetchMock.mockImplementation(async (url: string) => {
      const urlStr = url.toString();

      if (urlStr.includes("/auth/refresh")) {
        refreshCalled = true;
        return jsonResponse(200, {
          token: "fresh-token",
          token_expires_at: now + 900,
        });
      }

      // The actual request — should succeed
      if (urlStr.includes("/projects")) {
        return jsonResponse(200, [{ id: "p1" }]);
      }

      return jsonResponse(500, { error: "Unexpected" });
    });

    const result = await api.getProjects();

    expect(refreshCalled).toBe(true);
    expect(result).toEqual([{ id: "p1" }]);
  });

  it("skips proactive refresh when token has plenty of time left", async () => {
    const now = Math.floor(Date.now() / 1000);
    // Token expires in 10 minutes — well outside the 5-minute threshold
    setToken("valid-token", now + 600);

    let refreshCalled = false;

    fetchMock.mockImplementation(async (url: string) => {
      const urlStr = url.toString();

      if (urlStr.includes("/auth/refresh")) {
        refreshCalled = true;
        return jsonResponse(200, { token: "x" });
      }

      if (urlStr.includes("/projects")) {
        return jsonResponse(200, []);
      }

      return jsonResponse(500, { error: "Unexpected" });
    });

    await api.getProjects();
    expect(refreshCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Auth endpoints are NOT retried on 401
// ---------------------------------------------------------------------------

describe("auth endpoints not retried", () => {
  it("does not attempt refresh for /auth/login 401", async () => {
    setToken(null);

    let refreshCalled = false;

    fetchMock.mockImplementation(async (url: string) => {
      const urlStr = url.toString();

      if (urlStr.includes("/auth/refresh")) {
        refreshCalled = true;
        return jsonResponse(200, { token: "x" });
      }

      if (urlStr.includes("/auth/login")) {
        return jsonResponse(401, { error: "Invalid credentials" }, "Unauthorized");
      }

      return jsonResponse(500, { error: "Unexpected" });
    });

    await expect(api.login("bad@example.com", "wrong")).rejects.toThrow(ApiError);
    expect(refreshCalled).toBe(false);
  });

  it("does not attempt refresh for /auth/register 401", async () => {
    setToken(null);

    let refreshCalled = false;

    fetchMock.mockImplementation(async (url: string) => {
      const urlStr = url.toString();

      if (urlStr.includes("/auth/refresh")) {
        refreshCalled = true;
        return jsonResponse(200, { token: "x" });
      }

      if (urlStr.includes("/auth/register")) {
        return jsonResponse(401, { error: "Forbidden" }, "Unauthorized");
      }

      return jsonResponse(500, { error: "Unexpected" });
    });

    await expect(api.register("x@x.com", "password123", "Name")).rejects.toThrow(ApiError);
    expect(refreshCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Error message propagation
// ---------------------------------------------------------------------------

describe("error message propagation", () => {
  it("uses server error message when available", async () => {
    const now = Math.floor(Date.now() / 1000);
    setToken("valid-token", now + 600);

    fetchMock.mockImplementation(async () => {
      return jsonResponse(422, { error: "Missing field: name" });
    });

    try {
      await api.createProject({ name: "" });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).message).toBe("Missing field: name");
      expect((err as ApiError).status).toBe(422);
    }
  });

  it("uses fallback message when server body is not JSON", async () => {
    const now = Math.floor(Date.now() / 1000);
    setToken("valid-token", now + 600);

    fetchMock.mockImplementation(async () => {
      return {
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.reject(new Error("not json")),
      };
    });

    try {
      await api.getProjects();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(500);
    }
  });

  it("includes status code in ApiError", async () => {
    const now = Math.floor(Date.now() / 1000);
    setToken("valid-token", now + 600);

    fetchMock.mockImplementation(async () => {
      return jsonResponse(429, { error: "Too many requests" });
    });

    try {
      await api.getProjects();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(429);
      expect((err as ApiError).message).toBe("Too many requests");
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Token state management
// ---------------------------------------------------------------------------

describe("token state management", () => {
  it("setToken persists session hint to localStorage", () => {
    const now = Math.floor(Date.now() / 1000);
    setToken("test-token", now + 900);

    // Session cookie flow: token lives in memory + http-only cookie,
    // localStorage only stores a session-active hint and expiry for the UI.
    expect(localStorageMock.setItem).toHaveBeenCalledWith("helscoop_session_active", "true");
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "helscoop_session_expires_at",
      String(now + 900),
    );
  });

  it("setToken(null) removes from localStorage", () => {
    setToken(null);

    expect(localStorageMock.removeItem).toHaveBeenCalledWith("helscoop_session_active");
    expect(localStorageMock.removeItem).toHaveBeenCalledWith("helscoop_session_expires_at");
  });

  it("getToken returns in-memory token set via setToken", () => {
    // Reset in-memory token
    setToken(null);

    // Set a token — it's kept in memory, not localStorage
    const now = Math.floor(Date.now() / 1000);
    setToken("stored-token", now + 600);

    const token = getToken();
    expect(token).toBe("stored-token");
  });
});
