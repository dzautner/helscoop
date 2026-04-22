import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import {
  SkeletonBlock,
  Skeleton,
  SkeletonProjectCard,
  SkeletonTableRow,
  SkeletonBomPanel,
  SkeletonPriceComparison,
  SkeletonProjectEditor,
} from "@/components/Skeleton";

describe("SkeletonBlock", () => {
  it("renders with default dimensions", () => {
    const { container } = render(<SkeletonBlock />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveClass("skeleton");
    expect(el.style.width).toBe("100%");
    expect(el.style.height).toBe("16px");
  });

  it("accepts custom width and height", () => {
    const { container } = render(<SkeletonBlock width={200} height={40} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("200px");
    expect(el.style.height).toBe("40px");
  });

  it("accepts string dimensions", () => {
    const { container } = render(<SkeletonBlock width="50%" height="2rem" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("50%");
    expect(el.style.height).toBe("2rem");
  });

  it("applies custom border radius", () => {
    const { container } = render(<SkeletonBlock radius="50%" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.borderRadius).toBe("50%");
  });

  it("merges extra style props", () => {
    const { container } = render(<SkeletonBlock style={{ opacity: 0.5 }} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.opacity).toBe("0.5");
  });
});

describe("Skeleton variants", () => {
  it("text variant renders 14px tall by default", () => {
    const { container } = render(<Skeleton variant="text" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.height).toBe("14px");
  });

  it("card variant renders 80px tall by default", () => {
    const { container } = render(<Skeleton variant="card" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.height).toBe("80px");
  });

  it("circle variant renders 40x40 by default", () => {
    const { container } = render(<Skeleton variant="circle" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("40px");
    expect(el.style.height).toBe("40px");
    expect(el.style.borderRadius).toBe("50%");
  });

  it("rect variant renders 48px tall by default", () => {
    const { container } = render(<Skeleton variant="rect" />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.height).toBe("48px");
  });

  it("default variant is text", () => {
    const { container } = render(<Skeleton />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.height).toBe("14px");
  });

  it("overrides default dimensions with props", () => {
    const { container } = render(<Skeleton variant="circle" width={24} height={24} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe("24px");
    expect(el.style.height).toBe("24px");
  });
});

describe("Composite skeletons", () => {
  it("SkeletonProjectCard renders without crashing", () => {
    const { container } = render(<SkeletonProjectCard />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("SkeletonProjectCard accepts delay", () => {
    const { container } = render(<SkeletonProjectCard delay={0.1} />);
    const card = container.firstChild as HTMLElement;
    expect(card.style.animation).toContain("0.1s");
  });

  it("SkeletonTableRow renders correct number of columns", () => {
    const { container } = render(
      <table><tbody><SkeletonTableRow columns={3} /></tbody></table>,
    );
    expect(container.querySelectorAll("td")).toHaveLength(3);
  });

  it("SkeletonTableRow defaults to 5 columns", () => {
    const { container } = render(
      <table><tbody><SkeletonTableRow /></tbody></table>,
    );
    expect(container.querySelectorAll("td")).toHaveLength(5);
  });

  it("SkeletonBomPanel renders skeleton elements", () => {
    const { container } = render(<SkeletonBomPanel />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(5);
  });

  it("SkeletonPriceComparison renders 3 items", () => {
    const { container } = render(<SkeletonPriceComparison />);
    const items = container.querySelectorAll("[style*='border']");
    expect(items.length).toBeGreaterThanOrEqual(3);
  });

  it("SkeletonProjectEditor renders header and body sections", () => {
    const { container } = render(<SkeletonProjectEditor />);
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThanOrEqual(5);
  });
});
