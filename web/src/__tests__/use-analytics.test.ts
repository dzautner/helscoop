import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnalytics, useEditorSession, PLAUSIBLE_DOMAIN } from "@/hooks/useAnalytics";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let consoleSpy: any;
const win = window as any;

beforeEach(() => {
  vi.clearAllMocks();
  consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  win.plausible = undefined;
  Object.defineProperty(window, "location", {
    value: { hostname: "localhost" },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  consoleSpy.mockRestore();
});

describe("PLAUSIBLE_DOMAIN", () => {
  it("is helscoop.fi", () => {
    expect(PLAUSIBLE_DOMAIN).toBe("helscoop.fi");
  });
});

describe("useAnalytics", () => {
  it("returns a track function", () => {
    const { result } = renderHook(() => useAnalytics());
    expect(typeof result.current.track).toBe("function");
  });

  it("logs to console.debug on localhost", () => {
    const { result } = renderHook(() => useAnalytics());
    act(() => {
      result.current.track("address_search", { query_length: 5, had_result: true });
    });
    expect(consoleSpy).toHaveBeenCalledWith(
      "[analytics] address_search",
      expect.objectContaining({ query_length: 5, had_result: true }),
    );
  });

  it("does not call plausible on localhost even if defined", () => {
    const mockPlausible = vi.fn();
    win.plausible = mockPlausible;
    const { result } = renderHook(() => useAnalytics());
    act(() => {
      result.current.track("page_view", { path: "/test" });
    });
    expect(mockPlausible).not.toHaveBeenCalled();
  });

  it("calls window.plausible in production", () => {
    const mockPlausible = vi.fn();
    win.plausible = mockPlausible;
    Object.defineProperty(window, "location", {
      value: { hostname: "helscoop.fi" },
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useAnalytics());
    act(() => {
      result.current.track("project_created", { source: "template" });
    });
    expect(mockPlausible).toHaveBeenCalledWith("project_created", {
      props: { source: "template" },
    });
  });

  it("is a no-op when plausible not loaded in production", () => {
    Object.defineProperty(window, "location", {
      value: { hostname: "helscoop.fi" },
      writable: true,
      configurable: true,
    });
    win.plausible = undefined;
    const { result } = renderHook(() => useAnalytics());
    expect(() => {
      act(() => {
        result.current.track("auth_login", {} as any);
      });
    }).not.toThrow();
  });

  it("passes props to plausible in production", () => {
    const mockPlausible = vi.fn();
    win.plausible = mockPlausible;
    Object.defineProperty(window, "location", {
      value: { hostname: "helscoop.fi" },
      writable: true,
      configurable: true,
    });
    const { result } = renderHook(() => useAnalytics());
    act(() => {
      result.current.track("bom_exported", { format: "pdf" });
    });
    expect(mockPlausible).toHaveBeenCalledWith("bom_exported", {
      props: { format: "pdf" },
    });
  });
});

describe("useEditorSession", () => {
  it("returns markCodeEditor and markChat functions", () => {
    const { result } = renderHook(() => useEditorSession());
    expect(typeof result.current.markCodeEditor).toBe("function");
    expect(typeof result.current.markChat).toBe("function");
  });

  it("calls markCodeEditor without error", () => {
    const { result } = renderHook(() => useEditorSession());
    expect(() => {
      act(() => {
        result.current.markCodeEditor();
      });
    }).not.toThrow();
  });

  it("calls markChat without error", () => {
    const { result } = renderHook(() => useEditorSession());
    expect(() => {
      act(() => {
        result.current.markChat();
      });
    }).not.toThrow();
  });
});
