import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, renderHook } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/lib/i18n", () => ({
  detectLocale: vi.fn(() => "fi"),
  persistLocale: vi.fn(),
  getTranslation: vi.fn((locale: string) => (key: string, params?: Record<string, string | number>) => {
    if (params) return `[${locale}]${key}:${JSON.stringify(params)}`;
    return `[${locale}]${key}`;
  }),
}));

import { LocaleProvider, useTranslation } from "@/components/LocaleProvider";
import { detectLocale, persistLocale } from "@/lib/i18n";

beforeEach(() => {
  vi.clearAllMocks();
  document.documentElement.lang = "";
});

function TestConsumer() {
  const { locale, setLocale, t } = useTranslation();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="translated">{t("hello")}</span>
      <span data-testid="with-params">{t("greeting", { name: "Test" })}</span>
      <button data-testid="set-en" onClick={() => setLocale("en")}>EN</button>
      <button data-testid="set-fi" onClick={() => setLocale("fi")}>FI</button>
    </div>
  );
}

describe("LocaleProvider", () => {
  it("renders children after mount", () => {
    render(<LocaleProvider><span>child</span></LocaleProvider>);
    expect(screen.getByText("child")).toBeInTheDocument();
  });

  it("detects locale on mount", () => {
    render(<LocaleProvider><TestConsumer /></LocaleProvider>);
    expect(detectLocale).toHaveBeenCalledOnce();
  });

  it("sets document.documentElement.lang on mount", () => {
    render(<LocaleProvider><TestConsumer /></LocaleProvider>);
    expect(document.documentElement.lang).toBe("fi");
  });

  it("provides detected locale to consumers", () => {
    render(<LocaleProvider><TestConsumer /></LocaleProvider>);
    expect(screen.getByTestId("locale").textContent).toBe("fi");
  });

  it("translates keys using getTranslation", () => {
    render(<LocaleProvider><TestConsumer /></LocaleProvider>);
    expect(screen.getByTestId("translated").textContent).toBe("[fi]hello");
  });

  it("passes params to translation function", () => {
    render(<LocaleProvider><TestConsumer /></LocaleProvider>);
    expect(screen.getByTestId("with-params").textContent).toContain("Test");
  });

  it("setLocale updates locale and persists", () => {
    render(<LocaleProvider><TestConsumer /></LocaleProvider>);
    act(() => {
      screen.getByTestId("set-en").click();
    });
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(persistLocale).toHaveBeenCalledWith("en");
  });

  it("setLocale updates document.documentElement.lang", () => {
    render(<LocaleProvider><TestConsumer /></LocaleProvider>);
    act(() => {
      screen.getByTestId("set-en").click();
    });
    expect(document.documentElement.lang).toBe("en");
  });

  it("updates translations when locale changes", () => {
    render(<LocaleProvider><TestConsumer /></LocaleProvider>);
    act(() => {
      screen.getByTestId("set-en").click();
    });
    expect(screen.getByTestId("translated").textContent).toBe("[en]hello");
  });
});

describe("useTranslation", () => {
  it("throws when used outside LocaleProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      renderHook(() => useTranslation());
    }).toThrow("useTranslation must be used within a LocaleProvider");
    consoleError.mockRestore();
  });
});
