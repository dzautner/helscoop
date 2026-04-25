import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useCursorGlow } from "@/hooks/useCursorGlow";

// ---------------------------------------------------------------------------
// useFocusTrap
// ---------------------------------------------------------------------------
function FocusTrapTestHarness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, open, () => {
    setOpen(false);
    onClose();
  });

  if (!open) return <div data-testid="closed">closed</div>;

  return (
    <div ref={ref} data-testid="trap">
      <button data-testid="first">First</button>
      <button data-testid="second">Second</button>
      <button data-testid="third">Third</button>
    </div>
  );
}

describe("useFocusTrap", () => {
  it("focuses first focusable element on mount", () => {
    const onClose = vi.fn();
    render(<FocusTrapTestHarness onClose={onClose} />);
    expect(document.activeElement).toBe(screen.getByTestId("first"));
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(<FocusTrapTestHarness onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("closed")).toBeInTheDocument();
  });

  it("wraps Tab from last to first element", () => {
    const onClose = vi.fn();
    render(<FocusTrapTestHarness onClose={onClose} />);
    const third = screen.getByTestId("third");
    third.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByTestId("first"));
  });

  it("wraps Shift+Tab from first to last element", () => {
    const onClose = vi.fn();
    render(<FocusTrapTestHarness onClose={onClose} />);
    const first = screen.getByTestId("first");
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByTestId("third"));
  });

  it("does not trap when open is false", () => {
    const onClose = vi.fn();
    function ClosedHarness() {
      const ref = useRef<HTMLDivElement>(null);
      useFocusTrap(ref, false, onClose);
      return (
        <div ref={ref}>
          <button data-testid="btn">Click</button>
        </div>
      );
    }
    render(<ClosedHarness />);
    expect(document.activeElement).not.toBe(screen.getByTestId("btn"));
  });
});

// ---------------------------------------------------------------------------
// useCursorGlow
// ---------------------------------------------------------------------------
function CursorGlowTestHarness() {
  const glow = useCursorGlow();
  return (
    <div
      ref={glow.ref}
      onMouseMove={glow.onMouseMove}
      onMouseLeave={glow.onMouseLeave}
      data-testid="glow-el"
      style={{ width: 200, height: 200 }}
    />
  );
}

describe("useCursorGlow", () => {
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ref, onMouseMove, and onMouseLeave via component", () => {
    let glowResult: ReturnType<typeof useCursorGlow> | null = null;
    function Capture() {
      glowResult = useCursorGlow();
      return null;
    }
    render(<Capture />);
    expect(glowResult).not.toBeNull();
    expect(glowResult!.ref).toBeDefined();
    expect(typeof glowResult!.onMouseMove).toBe("function");
    expect(typeof glowResult!.onMouseLeave).toBe("function");
  });

  it("sets glow CSS vars on mouse move", () => {
    render(<CursorGlowTestHarness />);
    const el = screen.getByTestId("glow-el");

    // Mock getBoundingClientRect
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 20,
      right: 210,
      bottom: 220,
      width: 200,
      height: 200,
      x: 10,
      y: 20,
      toJSON: () => {},
    });

    fireEvent.mouseMove(el, { clientX: 50, clientY: 60 });

    // Execute the rAF callback
    act(() => {
      for (const cb of rafCallbacks) cb(performance.now());
      rafCallbacks = [];
    });

    expect(el.style.getPropertyValue("--glow-x")).toBe("40px");
    expect(el.style.getPropertyValue("--glow-y")).toBe("40px");
    expect(el.style.getPropertyValue("--glow-opacity")).toBe("1");
  });

  it("sets glow-opacity to 0 on mouse leave", () => {
    render(<CursorGlowTestHarness />);
    const el = screen.getByTestId("glow-el");
    fireEvent.mouseLeave(el);
    expect(el.style.getPropertyValue("--glow-opacity")).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// useMediaQuery (minimal test since jsdom has limited matchMedia)
// ---------------------------------------------------------------------------
describe("useMediaQuery", () => {
  it("module exports a function", async () => {
    const mod = await import("@/hooks/useMediaQuery");
    expect(typeof mod.useMediaQuery).toBe("function");
  });

  it("returns false by default in jsdom", async () => {
    const { useMediaQuery } = await import("@/hooks/useMediaQuery");

    function TestHarness() {
      const matches = useMediaQuery("(min-width: 768px)");
      return <div data-testid="result">{String(matches)}</div>;
    }

    render(<TestHarness />);
    expect(screen.getByTestId("result").textContent).toBe("false");
  });
});
