import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

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

import ProjectCard from "@/components/ProjectCard";
import { IFC_READINESS_STORAGE_KEY } from "@/lib/ifc-preview";
import type { Project } from "@/types";

const mockProject: Project = {
  id: "p1",
  name: "Sauna Reno",
  description: "Renovating the old sauna",
  estimated_cost: 8500,
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-04-20T14:30:00Z",
  thumbnail_url: null,
  view_count: 42,
};

const mockOnDuplicate = vi.fn();
const mockOnDelete = vi.fn();

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe("ProjectCard", () => {
  it("renders project name as link", () => {
    render(<ProjectCard project={mockProject} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    const link = screen.getByText("Sauna Reno").closest("a");
    expect(link).toHaveAttribute("href", "/project/p1");
  });

  it("renders project description", () => {
    render(<ProjectCard project={mockProject} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    expect(screen.getByText("Renovating the old sauna")).toBeInTheDocument();
  });

  it("renders estimated cost badge", () => {
    render(<ProjectCard project={mockProject} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    expect(screen.getByText(/8500/)).toBeInTheDocument();
  });

  it("renders funding badge for community energy projects", () => {
    const fundedProject: Project = {
      ...mockProject,
      estimated_cost: 60000,
      building_info: { type: "kerrostalo", units: 24 },
      bom: [{ material_id: "solar-panel", material_name: "Solar panel", category_name: "solar", quantity: 80, unit: "pcs" }],
    };
    render(<ProjectCard project={fundedProject} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    expect(screen.getByText(/Funding 45,000/)).toBeInTheDocument();
  });

  it("renders Lupapiste readiness badge after IFC validation has passed", () => {
    localStorage.setItem(IFC_READINESS_STORAGE_KEY, JSON.stringify({
      [mockProject.id]: {
        ready: true,
        schema: "IFC4X3_ADD2",
        checkedAt: "2026-04-23T00:00:00.000Z",
        warningCount: 0,
        blockingIssueCount: 0,
      },
    }));

    render(<ProjectCard project={mockProject} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);

    expect(screen.getByText("Ready for Lupapiste")).toBeInTheDocument();
  });

  it("hides cost badge when estimated_cost is 0", () => {
    const noCost = { ...mockProject, estimated_cost: 0 };
    const { container } = render(<ProjectCard project={noCost} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    expect(container.querySelector(".badge-amber")).not.toBeInTheDocument();
  });

  it("renders view count badge", () => {
    render(<ProjectCard project={mockProject} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    expect(screen.getByText(/project\.viewCount/)).toBeInTheDocument();
  });

  it("hides view count badge when 0", () => {
    const noViews = { ...mockProject, view_count: 0 };
    render(<ProjectCard project={noViews} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    expect(screen.queryByText(/project\.viewCount/)).not.toBeInTheDocument();
  });

  it("shows empty description placeholder", () => {
    const noDesc = { ...mockProject, description: "" };
    render(<ProjectCard project={noDesc} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    expect(screen.getByText("project.emptyDescription")).toBeInTheDocument();
  });

  it("renders date", () => {
    render(<ProjectCard project={mockProject} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    const date = new Date("2026-04-20T14:30:00Z").toLocaleDateString("en-GB");
    expect(screen.getByText(date)).toBeInTheDocument();
  });

  it("calls onDuplicate when copy button clicked", () => {
    render(<ProjectCard project={mockProject} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    fireEvent.click(screen.getByLabelText(/project\.copyAriaLabel/));
    expect(mockOnDuplicate).toHaveBeenCalledWith("p1");
  });

  it("calls onDelete when delete button clicked", () => {
    render(<ProjectCard project={mockProject} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    fireEvent.click(screen.getByLabelText(/project\.deleteAriaLabel/));
    expect(mockOnDelete).toHaveBeenCalledWith("p1");
  });

  it("renders copy and delete buttons", () => {
    render(<ProjectCard project={mockProject} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    expect(screen.getByText("project.copy")).toBeInTheDocument();
    expect(screen.getByText("project.delete")).toBeInTheDocument();
  });

  it("shows placeholder SVG when no thumbnail", () => {
    const { container } = render(<ProjectCard project={mockProject} index={0} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("uses animation delay from index", () => {
    const { container } = render(<ProjectCard project={mockProject} index={3} onDuplicate={mockOnDuplicate} onDelete={mockOnDelete} />);
    const card = container.querySelector(".project-card-grid") as HTMLElement;
    expect(card.style.animationDelay).toBe("0.12s");
  });
});
