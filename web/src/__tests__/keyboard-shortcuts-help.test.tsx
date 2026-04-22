import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp";
import type { KeyboardShortcut } from "@/hooks/useKeyboardShortcuts";

const mockShortcuts: KeyboardShortcut[] = [
  { key: "Ctrl+S", code: "s", mod: true, descriptionKey: "shortcuts.save", action: vi.fn() },
  { key: "Ctrl+Z", code: "z", mod: true, descriptionKey: "shortcuts.undo", action: vi.fn() },
  { key: "Ctrl+Shift+Z", code: "z", mod: true, shift: true, descriptionKey: "shortcuts.redo", action: vi.fn() },
  { key: "Enter", code: "Enter", descriptionKey: "shortcuts.run", action: vi.fn() },
  { key: "/", code: "/", descriptionKey: "shortcuts.search", action: vi.fn() },
];

describe("KeyboardShortcutsHelp", () => {
  it("returns null when not open", () => {
    const { container } = render(
      <KeyboardShortcutsHelp open={false} onClose={vi.fn()} shortcuts={mockShortcuts} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog when open", () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} shortcuts={mockShortcuts} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows dialog title", () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} shortcuts={mockShortcuts} />);
    expect(screen.getByText("shortcuts.title")).toBeInTheDocument();
  });

  it("renders all shortcut descriptions", () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} shortcuts={mockShortcuts} />);
    expect(screen.getByText("shortcuts.save")).toBeInTheDocument();
    expect(screen.getByText("shortcuts.undo")).toBeInTheDocument();
    expect(screen.getByText("shortcuts.redo")).toBeInTheDocument();
    expect(screen.getByText("shortcuts.run")).toBeInTheDocument();
    expect(screen.getByText("shortcuts.search")).toBeInTheDocument();
  });

  it("renders kbd elements for each shortcut", () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} shortcuts={mockShortcuts} />);
    const kbds = document.querySelectorAll("kbd");
    expect(kbds.length).toBe(mockShortcuts.length);
  });

  it("shows close button with aria-label", () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} shortcuts={mockShortcuts} />);
    expect(screen.getByLabelText("shortcuts.close")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsHelp open={true} onClose={onClose} shortcuts={mockShortcuts} />);
    fireEvent.click(screen.getByLabelText("shortcuts.close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose on Escape key", () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsHelp open={true} onClose={onClose} shortcuts={mockShortcuts} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows escape hint footer", () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} shortcuts={mockShortcuts} />);
    expect(screen.getByText("shortcuts.escToClose")).toBeInTheDocument();
  });

  it("has aria-modal attribute", () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} shortcuts={mockShortcuts} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("formats Ctrl modifier on non-Mac", () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} shortcuts={mockShortcuts} />);
    const kbds = document.querySelectorAll("kbd");
    const saveKbd = kbds[0];
    expect(saveKbd.textContent).toContain("Ctrl");
    expect(saveKbd.textContent).toContain("S");
  });

  it("formats Enter key symbol", () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} shortcuts={mockShortcuts} />);
    const kbds = document.querySelectorAll("kbd");
    const enterKbd = Array.from(kbds).find((kbd) => kbd.textContent?.includes("\u23CE"));
    expect(enterKbd).toBeTruthy();
  });

  it("formats Shift modifier", () => {
    render(<KeyboardShortcutsHelp open={true} onClose={vi.fn()} shortcuts={mockShortcuts} />);
    const kbds = document.querySelectorAll("kbd");
    const redoKbd = kbds[2];
    expect(redoKbd.textContent).toContain("Shift");
  });
});
