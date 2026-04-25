import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { api, ApiError, setToken, getToken, hasAuthSession, stopRefreshTimer } from "@/lib/api";

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

  it("stores token in memory and only persists a non-secret session hint", () => {
    setToken("abc123");
    expect(getToken()).toBe("abc123");
    expect(hasAuthSession()).toBe(true);
    expect(localStorage.getItem("helscoop_session_active")).toBe("true");
    expect(localStorage.getItem("helscoop_token")).toBeNull();
  });

  it("stores non-secret expiry timestamp when provided", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    setToken("t1", exp);
    expect(localStorage.getItem("helscoop_session_expires_at")).toBe(String(exp));
    expect(localStorage.getItem("helscoop_token_expires_at")).toBeNull();
  });

  it("clears token, session hint, and legacy localStorage tokens on null", () => {
    setToken("t2", 12345);
    localStorage.setItem("helscoop_token", "legacy-token");
    localStorage.setItem("helscoop_token_expires_at", "12345");
    setToken(null);
    expect(getToken()).toBeNull();
    expect(hasAuthSession()).toBe(false);
    expect(localStorage.getItem("helscoop_session_active")).toBeNull();
    expect(localStorage.getItem("helscoop_session_expires_at")).toBeNull();
    expect(localStorage.getItem("helscoop_token")).toBeNull();
    expect(localStorage.getItem("helscoop_token_expires_at")).toBeNull();
  });

  it("does not restore bearer tokens from legacy localStorage", () => {
    localStorage.setItem("helscoop_token", "fallback-token");
    localStorage.setItem("helscoop_token_expires_at", "9999999999");
    expect(getToken()).toBeNull();
    expect(localStorage.getItem("helscoop_token")).toBeNull();
    expect(localStorage.getItem("helscoop_token_expires_at")).toBeNull();
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
      credentials: "include",
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

  it("returns generated IFC text for preview without triggering a download", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "ISO-10303-21; IFC4X3_ADD2;",
    }));
    vi.stubGlobal("fetch", fetchMock);

    const ifcText = await api.getIFC("project-1");

    expect(ifcText).toBe("ISO-10303-21; IFC4X3_ADD2;");
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/ifc-export/generate?projectId=project-1", {
      credentials: "include",
      headers: { Authorization: "Bearer download-token" },
    });
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
