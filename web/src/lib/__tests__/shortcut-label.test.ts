import { describe, it, expect, beforeEach, vi } from "vitest";
import { shortcutLabel, _resetPlatformCache } from "@/lib/shortcut-label";

describe("shortcutLabel", () => {
  beforeEach(() => {
    _resetPlatformCache();
  });

  describe("on macOS", () => {
    beforeEach(() => {
      vi.stubGlobal("navigator", { platform: "MacIntel" });
    });

    it("formats Cmd+S as ⌘S", () => {
      expect(shortcutLabel("Cmd+S")).toBe("⌘S");
    });

    it("formats Cmd+Shift+Z as ⌘⇧Z", () => {
      expect(shortcutLabel("Cmd+Shift+Z")).toBe("⌘⇧Z");
    });

    it("formats Cmd+K as ⌘K", () => {
      expect(shortcutLabel("Cmd+K")).toBe("⌘K");
    });

    it("formats Cmd+/ as ⌘/", () => {
      expect(shortcutLabel("Cmd+/")).toBe("⌘/");
    });

    it("formats Cmd+Enter as ⌘↵", () => {
      expect(shortcutLabel("Cmd+Enter")).toBe("⌘↵");
    });

    it("formats Escape as Esc", () => {
      expect(shortcutLabel("Escape")).toBe("ESC");
    });

    it("formats Cmd+Shift+S as ⌘⇧S", () => {
      expect(shortcutLabel("Cmd+Shift+S")).toBe("⌘⇧S");
    });

    it("formats Cmd+B as ⌘B", () => {
      expect(shortcutLabel("Cmd+B")).toBe("⌘B");
    });
  });

  describe("on non-Mac platforms", () => {
    beforeEach(() => {
      vi.stubGlobal("navigator", { platform: "Win32" });
    });

    it("formats Cmd+S as Ctrl+S", () => {
      expect(shortcutLabel("Cmd+S")).toBe("Ctrl+S");
    });

    it("formats Cmd+Shift+Z as Ctrl+Shift+Z", () => {
      expect(shortcutLabel("Cmd+Shift+Z")).toBe("Ctrl+Shift+Z");
    });

    it("formats Cmd+K as Ctrl+K", () => {
      expect(shortcutLabel("Cmd+K")).toBe("Ctrl+K");
    });

    it("formats Cmd+/ as Ctrl+/", () => {
      expect(shortcutLabel("Cmd+/")).toBe("Ctrl+/");
    });

    it("formats Cmd+Enter as Ctrl+Enter", () => {
      expect(shortcutLabel("Cmd+Enter")).toBe("Ctrl+Enter");
    });

    it("formats Escape as Esc", () => {
      expect(shortcutLabel("Escape")).toBe("Esc");
    });

    it("formats Cmd+Shift+S as Ctrl+Shift+S", () => {
      expect(shortcutLabel("Cmd+Shift+S")).toBe("Ctrl+Shift+S");
    });
  });

  describe("with no navigator (SSR)", () => {
    beforeEach(() => {
      vi.stubGlobal("navigator", undefined);
    });

    it("defaults to Ctrl-style labels", () => {
      expect(shortcutLabel("Cmd+S")).toBe("Ctrl+S");
    });
  });
});
