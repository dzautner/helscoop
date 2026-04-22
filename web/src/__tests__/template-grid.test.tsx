import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

import TemplateGrid from "@/components/TemplateGrid";
import type { Template } from "@/types";

const mockTemplates: Template[] = [
  {
    id: "t1",
    name: "Sauna Renovation",
    description: "A cozy sauna project",
    icon: "sauna",
    estimated_cost: 8500,
    scene_js: "// sauna",
    bom: [{ material_id: "m1", quantity: 10, unit: "kpl" }],
  },
  {
    id: "t2",
    name: "Garage Build",
    description: "Double garage with storage",
    icon: "garage",
    estimated_cost: 15000,
    scene_js: "// garage",
    bom: [],
  },
];

describe("TemplateGrid", () => {
  it("renders section label", () => {
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={false} onCreateFromTemplate={vi.fn()} />,
    );
    expect(screen.getByText("project.orStartFromTemplate")).toBeInTheDocument();
  });

  it("renders template names", () => {
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={false} onCreateFromTemplate={vi.fn()} />,
    );
    expect(screen.getByText("Sauna Renovation")).toBeInTheDocument();
    expect(screen.getByText("Garage Build")).toBeInTheDocument();
  });

  it("renders template descriptions", () => {
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={false} onCreateFromTemplate={vi.fn()} />,
    );
    expect(screen.getByText("A cozy sauna project")).toBeInTheDocument();
    expect(screen.getByText("Double garage with storage")).toBeInTheDocument();
  });

  it("renders cost badges", () => {
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={false} onCreateFromTemplate={vi.fn()} />,
    );
    expect(screen.getByText(/8,500/)).toBeInTheDocument();
    expect(screen.getByText(/15,000/)).toBeInTheDocument();
  });

  it("fires onCreateFromTemplate when clicked", () => {
    const onCreate = vi.fn();
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={false} onCreateFromTemplate={onCreate} />,
    );
    fireEvent.click(screen.getByText("Sauna Renovation"));
    expect(onCreate).toHaveBeenCalledWith(mockTemplates[0]);
  });

  it("disables buttons when creating", () => {
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={true} onCreateFromTemplate={vi.fn()} />,
    );
    const buttons = screen.getAllByRole("button");
    buttons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("has aria-label with template name", () => {
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={false} onCreateFromTemplate={vi.fn()} />,
    );
    expect(screen.getByLabelText(/project\.useTemplate.*Sauna/)).toBeInTheDocument();
  });

  it("shows skeleton loaders when loading", () => {
    const { container } = render(
      <TemplateGrid templates={[]} loading={true} creating={false} onCreateFromTemplate={vi.fn()} />,
    );
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("renders nothing for empty templates list", () => {
    const { container } = render(
      <TemplateGrid templates={[]} loading={false} creating={false} onCreateFromTemplate={vi.fn()} />,
    );
    expect(screen.getByText("project.orStartFromTemplate")).toBeInTheDocument();
    expect(container.querySelector(".template-grid")).not.toBeInTheDocument();
  });
});
