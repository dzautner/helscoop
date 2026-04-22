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

import LandingFooter from "@/components/LandingFooter";

describe("LandingFooter", () => {
  it("renders footer element", () => {
    const { container } = render(<LandingFooter />);
    expect(container.querySelector("footer")).toBeInTheDocument();
  });

  it("renders Helscoop brand name", () => {
    render(<LandingFooter />);
    expect(screen.getByText("Hel")).toBeInTheDocument();
    expect(screen.getByText("scoop")).toBeInTheDocument();
  });

  it("renders footer description", () => {
    render(<LandingFooter />);
    expect(screen.getByText("landing.footerDescription")).toBeInTheDocument();
  });

  it("renders all 6 data sources", () => {
    render(<LandingFooter />);
    expect(screen.getByText("DVV")).toBeInTheDocument();
    expect(screen.getByText("MML")).toBeInTheDocument();
    expect(screen.getByText("K-Rauta")).toBeInTheDocument();
    expect(screen.getByText("Stark")).toBeInTheDocument();
    expect(screen.getByText("Sarokas")).toBeInTheDocument();
    expect(screen.getByText("Ruukki")).toBeInTheDocument();
  });

  it("renders data sources heading", () => {
    render(<LandingFooter />);
    expect(screen.getByText("landing.dataSources")).toBeInTheDocument();
  });

  it("renders disclaimer", () => {
    render(<LandingFooter />);
    expect(screen.getByText("landing.dataSourcesDisclaimer")).toBeInTheDocument();
  });

  it("renders privacy and terms links", () => {
    render(<LandingFooter />);
    expect(screen.getByText("landing.privacyPolicy")).toBeInTheDocument();
    expect(screen.getByText("landing.termsOfService")).toBeInTheDocument();
  });

  it("privacy link points to /privacy", () => {
    const { container } = render(<LandingFooter />);
    const privacyLink = container.querySelector('a[href="/privacy"]');
    expect(privacyLink).toBeInTheDocument();
  });

  it("terms link points to /terms", () => {
    const { container } = render(<LandingFooter />);
    const termsLink = container.querySelector('a[href="/terms"]');
    expect(termsLink).toBeInTheDocument();
  });

  it("renders current year in copyright", () => {
    render(<LandingFooter />);
    const year = new Date().getFullYear().toString();
    expect(screen.getByText(new RegExp(year))).toBeInTheDocument();
  });

  it("renders Helsinki location", () => {
    render(<LandingFooter />);
    expect(screen.getByText("Helsinki, Finland")).toBeInTheDocument();
  });

  it("renders EU data notice", () => {
    render(<LandingFooter />);
    expect(screen.getByText(/landing\.dataInEu/)).toBeInTheDocument();
  });

  it("renders links section heading", () => {
    render(<LandingFooter />);
    expect(screen.getByText("landing.links")).toBeInTheDocument();
  });
});
