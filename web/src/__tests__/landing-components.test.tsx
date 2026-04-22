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
  default: ({ children }: { children: React.ReactNode }) => <div data-testid="scroll-reveal">{children}</div>,
}));

import FeatureHighlights from "@/components/FeatureHighlights";
import LandingFooter from "@/components/LandingFooter";

describe("FeatureHighlights", () => {
  it("renders the feature section", () => {
    render(<FeatureHighlights />);
    expect(screen.getByText("landing.featuresTitle")).toBeInTheDocument();
  });

  it("renders the features label", () => {
    render(<FeatureHighlights />);
    expect(screen.getByText("landing.featuresLabel")).toBeInTheDocument();
  });

  it("renders three feature cards", () => {
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

  it("renders step numbers 01, 02, 03", () => {
    const { container } = render(<FeatureHighlights />);
    const steps = container.querySelectorAll(".feature-card-step");
    expect(steps).toHaveLength(3);
    expect(steps[0].textContent).toBe("01");
    expect(steps[1].textContent).toBe("02");
    expect(steps[2].textContent).toBe("03");
  });

  it("marks first feature as hero", () => {
    const { container } = render(<FeatureHighlights />);
    const heroCards = container.querySelectorAll(".feature-card--hero");
    expect(heroCards).toHaveLength(1);
  });

  it("has sr-only heading for a11y", () => {
    render(<FeatureHighlights />);
    const heading = screen.getByText("landing.featuresHeading");
    expect(heading.className).toBe("sr-only");
  });

  it("wraps features in ScrollReveal", () => {
    render(<FeatureHighlights />);
    const reveals = screen.getAllByTestId("scroll-reveal");
    expect(reveals.length).toBeGreaterThanOrEqual(2);
  });
});

describe("LandingFooter", () => {
  it("renders the brand name", () => {
    render(<LandingFooter />);
    expect(screen.getByText("Hel")).toBeInTheDocument();
    expect(screen.getByText("scoop")).toBeInTheDocument();
  });

  it("renders footer description", () => {
    render(<LandingFooter />);
    expect(screen.getByText("landing.footerDescription")).toBeInTheDocument();
  });

  it("renders data source names", () => {
    render(<LandingFooter />);
    expect(screen.getByText("DVV")).toBeInTheDocument();
    expect(screen.getByText("MML")).toBeInTheDocument();
    expect(screen.getByText("K-Rauta")).toBeInTheDocument();
    expect(screen.getByText("Stark")).toBeInTheDocument();
  });

  it("renders data sources label", () => {
    render(<LandingFooter />);
    expect(screen.getByText("landing.dataSources")).toBeInTheDocument();
  });

  it("renders privacy and terms links", () => {
    render(<LandingFooter />);
    const privacyLink = screen.getByText("landing.privacyPolicy");
    const termsLink = screen.getByText("landing.termsOfService");
    expect(privacyLink.closest("a")).toHaveAttribute("href", "/privacy");
    expect(termsLink.closest("a")).toHaveAttribute("href", "/terms");
  });

  it("renders current year in copyright", () => {
    render(<LandingFooter />);
    const year = new Date().getFullYear();
    expect(screen.getByText(new RegExp(`${year}`))).toBeInTheDocument();
  });

  it("renders Helsinki location", () => {
    render(<LandingFooter />);
    expect(screen.getByText("Helsinki, Finland")).toBeInTheDocument();
  });

  it("renders EU data disclaimer", () => {
    render(<LandingFooter />);
    const year = new Date().getFullYear();
    const copyrightEl = screen.getByText(new RegExp(`${year}`));
    expect(copyrightEl.textContent).toContain("landing.dataInEu");
  });
});
