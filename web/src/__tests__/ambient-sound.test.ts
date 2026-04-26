import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/sounds", () => ({
  playSound: vi.fn(),
}));

import { getAmbientSoundEnabled, setAmbientSoundEnabled, useAmbientSound } from "@/hooks/useAmbientSound";
import { playSound } from "@/lib/sounds";
import { renderHook, act } from "@testing-library/react";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getAmbientSoundEnabled", () => {
  it("returns false by default", () => {
    expect(getAmbientSoundEnabled()).toBe(false);
  });

  it("returns true when localStorage is set to true", () => {
    localStorage.setItem("helscoop_ambient_sound", "true");
    expect(getAmbientSoundEnabled()).toBe(true);
  });

  it("returns false when localStorage is set to false", () => {
    localStorage.setItem("helscoop_ambient_sound", "false");
    expect(getAmbientSoundEnabled()).toBe(false);
  });

  it("returns false when localStorage reads are blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("localStorage blocked", "SecurityError");
    });

    expect(getAmbientSoundEnabled()).toBe(false);
  });
});

describe("setAmbientSoundEnabled", () => {
  it("stores true in localStorage", () => {
    setAmbientSoundEnabled(true);
    expect(localStorage.getItem("helscoop_ambient_sound")).toBe("true");
  });

  it("stores false in localStorage", () => {
    setAmbientSoundEnabled(false);
    expect(localStorage.getItem("helscoop_ambient_sound")).toBe("false");
  });

  it("does not throw when localStorage writes are blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("localStorage blocked", "SecurityError");
    });

    expect(() => setAmbientSoundEnabled(true)).not.toThrow();
  });
});

describe("useAmbientSound", () => {
  it("returns a play function", () => {
    const { result } = renderHook(() => useAmbientSound());
    expect(typeof result.current.play).toBe("function");
  });

  it("does not play when sound is disabled", () => {
    const { result } = renderHook(() => useAmbientSound());
    act(() => { result.current.play("save"); });
    expect(playSound).not.toHaveBeenCalled();
  });

  it("does not throw when localStorage reads are blocked during playback", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("localStorage blocked", "SecurityError");
    });
    const { result } = renderHook(() => useAmbientSound());

    expect(() => act(() => { result.current.play("save"); })).not.toThrow();
    expect(playSound).not.toHaveBeenCalled();
  });

  it("plays when sound is enabled", () => {
    localStorage.setItem("helscoop_ambient_sound", "true");
    const { result } = renderHook(() => useAmbientSound());
    act(() => { result.current.play("save"); });
    expect(playSound).toHaveBeenCalledWith("save");
  });

  it("respects prefers-reduced-motion", () => {
    localStorage.setItem("helscoop_ambient_sound", "true");
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as any;
    const { result } = renderHook(() => useAmbientSound());
    act(() => { result.current.play("save"); });
    expect(playSound).toHaveBeenCalledWith("save");
    window.matchMedia = originalMatchMedia;
  });

  it("blocks reduced-motion when not explicitly enabled", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })) as any;
    const { result } = renderHook(() => useAmbientSound());
    act(() => { result.current.play("save"); });
    expect(playSound).not.toHaveBeenCalled();
    window.matchMedia = originalMatchMedia;
  });

  it("plays different sound names", () => {
    localStorage.setItem("helscoop_ambient_sound", "true");
    const { result } = renderHook(() => useAmbientSound());
    act(() => { result.current.play("bomAdd"); });
    expect(playSound).toHaveBeenCalledWith("bomAdd");
    act(() => { result.current.play("error"); });
    expect(playSound).toHaveBeenCalledWith("error");
  });
});
