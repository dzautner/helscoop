import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";

let rafCallbacks: ((ts: number) => void)[] = [];
let rafId = 0;

beforeEach(() => {
  rafCallbacks = [];
  rafId = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: (ts: number) => void) => {
    rafCallbacks.push(cb);
    return ++rafId;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    // no-op for tests
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function flushRaf(timestamp: number) {
  const cbs = [...rafCallbacks];
  rafCallbacks = [];
  cbs.forEach((cb) => cb(timestamp));
}

describe("useAnimatedNumber", () => {
  it("returns the initial target immediately", () => {
    const { result } = renderHook(() => useAnimatedNumber(100));
    expect(result.current).toBe(100);
  });

  it("starts animating when target changes", () => {
    const { result, rerender } = renderHook(
      ({ target }) => useAnimatedNumber(target, 400),
      { initialProps: { target: 0 } },
    );
    expect(result.current).toBe(0);

    rerender({ target: 100 });
    expect(rafCallbacks.length).toBeGreaterThan(0);
  });

  it("reaches exact target at end of animation", () => {
    const { result, rerender } = renderHook(
      ({ target }) => useAnimatedNumber(target, 400),
      { initialProps: { target: 0 } },
    );

    rerender({ target: 200 });

    // Simulate first frame at t=0
    act(() => flushRaf(0));
    // Simulate final frame at t=400 (duration)
    act(() => flushRaf(400));

    expect(result.current).toBe(200);
  });

  it("interpolates intermediate values with ease-out", () => {
    const { result, rerender } = renderHook(
      ({ target }) => useAnimatedNumber(target, 1000),
      { initialProps: { target: 0 } },
    );

    rerender({ target: 100 });

    // t=0
    act(() => flushRaf(0));
    // t=500 (50% through)
    act(() => flushRaf(500));

    // Ease-out: 1 - (1-0.5)^3 = 1 - 0.125 = 0.875
    // So at 50% time, we should be at ~87.5% of the way
    expect(result.current).toBeCloseTo(87.5, 0);
  });

  it("does not animate when target stays the same", () => {
    const { result, rerender } = renderHook(
      ({ target }) => useAnimatedNumber(target, 400),
      { initialProps: { target: 50 } },
    );

    rerender({ target: 50 });
    expect(rafCallbacks.length).toBe(0);
    expect(result.current).toBe(50);
  });

  it("cancels previous animation when target changes mid-flight", () => {
    const cancelSpy = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelSpy);

    const { rerender } = renderHook(
      ({ target }) => useAnimatedNumber(target, 400),
      { initialProps: { target: 0 } },
    );

    rerender({ target: 100 });
    act(() => flushRaf(0));

    rerender({ target: 200 });
    expect(cancelSpy).toHaveBeenCalled();
  });

  it("animates downward", () => {
    const { result, rerender } = renderHook(
      ({ target }) => useAnimatedNumber(target, 400),
      { initialProps: { target: 100 } },
    );

    rerender({ target: 0 });

    act(() => flushRaf(0));
    act(() => flushRaf(400));

    expect(result.current).toBe(0);
  });

  it("uses custom duration", () => {
    const { result, rerender } = renderHook(
      ({ target, duration }) => useAnimatedNumber(target, duration),
      { initialProps: { target: 0, duration: 200 } },
    );

    rerender({ target: 100, duration: 200 });

    act(() => flushRaf(0));
    // At 100ms (50% of 200ms duration), ease-out: 1 - (0.5)^3 = 0.875
    act(() => flushRaf(100));
    expect(result.current).toBeCloseTo(87.5, 0);

    act(() => flushRaf(200));
    expect(result.current).toBe(100);
  });
});
