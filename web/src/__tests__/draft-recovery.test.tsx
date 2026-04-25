import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDraftRecovery } from "@/hooks/useDraftRecovery";

const mockStorage: Record<string, string> = {};

beforeEach(() => {
  vi.useFakeTimers();
  Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation((key: string) => mockStorage[key] ?? null);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation((key: string, value: string) => {
    mockStorage[key] = value;
  });
  vi.spyOn(Storage.prototype, "removeItem").mockImplementation((key: string) => {
    delete mockStorage[key];
  });
});

describe("useDraftRecovery", () => {
  it("returns hasDraft false when no stored draft", () => {
    const { result } = renderHook(() =>
      useDraftRecovery("p1", "script", "script", vi.fn()),
    );
    expect(result.current.hasDraft).toBe(false);
  });

  it("detects existing draft that differs from saved", () => {
    mockStorage["helscoop-draft-p1"] = "modified script";
    const { result } = renderHook(() =>
      useDraftRecovery("p1", "saved script", "saved script", vi.fn()),
    );
    expect(result.current.hasDraft).toBe(true);
  });

  it("does not detect draft when it matches saved", () => {
    mockStorage["helscoop-draft-p1"] = "saved script";
    const { result } = renderHook(() =>
      useDraftRecovery("p1", "saved script", "saved script", vi.fn()),
    );
    expect(result.current.hasDraft).toBe(false);
  });

  it("restores draft via onRestore callback", () => {
    mockStorage["helscoop-draft-p1"] = "draft content";
    const onRestore = vi.fn();
    const { result } = renderHook(() =>
      useDraftRecovery("p1", "saved", "saved", onRestore),
    );
    act(() => { result.current.restore(); });
    expect(onRestore).toHaveBeenCalledWith("draft content");
    expect(result.current.hasDraft).toBe(false);
  });

  it("discards draft from localStorage", () => {
    mockStorage["helscoop-draft-p1"] = "draft content";
    const { result } = renderHook(() =>
      useDraftRecovery("p1", "saved", "saved", vi.fn()),
    );
    act(() => { result.current.discard(); });
    expect(result.current.hasDraft).toBe(false);
    expect(mockStorage["helscoop-draft-p1"]).toBeUndefined();
  });

  it("clearDraft removes from localStorage", () => {
    mockStorage["helscoop-draft-p1"] = "draft content";
    const { result } = renderHook(() =>
      useDraftRecovery("p1", "saved", "saved", vi.fn()),
    );
    act(() => { result.current.clearDraft(); });
    expect(mockStorage["helscoop-draft-p1"]).toBeUndefined();
    expect(result.current.hasDraft).toBe(false);
  });

  it("returns no draft when projectId is null", () => {
    const { result } = renderHook(() =>
      useDraftRecovery(null, "script", "script", vi.fn()),
    );
    expect(result.current.hasDraft).toBe(false);
  });

  it("saves draft to localStorage after debounce", () => {
    const { result } = renderHook(() =>
      useDraftRecovery("p1", "saved", "saved", vi.fn()),
    );
    // Tick past initial check
    act(() => { vi.advanceTimersByTime(0); });
    // Re-render with changed script
    const { rerender } = renderHook(
      ({ script }) => useDraftRecovery("p1", script, "saved", vi.fn()),
      { initialProps: { script: "saved" } },
    );
    // Tick past initial check for the new hook instance
    act(() => { vi.advanceTimersByTime(0); });
    rerender({ script: "modified" });
    // Before debounce — not yet saved
    expect(mockStorage["helscoop-draft-p1"]).toBeUndefined();
    // After debounce (2000ms)
    act(() => { vi.advanceTimersByTime(2000); });
    expect(mockStorage["helscoop-draft-p1"]).toBe("modified");

    vi.useRealTimers();
  });

  it("clears draft when script matches saved", () => {
    mockStorage["helscoop-draft-p1"] = "old draft";
    const { rerender } = renderHook(
      ({ script, saved }) => useDraftRecovery("p1", script, saved, vi.fn()),
      { initialProps: { script: "modified", saved: "saved" } },
    );
    act(() => { vi.advanceTimersByTime(0); });
    rerender({ script: "saved", saved: "saved" });
    act(() => { vi.advanceTimersByTime(0); });
    expect(mockStorage["helscoop-draft-p1"]).toBeUndefined();

    vi.useRealTimers();
  });
});
