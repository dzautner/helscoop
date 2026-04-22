import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoSave } from "@/hooks/useAutoSave";
import type { SaveableFields, AutoSaveCallbacks, AutoSaveOptions } from "@/hooks/useAutoSave";

const baseFields: SaveableFields = {
  name: "Project A",
  description: "A test project",
  scene_js: "box(1,1,1);",
  bom: [{ material_id: "m1", quantity: 5, unit: "kpl" }],
};

function makeCallbacks(overrides?: Partial<AutoSaveCallbacks>): AutoSaveCallbacks {
  return {
    onSaveProject: vi.fn().mockResolvedValue(undefined),
    onSaveBom: vi.fn().mockResolvedValue(undefined),
    onSaveThumbnail: vi.fn().mockResolvedValue(undefined),
    onStatusChange: vi.fn(),
    onSaveSuccess: vi.fn(),
    onSaveError: vi.fn(),
    ...overrides,
  };
}

const baseOptions: AutoSaveOptions = {
  debounceMs: 2000,
  typingDebounceMs: 4000,
  rapidFireThresholdMs: 800,
  initialLoadDone: true,
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useAutoSave", () => {
  it("returns saveNow and setSavedSnapshot", () => {
    const cb = makeCallbacks();
    const { result } = renderHook(() => useAutoSave(baseFields, cb, baseOptions));
    expect(typeof result.current.saveNow).toBe("function");
    expect(typeof result.current.setSavedSnapshot).toBe("function");
  });

  it("does not trigger save when initialLoadDone is false", () => {
    const cb = makeCallbacks();
    const opts = { ...baseOptions, initialLoadDone: false };
    const changed = { ...baseFields, name: "Changed" };
    renderHook(() => useAutoSave(changed, cb, opts));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(cb.onSaveProject).not.toHaveBeenCalled();
  });

  it("triggers save after debounce when field changes", async () => {
    const cb = makeCallbacks();
    const { rerender } = renderHook(
      ({ fields }) => useAutoSave(fields, cb, baseOptions),
      { initialProps: { fields: baseFields } },
    );
    rerender({ fields: { ...baseFields, name: "Changed" } });
    expect(cb.onSaveProject).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(cb.onSaveProject).toHaveBeenCalledWith({ name: "Changed" });
  });

  it("calls onStatusChange unsaved then saving then saved", async () => {
    const cb = makeCallbacks();
    const { rerender } = renderHook(
      ({ fields }) => useAutoSave(fields, cb, baseOptions),
      { initialProps: { fields: baseFields } },
    );
    rerender({ fields: { ...baseFields, description: "Updated" } });
    expect(cb.onStatusChange).toHaveBeenCalledWith("unsaved");
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(cb.onStatusChange).toHaveBeenCalledWith("saving");
    expect(cb.onStatusChange).toHaveBeenCalledWith("saved");
  });

  it("only sends changed fields in save", async () => {
    const cb = makeCallbacks();
    const { rerender } = renderHook(
      ({ fields }) => useAutoSave(fields, cb, baseOptions),
      { initialProps: { fields: baseFields } },
    );
    rerender({ fields: { ...baseFields, description: "New desc" } });
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(cb.onSaveProject).toHaveBeenCalledWith({ description: "New desc" });
    expect(cb.onSaveBom).not.toHaveBeenCalled();
  });

  it("calls onSaveBom when BOM changes", async () => {
    const cb = makeCallbacks();
    const newBom = [{ material_id: "m2", quantity: 10, unit: "m2" }];
    const { rerender } = renderHook(
      ({ fields }) => useAutoSave(fields, cb, baseOptions),
      { initialProps: { fields: baseFields } },
    );
    rerender({ fields: { ...baseFields, bom: newBom } });
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(cb.onSaveBom).toHaveBeenCalledWith(newBom);
  });

  it("calls onSaveThumbnail when scene_js changes", async () => {
    const cb = makeCallbacks();
    const { rerender } = renderHook(
      ({ fields }) => useAutoSave(fields, cb, baseOptions),
      { initialProps: { fields: baseFields } },
    );
    rerender({ fields: { ...baseFields, scene_js: "cylinder(1,2);" } });
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(cb.onSaveThumbnail).toHaveBeenCalled();
  });

  it("does not call onSaveThumbnail when only name changes", async () => {
    const cb = makeCallbacks();
    const { rerender } = renderHook(
      ({ fields }) => useAutoSave(fields, cb, baseOptions),
      { initialProps: { fields: baseFields } },
    );
    rerender({ fields: { ...baseFields, name: "Renamed" } });
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(cb.onSaveThumbnail).not.toHaveBeenCalled();
  });

  it("calls onSaveError on save failure", async () => {
    const err = new Error("save failed");
    const cb = makeCallbacks({
      onSaveProject: vi.fn().mockRejectedValue(err),
    });
    const { rerender } = renderHook(
      ({ fields }) => useAutoSave(fields, cb, baseOptions),
      { initialProps: { fields: baseFields } },
    );
    rerender({ fields: { ...baseFields, name: "Fail" } });
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(cb.onSaveError).toHaveBeenCalledWith(err);
    expect(cb.onStatusChange).toHaveBeenCalledWith("unsaved");
  });

  it("saveNow triggers immediate save", async () => {
    const cb = makeCallbacks();
    const { result, rerender } = renderHook(
      ({ fields }) => useAutoSave(fields, cb, baseOptions),
      { initialProps: { fields: baseFields } },
    );
    rerender({ fields: { ...baseFields, name: "Immediate" } });
    await act(async () => { await result.current.saveNow(); });
    expect(cb.onSaveProject).toHaveBeenCalledWith({ name: "Immediate" });
  });

  it("does not save when fields are unchanged", async () => {
    const cb = makeCallbacks();
    const { result } = renderHook(() => useAutoSave(baseFields, cb, baseOptions));
    await act(async () => { await result.current.saveNow(); });
    expect(cb.onSaveProject).not.toHaveBeenCalled();
    expect(cb.onSaveBom).not.toHaveBeenCalled();
  });

  it("calls onSaveSuccess with saved fields", async () => {
    const cb = makeCallbacks();
    const changed = { ...baseFields, name: "Success" };
    const { rerender } = renderHook(
      ({ fields }) => useAutoSave(fields, cb, baseOptions),
      { initialProps: { fields: baseFields } },
    );
    rerender({ fields: changed });
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(cb.onSaveSuccess).toHaveBeenCalledWith(changed);
  });

  it("saves both project and BOM when both change", async () => {
    const cb = makeCallbacks();
    const newBom = [{ material_id: "m3", quantity: 1, unit: "kpl" }];
    const { rerender } = renderHook(
      ({ fields }) => useAutoSave(fields, cb, baseOptions),
      { initialProps: { fields: baseFields } },
    );
    rerender({ fields: { ...baseFields, name: "Both", bom: newBom } });
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(cb.onSaveProject).toHaveBeenCalledWith({ name: "Both" });
    expect(cb.onSaveBom).toHaveBeenCalledWith(newBom);
  });

  it("setSavedSnapshot updates the baseline", async () => {
    const cb = makeCallbacks();
    const updated = { ...baseFields, name: "Updated Baseline" };
    const { result } = renderHook(() => useAutoSave(updated, cb, baseOptions));
    act(() => { result.current.setSavedSnapshot(updated); });
    await act(async () => { await result.current.saveNow(); });
    expect(cb.onSaveProject).not.toHaveBeenCalled();
  });

  it("detects BOM quantity change", async () => {
    const cb = makeCallbacks();
    const changedBom = [{ material_id: "m1", quantity: 10, unit: "kpl" }];
    const { rerender } = renderHook(
      ({ fields }) => useAutoSave(fields, cb, baseOptions),
      { initialProps: { fields: baseFields } },
    );
    rerender({ fields: { ...baseFields, bom: changedBom } });
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(cb.onSaveBom).toHaveBeenCalled();
  });

  it("detects BOM length change", async () => {
    const cb = makeCallbacks();
    const longerBom = [
      { material_id: "m1", quantity: 5, unit: "kpl" },
      { material_id: "m2", quantity: 3, unit: "m2" },
    ];
    const { rerender } = renderHook(
      ({ fields }) => useAutoSave(fields, cb, baseOptions),
      { initialProps: { fields: baseFields } },
    );
    rerender({ fields: { ...baseFields, bom: longerBom } });
    await act(async () => { vi.advanceTimersByTime(2500); });
    expect(cb.onSaveBom).toHaveBeenCalledWith(longerBom);
  });
});
