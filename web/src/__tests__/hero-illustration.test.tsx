import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import HeroIllustration from "@/components/HeroIllustration";

describe("HeroIllustration", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it("renders SVG", () => {
    vi.useFakeTimers();
    const { container } = render(<HeroIllustration />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("starts hidden (opacity 0)", () => {
    vi.useFakeTimers();
    const { container } = render(<HeroIllustration />);
    const wrapper = container.querySelector(".hero-illustration") as HTMLElement;
    expect(wrapper.style.opacity).toBe("0");
    vi.useRealTimers();
  });

  it("becomes visible after 200ms", () => {
    vi.useFakeTimers();
    const { container } = render(<HeroIllustration />);
    act(() => { vi.advanceTimersByTime(200); });
    const wrapper = container.querySelector(".hero-illustration") as HTMLElement;
    expect(wrapper.style.opacity).toBe("1");
    vi.useRealTimers();
  });

  it("has aria-hidden on SVG", () => {
    vi.useFakeTimers();
    const { container } = render(<HeroIllustration />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    vi.useRealTimers();
  });

  it("renders house elements", () => {
    vi.useFakeTimers();
    const { container } = render(<HeroIllustration />);
    const rects = container.querySelectorAll("rect");
    expect(rects.length).toBeGreaterThan(3);
    vi.useRealTimers();
  });

  it("renders dimension text", () => {
    vi.useFakeTimers();
    render(<HeroIllustration />);
    expect(screen.getByText("12 000")).toBeInTheDocument();
    expect(screen.getByText("7 000")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("has blueprint CSS classes", () => {
    vi.useFakeTimers();
    const { container } = render(<HeroIllustration />);
    expect(container.querySelector(".bp-line")).toBeInTheDocument();
    expect(container.querySelector(".bp-dim")).toBeInTheDocument();
    expect(container.querySelector(".bp-text")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
