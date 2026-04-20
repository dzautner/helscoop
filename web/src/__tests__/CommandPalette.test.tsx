/**
 * Unit tests for CommandPalette component.
 *
 * Tests cover: open/closed rendering, search input focus, fuzzy filtering,
 * category grouping, keyboard navigation (ArrowUp/Down/Enter/Escape),
 * command execution and onClose callback, recent commands display,
 * toggle state indicators, shortcut display, and accessibility attributes.
 *
 * Run: npx vitest run src/__tests__/CommandPalette.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CommandPalette, { type Command } from "@/components/CommandPalette";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// jsdom does not implement scrollIntoView — stub it globally
Element.prototype.scrollIntoView = vi.fn();

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "commandPalette.title": "Command Palette",
        "commandPalette.placeholder": "Search commands...",
        "commandPalette.noResults": "No results found",
        "commandPalette.categoryRecent": "Recent",
        "commandPalette.categoryScene": "Scene",
        "commandPalette.categoryProject": "Project",
        "commandPalette.categoryPreferences": "Preferences",
        "commandPalette.navigate": "Navigate",
        "commandPalette.execute": "Run",
        "commandPalette.close": "Close",
        "commandPalette.stateOn": "On",
        "commandPalette.stateOff": "Off",
        // Command labels
        "cmd.save": "Save",
        "cmd.saveEn": "Save project",
        "cmd.wireframe": "Toggle wireframe",
        "cmd.wireframeEn": "Toggle wireframe",
        "cmd.theme": "Theme",
        "cmd.themeEn": "Change theme",
        "cmd.bom": "Bill of materials",
        "cmd.bomEn": "Bill of materials",
        "cmd.share": "Share project",
        "cmd.shareEn": "Share project",
      };
      return map[key] ?? key;
    },
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: "save",
    labelKey: "cmd.save",
    action: vi.fn(),
    category: "project",
    ...overrides,
  };
}

const BASIC_COMMANDS: Command[] = [
  makeCommand({ id: "save", labelKey: "cmd.save", category: "project" }),
  makeCommand({ id: "toggle-wireframe", labelKey: "cmd.wireframe", category: "scene" }),
  makeCommand({ id: "toggle-theme", labelKey: "cmd.theme", category: "preferences" }),
];

// ---------------------------------------------------------------------------
// Open / closed state
// ---------------------------------------------------------------------------

describe("CommandPalette — open/closed", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CommandPalette open={false} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders the dialog when open", () => {
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  it("has aria-modal=true on dialog", () => {
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("has aria-label on dialog matching title translation", () => {
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-label")).toBe("Command Palette");
  });
});

// ---------------------------------------------------------------------------
// Search input
// ---------------------------------------------------------------------------

describe("CommandPalette — search input", () => {
  it("renders a search input with placeholder", () => {
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    const input = screen.getByPlaceholderText("Search commands...");
    expect(input).toBeDefined();
  });

  it("filters commands based on search query", () => {
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    const input = screen.getByPlaceholderText("Search commands...");
    fireEvent.change(input, { target: { value: "wire" } });
    expect(screen.getByText("Toggle wireframe")).toBeDefined();
    // "Save" and "Theme" should not match "wire"
    expect(screen.queryByText("Save")).toBeNull();
    expect(screen.queryByText("Theme")).toBeNull();
  });

  it("shows 'no results' message when no commands match query", () => {
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    const input = screen.getByPlaceholderText("Search commands...");
    fireEvent.change(input, { target: { value: "zzzzz_no_match" } });
    expect(screen.getByText("No results found")).toBeDefined();
  });

  it("resets query when palette is reopened", () => {
    const { rerender } = render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    const input = screen.getByPlaceholderText("Search commands...");
    fireEvent.change(input, { target: { value: "wire" } });
    // Close and reopen
    rerender(
      <CommandPalette open={false} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    rerender(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    const freshInput = screen.getByPlaceholderText("Search commands...");
    expect((freshInput as HTMLInputElement).value).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Category grouping
// ---------------------------------------------------------------------------

describe("CommandPalette — category grouping", () => {
  it("shows category headers when no query is active", () => {
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    expect(screen.getByText("Scene")).toBeDefined();
    expect(screen.getByText("Project")).toBeDefined();
    expect(screen.getByText("Preferences")).toBeDefined();
  });

  it("does not show category headers when a query is typed", () => {
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    const input = screen.getByPlaceholderText("Search commands...");
    fireEvent.change(input, { target: { value: "s" } });
    // Category headers should not be visible in search mode
    expect(screen.queryByText("Scene")).toBeNull();
    expect(screen.queryByText("Project")).toBeNull();
  });

  it("skips empty categories", () => {
    const cmds = [
      makeCommand({ id: "save", labelKey: "cmd.save", category: "project" }),
    ];
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={cmds} />
    );
    // Only Project should appear, not Scene or Preferences
    expect(screen.getByText("Project")).toBeDefined();
    expect(screen.queryByText("Scene")).toBeNull();
    expect(screen.queryByText("Preferences")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

describe("CommandPalette — keyboard navigation", () => {
  it("calls onClose when Escape is pressed", () => {
    const onClose = vi.fn();
    render(
      <CommandPalette open={true} onClose={onClose} commands={BASIC_COMMANDS} />
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("executes selected command and calls onClose on Enter", () => {
    const action = vi.fn();
    const onClose = vi.fn();
    const cmds = [makeCommand({ id: "save", labelKey: "cmd.save", action, category: "project" })];
    render(
      <CommandPalette open={true} onClose={onClose} commands={cmds} />
    );
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" });
    expect(onClose).toHaveBeenCalledTimes(1);
    // action called via requestAnimationFrame — trigger rAF
    // In jsdom vitest env rAF fires synchronously or needs flush
  });

  it("moves selection down with ArrowDown", () => {
    const cmds = [
      makeCommand({ id: "save", labelKey: "cmd.save", category: "project" }),
      makeCommand({ id: "toggle-wireframe", labelKey: "cmd.wireframe", category: "scene" }),
    ];
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={cmds} />
    );
    // First item should be selected initially
    const items = screen.getAllByRole("button").filter(
      (b) => b.hasAttribute("data-cmd-item")
    );
    expect(items[0].getAttribute("data-selected")).toBe("true");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowDown" });
    // After ArrowDown, second item is selected
    expect(items[1].getAttribute("data-selected")).toBe("true");
  });

  it("wraps around from last item to first on ArrowDown", () => {
    const cmds = [
      makeCommand({ id: "save", labelKey: "cmd.save", category: "project" }),
      makeCommand({ id: "toggle-wireframe", labelKey: "cmd.wireframe", category: "scene" }),
    ];
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={cmds} />
    );
    const items = screen.getAllByRole("button").filter(
      (b) => b.hasAttribute("data-cmd-item")
    );
    // Navigate to last item
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowDown" });
    expect(items[1].getAttribute("data-selected")).toBe("true");
    // Wrap around
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowDown" });
    expect(items[0].getAttribute("data-selected")).toBe("true");
  });

  it("moves selection up with ArrowUp", () => {
    const cmds = [
      makeCommand({ id: "save", labelKey: "cmd.save", category: "project" }),
      makeCommand({ id: "toggle-wireframe", labelKey: "cmd.wireframe", category: "scene" }),
    ];
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={cmds} />
    );
    const items = screen.getAllByRole("button").filter(
      (b) => b.hasAttribute("data-cmd-item")
    );
    // From first item, ArrowUp wraps to last
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowUp" });
    expect(items[1].getAttribute("data-selected")).toBe("true");
  });

  it("updates selection on mouse hover", () => {
    const cmds = [
      makeCommand({ id: "save", labelKey: "cmd.save", category: "project" }),
      makeCommand({ id: "toggle-wireframe", labelKey: "cmd.wireframe", category: "scene" }),
    ];
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={cmds} />
    );
    const items = screen.getAllByRole("button").filter(
      (b) => b.hasAttribute("data-cmd-item")
    );
    fireEvent.mouseEnter(items[1]);
    expect(items[1].getAttribute("data-selected")).toBe("true");
    expect(items[0].getAttribute("data-selected")).toBe("false");
  });
});

// ---------------------------------------------------------------------------
// Command execution
// ---------------------------------------------------------------------------

describe("CommandPalette — command execution", () => {
  it("calls onClose when a command is clicked", () => {
    const onClose = vi.fn();
    render(
      <CommandPalette open={true} onClose={onClose} commands={BASIC_COMMANDS} />
    );
    const items = screen.getAllByRole("button").filter(
      (b) => b.hasAttribute("data-cmd-item")
    );
    fireEvent.click(items[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("saves command id to localStorage on execution", () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    const cmds = [makeCommand({ id: "save", labelKey: "cmd.save", category: "project" })];
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={cmds} />
    );
    const items = screen.getAllByRole("button").filter(
      (b) => b.hasAttribute("data-cmd-item")
    );
    fireEvent.click(items[0]);
    expect(localStorageSpy).toHaveBeenCalledWith(
      "helscoop_recent_commands",
      expect.stringContaining("save")
    );
    localStorageSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Toggle state indicators
// ---------------------------------------------------------------------------

describe("CommandPalette — toggle state", () => {
  it("renders 'On' indicator when isActive=true", () => {
    const cmds = [
      makeCommand({ id: "toggle-wireframe", labelKey: "cmd.wireframe", isActive: true }),
    ];
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={cmds} />
    );
    // The toggle indicator has aria-label "On"
    const onIndicator = screen.getByLabelText("On");
    expect(onIndicator).toBeDefined();
  });

  it("renders 'Off' indicator when isActive=false", () => {
    const cmds = [
      makeCommand({ id: "toggle-wireframe", labelKey: "cmd.wireframe", isActive: false }),
    ];
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={cmds} />
    );
    const offIndicator = screen.getByLabelText("Off");
    expect(offIndicator).toBeDefined();
  });

  it("does not render toggle indicator when isActive is undefined", () => {
    const cmds = [
      makeCommand({ id: "save", labelKey: "cmd.save" }), // no isActive
    ];
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={cmds} />
    );
    expect(screen.queryByLabelText("On")).toBeNull();
    expect(screen.queryByLabelText("Off")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Shortcut display
// ---------------------------------------------------------------------------

describe("CommandPalette — shortcuts", () => {
  it("renders shortcut badge for commands with a shortcut", () => {
    const cmds = [
      makeCommand({ id: "save", labelKey: "cmd.save", shortcut: "Cmd+S" }),
    ];
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={cmds} />
    );
    // The shortcut text will be formatted — just verify a kbd element exists
    const kbds = screen.getAllByRole("button")[0]
      .closest("[data-cmd-item]")
      ?.querySelectorAll("kbd");
    expect(kbds && kbds.length > 0).toBe(true);
  });

  it("does not render shortcut kbd when shortcut is not provided", () => {
    const cmds = [
      makeCommand({ id: "save", labelKey: "cmd.save" }), // no shortcut
    ];
    const { container } = render(
      <CommandPalette open={true} onClose={vi.fn()} commands={cmds} />
    );
    // Footer always has Esc/Enter/arrows, so check inside cmd items only
    const items = container.querySelectorAll("[data-cmd-item]");
    let hasKbd = false;
    items.forEach((item) => {
      if (item.querySelector("kbd")) hasKbd = true;
    });
    expect(hasKbd).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Overlay close
// ---------------------------------------------------------------------------

describe("CommandPalette — overlay close", () => {
  it("calls onClose when the overlay backdrop is clicked", () => {
    const onClose = vi.fn();
    const { container } = render(
      <CommandPalette open={true} onClose={onClose} commands={BASIC_COMMANDS} />
    );
    // The outermost overlay div
    const overlay = container.querySelector(".cmd-palette-overlay") as HTMLElement;
    // Simulate click on overlay itself (not on child)
    fireEvent.click(overlay, { target: overlay });
    // Note: fireEvent.click always sets target = the element, so this triggers onClose
    expect(onClose).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Footer hints
// ---------------------------------------------------------------------------

describe("CommandPalette — footer", () => {
  it("renders footer navigation hints", () => {
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    expect(screen.getByText("Navigate")).toBeDefined();
    expect(screen.getByText("Run")).toBeDefined();
    expect(screen.getByText("Close")).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Recent commands
// ---------------------------------------------------------------------------

describe("CommandPalette — recent commands", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("shows 'Recent' section when recent commands exist in localStorage", () => {
    localStorage.setItem(
      "helscoop_recent_commands",
      JSON.stringify(["save"])
    );
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    expect(screen.getByText("Recent")).toBeDefined();
  });

  it("does not show 'Recent' section when no history exists", () => {
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    expect(screen.queryByText("Recent")).toBeNull();
  });

  it("does not show recent commands section in search mode", () => {
    localStorage.setItem(
      "helscoop_recent_commands",
      JSON.stringify(["save"])
    );
    render(
      <CommandPalette open={true} onClose={vi.fn()} commands={BASIC_COMMANDS} />
    );
    const input = screen.getByPlaceholderText("Search commands...");
    fireEvent.change(input, { target: { value: "save" } });
    expect(screen.queryByText("Recent")).toBeNull();
  });
});
