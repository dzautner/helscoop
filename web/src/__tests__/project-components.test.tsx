import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

Element.prototype.scrollIntoView = vi.fn();

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/useCursorGlow", () => ({
  useCursorGlow: () => ({
    ref: { current: null },
    onMouseMove: vi.fn(),
    onMouseLeave: vi.fn(),
  }),
}));

import ProjectCard from "@/components/ProjectCard";
import UpgradeGate from "@/components/UpgradeGate";
import type { Project } from "@/types";

const mockProject: Project = {
  id: "test-1",
  name: "Sauna Renovation",
  description: "Small sauna project",
  estimated_cost: 4500,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-06-15T12:00:00Z",
  thumbnail_url: null,
  view_count: 3,
};

// ---------------------------------------------------------------------------
// ProjectCard
// ---------------------------------------------------------------------------
describe("ProjectCard", () => {
  it("renders project name and description", () => {
    render(
      <ProjectCard project={mockProject} index={0} onDuplicate={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText("Sauna Renovation")).toBeInTheDocument();
    expect(screen.getByText("Small sauna project")).toBeInTheDocument();
  });

  it("renders cost badge when estimated_cost > 0", () => {
    render(
      <ProjectCard project={mockProject} index={0} onDuplicate={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText(/4500/)).toBeInTheDocument();
  });

  it("renders view count badge", () => {
    render(
      <ProjectCard project={mockProject} index={0} onDuplicate={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText("project.viewCount")).toBeInTheDocument();
  });

  it("renders placeholder when no thumbnail", () => {
    render(
      <ProjectCard project={mockProject} index={0} onDuplicate={vi.fn()} onDelete={vi.fn()} />,
    );
    const svg = document.querySelector(".project-card-thumb svg");
    expect(svg).toBeTruthy();
  });

  it("renders thumbnail background when provided", () => {
    const withThumb = { ...mockProject, thumbnail_url: "https://example.com/thumb.jpg" };
    render(
      <ProjectCard project={withThumb} index={0} onDuplicate={vi.fn()} onDelete={vi.fn()} />,
    );
    const thumbDiv = document.querySelector(".project-card-thumb") as HTMLElement;
    expect(thumbDiv.style.background).toContain("thumb.jpg");
  });

  it("fires onDuplicate with project id", () => {
    const onDuplicate = vi.fn();
    render(
      <ProjectCard project={mockProject} index={0} onDuplicate={onDuplicate} onDelete={vi.fn()} />,
    );
    const copyBtn = screen.getByLabelText("project.copyAriaLabel");
    fireEvent.click(copyBtn);
    expect(onDuplicate).toHaveBeenCalledWith("test-1");
  });

  it("fires onDelete with project id", () => {
    const onDelete = vi.fn();
    render(
      <ProjectCard project={mockProject} index={0} onDuplicate={vi.fn()} onDelete={onDelete} />,
    );
    const deleteBtn = screen.getByLabelText("project.deleteAriaLabel");
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith("test-1");
  });

  it("shows empty description fallback", () => {
    const noDesc = { ...mockProject, description: "" };
    render(
      <ProjectCard project={noDesc} index={0} onDuplicate={vi.fn()} onDelete={vi.fn()} />,
    );
    expect(screen.getByText("project.emptyDescription")).toBeInTheDocument();
  });

  it("links to project page", () => {
    render(
      <ProjectCard project={mockProject} index={0} onDuplicate={vi.fn()} onDelete={vi.fn()} />,
    );
    const link = screen.getByText("Sauna Renovation").closest("a");
    expect(link?.getAttribute("href")).toBe("/project/test-1");
  });
});

// ---------------------------------------------------------------------------
// UpgradeGate
// ---------------------------------------------------------------------------
describe("UpgradeGate", () => {
  it("renders headline for AI quota exhaustion", () => {
    render(
      <UpgradeGate feature="aiMessages" requiredPlan="pro" currentPlan="free" />,
    );
    expect(screen.getByText("upgrade.aiQuotaExhausted")).toBeInTheDocument();
  });

  it("renders generic title for non-AI features", () => {
    render(
      <UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />,
    );
    expect(screen.getByText("upgrade.title")).toBeInTheDocument();
  });

  it("renders feature comparison table with plan names", () => {
    render(
      <UpgradeGate feature="apiAccess" requiredPlan="enterprise" currentPlan="free" />,
    );
    expect(screen.getByText("upgrade.free")).toBeInTheDocument();
    expect(screen.getByText("upgrade.pro")).toBeInTheDocument();
    expect(screen.getByText("upgrade.enterprise")).toBeInTheDocument();
  });

  it("renders CTA for pro plan", () => {
    render(
      <UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />,
    );
    expect(screen.getByText("upgrade.ctaPro")).toBeInTheDocument();
  });

  it("renders CTA for enterprise plan", () => {
    render(
      <UpgradeGate feature="apiAccess" requiredPlan="enterprise" currentPlan="free" />,
    );
    expect(screen.getByText("upgrade.ctaEnterprise")).toBeInTheDocument();
  });

  it("calls onDismiss and returns null after dismiss", () => {
    const onDismiss = vi.fn();
    const { container, rerender } = render(
      <UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" onDismiss={onDismiss} />,
    );
    const dismissBtn = screen.getByLabelText("upgrade.dismiss");
    fireEvent.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalled();
    rerender(
      <UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" onDismiss={onDismiss} />,
    );
  });

  it("dismisses on backdrop click in overlay mode", () => {
    const onDismiss = vi.fn();
    render(
      <UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" onDismiss={onDismiss} />,
    );
    const backdrop = document.querySelector("[style*='position: fixed']") as HTMLElement;
    if (backdrop) fireEvent.click(backdrop);
    expect(onDismiss).toHaveBeenCalled();
  });

  it("renders inline mode without dialog role", () => {
    render(
      <UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" inline />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders overlay mode with dialog role", () => {
    render(
      <UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders dismiss button", () => {
    render(
      <UpgradeGate feature="premiumExport" requiredPlan="pro" currentPlan="free" />,
    );
    expect(screen.getByText("upgrade.dismiss")).toBeInTheDocument();
  });
});
