import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

let rafCallback: ((ts: number) => void) | null = null;
vi.stubGlobal("requestAnimationFrame", (cb: (ts: number) => void) => {
  rafCallback = cb;
  return 1;
});

import ViewportContextMenu from "@/components/ViewportContextMenu";
import type { ContextMenuItem } from "@/components/ViewportContextMenu";

const mockItems: ContextMenuItem[] = [
  { id: "delete", label: "Delete", icon: "M3 6h18M8 6V4h8v2M5 6v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6", onClick: vi.fn() },
  { id: "copy", label: "Copy", icon: "M8 4v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8l-6-4", onClick: vi.fn() },
  { id: "rotate", label: "Rotate", icon: "M23 4v6h-6M1 20v-6h6", onClick: vi.fn(), active: true },
];

beforeEach(() => {
  vi.clearAllMocks();
  rafCallback = null;
});

function renderOpen(onClose = vi.fn()) {
  const result = render(
    <ViewportContextMenu items={mockItems} position={{ x: 400, y: 300 }} onClose={onClose} />,
  );
  if (rafCallback) act(() => rafCallback!(0));
  return { ...result, onClose };
}

describe("ViewportContextMenu", () => {
  it("returns null when position is null", () => {
    const { container } = render(
      <ViewportContextMenu items={mockItems} position={null} onClose={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders menu when position is provided", () => {
    renderOpen();
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("renders all menu items", () => {
    renderOpen();
    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems).toHaveLength(3);
  });

  it("has aria-label on menu items", () => {
    renderOpen();
    expect(screen.getByLabelText("Delete")).toBeInTheDocument();
    expect(screen.getByLabelText("Copy")).toBeInTheDocument();
    expect(screen.getByLabelText("Rotate")).toBeInTheDocument();
  });

  it("has menu aria-label", () => {
    renderOpen();
    expect(screen.getByRole("menu")).toHaveAttribute("aria-label", "viewport.contextMenuLabel");
  });

  it("calls onClick and onClose when item is clicked", () => {
    const onClose = vi.fn();
    renderOpen(onClose);
    fireEvent.click(screen.getByLabelText("Delete"));
    expect(mockItems[0].onClick).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    renderOpen(onClose);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates items with ArrowDown", () => {
    renderOpen();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    const items = screen.getAllByRole("menuitem");
    expect(items[1]).toHaveFocus();
  });

  it("navigates items with ArrowUp (wraps around)", () => {
    renderOpen();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    const items = screen.getAllByRole("menuitem");
    expect(items[2]).toHaveFocus();
  });

  it("activates item with Enter key", () => {
    const onClose = vi.fn();
    renderOpen(onClose);
    fireEvent.keyDown(window, { key: "Enter" });
    expect(mockItems[0].onClick).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("first item has tabIndex 0, others have -1", () => {
    renderOpen();
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveAttribute("tabindex", "0");
    expect(items[1]).toHaveAttribute("tabindex", "-1");
    expect(items[2]).toHaveAttribute("tabindex", "-1");
  });
});
