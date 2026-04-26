import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  safeGetLocalStorageItem,
  safeRemoveLocalStorageItem,
  safeSetLocalStorageItem,
} from "@/lib/browser-storage";

describe("browser-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads, writes, and removes localStorage values", () => {
    expect(safeSetLocalStorageItem("k", "v")).toBe(true);
    expect(safeGetLocalStorageItem("k")).toBe("v");
    expect(safeRemoveLocalStorageItem("k")).toBe(true);
    expect(safeGetLocalStorageItem("k")).toBeNull();
  });

  it("returns null when localStorage reads are blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("localStorage blocked", "SecurityError");
    });

    expect(safeGetLocalStorageItem("k")).toBeNull();
  });

  it("returns false instead of throwing when localStorage writes are blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("localStorage blocked", "SecurityError");
    });

    expect(safeSetLocalStorageItem("k", "v")).toBe(false);
  });

  it("returns false instead of throwing when localStorage removes are blocked", () => {
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("localStorage blocked", "SecurityError");
    });

    expect(safeRemoveLocalStorageItem("k")).toBe(false);
  });
});
