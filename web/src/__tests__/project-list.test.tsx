import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Project, Template } from "@/types";

const mockGetProjects = vi.fn();
const mockGetTemplates = vi.fn();
const mockCreateProject = vi.fn();
const mockDeleteProject = vi.fn();
const mockDuplicateProject = vi.fn();
const mockGetTrashProjects = vi.fn();
const mockAggregateBOM = vi.fn();
const mockTrack = vi.fn();
const mockToast = vi.fn();
const mockPush = vi.fn();

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

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mockTrack }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getProjects: (...args: unknown[]) => mockGetProjects(...args),
    getTemplates: (...args: unknown[]) => mockGetTemplates(...args),
    createProject: (...args: unknown[]) => mockCreateProject(...args),
    deleteProject: (...args: unknown[]) => mockDeleteProject(...args),
    duplicateProject: (...args: unknown[]) => mockDuplicateProject(...args),
    getTrashProjects: (...args: unknown[]) => mockGetTrashProjects(...args),
    aggregateBOM: (...args: unknown[]) => mockAggregateBOM(...args),
    saveBOM: vi.fn().mockResolvedValue(undefined),
    restoreProject: vi.fn().mockResolvedValue(undefined),
    permanentDeleteProject: vi.fn().mockResolvedValue(undefined),
  },
  setToken: vi.fn(),
}));

vi.mock("@/components/Skeleton", () => ({
  SkeletonProjectCard: ({ delay }: { delay: number }) => <div data-testid="skeleton-card" data-delay={delay} />,
  SkeletonBlock: () => <div data-testid="skeleton-block" />,
}));

vi.mock("@/components/ProjectCard", () => ({
  default: ({
    project,
    onDuplicate,
    onDelete,
    selectable,
    selected,
    onSelectChange,
  }: {
    project: Project;
    index: number;
    onDuplicate: (id: string) => void;
    onDelete: (id: string) => void;
    selectable?: boolean;
    selected?: boolean;
    onSelectChange?: (checked: boolean) => void;
  }) => (
    <div data-testid={`project-card-${project.id}`}>
      <span>{project.name}</span>
      {selectable && (
        <input
          type="checkbox"
          checked={Boolean(selected)}
          aria-label={`bomAggregate.selectProject:${JSON.stringify({ name: project.name })}`}
          onChange={(event) => onSelectChange?.(event.currentTarget.checked)}
        />
      )}
      <button onClick={() => onDuplicate(project.id)}>Duplicate</button>
      <button onClick={() => onDelete(project.id)}>Delete</button>
    </div>
  ),
}));

vi.mock("@/components/TemplateGrid", () => ({
  default: ({ templates, onCreateFromTemplate }: { templates: Template[]; loading: boolean; creating: boolean; onCreateFromTemplate: (t: Template) => void }) => (
    <div data-testid="template-grid">
      {templates.map((t) => (
        <button key={t.id} onClick={() => onCreateFromTemplate(t)}>{t.name}</button>
      ))}
    </div>
  ),
}));

vi.mock("@/components/AddressSearch", () => ({
  default: () => <div data-testid="address-search" />,
}));

