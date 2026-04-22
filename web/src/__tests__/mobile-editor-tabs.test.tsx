import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import MobileEditorTabs from "@/components/MobileEditorTabs";
import type { MobileEditorTab } from "@/components/MobileEditorTabs";

const tabs: MobileEditorTab<"code" | "preview" | "bom">[] = [
  { id: "code", label: "Code" },
  { id: "preview", label: "Preview" },
  { id: "bom", label: "BOM", badge: 5 },
];

describe("MobileEditorTabs", () => {
  it("renders all tabs", () => {
    render(<MobileEditorTabs active="code" tabs={tabs} onChange={vi.fn()} ariaLabel="Editor tabs" />);
    expect(screen.getByText("Code")).toBeInTheDocument();
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByText("BOM")).toBeInTheDocument();
  });

  it("has tablist role", () => {
    render(<MobileEditorTabs active="code" tabs={tabs} onChange={vi.fn()} ariaLabel="Editor tabs" />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("has aria-label", () => {
    render(<MobileEditorTabs active="code" tabs={tabs} onChange={vi.fn()} ariaLabel="Editor tabs" />);
    expect(screen.getByRole("tablist")).toHaveAttribute("aria-label", "Editor tabs");
  });

  it("renders tab buttons with tab role", () => {
    render(<MobileEditorTabs active="code" tabs={tabs} onChange={vi.fn()} ariaLabel="Editor tabs" />);
    const tabElements = screen.getAllByRole("tab");
    expect(tabElements).toHaveLength(3);
  });

  it("marks active tab with aria-selected", () => {
    render(<MobileEditorTabs active="preview" tabs={tabs} onChange={vi.fn()} ariaLabel="Editor tabs" />);
    const tabElements = screen.getAllByRole("tab");
    expect(tabElements[1]).toHaveAttribute("aria-selected", "true");
    expect(tabElements[0]).toHaveAttribute("aria-selected", "false");
  });

  it("calls onChange with tab id on click", () => {
    const onChange = vi.fn();
    render(<MobileEditorTabs active="code" tabs={tabs} onChange={onChange} ariaLabel="Editor tabs" />);
    fireEvent.click(screen.getByText("Preview"));
    expect(onChange).toHaveBeenCalledWith("preview");
  });

  it("renders badge when present", () => {
    render(<MobileEditorTabs active="code" tabs={tabs} onChange={vi.fn()} ariaLabel="Editor tabs" />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("hides badge when value is 0", () => {
    const tabsWithZero: MobileEditorTab<"a">[] = [{ id: "a", label: "Tab", badge: 0 }];
    render(<MobileEditorTabs active="a" tabs={tabsWithZero} onChange={vi.fn()} ariaLabel="Test" />);
    const badges = screen.queryAllByText("0");
    expect(badges).toHaveLength(0);
  });

  it("shows badge when value is string", () => {
    const tabsWithStr: MobileEditorTab<"a">[] = [{ id: "a", label: "Tab", badge: "new" }];
    render(<MobileEditorTabs active="a" tabs={tabsWithStr} onChange={vi.fn()} ariaLabel="Test" />);
    expect(screen.getByText("new")).toBeInTheDocument();
  });

  it("sets data-active attribute on active tab", () => {
    const { container } = render(<MobileEditorTabs active="bom" tabs={tabs} onChange={vi.fn()} ariaLabel="Editor tabs" />);
    const activeTabs = container.querySelectorAll('[data-active="true"]');
    expect(activeTabs).toHaveLength(1);
  });
});
