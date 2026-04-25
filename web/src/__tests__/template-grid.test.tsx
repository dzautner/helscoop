import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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
    category: "sauna",
    icon: "sauna",
    thumbnail_url: "data:image/svg+xml;utf8,<svg />",
    estimated_cost: 8500,
    difficulty: "intermediate",
    area_m2: 12,
    use_count: 4,
    created_at: "2026-04-01T10:00:00Z",
    scene_js: "// sauna",
    bom: [{ material_id: "m1", quantity: 10, unit: "kpl" }],
  },
  {
    id: "t2",
    name: "Garage Build",
    description: "Double garage with storage",
    category: "garage",
    icon: "garage",
    estimated_cost: 15000,
    difficulty: "advanced",
    area_m2: 24,
    use_count: 8,
    created_at: "2026-03-01T10:00:00Z",
    scene_js: "// garage",
    bom: [],
  },
  {
    id: "t3",
    name: "Wood Shed",
    description: "Low-cost firewood storage",
    category: "shed",
    icon: "shed",
    estimated_cost: 900,
    difficulty: "beginner",
    area_m2: 2,
    use_count: 1,
    created_at: "2026-04-15T10:00:00Z",
    scene_js: "// shed",
    bom: [],
  },
];

describe("TemplateGrid", () => {
  it("renders section label, controls, and template names", () => {
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={false} onCreateFromTemplate={vi.fn()} />,
    );

    expect(screen.getByText("project.orStartFromTemplate")).toBeInTheDocument();
    expect(screen.getByText("templates.gallerySubtitle")).toBeInTheDocument();
    expect(screen.getByLabelText("templates.searchLabel")).toBeInTheDocument();
    expect(screen.getByLabelText("templates.sortLabel")).toBeInTheDocument();
    expect(screen.getByText("Sauna Renovation")).toBeInTheDocument();
    expect(screen.getByText("Garage Build")).toBeInTheDocument();
  });

  it("renders template metadata", () => {
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={false} onCreateFromTemplate={vi.fn()} />,
    );

    expect(screen.getByText(/8,500/)).toBeInTheDocument();
    expect(screen.getByText("12 m²")).toBeInTheDocument();
    expect(screen.getByText("templates.difficulty.intermediate")).toBeInTheDocument();
    expect(screen.getByText(/templates\.useCount.*4/)).toBeInTheDocument();
  });

  it("filters templates by category tab", () => {
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={false} onCreateFromTemplate={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "templates.categories.garage" }));

    expect(screen.getByText("Garage Build")).toBeInTheDocument();
    expect(screen.queryByText("Sauna Renovation")).not.toBeInTheDocument();
  });

  it("filters templates by search", () => {
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={false} onCreateFromTemplate={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("templates.searchLabel"), { target: { value: "firewood" } });

    expect(screen.getByText("Wood Shed")).toBeInTheDocument();
    expect(screen.queryByText("Garage Build")).not.toBeInTheDocument();
  });

  it("sorts templates by price", () => {
    const { container } = render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={false} onCreateFromTemplate={vi.fn()} />,
    );

    fireEvent.change(screen.getByLabelText("templates.sortLabel"), { target: { value: "price" } });

    const cards = Array.from(container.querySelectorAll(".template-card-rich"));
    expect(cards).toHaveLength(3);
    expect(within(cards[0] as HTMLElement).getByText("Wood Shed")).toBeInTheDocument();
  });

  it("fires onCreateFromTemplate when clicked", () => {
    const onCreate = vi.fn();
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={false} onCreateFromTemplate={onCreate} />,
    );

    fireEvent.click(screen.getByLabelText(/project\.useTemplate.*Sauna/));

    expect(onCreate).toHaveBeenCalledWith(mockTemplates[0]);
  });

  it("disables template cards when creating", () => {
    render(
      <TemplateGrid templates={mockTemplates} loading={false} creating={true} onCreateFromTemplate={vi.fn()} />,
    );

    expect(screen.getByLabelText(/project\.useTemplate.*Sauna/)).toBeDisabled();
    expect(screen.getByRole("tab", { name: "templates.categories.sauna" })).not.toBeDisabled();
  });

  it("shows skeleton loaders when loading", () => {
    const { container } = render(
      <TemplateGrid templates={[]} loading={true} creating={false} onCreateFromTemplate={vi.fn()} />,
    );

    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("renders only the label for empty templates list", () => {
    const { container } = render(
      <TemplateGrid templates={[]} loading={false} creating={false} onCreateFromTemplate={vi.fn()} />,
    );

    expect(screen.getByText("project.orStartFromTemplate")).toBeInTheDocument();
    expect(container.querySelector(".template-grid")).not.toBeInTheDocument();
  });
});
