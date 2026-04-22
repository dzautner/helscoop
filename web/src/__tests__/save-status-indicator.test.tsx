import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/shortcut-label", () => ({
  shortcutLabel: (combo: string) => combo,
}));

import SaveStatusIndicator from "@/components/SaveStatusIndicator";

describe("SaveStatusIndicator", () => {
  it("renders with role status", () => {
    render(<SaveStatusIndicator status="saved" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has aria-live polite", () => {
    render(<SaveStatusIndicator status="saved" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });

  it("shows saved label", () => {
    render(<SaveStatusIndicator status="saved" />);
    expect(screen.getByText("saveStatus.saved")).toBeInTheDocument();
  });

  it("shows saving label", () => {
    render(<SaveStatusIndicator status="saving" />);
    expect(screen.getByText("saveStatus.saving")).toBeInTheDocument();
  });

  it("shows unsaved label", () => {
    render(<SaveStatusIndicator status="unsaved" />);
    expect(screen.getByText("saveStatus.unsaved")).toBeInTheDocument();
  });

  it("shows error label", () => {
    render(<SaveStatusIndicator status="error" />);
    expect(screen.getByText("saveStatus.error")).toBeInTheDocument();
  });

  it("includes lastSaved in saved label", () => {
    render(<SaveStatusIndicator status="saved" lastSaved="2 min ago" />);
    expect(screen.getByText("saveStatus.saved 2 min ago")).toBeInTheDocument();
  });

  it("sets data-status attribute", () => {
    const { container } = render(<SaveStatusIndicator status="unsaved" />);
    expect(container.querySelector('[data-status="unsaved"]')).toBeInTheDocument();
  });

  it("has save tooltip with shortcut", () => {
    const { container } = render(<SaveStatusIndicator status="saved" />);
    const pill = container.querySelector(".save-status-pill");
    expect(pill?.getAttribute("data-tooltip")).toContain("Cmd+S");
  });

  it("renders checkmark SVG for saved", () => {
    const { container } = render(<SaveStatusIndicator status="saved" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders spinner SVG for saving", () => {
    const { container } = render(<SaveStatusIndicator status="saving" />);
    const spinner = container.querySelector(".save-status-spinner");
    expect(spinner).toBeInTheDocument();
  });

  it("renders dot for unsaved", () => {
    const { container } = render(<SaveStatusIndicator status="unsaved" />);
    const dot = container.querySelector(".save-status-dot");
    expect(dot).toBeInTheDocument();
  });

  it("renders exclamation SVG for error", () => {
    const { container } = render(<SaveStatusIndicator status="error" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("saved aria-label includes lastSaved", () => {
    render(<SaveStatusIndicator status="saved" lastSaved="10:30" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toContain("10:30");
  });

  it("error aria-label is error text", () => {
    render(<SaveStatusIndicator status="error" />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-label")).toBe("saveStatus.error");
  });
});
