import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCursorGlow } from "@/hooks/useCursorGlow";

let mockRaf: (cb: FrameRequestCallback) => number;

beforeEach(() => {
  vi.clearAllMocks();
  mockRaf = vi.fn((cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal("requestAnimationFrame", mockRaf);
});

describe("useCursorGlow", () => {
  it("returns ref, onMouseMove, and onMouseLeave", () => {
    const { result } = renderHook(() => useCursorGlow());
    expect(result.current.ref).toBeDefined();
    expect(typeof result.current.onMouseMove).toBe("function");
    expect(typeof result.current.onMouseLeave).toBe("function");
  });

  it("sets glow CSS properties on mouse move", () => {
    const { result } = renderHook(() => useCursorGlow());
    const el = document.createElement("div");
    el.getBoundingClientRect = vi.fn(() => ({
      left: 100,
      top: 50,
      right: 300,
      bottom: 150,
      width: 200,
      height: 100,
      x: 100,
      y: 50,
      toJSON: () => {},
    }));
    (result.current.ref as any).current = el;

    act(() => {
      result.current.onMouseMove({ clientX: 150, clientY: 80 } as React.MouseEvent);
    });

    expect(el.style.getPropertyValue("--glow-x")).toBe("50px");
    expect(el.style.getPropertyValue("--glow-y")).toBe("30px");
    expect(el.style.getPropertyValue("--glow-opacity")).toBe("1");
  });

  it("sets glow-opacity to 0 on mouse leave", () => {
    const { result } = renderHook(() => useCursorGlow());
    const el = document.createElement("div");
    (result.current.ref as any).current = el;

    act(() => {
      result.current.onMouseLeave();
    });

    expect(el.style.getPropertyValue("--glow-opacity")).toBe("0");
  });

  it("does nothing on mouse leave when ref is null", () => {
    const { result } = renderHook(() => useCursorGlow());
    expect(() => {
      act(() => {
        result.current.onMouseLeave();
      });
    }).not.toThrow();
  });

  it("does nothing on mouse move when ref is null", () => {
    const { result } = renderHook(() => useCursorGlow());
    expect(() => {
      act(() => {
        result.current.onMouseMove({ clientX: 0, clientY: 0 } as React.MouseEvent);
      });
    }).not.toThrow();
  });

  it("throttles mouse move via requestAnimationFrame", () => {
    let rafCallback: FrameRequestCallback | null = null;
    vi.stubGlobal("requestAnimationFrame", vi.fn((cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    }));

    const { result } = renderHook(() => useCursorGlow());
    const el = document.createElement("div");
    el.getBoundingClientRect = vi.fn(() => ({
      left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => {},
    }));
    (result.current.ref as any).current = el;

    act(() => {
      result.current.onMouseMove({ clientX: 10, clientY: 10 } as React.MouseEvent);
    });

    expect(el.style.getPropertyValue("--glow-x")).toBe("");

    act(() => {
      rafCallback?.(0);
    });

    expect(el.style.getPropertyValue("--glow-x")).toBe("10px");
  });
});