vi.mock("@/components/ConfirmDialog", () => ({
  default: ({ open, onConfirm, onCancel, title }: { open: boolean; onConfirm: () => void; onCancel: () => void; title: string; message: string; confirmText: string; cancelText: string; variant: string }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("@/components/CreditBalancePill", () => ({
  default: () => <div data-testid="credit-pill" />,
}));

vi.mock("@/components/LanguageSwitcher", () => ({
  LanguageSwitcher: () => <div data-testid="lang-switcher" />,
}));

vi.mock("@/components/ThemeToggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

import ProjectList from "@/components/ProjectList";

const mockProjects: Project[] = [
  {
    id: "p1",
    name: "Sauna Reno",
    description: "Renovating sauna",
    estimated_cost: 8500,
    created_at: "2026-01-15T10:00:00Z",
    updated_at: "2026-04-20T14:30:00Z",
    thumbnail_url: null,
    view_count: 5,
  },
  {
    id: "p2",
    name: "Kitchen Update",
    description: "New cabinets",
    estimated_cost: 12000,
    created_at: "2026-02-01T10:00:00Z",
    updated_at: "2026-04-19T10:00:00Z",
    thumbnail_url: null,
    view_count: 3,
  },
];

const mockTemplatesData: Template[] = [
  {
    id: "t1",
    name: "Basic Room",
    description: "A simple room",
    icon: "🏠",
    scene_js: "box(4,2.8,0.15);",
    estimated_cost: 500,
    bom: [],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProjects.mockResolvedValue(mockProjects);
  mockGetTemplates.mockResolvedValue(mockTemplatesData);
  mockAggregateBOM.mockResolvedValue({
    project_ids: ["p1", "p2"],
    project_count: 2,
    item_count: 1,
    total_cost: 302.5,
    bulk_opportunity_count: 1,
    projects: [
      { id: "p1", name: "Sauna Reno", estimated_cost: 100, bom_rows: 1, area_m2: 10, cost_per_m2: 10 },
      { id: "p2", name: "Kitchen Update", estimated_cost: 200, bom_rows: 1, area_m2: 20, cost_per_m2: 10 },
    ],
    items: [
      {
        material_id: "pine_48x148_c24",
        material_name: "Pine 48x148 C24",
        category_name: "Lumber",
        unit: "jm",
        quantity: 110,
        unit_price: 2.5,
        supplier_name: "K-Rauta",
        total: 302.5,
        source_project_count: 2,
        bulk_discount: {
          eligible: true,
          threshold: 100,
          estimated_savings_pct: 5,
          estimated_savings_eur: 15.13,
          note: "Estimated",
        },
        project_breakdown: [
          { project_id: "p1", project_name: "Sauna Reno", quantity: 40, total: 110 },
          { project_id: "p2", project_name: "Kitchen Update", quantity: 70, total: 192.5 },
        ],
      },
    ],
  });
});

describe("ProjectList", () => {
  it("shows skeleton cards while loading", () => {
    mockGetProjects.mockReturnValue(new Promise(() => {}));
    mockGetTemplates.mockReturnValue(new Promise(() => {}));
    render(<ProjectList />);
    expect(screen.getAllByTestId("skeleton-card").length).toBe(3);
  });

  it("renders project cards after loading", async () => {
    render(<ProjectList />);
    await waitFor(() => {
      expect(screen.getByText("Sauna Reno")).toBeInTheDocument();
      expect(screen.getByText("Kitchen Update")).toBeInTheDocument();
    });
  });

  it("renders Helscoop branding", async () => {
    render(<ProjectList />);
    expect(screen.getByText("Hel")).toBeInTheDocument();
    expect(screen.getByText("scoop")).toBeInTheDocument();
  });

  it("renders nav items", async () => {
    render(<ProjectList />);
    expect(screen.getByText("nav.projects")).toBeInTheDocument();
    expect(screen.getAllByText("nav.settings").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("nav.logout").length).toBeGreaterThanOrEqual(1);
  });

  it("renders project count text", async () => {
    render(<ProjectList />);
    await waitFor(() => {
      expect(screen.getByText("2 projects")).toBeInTheDocument();
    });
  });

  it("renders new project input", async () => {
    render(<ProjectList />);
    expect(screen.getByLabelText("project.newProjectPlaceholder")).toBeInTheDocument();
  });

  it("creates project on button click", async () => {
    const newProject = { ...mockProjects[0], id: "p3", name: "New Project" };
    mockCreateProject.mockResolvedValue(newProject);
    render(<ProjectList />);
    await waitFor(() => { expect(screen.getByText("Sauna Reno")).toBeInTheDocument(); });

    const input = screen.getByLabelText("project.newProjectPlaceholder");
    fireEvent.change(input, { target: { value: "New Project" } });
    fireEvent.click(screen.getByText("project.create"));

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledWith({ name: "New Project" });
    });
  });

  it("creates project on Enter key", async () => {
    const newProject = { ...mockProjects[0], id: "p3", name: "Enter Project" };
    mockCreateProject.mockResolvedValue(newProject);
    render(<ProjectList />);
    await waitFor(() => { expect(screen.getByText("Sauna Reno")).toBeInTheDocument(); });

    const input = screen.getByLabelText("project.newProjectPlaceholder");
    fireEvent.change(input, { target: { value: "Enter Project" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockCreateProject).toHaveBeenCalledWith({ name: "Enter Project" });
    });
  });

  it("disables create button when name is empty", async () => {
    render(<ProjectList />);
    await waitFor(() => { expect(screen.getByText("Sauna Reno")).toBeInTheDocument(); });
    expect(screen.getByText("project.create").closest("button")).toBeDisabled();
  });

  it("renders search input after loading", async () => {
    render(<ProjectList />);
    await waitFor(() => {
      expect(screen.getByLabelText("project.searchPlaceholder")).toBeInTheDocument();
    });
  });

  it("filters projects by search query", async () => {
    render(<ProjectList />);
    await waitFor(() => { expect(screen.getByText("Sauna Reno")).toBeInTheDocument(); });

    const search = screen.getByLabelText("project.searchPlaceholder");
    fireEvent.change(search, { target: { value: "Kitchen" } });

    expect(screen.queryByText("Sauna Reno")).not.toBeInTheDocument();
    expect(screen.getByText("Kitchen Update")).toBeInTheDocument();
  });

  it("renders sort dropdown", async () => {
    render(<ProjectList />);
    await waitFor(() => {
      expect(screen.getByLabelText("project.sortBy")).toBeInTheDocument();
    });
  });

  it("renders dashboard stats", async () => {
    render(<ProjectList />);
    await waitFor(() => {
      expect(screen.getByText("dashboard.totalCost")).toBeInTheDocument();
      expect(screen.getByText("dashboard.activeProjects")).toBeInTheDocument();
      expect(screen.getByText("dashboard.lastActivity")).toBeInTheDocument();
    });
  });

  it("aggregates selected project BOMs", async () => {
    render(<ProjectList />);
    await waitFor(() => { expect(screen.getByText("Sauna Reno")).toBeInTheDocument(); });

    fireEvent.click(screen.getByLabelText('bomAggregate.selectProject:{"name":"Sauna Reno"}'));
    fireEvent.click(screen.getByLabelText('bomAggregate.selectProject:{"name":"Kitchen Update"}'));
    fireEvent.click(screen.getByText("bomAggregate.combine"));

    await waitFor(() => {
      expect(mockAggregateBOM).toHaveBeenCalledWith(["p1", "p2"]);
    });
    expect(screen.getByText("Pine 48x148 C24")).toBeInTheDocument();
    expect(screen.getByText("110 jm")).toBeInTheDocument();
    expect(screen.getByText("bomAggregate.compareTitle")).toBeInTheDocument();
    expect(screen.getAllByText((text) => text.includes('bomAggregate.costPerM2:{"cost":"10"}')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('bomAggregate.bulkCandidate:{"threshold":100,"unit":"jm"}')).toBeInTheDocument();
  });

  it("renders active project count in stats", async () => {
    render(<ProjectList />);
    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });

  it("shows empty state when no projects", async () => {
    mockGetProjects.mockResolvedValue([]);
    render(<ProjectList />);
    await waitFor(() => {
      expect(screen.getByText("project.emptyOnboardingHeading")).toBeInTheDocument();
      expect(screen.getByText("project.emptyOnboardingSubtitle")).toBeInTheDocument();
    });
  });

  it("renders template grid", async () => {
    render(<ProjectList />);
    await waitFor(() => {
      expect(screen.getByTestId("template-grid")).toBeInTheDocument();
    });
  });

  it("renders trash toggle button", async () => {
    render(<ProjectList />);
    expect(screen.getByText("project.showTrash")).toBeInTheDocument();
  });

  it("shows confirm dialog when deleting project", async () => {
    render(<ProjectList />);
    await waitFor(() => { expect(screen.getByText("Sauna Reno")).toBeInTheDocument(); });

    const deleteButtons = screen.getAllByText("Delete");
    fireEvent.click(deleteButtons[0]);

    expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    expect(screen.getByText("dialog.deleteProjectTitle")).toBeInTheDocument();
  });

  it("renders import button", async () => {
    render(<ProjectList />);
    const importEls = screen.getAllByLabelText("project.importProject");
    expect(importEls.length).toBeGreaterThanOrEqual(1);
  });

  it("renders mobile menu hamburger", async () => {
    render(<ProjectList />);
    expect(screen.getByLabelText("projectList.menuAriaLabel")).toBeInTheDocument();
  });

  it("renders no search results message", async () => {
    render(<ProjectList />);
    await waitFor(() => { expect(screen.getByText("Sauna Reno")).toBeInTheDocument(); });

    const search = screen.getByLabelText("project.searchPlaceholder");
    fireEvent.change(search, { target: { value: "xyznonexistent" } });

    expect(screen.getByText("project.noSearchResults")).toBeInTheDocument();
  });

  it("shows toast on load failure", async () => {
    mockGetProjects.mockRejectedValue(new Error("Network fail"));
    render(<ProjectList />);
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("Network fail", "error");
    });
  });

  it("tracks project creation", async () => {
    mockCreateProject.mockResolvedValue({ ...mockProjects[0], id: "p3" });
    render(<ProjectList />);
    await waitFor(() => { expect(screen.getByText("Sauna Reno")).toBeInTheDocument(); });

    const input = screen.getByLabelText("project.newProjectPlaceholder");
    fireEvent.change(input, { target: { value: "Tracked" } });
    fireEvent.click(screen.getByText("project.create"));

    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith("project_created", { source: "blank" });
    });
  });
});
