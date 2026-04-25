import { describe, expect, it, beforeEach } from "vitest";
import {
  getAssemblyProgressStorageKey,
  readAssemblyProgressFromStorage,
  writeAssemblyProgressToStorage,
} from "@/lib/assembly-progress-storage";

describe("assembly progress storage", () => {
  const storageKey = getAssemblyProgressStorageKey("project-1");
  const validStepIds = new Set(["foundation", "walls", "roof"]);

  beforeEach(() => {
    localStorage.clear();
  });

  it("removes corrupt JSON and returns empty progress", () => {
    localStorage.setItem(storageKey, "{not valid json");

    const progress = readAssemblyProgressFromStorage(localStorage, storageKey, validStepIds);

    expect(Array.from(progress)).toEqual([]);
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("removes non-array payloads and returns empty progress", () => {
    localStorage.setItem(storageKey, JSON.stringify({ foundation: true }));

    const progress = readAssemblyProgressFromStorage(localStorage, storageKey, validStepIds);

    expect(Array.from(progress)).toEqual([]);
    expect(localStorage.getItem(storageKey)).toBeNull();
  });

  it("filters stale, duplicate, and non-string step ids", () => {
    localStorage.setItem(storageKey, JSON.stringify(["walls", "missing", "walls", 12, "roof"]));

    const progress = readAssemblyProgressFromStorage(localStorage, storageKey, validStepIds);

    expect(Array.from(progress)).toEqual(["walls", "roof"]);
    expect(localStorage.getItem(storageKey)).toBe(JSON.stringify(["walls", "roof"]));
  });

  it("writes completed ids as a JSON array", () => {
    writeAssemblyProgressToStorage(localStorage, storageKey, new Set(["foundation", "roof"]));

    expect(localStorage.getItem(storageKey)).toBe(JSON.stringify(["foundation", "roof"]));
  });

  it("treats storage failures as empty best-effort persistence", () => {
    const failingStorage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      removeItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };

    expect(readAssemblyProgressFromStorage(failingStorage, storageKey, validStepIds)).toEqual(new Set());
    expect(() => writeAssemblyProgressToStorage(failingStorage, storageKey, new Set(["walls"]))).not.toThrow();
  });
});
