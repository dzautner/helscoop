import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMediaQuery } from "@/hooks/useMediaQuery";

describe("useMediaQuery", () => {
  let matchMediaListeners: Map<string, ((e: { matches: boolean }) => void)[]>;

  beforeEach(() => {
    matchMediaListeners = new Map();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn((query: string) => {
        const listeners: ((e: { matches: boolean }) => void)[] = [];
        matchMediaListeners.set(query, listeners);
        return {
          matches: false,
          media: query,
          addEventListener: vi.fn((_: string, cb: (e: { matches: boolean }) => void) => {
            listeners.push(cb);
          }),
          removeEventListener: vi.fn((_: string, cb: (e: { matches: boolean }) => void) => {
            const idx = listeners.indexOf(cb);
            if (idx >= 0) listeners.splice(idx, 1);
          }),
          addListener: vi.fn(),
          removeListener: vi.fn(),
        };
      }),
    });
  });

  it("returns false by default", () => {
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);
  });

  it("returns initial match state", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn(() => ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(true);
  });

  it("updates when media query changes", () => {
    let currentMatches = false;
    const listeners: (() => void)[] = [];
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn(() => ({
        get matches() { return currentMatches; },
        addEventListener: vi.fn((_: string, cb: () => void) => { listeners.push(cb); }),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });

    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    expect(result.current).toBe(false);

    currentMatches = true;
    act(() => {
      listeners.forEach((cb) => cb());
    });
    expect(result.current).toBe(true);
  });

  it("cleans up listener on unmount", () => {
    const removeEventListener = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener,
        addListener: vi.fn(),
        removeListener: vi.fn(),
      })),
    });
    const { unmount } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    unmount();
    expect(removeEventListener).toHaveBeenCalled();
  });

  it("updates when query string changes", () => {
    const { result, rerender } = renderHook(
      ({ query }) => useMediaQuery(query),
      { initialProps: { query: "(min-width: 768px)" } },
    );
    expect(result.current).toBe(false);
    rerender({ query: "(min-width: 1024px)" });
    expect(result.current).toBe(false);
  });
});
