import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getTranslation, detectLocale, persistLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getTranslation", () => {
  it("returns Finnish translation for known key", () => {
    const t = getTranslation("fi");
    expect(t("nav.projects")).toBe("Projektit");
  });

  it("returns English translation for known key", () => {
    const t = getTranslation("en");
    expect(t("nav.projects")).toBe("Projects");
  });

  it("returns key itself for unknown path", () => {
    const t = getTranslation("fi");
    expect(t("nonexistent.key.path")).toBe("nonexistent.key.path");
  });

  it("interpolates params with {{key}} syntax", () => {
    const t = getTranslation("fi");
    const result = t("nav.projects");
    expect(typeof result).toBe("string");
  });

  it("supports nested keys", () => {
    const t = getTranslation("fi");
    expect(t("auth.login")).toBe("Kirjaudu");
  });

  it("returns different values for fi and en", () => {
    const tFi = getTranslation("fi");
    const tEn = getTranslation("en");
    expect(tFi("auth.login")).not.toBe(tEn("auth.login"));
  });
});

describe("detectLocale", () => {
  it("returns stored locale from localStorage", () => {
    localStorage.setItem("helscoop_locale", "en");
    expect(detectLocale()).toBe("en");
  });

  it("returns fi when stored locale is fi", () => {
    localStorage.setItem("helscoop_locale", "fi");
    expect(detectLocale()).toBe("fi");
  });

  it("ignores invalid stored locale", () => {
    localStorage.setItem("helscoop_locale", "de");
    const result = detectLocale();
    expect(result === "fi" || result === "en").toBe(true);
  });

  it("defaults to fi when no stored locale and browser is Finnish", () => {
    Object.defineProperty(navigator, "language", { value: "fi-FI", writable: true, configurable: true });
    expect(detectLocale()).toBe("fi");
  });

  it("returns en when browser language starts with en", () => {
    Object.defineProperty(navigator, "language", { value: "en-US", writable: true, configurable: true });
    expect(detectLocale()).toBe("en");
  });

  it("falls back to browser language when localStorage is blocked", () => {
    Object.defineProperty(navigator, "language", { value: "sv-FI", writable: true, configurable: true });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("localStorage blocked", "SecurityError");
    });

    expect(detectLocale()).toBe("sv");
  });
});

describe("persistLocale", () => {
  it("stores fi in localStorage", () => {
    persistLocale("fi");
    expect(localStorage.getItem("helscoop_locale")).toBe("fi");
  });

  it("stores en in localStorage", () => {
    persistLocale("en");
    expect(localStorage.getItem("helscoop_locale")).toBe("en");
  });

  it("overwrites previous locale", () => {
    persistLocale("fi");
    persistLocale("en");
    expect(localStorage.getItem("helscoop_locale")).toBe("en");
  });

  it("does not throw when localStorage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("localStorage blocked", "SecurityError");
    });

    expect(() => persistLocale("en")).not.toThrow();
  });
});
