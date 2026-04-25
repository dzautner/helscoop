import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string, vars?: Record<string, unknown>) => {
      if (vars) return `${key}:${JSON.stringify(vars)}`;
      return key;
    },
  }),
}));

import EditorStatusBar from "@/components/EditorStatusBar";

const baseProps = {
  objectCount: 12,
  materialCount: 5,
  scriptByteSize: 2048,
  saveStatus: "saved" as const,
  lastSavedAt: null,
  warningCount: 0,
};

describe("EditorStatusBar", () => {
  it("renders object count", () => {
    render(<EditorStatusBar {...baseProps} />);
    expect(screen.getByText(/editor\.objectCount/)).toBeInTheDocument();
  });

  it("renders material count", () => {
    render(<EditorStatusBar {...baseProps} />);
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/editor\.statusMaterials/)).toBeInTheDocument();
  });

  it("formats bytes as KB", () => {
    render(<EditorStatusBar {...baseProps} scriptByteSize={2048} />);
    expect(screen.getByText("2.0 KB")).toBeInTheDocument();
  });

  it("formats bytes under 1024 as B", () => {
    render(<EditorStatusBar {...baseProps} scriptByteSize={500} />);
    expect(screen.getByText("500 B")).toBeInTheDocument();
  });

  it("shows saved status text", () => {
    render(<EditorStatusBar {...baseProps} saveStatus="saved" />);
    expect(screen.getByText("editor.saved")).toBeInTheDocument();
  });

  it("shows saving status text", () => {
    render(<EditorStatusBar {...baseProps} saveStatus="saving" />);
    expect(screen.getByText("editor.saving")).toBeInTheDocument();
  });

  it("shows error status text", () => {
    render(<EditorStatusBar {...baseProps} saveStatus="error" />);
    expect(screen.getByText("editor.saveFailed")).toBeInTheDocument();
  });

  it("shows unsaved status text", () => {
    render(<EditorStatusBar {...baseProps} saveStatus="unsaved" />);
    expect(screen.getByText("editor.unsaved")).toBeInTheDocument();
  });

  it("hides warnings when count is 0", () => {
    render(<EditorStatusBar {...baseProps} warningCount={0} />);
    expect(screen.queryByText(/editor\.statusWarning/)).not.toBeInTheDocument();
  });

  it("shows singular warning label for 1 warning", () => {
    render(<EditorStatusBar {...baseProps} warningCount={1} />);
    expect(screen.getByText(/1 editor\.statusWarning$/)).toBeInTheDocument();
  });

  it("shows plural warning label for multiple warnings", () => {
    render(<EditorStatusBar {...baseProps} warningCount={3} />);
    expect(screen.getByText(/3 editor\.statusWarnings/)).toBeInTheDocument();
  });

  it("formats lastSavedAt as relative time", () => {
    const thirtySecsAgo = new Date(Date.now() - 30000);
    render(<EditorStatusBar {...baseProps} lastSavedAt={thirtySecsAgo} />);
    expect(screen.getByText("30s ago")).toBeInTheDocument();
  });

  it("shows 'just now' for recent saves", () => {
    const justNow = new Date(Date.now() - 3000);
    render(<EditorStatusBar {...baseProps} lastSavedAt={justNow} />);
    expect(screen.getByText("just now")).toBeInTheDocument();
  });

  it("shows minutes for older saves", () => {
    const twoMinsAgo = new Date(Date.now() - 120000);
    render(<EditorStatusBar {...baseProps} lastSavedAt={twoMinsAgo} />);
    expect(screen.getByText("2m ago")).toBeInTheDocument();
  });

  it("has status pulse class when saving", () => {
    const { container } = render(<EditorStatusBar {...baseProps} saveStatus="saving" />);
    expect(container.querySelector(".status-pulse")).toBeInTheDocument();
  });

  it("has no-print class", () => {
    const { container } = render(<EditorStatusBar {...baseProps} />);
    expect(container.querySelector(".no-print")).toBeInTheDocument();
  });
});
