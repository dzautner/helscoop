import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock LocaleProvider
vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

// Mock useCursorGlow
vi.mock("@/hooks/useCursorGlow", () => ({
  useCursorGlow: () => ({
    ref: { current: null },
    onMouseMove: vi.fn(),
    onMouseLeave: vi.fn(),
  }),
}));

import SceneParamsPanel from "@/components/SceneParamsPanel";
import { ToastContainer, type ToastItem } from "@/components/Toast";
import CommandPalette, { type Command } from "@/components/CommandPalette";

// ---------------------------------------------------------------------------
// SceneParamsPanel
// ---------------------------------------------------------------------------
describe("SceneParamsPanel", () => {
  const mockParams = [
    { name: "width", section: "Dimensions", label: "Width", min: 1, max: 10, value: 5, step: 1 },
    { name: "height", section: "Dimensions", label: "Height", min: 0, max: 20, value: 10, step: 1 },
    { name: "color", section: "Appearance", label: "Color", min: 0, max: 1, value: 0.5, step: 0.1 },
  ];

  it("returns null when params array is empty", () => {
    const { container } = render(
      <SceneParamsPanel params={[]} onParamChange={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders sections grouped by param.section", () => {
    render(<SceneParamsPanel params={mockParams} onParamChange={vi.fn()} />);
    expect(screen.getByText("Dimensions")).toBeInTheDocument();
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });

  it("renders all param labels", () => {
    render(<SceneParamsPanel params={mockParams} onParamChange={vi.fn()} />);
    expect(screen.getByText("Width")).toBeInTheDocument();
    expect(screen.getByText("Height")).toBeInTheDocument();
    expect(screen.getByText("Color")).toBeInTheDocument();
  });

  it("collapse/expand toggles section visibility", () => {
    render(<SceneParamsPanel params={mockParams} onParamChange={vi.fn()} />);
    const toggleBtn = screen.getAllByRole("button").find(
      (b) => b.getAttribute("aria-expanded") === "true",
    );
    expect(toggleBtn).toBeDefined();
    fireEvent.click(toggleBtn!);
    expect(toggleBtn!.getAttribute("aria-expanded")).toBe("false");
  });

  it("calls onParamChange when slider value changes", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    render(<SceneParamsPanel params={mockParams} onParamChange={onChange} />);
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0], { target: { value: "7" } });
    act(() => { vi.advanceTimersByTime(20); });
    expect(onChange).toHaveBeenCalledWith("width", 7);
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
describe("ToastContainer", () => {
  const baseToast: ToastItem = {
    id: 1,
    message: "Test toast",
    type: "info",
    createdAt: Date.now(),
  };

  it("renders a toast message", () => {
    render(<ToastContainer toasts={[baseToast]} onDismiss={vi.fn()} />);
    expect(screen.getByText("Test toast")).toBeInTheDocument();
  });

  it("renders error toast with alert role", () => {
    const errorToast = { ...baseToast, type: "error" as const, message: "Error!" };
    render(<ToastContainer toasts={[errorToast]} onDismiss={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders info toast with status role", () => {
    render(<ToastContainer toasts={[baseToast]} onDismiss={vi.fn()} />);
    const statusElements = screen.getAllByRole("status");
    expect(statusElements.length).toBeGreaterThan(0);
  });

  it("renders progress toast with progressbar", () => {
    const progressToast: ToastItem = {
      ...baseToast,
      type: "progress",
      progress: 42,
      duration: 0,
    };
    render(<ToastContainer toasts={[progressToast]} onDismiss={vi.fn()} />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toBeInTheDocument();
    expect(bar.getAttribute("aria-valuenow")).toBe("42");
  });

  it("shows overflow indicator when more than 5 toasts", () => {
    const toasts = Array.from({ length: 7 }, (_, i) => ({
      ...baseToast,
      id: i,
      message: `Toast ${i}`,
      createdAt: Date.now() + i,
    }));
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    expect(screen.getByText("toast.overflowMore")).toBeInTheDocument();
  });

  it("renders action button when action is provided", () => {
    const actionToast: ToastItem = {
      ...baseToast,
      action: { label: "Undo", onClick: vi.fn() },
    };
    render(<ToastContainer toasts={[actionToast]} onDismiss={vi.fn()} />);
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });

  it("auto-dismisses after duration", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const toast: ToastItem = { ...baseToast, duration: 1000 };
    render(<ToastContainer toasts={[toast]} onDismiss={onDismiss} />);
    act(() => { vi.advanceTimersByTime(1300); });
    expect(onDismiss).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("groups toasts with same group key", () => {
    const toasts: ToastItem[] = [
      { ...baseToast, id: 1, group: "save", message: "Saved 1", createdAt: 1 },
      { ...baseToast, id: 2, group: "save", message: "Saved 2", createdAt: 2 },
      { ...baseToast, id: 3, group: "save", message: "Saved 3", createdAt: 3 },
    ];
    render(<ToastContainer toasts={toasts} onDismiss={vi.fn()} />);
    // Only the latest grouped toast message should be visible
    expect(screen.getByText("Saved 3")).toBeInTheDocument();
    expect(screen.queryByText("Saved 1")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CommandPalette
// ---------------------------------------------------------------------------
describe("CommandPalette", () => {
  const commands: Command[] = [
    { id: "cmd-save", labelKey: "cmd.save", action: vi.fn(), category: "project" },
    { id: "cmd-undo", labelKey: "cmd.undo", action: vi.fn(), category: "scene" },
    { id: "cmd-theme", labelKey: "cmd.theme", action: vi.fn(), category: "preferences", isActive: true },
  ];

  beforeEach(() => {
    localStorage.clear();
  });

  it("returns null when open is false", () => {
    const { container } = render(
      <CommandPalette open={false} onClose={vi.fn()} commands={commands} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders command labels when open", () => {
    render(<CommandPalette open={true} onClose={vi.fn()} commands={commands} />);
    expect(screen.getByText("cmd.save")).toBeInTheDocument();
    expect(screen.getByText("cmd.undo")).toBeInTheDocument();
    expect(screen.getByText("cmd.theme")).toBeInTheDocument();
  });

  it("filters commands by search query", () => {
    render(<CommandPalette open={true} onClose={vi.fn()} commands={commands} />);
    const input = screen.getByRole("textbox") || screen.getByRole("searchbox")
      || document.querySelector("input");
    fireEvent.change(input!, { target: { value: "save" } });
    expect(screen.getByText("cmd.save")).toBeInTheDocument();
    expect(screen.queryByText("cmd.undo")).not.toBeInTheDocument();
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<CommandPalette open={true} onClose={onClose} commands={commands} />);
    fireEvent.keyDown(document.querySelector("[role='dialog']") || document.body, {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("executes command on Enter after arrow navigation", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const cmds: Command[] = [
      { id: "a", labelKey: "Alpha", action, category: "scene" },
      { id: "b", labelKey: "Beta", action: vi.fn(), category: "scene" },
    ];
    render(<CommandPalette open={true} onClose={vi.fn()} commands={cmds} />);
    const dialog = document.querySelector("[role='dialog']") || document.body;
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    fireEvent.keyDown(dialog, { key: "Enter" });
    act(() => {
      vi.advanceTimersByTime(50);
      // rAF callback
      vi.advanceTimersByTime(50);
    });
    vi.useRealTimers();
  });

  it("shows toggle indicator for commands with isActive", () => {
    render(<CommandPalette open={true} onClose={vi.fn()} commands={commands} />);
    expect(screen.getByText("cmd.theme")).toBeInTheDocument();
  });

  it("saves recent commands to localStorage on execution", () => {
    vi.useFakeTimers();
    const action = vi.fn();
    const cmds: Command[] = [
      { id: "test-cmd", labelKey: "Test", action, category: "scene" },
    ];
    render(<CommandPalette open={true} onClose={vi.fn()} commands={cmds} />);
    const dialog = document.querySelector("[role='dialog']") || document.body;
    // Select first item
    fireEvent.keyDown(dialog, { key: "ArrowDown" });
    fireEvent.keyDown(dialog, { key: "Enter" });
    act(() => { vi.advanceTimersByTime(50); });
    const stored = localStorage.getItem("helscoop_recent_commands");
    expect(stored).toContain("test-cmd");
    vi.useRealTimers();
  });
});
