import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";
import CommandPalette, { type Command } from "@/components/CommandPalette";
import ConfirmDialog from "@/components/ConfirmDialog";
import SaveStatusIndicator from "@/components/SaveStatusIndicator";
import { ToastContainer } from "@/components/Toast";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        "commandPalette.title": "Command Palette",
        "commandPalette.placeholder": "Search commands",
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
        "cmd.save": "Save",
        "cmd.saveEn": "Save project",
        "cmd.wireframe": "Toggle wireframe",
        "cmd.wireframeEn": "Toggle wireframe",
        "dialog.confirm": "Confirm",
        "dialog.cancel": "Cancel",
        "editor.save": "Save",
        "saveStatus.error": "Save failed",
        "saveStatus.saving": "Saving",
        "saveStatus.unsaved": "Unsaved changes",
        "saveStatus.saved": "Saved",
        "toast.dismiss": "Dismiss",
        "toast.overflowMore": `+${params?.count ?? "?"} more`,
      };
      return map[key] ?? key;
    },
  }),
}));

Element.prototype.scrollIntoView = vi.fn();

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function expectNoAxeViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      // These tests render isolated components, not full app pages with landmarks.
      region: { enabled: false },
      // axe-core's contrast rule depends on canvas APIs that jsdom does not implement.
      "color-contrast": { enabled: false },
    },
  });

  expect(
    results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      targets: violation.nodes.map((node) => node.target.join(" ")),
    })),
  ).toEqual([]);
}

function makeCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: "save",
    labelKey: "cmd.save",
    labelSecondaryKey: "cmd.saveEn",
    action: vi.fn(),
    category: "project",
    ...overrides,
  };
}

describe("axe-core accessibility smoke tests", () => {
  it("keeps the command palette free of automated axe violations", async () => {
    const { container } = render(
      <CommandPalette
        open
        onClose={vi.fn()}
        commands={[
          makeCommand(),
          makeCommand({
            id: "wireframe",
            labelKey: "cmd.wireframe",
            labelSecondaryKey: "cmd.wireframeEn",
            category: "scene",
            isActive: true,
          }),
        ]}
      />,
    );

    await expectNoAxeViolations(container);
  });

  it("keeps the confirmation dialog free of automated axe violations", async () => {
    const { container } = render(
      <ConfirmDialog
        open
        title="Delete project"
        message="This cannot be undone."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        variant="danger"
      />,
    );

    await expectNoAxeViolations(container);
  });

  it("keeps live status widgets free of automated axe violations", async () => {
    const { container } = render(
      <>
        <SaveStatusIndicator status="saved" lastSaved="09:00" />
        <ToastContainer
          toasts={[]}
          onDismiss={vi.fn()}
        />
      </>,
    );

    await expectNoAxeViolations(container);
  });
});
