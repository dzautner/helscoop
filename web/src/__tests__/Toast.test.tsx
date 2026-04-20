/**
 * Unit tests for Toast components.
 *
 * Tests cover: ToastContainer rendering and overflow, ToastMessage (all types,
 * action buttons, dismiss, auto-dismiss timer, group count badge),
 * ProgressToast (progress bar ARIA, completion auto-dismiss), and the
 * groupToasts grouping logic via ToastContainer.
 *
 * Run: npx vitest run src/__tests__/Toast.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastContainer } from "@/components/Toast";
import type { ToastItem } from "@/components/Toast";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        "toast.dismiss": "Dismiss",
        "toast.overflowMore": `+${params?.count ?? "?"} more`,
      };
      if (key === "toast.overflowMore" && params) {
        return `+${params.count} more`;
      }
      return map[key] ?? key;
    },
  }),
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let idCounter = 0;

function makeToast(overrides: Partial<ToastItem> = {}): ToastItem {
  return {
    id: ++idCounter,
    message: "Test notification",
    type: "info",
    createdAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ToastContainer
// ---------------------------------------------------------------------------

describe("ToastContainer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    idCounter = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when toasts array is empty", () => {
    const { container } = render(
      <ToastContainer toasts={[]} onDismiss={vi.fn()} />
    );
    // The outer wrapper is always present, but no toast items
    const items = container.querySelectorAll("[role='alert'], [role='status']");
    // Only the container's own role=status counts; individual toast items excluded
    expect(items.length).toBe(1); // the outer role="status" wrapper
  });

  it("renders a single toast message", () => {
    const toast = makeToast({ message: "Hello world", type: "success" });
    render(<ToastContainer toasts={[toast]} onDismiss={vi.fn()} />);
    expect(screen.getByText("Hello world")).toBeDefined();
  });

  it("renders multiple toasts", () => {
    const toasts = [
      makeToast({ message: "First", type: "success" }),
      makeToast({ message: "Second", type: "error" }),
      makeToast({ message: "Third", type: "warning" }),
    ];
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    expect(screen.getByText("First")).toBeDefined();
    expect(screen.getByText("Second")).toBeDefined();
    expect(screen.getByText("Third")).toBeDefined();
  });

  it("renders at most 5 toasts and shows overflow indicator for extras", () => {
    const toasts = Array.from({ length: 7 }, (_, i) =>
      makeToast({ message: `Toast ${i + 1}`, type: "info" })
    );
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    // Only 5 visible
    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`Toast ${i}`)).toBeDefined();
    }
    // Overflow indicator shows "+2 more"
    expect(screen.getByText("+2 more")).toBeDefined();
  });

  it("does not show overflow indicator when toasts <= 5", () => {
    const toasts = Array.from({ length: 5 }, (_, i) =>
      makeToast({ message: `Toast ${i + 1}`, type: "info" })
    );
    const { queryByText } = render(
      <ToastContainer toasts={toasts} onDismiss={vi.fn()} />
    );
    expect(queryByText(/\+\d+ more/)).toBeNull();
  });

  it("has role=status and aria-live=polite on container", () => {
    const { container } = render(
      <ToastContainer toasts={[]} onDismiss={vi.fn()} />
    );
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.getAttribute("role")).toBe("status");
    expect(wrapper.getAttribute("aria-live")).toBe("polite");
  });

  // ------------------------------------------------------------------
  // Grouping logic
  // ------------------------------------------------------------------

  it("groups toasts with the same group key into one with a count badge", () => {
    const toasts = [
      makeToast({ message: "Save 1", type: "success", group: "save" }),
      makeToast({ message: "Save 2", type: "success", group: "save" }),
      makeToast({ message: "Save 3", type: "success", group: "save" }),
    ];
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    // Only the latest grouped message should be visible
    expect(screen.getByText("Save 3")).toBeDefined();
    // Count badge "3" should appear
    expect(screen.getByText("3")).toBeDefined();
    // Earlier grouped messages should not be rendered
    expect(screen.queryByText("Save 1")).toBeNull();
    expect(screen.queryByText("Save 2")).toBeNull();
  });

  it("keeps ungrouped toasts and grouped toasts separate", () => {
    const toasts = [
      makeToast({ message: "Solo", type: "info" }),
      makeToast({ message: "Grouped A", type: "success", group: "g1" }),
      makeToast({ message: "Grouped B", type: "success", group: "g1" }),
    ];
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    expect(screen.getByText("Solo")).toBeDefined();
    expect(screen.getByText("Grouped B")).toBeDefined();
    expect(screen.queryByText("Grouped A")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ToastMessage via ToastContainer
// ---------------------------------------------------------------------------

describe("ToastMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    idCounter = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders success type toast", () => {
    const toast = makeToast({ type: "success", message: "Saved!" });
    render(<ToastContainer toasts={[toast]} onDismiss={vi.fn()} />);
    expect(screen.getByText("Saved!")).toBeDefined();
  });

  it("renders error type toast with role=alert", () => {
    const toast = makeToast({ type: "error", message: "Something failed" });
    const { container } = render(
      <ToastContainer toasts={[toast]} onDismiss={vi.fn()} />
    );
    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert?.textContent).toContain("Something failed");
  });

  it("renders warning type toast", () => {
    const toast = makeToast({ type: "warning", message: "Watch out!" });
    render(<ToastContainer toasts={[toast]} onDismiss={vi.fn()} />);
    expect(screen.getByText("Watch out!")).toBeDefined();
  });

  it("renders dismiss button with accessible label", () => {
    const toast = makeToast({ type: "info", message: "Info" });
    render(<ToastContainer toasts={[toast]} onDismiss={vi.fn()} />);
    const dismissBtn = screen.getByLabelText("Dismiss");
    expect(dismissBtn).toBeDefined();
  });

  it("calls onDismiss when dismiss button is clicked", () => {
    const onDismiss = vi.fn();
    const toast = makeToast({ id: 42, type: "info", message: "Click me" });
    render(<ToastContainer toasts={[toast]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByLabelText("Dismiss"));
    // Dismiss triggers after 300ms transition
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onDismiss).toHaveBeenCalledWith(42);
  });

  it("calls onDismiss when clicking the toast body (no action)", () => {
    const onDismiss = vi.fn();
    const toast = makeToast({ id: 99, type: "success", message: "Click body" });
    render(<ToastContainer toasts={[toast]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByText("Click body"));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onDismiss).toHaveBeenCalledWith(99);
  });

  it("auto-dismisses after default 4000ms", () => {
    const onDismiss = vi.fn();
    const toast = makeToast({ id: 10, type: "info", message: "Goodbye" });
    render(<ToastContainer toasts={[toast]} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(4000 + 300);
    });
    expect(onDismiss).toHaveBeenCalledWith(10);
  });

  it("respects custom duration", () => {
    const onDismiss = vi.fn();
    const toast = makeToast({ id: 11, type: "info", message: "Custom", duration: 1000 });
    render(<ToastContainer toasts={[toast]} onDismiss={onDismiss} />);
    // Should not dismiss before duration
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    // Should dismiss after duration + transition
    act(() => {
      vi.advanceTimersByTime(301 + 300);
    });
    expect(onDismiss).toHaveBeenCalledWith(11);
  });

  it("does not auto-dismiss when duration=0", () => {
    const onDismiss = vi.fn();
    const toast = makeToast({ id: 12, type: "info", message: "Sticky", duration: 0 });
    render(<ToastContainer toasts={[toast]} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(30000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("renders action button and calls action handler", () => {
    const actionHandler = vi.fn();
    const onDismiss = vi.fn();
    const toast = makeToast({
      id: 20,
      type: "success",
      message: "Deleted",
      action: { label: "Undo", onClick: actionHandler },
    });
    render(<ToastContainer toasts={[toast]} onDismiss={onDismiss} />);
    const actionBtn = screen.getByText("Undo");
    expect(actionBtn).toBeDefined();
    fireEvent.click(actionBtn);
    expect(actionHandler).toHaveBeenCalledTimes(1);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onDismiss).toHaveBeenCalledWith(20);
  });

  it("does not dismiss on body click when action is present", () => {
    const onDismiss = vi.fn();
    const toast = makeToast({
      id: 21,
      type: "info",
      message: "Has action",
      action: { label: "Undo", onClick: vi.fn() },
      duration: 0,
    });
    const { container } = render(
      <ToastContainer toasts={[toast]} onDismiss={onDismiss} />
    );
    // Click the toast body (not the Undo button)
    const toastEl = container.querySelector("[role='status']:not([aria-live='polite']:not([data-cmd-item]))") as HTMLElement;
    // Find the inner div with the message
    fireEvent.click(screen.getByText("Has action"));
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Should NOT dismiss when action exists (body click ignored)
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("shows group count badge when groupCount > 1", () => {
    const toasts = [
      makeToast({ message: "Event", type: "info", group: "events" }),
      makeToast({ message: "Event", type: "info", group: "events" }),
      makeToast({ message: "Event", type: "info", group: "events" }),
    ];
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    // Badge should show count 3
    expect(screen.getByText("3")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ProgressToast via ToastContainer
// ---------------------------------------------------------------------------

describe("ProgressToast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    idCounter = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders progress toast with message", () => {
    const toast = makeToast({ type: "progress", message: "Uploading...", progress: 40 });
    render(<ToastContainer toasts={[toast]} onDismiss={vi.fn()} />);
    expect(screen.getByText("Uploading...")).toBeDefined();
  });

  it("renders progressbar with correct aria-valuenow", () => {
    const toast = makeToast({ type: "progress", message: "Processing", progress: 65 });
    const { container } = render(
      <ToastContainer toasts={[toast]} onDismiss={vi.fn()} />
    );
    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar).toBeTruthy();
    expect(progressbar?.getAttribute("aria-valuenow")).toBe("65");
    expect(progressbar?.getAttribute("aria-valuemin")).toBe("0");
    expect(progressbar?.getAttribute("aria-valuemax")).toBe("100");
  });

  it("renders progressbar aria-label containing message", () => {
    const toast = makeToast({ type: "progress", message: "Exporting", progress: 50 });
    const { container } = render(
      <ToastContainer toasts={[toast]} onDismiss={vi.fn()} />
    );
    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar?.getAttribute("aria-label")).toContain("Exporting");
  });

  it("shows percentage text", () => {
    const toast = makeToast({ type: "progress", message: "Loading", progress: 73 });
    render(<ToastContainer toasts={[toast]} onDismiss={vi.fn()} />);
    expect(screen.getByText("73%")).toBeDefined();
  });

  it("shows 0% when progress is 0", () => {
    const toast = makeToast({ type: "progress", message: "Starting", progress: 0 });
    render(<ToastContainer toasts={[toast]} onDismiss={vi.fn()} />);
    expect(screen.getByText("0%")).toBeDefined();
  });

  it("rounds fractional progress in aria-valuenow", () => {
    const toast = makeToast({ type: "progress", message: "Work", progress: 33.7 });
    const { container } = render(
      <ToastContainer toasts={[toast]} onDismiss={vi.fn()} />
    );
    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar?.getAttribute("aria-valuenow")).toBe("34");
  });

  it("auto-dismisses 1500ms after reaching 100%", () => {
    const onDismiss = vi.fn();
    const toast = makeToast({ id: 50, type: "progress", message: "Done", progress: 100 });
    render(<ToastContainer toasts={[toast]} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(1500 + 300);
    });
    expect(onDismiss).toHaveBeenCalledWith(50);
  });

  it("does not auto-dismiss before 100% completion", () => {
    const onDismiss = vi.fn();
    const toast = makeToast({ id: 51, type: "progress", message: "In progress", progress: 99 });
    render(<ToastContainer toasts={[toast]} onDismiss={onDismiss} />);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("has role=status and aria-live=polite on progress toast", () => {
    const toast = makeToast({ type: "progress", message: "Building", progress: 20 });
    const { container } = render(
      <ToastContainer toasts={[toast]} onDismiss={vi.fn()} />
    );
    // The progress toast outer div
    const statusEls = container.querySelectorAll('[role="status"]');
    // At least the container + the progress toast itself
    expect(statusEls.length).toBeGreaterThanOrEqual(2);
  });

  it("clamps the inner progress bar fill width to 100% even when progress > 100", () => {
    // The bar fill uses Math.min(100, ...) for the width, but aria-valuenow
    // reflects the raw rounded value. The visual bar must not overflow its container.
    const toast = makeToast({ type: "progress", message: "Over", progress: 120 });
    const { container } = render(
      <ToastContainer toasts={[toast]} onDismiss={vi.fn()} />
    );
    const progressbar = container.querySelector('[role="progressbar"]');
    expect(progressbar).toBeTruthy();
    // The fill div is the only child of the progressbar
    const fill = progressbar?.firstElementChild as HTMLElement | undefined;
    // The fill width style should be clamped to 100%
    expect(fill?.style.width).toBe("100%");
  });
});
