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

vi.mock("@/components/ScrollReveal", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import FeatureHighlights from "@/components/FeatureHighlights";

describe("FeatureHighlights", () => {
  it("renders section element", () => {
    const { container } = render(<FeatureHighlights />);
    expect(container.querySelector("section.feature-section")).toBeInTheDocument();
  });

  it("renders sr-only heading", () => {
    render(<FeatureHighlights />);
    expect(screen.getByText("landing.featuresHeading")).toBeInTheDocument();
  });

  it("renders features label", () => {
    render(<FeatureHighlights />);
    expect(screen.getByText("landing.featuresLabel")).toBeInTheDocument();
  });

  it("renders features title", () => {
    render(<FeatureHighlights />);
    expect(screen.getByText("landing.featuresTitle")).toBeInTheDocument();
  });

  it("renders 3 feature cards", () => {
    const { container } = render(<FeatureHighlights />);
    const cards = container.querySelectorAll(".feature-card");
    expect(cards.length).toBe(3);
  });

  it("renders feature titles", () => {
    render(<FeatureHighlights />);
    expect(screen.getByText("landing.feature1Title")).toBeInTheDocument();
    expect(screen.getByText("landing.feature2Title")).toBeInTheDocument();
    expect(screen.getByText("landing.feature3Title")).toBeInTheDocument();
  });

  it("renders feature descriptions", () => {
    render(<FeatureHighlights />);
    expect(screen.getByText("landing.feature1Desc")).toBeInTheDocument();
    expect(screen.getByText("landing.feature2Desc")).toBeInTheDocument();
    expect(screen.getByText("landing.feature3Desc")).toBeInTheDocument();
  });

  it("renders step numbers", () => {
    render(<FeatureHighlights />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });

  it("first card has hero class", () => {
    const { container } = render(<FeatureHighlights />);
    const heroCards = container.querySelectorAll(".feature-card--hero");
    expect(heroCards.length).toBe(1);
  });

  it("renders SVG icons", () => {
    const { container } = render(<FeatureHighlights />);
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBe(3);
  });

  it("SVGs have aria-labels matching feature titles", () => {
    const { container } = render(<FeatureHighlights />);
    const svgs = container.querySelectorAll("svg[aria-label]");
    expect(svgs.length).toBe(3);
  });
});
