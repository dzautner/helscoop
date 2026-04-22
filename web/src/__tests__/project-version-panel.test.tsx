import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockGetProjectVersions = vi.fn();
const mockCreateProjectVersion = vi.fn();
const mockCreateProjectBranch = vi.fn();
const mockRestoreProjectVersion = vi.fn();
const mockCompareProjectVersions = vi.fn();

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

vi.mock("@/lib/api", () => ({
  api: {
    getProjectVersions: (...args: unknown[]) => mockGetProjectVersions(...args),
    createProjectVersion: (...args: unknown[]) => mockCreateProjectVersion(...args),
    createProjectBranch: (...args: unknown[]) => mockCreateProjectBranch(...args),
    restoreProjectVersion: (...args: unknown[]) => mockRestoreProjectVersion(...args),
    compareProjectVersions: (...args: unknown[]) => mockCompareProjectVersions(...args),
  },
}));

import ProjectVersionPanel from "@/components/ProjectVersionPanel";
import type { ProjectBranch, ProjectVersion, ProjectVersionSnapshot } from "@/types";

const mockBranch: ProjectBranch = {
  id: "b1",
  project_id: "p1",
  name: "Main",
  forked_from_version_id: null,
  is_default: true,
  created_at: "2026-04-20T10:00:00Z",
};

const mockVersion: ProjectVersion = {
  id: "v1",
  project_id: "p1",
  branch_id: "b1",
  parent_version_id: null,
  restored_from_version_id: null,
  name: "Initial checkpoint",
  description: null,
  event_type: "named",
  delta: { changedFields: ["scene_js"], bom: { added: 2, removed: 0, quantityChanged: 0, unitChanged: 0 } },
  thumbnail_url: null,
  created_at: "2026-04-20T10:00:00Z",
};

const mockSnapshot: ProjectVersionSnapshot = {
  name: "Test Project",
  description: "A test",
  scene_js: "// scene",
  bom: [],
};

const baseProps = {
  projectId: "p1",
  open: true,
  snapshot: mockSnapshot,
  activeBranchId: "b1",
  saveNow: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
  onActiveBranchChange: vi.fn(),
  onRestored: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProjectVersions.mockResolvedValue({
    branches: [mockBranch],
    versions: [mockVersion],
  });
});

describe("ProjectVersionPanel", () => {
  it("returns null when not open", () => {
    const { container } = render(<ProjectVersionPanel {...baseProps} open={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog when open", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  it("has aria-label", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-label", "versions.title");
    });
  });

  it("renders eyebrow text", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("versions.eyebrow")).toBeInTheDocument();
    });
  });

  it("renders title", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("versions.title")).toBeInTheDocument();
    });
  });

  it("renders subtitle", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("versions.subtitle")).toBeInTheDocument();
    });
  });

  it("renders close button", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByLabelText("dialog.close")).toBeInTheDocument();
    });
  });

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    render(<ProjectVersionPanel {...baseProps} onClose={onClose} />);
    await waitFor(() => {
      fireEvent.click(screen.getByLabelText("dialog.close"));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders branch buttons", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("Main")).toBeInTheDocument();
    });
  });

  it("renders branch creation input", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("versions.createBranch")).toBeInTheDocument();
    });
  });

  it("renders checkpoint creation input", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("versions.saveCheckpoint")).toBeInTheDocument();
    });
  });

  it("disables save checkpoint when name is empty", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      const btn = screen.getByText("versions.saveCheckpoint").closest("button")!;
      expect(btn).toBeDisabled();
    });
  });

  it("renders version name", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("Initial checkpoint")).toBeInTheDocument();
    });
  });

  it("renders version event type badge", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("versions.event.named")).toBeInTheDocument();
    });
  });

  it("renders compare and restore buttons for version", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("versions.compare")).toBeInTheDocument();
      expect(screen.getByText("versions.restore")).toBeInTheDocument();
    });
  });

  it("renders delta summary", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText(/versions\.fieldScene/)).toBeInTheDocument();
      expect(screen.getByText(/versions\.bomChanges/)).toBeInTheDocument();
    });
  });

  it("shows empty message when no versions", async () => {
    mockGetProjectVersions.mockResolvedValue({ branches: [mockBranch], versions: [] });
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("versions.empty")).toBeInTheDocument();
    });
  });

  it("fetches versions on mount", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(mockGetProjectVersions).toHaveBeenCalledWith("p1");
    });
  });

  it("renders branches label", async () => {
    render(<ProjectVersionPanel {...baseProps} />);
    await waitFor(() => {
      expect(screen.getByText("versions.branches")).toBeInTheDocument();
    });
  });
});
