import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockSetLocale = vi.fn();
const mockToggle = vi.fn();
let mockLocale = "fi";
let mockTheme = "dark";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: mockLocale,
    setLocale: mockSetLocale,
    t: (key: string, vars?: Record<string, unknown>) => {
      if (vars) return `${key}:${JSON.stringify(vars)}`;
      return key;
    },
  }),
}));

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({
    theme: mockTheme,
    toggle: mockToggle,
    darkMood: "warm",
    setDarkMood: vi.fn(),
  }),
}));

import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import EditorStatusBar from "@/components/EditorStatusBar";

beforeEach(() => {
  mockSetLocale.mockReset();
  mockToggle.mockReset();
  mockLocale = "fi";
  mockTheme = "dark";
});

// ---------------------------------------------------------------------------
// LanguageSwitcher
// ---------------------------------------------------------------------------
describe("LanguageSwitcher", () => {
  it("renders FI and EN labels", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText("FI")).toBeInTheDocument();
    expect(screen.getByText("EN")).toBeInTheDocument();
  });

  it("has aria-label for accessibility", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByLabelText("aria.switchLanguage")).toBeInTheDocument();
  });

  it("switches from fi to en on click", () => {
    mockLocale = "fi";
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByLabelText("aria.switchLanguage"));
    expect(mockSetLocale).toHaveBeenCalledWith("en");
  });

  it("switches from en to fi on click", () => {
    mockLocale = "en";
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByLabelText("aria.switchLanguage"));
    expect(mockSetLocale).toHaveBeenCalledWith("fi");
  });

  it("highlights active locale (FI full opacity when fi)", () => {
    mockLocale = "fi";
    render(<LanguageSwitcher />);
    const fi = screen.getByText("FI");
    expect(fi.style.opacity).toBe("1");
    const en = screen.getByText("EN");
    expect(en.style.opacity).toBe("0.4");
  });

  it("highlights active locale (EN full opacity when en)", () => {
    mockLocale = "en";
    render(<LanguageSwitcher />);
    const en = screen.getByText("EN");
    expect(en.style.opacity).toBe("1");
    const fi = screen.getByText("FI");
    expect(fi.style.opacity).toBe("0.4");
  });
});

// ---------------------------------------------------------------------------
// ThemeToggle
// ---------------------------------------------------------------------------
describe("ThemeToggle", () => {
  it("renders with dark theme label", () => {
    mockTheme = "dark";
    render(<ThemeToggle />);
    const btn = screen.getByLabelText("aria.themeDark");
    expect(btn).toBeInTheDocument();
  });

  it("renders with light theme label", () => {
    mockTheme = "light";
    render(<ThemeToggle />);
    const btn = screen.getByLabelText("aria.themeLight");
    expect(btn).toBeInTheDocument();
  });

  it("renders with auto theme label", () => {
    mockTheme = "auto";
    render(<ThemeToggle />);
    const btn = screen.getByLabelText("aria.themeAuto");
    expect(btn).toBeInTheDocument();
  });

  it("calls toggle on click", () => {
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockToggle).toHaveBeenCalledTimes(1);
  });

  it("renders moon icon for dark theme", () => {
    mockTheme = "dark";
    const { container } = render(<ThemeToggle />);
    const svg = container.querySelector("svg");
    expect(svg).toBeTruthy();
    expect(container.querySelector("path")?.getAttribute("d")).toContain("12.79");
  });

  it("renders sun icon for light theme", () => {
    mockTheme = "light";
    const { container } = render(<ThemeToggle />);
    expect(container.querySelector("circle")).toBeTruthy();
  });

  it("renders monitor icon for auto theme", () => {
    mockTheme = "auto";
    const { container } = render(<ThemeToggle />);
    expect(container.querySelector("rect")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// EditorStatusBar
// ---------------------------------------------------------------------------
describe("EditorStatusBar", () => {
  const defaultStatusProps = {
    objectCount: 5,
    materialCount: 3,
    scriptByteSize: 512,
    saveStatus: "saved" as const,
    lastSavedAt: null,
    warningCount: 0,
  };

  it("renders object count", () => {
    render(<EditorStatusBar {...defaultStatusProps} />);
    expect(screen.getByText(/editor\.objectCount/)).toBeInTheDocument();
  });

  it("renders material count", () => {
    render(<EditorStatusBar {...defaultStatusProps} />);
    expect(screen.getByText(/3/)).toBeInTheDocument();
    expect(screen.getByText(/editor\.statusMaterials/)).toBeInTheDocument();
  });

  it("formats bytes correctly", () => {
    render(<EditorStatusBar {...defaultStatusProps} scriptByteSize={512} />);
    expect(screen.getByText("512 B")).toBeInTheDocument();
  });

  it("formats kilobytes correctly", () => {
    render(<EditorStatusBar {...defaultStatusProps} scriptByteSize={2048} />);
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  });

  it("shows saving status", () => {
    render(<EditorStatusBar {...defaultStatusProps} saveStatus="saving" />);
    expect(screen.getByText("editor.saving")).toBeInTheDocument();
  });

  it("shows unsaved status", () => {
    render(<EditorStatusBar {...defaultStatusProps} saveStatus="unsaved" />);
    expect(screen.getByText("editor.unsaved")).toBeInTheDocument();
  });

  it("shows save error status", () => {
    render(<EditorStatusBar {...defaultStatusProps} saveStatus="error" />);
    expect(screen.getByText("editor.saveFailed")).toBeInTheDocument();
  });

  it("shows saved status with default text", () => {
    render(<EditorStatusBar {...defaultStatusProps} />);
    expect(screen.getByText("editor.saved")).toBeInTheDocument();
  });

  it("does not show warnings when count is 0", () => {
    render(<EditorStatusBar {...defaultStatusProps} warningCount={0} />);
    expect(screen.queryByText(/editor\.statusWarning/)).not.toBeInTheDocument();
  });

  it("shows singular warning when count is 1", () => {
    render(<EditorStatusBar {...defaultStatusProps} warningCount={1} />);
    expect(screen.getByText(/1.*editor\.statusWarning$/)).toBeInTheDocument();
  });

  it("shows plural warnings when count > 1", () => {
    render(<EditorStatusBar {...defaultStatusProps} warningCount={3} />);
    expect(screen.getByText(/3.*editor\.statusWarnings/)).toBeInTheDocument();
  });

  it("has no-print class", () => {
    const { container } = render(<EditorStatusBar {...defaultStatusProps} />);
    expect(container.querySelector(".no-print")).toBeTruthy();
  });
});
