import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      className,
      custom,
      ...rest
    }: {
      children: React.ReactNode;
      className?: string;
      custom?: string;
      [key: string]: unknown;
    }) => (
      <div className={className} data-custom={custom} data-testid="scroll-reveal">
        {children}
      </div>
    ),
  },
}));

import ScrollReveal from "@/components/ScrollReveal";

describe("ScrollReveal", () => {
  it("renders children", () => {
    render(<ScrollReveal><span>Hello</span></ScrollReveal>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("applies className", () => {
    render(<ScrollReveal className="my-class"><span>Content</span></ScrollReveal>);
    const el = screen.getByTestId("scroll-reveal");
    expect(el).toHaveClass("my-class");
  });

  it("passes direction as custom prop", () => {
    render(<ScrollReveal direction="left"><span>Left</span></ScrollReveal>);
    const el = screen.getByTestId("scroll-reveal");
    expect(el.dataset.custom).toBe("left");
  });

  it("defaults direction to up", () => {
    render(<ScrollReveal><span>Default</span></ScrollReveal>);
    const el = screen.getByTestId("scroll-reveal");
    expect(el.dataset.custom).toBe("up");
  });

  it("renders with right direction", () => {
    render(<ScrollReveal direction="right"><span>Right</span></ScrollReveal>);
    const el = screen.getByTestId("scroll-reveal");
    expect(el.dataset.custom).toBe("right");
  });

  it("renders without className when not provided", () => {
    render(<ScrollReveal><span>No class</span></ScrollReveal>);
    const el = screen.getByTestId("scroll-reveal");
    expect(el.className).toBe("");
  });
});
