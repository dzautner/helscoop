import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

import ConfidenceBadge, { StalePriceBadge } from "@/components/ConfidenceBadge";
import type { DataProvenance } from "@/lib/confidence";

const verifiedProvenance: DataProvenance = {
  confidence: "verified",
  source: "DVV",
  fetchedAt: "2025-06-01T00:00:00Z",
};

const estimatedProvenance: DataProvenance = {
  confidence: "estimated",
  source: "heuristic",
};

const demoProvenance: DataProvenance = {
  confidence: "demo",
  source: "demo-data",
};

const manualProvenance: DataProvenance = {
  confidence: "manual",
  source: "user",
};

describe("ConfidenceBadge", () => {
  it("renders verified badge with label", () => {
    render(<ConfidenceBadge provenance={verifiedProvenance} />);
    expect(screen.getByText("confidence.verified")).toBeInTheDocument();
  });

  it("renders estimated badge with label", () => {
    render(<ConfidenceBadge provenance={estimatedProvenance} />);
    expect(screen.getByText("confidence.estimated")).toBeInTheDocument();
  });

  it("renders demo badge with label", () => {
    render(<ConfidenceBadge provenance={demoProvenance} />);
    expect(screen.getByText("confidence.demo")).toBeInTheDocument();
  });

  it("renders manual badge with label", () => {
    render(<ConfidenceBadge provenance={manualProvenance} />);
    expect(screen.getByText("confidence.manual")).toBeInTheDocument();
  });

  it("hides label in compact mode", () => {
    render(<ConfidenceBadge provenance={verifiedProvenance} compact />);
    expect(screen.queryByText("confidence.verified")).not.toBeInTheDocument();
  });

  it("has aria-label with data quality info", () => {
    render(<ConfidenceBadge provenance={verifiedProvenance} />);
    const badge = screen.getByLabelText(/confidence\.dataQuality/);
    expect(badge).toBeInTheDocument();
  });

  it("includes fetch date in aria-label when available", () => {
    render(<ConfidenceBadge provenance={verifiedProvenance} />);
    const badge = screen.getByLabelText(/confidence\.fetchedAt/);
    expect(badge).toBeInTheDocument();
  });

  it("shows tooltip on hover", () => {
    render(<ConfidenceBadge provenance={verifiedProvenance} />);
    const badge = screen.getByLabelText(/confidence\.dataQuality/);
    fireEvent.mouseEnter(badge.parentElement!);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("tooltip shows source info", () => {
    render(<ConfidenceBadge provenance={verifiedProvenance} />);
    const badge = screen.getByLabelText(/confidence\.dataQuality/);
    fireEvent.mouseEnter(badge.parentElement!);
    expect(screen.getByText("DVV")).toBeInTheDocument();
  });

  it("hides tooltip on mouse leave", () => {
    render(<ConfidenceBadge provenance={verifiedProvenance} />);
    const wrapper = screen.getByLabelText(/confidence\.dataQuality/).parentElement!;
    fireEvent.mouseEnter(wrapper);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.mouseLeave(wrapper);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("is focusable via tabIndex", () => {
    render(<ConfidenceBadge provenance={verifiedProvenance} />);
    const badge = screen.getByLabelText(/confidence\.dataQuality/);
    expect(badge).toHaveAttribute("tabindex", "0");
  });

  it("shows tooltip on focus", () => {
    render(<ConfidenceBadge provenance={verifiedProvenance} />);
    const badge = screen.getByLabelText(/confidence\.dataQuality/);
    fireEvent.focus(badge.parentElement!);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});

describe("StalePriceBadge", () => {
  it("renders stale price label", () => {
    render(<StalePriceBadge lastUpdated="2024-01-01" />);
    expect(screen.getByText("confidence.stalePrice")).toBeInTheDocument();
  });

  it("has correct aria-label", () => {
    render(<StalePriceBadge lastUpdated="2024-01-01" />);
    expect(screen.getByLabelText("confidence.stalePrice")).toBeInTheDocument();
  });

  it("renders without lastUpdated", () => {
    render(<StalePriceBadge lastUpdated={null} />);
    expect(screen.getByText("confidence.stalePrice")).toBeInTheDocument();
  });

  it("shows tooltip with stale detail on hover", () => {
    render(<StalePriceBadge lastUpdated="2024-01-15" />);
    const badge = screen.getByLabelText("confidence.stalePrice");
    fireEvent.mouseEnter(badge.parentElement!);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });

  it("is focusable", () => {
    render(<StalePriceBadge lastUpdated="2024-01-01" />);
    const badge = screen.getByLabelText("confidence.stalePrice");
    expect(badge).toHaveAttribute("tabindex", "0");
  });
});
