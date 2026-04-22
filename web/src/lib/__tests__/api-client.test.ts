import { describe, it, expect, beforeEach, vi } from "vitest";
import { ApiError, setToken, getToken, stopRefreshTimer } from "@/lib/api";

describe("ApiError", () => {
  it("sets name, status, and statusText", () => {
    const err = new ApiError("Not found", 404, "Not Found");
    expect(err.name).toBe("ApiError");
    expect(err.message).toBe("Not found");
    expect(err.status).toBe(404);
    expect(err.statusText).toBe("Not Found");
    expect(err).toBeInstanceOf(Error);
  });

  it("inherits from Error", () => {
    const err = new ApiError("fail", 500, "Internal Server Error");
    expect(err instanceof Error).toBe(true);
    expect(err.stack).toBeDefined();
  });
});

describe("setToken / getToken", () => {
  beforeEach(() => {
    localStorage.clear();
    setToken(null);
    stopRefreshTimer();
  });

  it("stores and retrieves a token", () => {
    setToken("abc123");
    expect(getToken()).toBe("abc123");
    expect(localStorage.getItem("helscoop_token")).toBe("abc123");
  });

  it("stores expiry timestamp when provided", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    setToken("t1", exp);
    expect(localStorage.getItem("helscoop_token_expires_at")).toBe(String(exp));
  });

  it("clears token and expiry on null", () => {
    setToken("t2", 12345);
    setToken(null);
    expect(getToken()).toBeNull();
    expect(localStorage.getItem("helscoop_token")).toBeNull();
    expect(localStorage.getItem("helscoop_token_expires_at")).toBeNull();
  });

  it("reads token from localStorage when in-memory is null", () => {
    localStorage.setItem("helscoop_token", "from-storage");
    setToken(null);
    // Force in-memory to null without clearing localStorage
    // getToken should fall back to localStorage
    const directGet = getToken();
    // After clearing with setToken(null), localStorage is also cleared
    // So let's set it directly
    localStorage.setItem("helscoop_token", "from-storage-2");
    // Reset in-memory by accessing internal state via a trick:
    // We need to call setToken(null) which clears localStorage, then manually set localStorage
    setToken(null);
    localStorage.setItem("helscoop_token", "fallback-token");
    expect(getToken()).toBe("fallback-token");
  });
});
