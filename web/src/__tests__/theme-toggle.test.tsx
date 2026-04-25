import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockToggle = vi.fn();
let mockTheme = "dark";

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({ theme: mockTheme, toggle: mockToggle }),
}));

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

import { ThemeToggle } from "@/components/ThemeToggle";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ThemeToggle", () => {
  it("renders dark theme label", () => {
    mockTheme = "dark";
    render(<ThemeToggle />);
    expect(screen.getByLabelText("aria.themeDark")).toBeInTheDocument();
  });

  it("renders light theme label", () => {
    mockTheme = "light";
    render(<ThemeToggle />);
    expect(screen.getByLabelText("aria.themeLight")).toBeInTheDocument();
  });

  it("renders auto theme label", () => {
    mockTheme = "auto";
    render(<ThemeToggle />);
    expect(screen.getByLabelText("aria.themeAuto")).toBeInTheDocument();
  });

  it("calls toggle on click", () => {
    mockTheme = "dark";
    render(<ThemeToggle />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockToggle).toHaveBeenCalledOnce();
  });

  it("shows uppercase label text", () => {
    mockTheme = "dark";
    render(<ThemeToggle />);
    expect(screen.getByText("ARIA.THEMEDARK")).toBeInTheDocument();
  });

  it("renders moon SVG for dark theme", () => {
    mockTheme = "dark";
    const { container } = render(<ThemeToggle />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("renders sun SVG for light theme", () => {
    mockTheme = "light";
    const { container } = render(<ThemeToggle />);
    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBeGreaterThan(0);
  });

  it("renders monitor SVG for auto theme", () => {
    mockTheme = "auto";
    const { container } = render(<ThemeToggle />);
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBeGreaterThan(0);
  });
});
