import { describe, it, expect, beforeEach } from "vitest";
import { modKey, shortcutLabel, _resetPlatformCache } from "@/lib/shortcut-label";

beforeEach(() => {
  _resetPlatformCache();
});

describe("modKey", () => {
  it("returns Ctrl on non-Mac platform", () => {
    Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
    expect(modKey()).toBe("Ctrl");
  });

  it("returns ⌘ on Mac platform", () => {
    Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
    _resetPlatformCache();
    expect(modKey()).toBe("⌘");
  });
});

describe("shortcutLabel", () => {
  describe("on non-Mac", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "platform", { value: "Win32", configurable: true });
      _resetPlatformCache();
    });

    it("formats Cmd+S as Ctrl+S", () => {
      expect(shortcutLabel("Cmd+S")).toBe("Ctrl+S");
    });

    it("formats Cmd+Shift+Z as Ctrl+Shift+Z", () => {
      expect(shortcutLabel("Cmd+Shift+Z")).toBe("Ctrl+Shift+Z");
    });

    it("formats Escape as Esc", () => {
      expect(shortcutLabel("Escape")).toBe("Esc");
    });

    it("formats Cmd+Enter as Ctrl+Enter", () => {
      expect(shortcutLabel("Cmd+Enter")).toBe("Ctrl+Enter");
    });

    it("formats Cmd+/ as Ctrl+/", () => {
      expect(shortcutLabel("Cmd+/")).toBe("Ctrl+/");
    });
  });

  describe("on Mac", () => {
    beforeEach(() => {
      Object.defineProperty(navigator, "platform", { value: "MacIntel", configurable: true });
      _resetPlatformCache();
    });

    it("formats Cmd+S as ⌘S", () => {
      expect(shortcutLabel("Cmd+S")).toBe("⌘S");
    });

    it("formats Cmd+Shift+Z as ⌘⇧Z", () => {
      expect(shortcutLabel("Cmd+Shift+Z")).toBe("⌘⇧Z");
    });

    it("formats Escape as Esc", () => {
      expect(shortcutLabel("Escape")).toBe("ESC");
    });

    it("formats Cmd+Enter as ⌘↵", () => {
      expect(shortcutLabel("Cmd+Enter")).toBe("⌘↵");
    });

    it("formats Cmd+K as ⌘K", () => {
      expect(shortcutLabel("Cmd+K")).toBe("⌘K");
    });

    it("formats Cmd+/ as ⌘/", () => {
      expect(shortcutLabel("Cmd+/")).toBe("⌘/");
    });
  });
});
