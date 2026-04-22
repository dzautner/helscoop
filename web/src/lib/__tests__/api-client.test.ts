import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, ApiError, setToken, getToken, stopRefreshTimer } from "@/lib/api";

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

describe("blob-backed downloads", () => {
  const originalCreateObjectUrl = URL.createObjectURL;
  const originalRevokeObjectUrl = URL.revokeObjectURL;

  beforeEach(() => {
    localStorage.clear();
    setToken("download-token");
    stopRefreshTimer();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: originalCreateObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: originalRevokeObjectUrl,
    });
    document.body.innerHTML = "";
    setToken(null);
    stopRefreshTimer();
  });

  it("downloads exported PDFs via an attached anchor before revoking the blob URL", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:pdf-download"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      blob: async () => new Blob(["%PDF-test"], { type: "application/pdf" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    let clickedAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedAnchor = this;
    });

    await api.exportPdf("project-1", "My Project", "fi");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/projects/project-1/pdf?lang=fi", {
      headers: { Authorization: "Bearer download-token" },
    });
    expect(clickedAnchor).not.toBeNull();
    const anchor = clickedAnchor as unknown as HTMLAnchorElement;
    expect(anchor.download).toBe("helscoop_My_Project.pdf");
    expect(anchor.href).toBe("blob:pdf-download");
    expect(document.querySelector("a[download]")).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:pdf-download");
  });
});
