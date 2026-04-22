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

import TrustLayer from "@/components/TrustLayer";

describe("TrustLayer", () => {
  it("renders trust layer container", () => {
    const { container } = render(<TrustLayer />);
    expect(container.querySelector(".trust-layer")).toBeInTheDocument();
  });

  it("renders all 6 partner logos", () => {
    render(<TrustLayer />);
    expect(screen.getByText("K-Rauta")).toBeInTheDocument();
    expect(screen.getByText("Stark")).toBeInTheDocument();
    expect(screen.getByText("Ruukki")).toBeInTheDocument();
    expect(screen.getByText("DVV")).toBeInTheDocument();
    expect(screen.getByText("MML")).toBeInTheDocument();
    expect(screen.getByText("Sarokas")).toBeInTheDocument();
  });

  it("renders sources label", () => {
    render(<TrustLayer />);
    expect(screen.getByText("trust.sourcesLabel")).toBeInTheDocument();
  });

  it("renders 4 stats", () => {
    const { container } = render(<TrustLayer />);
    const stats = container.querySelectorAll(".trust-stat");
    expect(stats.length).toBe(4);
  });

  it("renders product count stat", () => {
    render(<TrustLayer />);
    expect(screen.getByText("1 200+")).toBeInTheDocument();
    expect(screen.getByText("trust.products")).toBeInTheDocument();
  });

  it("renders supplier count stat", () => {
    render(<TrustLayer />);
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("trust.suppliers")).toBeInTheDocument();
  });

  it("renders free stat", () => {
    render(<TrustLayer />);
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(screen.getByText("trust.free")).toBeInTheDocument();
  });

  it("renders GDPR stat", () => {
    render(<TrustLayer />);
    expect(screen.getByText("GDPR")).toBeInTheDocument();
    expect(screen.getByText("trust.gdprCompliant")).toBeInTheDocument();
  });

  it("renders social proof section", () => {
    const { container } = render(<TrustLayer />);
    expect(container.querySelector(".trust-proof")).toBeInTheDocument();
  });

  it("renders proof text", () => {
    render(<TrustLayer />);
    expect(screen.getByText("trust.proofText")).toBeInTheDocument();
  });

  it("renders shield SVG icon", () => {
    const { container } = render(<TrustLayer />);
    const svg = container.querySelector(".trust-proof svg");
    expect(svg).toBeInTheDocument();
  });
});
