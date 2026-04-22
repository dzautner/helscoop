import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockGetRyhtiPackage = vi.fn();
const mockUpdateRyhtiMetadata = vi.fn();
const mockSubmitRyhti = vi.fn();
const mockToast = vi.fn();

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

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getRyhtiPackage: (...args: unknown[]) => mockGetRyhtiPackage(...args),
    updateRyhtiMetadata: (...args: unknown[]) => mockUpdateRyhtiMetadata(...args),
    submitRyhti: (...args: unknown[]) => mockSubmitRyhti(...args),
  },
}));

import RyhtiSubmissionPanel from "@/components/RyhtiSubmissionPanel";
import type { RyhtiPackageResponse } from "@/types";

const mockPackage: RyhtiPackageResponse = {
  package: {},
  validation: {
    ready: false,
    generatedAt: "2026-04-22T10:00:00Z",
    mode: "dry_run",
    remoteConfigured: false,
    issues: [
      { level: "error", code: "missing_municipality", field: "municipalityNumber", message: "Municipality number required", action: "Enter municipality number" },
      { level: "warning", code: "no_description", field: "descriptionOfAction", message: "Description recommended", action: "Add description" },
    ],
    summary: { errors: 1, warnings: 1, info: 0 },
  },
  permitMetadata: {},
  latestSubmission: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRyhtiPackage.mockResolvedValue(mockPackage);
});

describe("RyhtiSubmissionPanel", () => {
  it("returns null when no projectId", () => {
    const { container } = render(<RyhtiSubmissionPanel bomCount={5} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders title", async () => {
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.title")).toBeInTheDocument();
    });
  });

  it("renders subtitle", async () => {
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.subtitle")).toBeInTheDocument();
    });
  });

  it("shows blocked badge with issue count", async () => {
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText(/ryhti\.blocked/)).toBeInTheDocument();
    });
  });

  it("shows ready badge when validation passes", async () => {
    mockGetRyhtiPackage.mockResolvedValue({
      ...mockPackage,
      validation: { ...mockPackage.validation, ready: true, issues: [], summary: { errors: 0, warnings: 0, info: 0 } },
    });
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.ready")).toBeInTheDocument();
    });
  });

  it("renders municipality number input", async () => {
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.municipalityNumber")).toBeInTheDocument();
    });
  });

  it("renders property identifier input", async () => {
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.propertyIdentifier")).toBeInTheDocument();
    });
  });

  it("renders building identifier input", async () => {
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.buildingIdentifier")).toBeInTheDocument();
    });
  });

  it("renders description textarea", async () => {
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.description")).toBeInTheDocument();
    });
  });

  it("renders Suomi.fi checkbox", async () => {
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.suomiFiConfirmed")).toBeInTheDocument();
    });
  });

  it("renders validation issues", async () => {
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("Municipality number required")).toBeInTheDocument();
      expect(screen.getByText("Description recommended")).toBeInTheDocument();
    });
  });

  it("renders check and submit buttons", async () => {
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.check")).toBeInTheDocument();
      expect(screen.getByText("ryhti.createPackage")).toBeInTheDocument();
    });
  });

  it("disables submit when not ready", async () => {
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      const btn = screen.getByText("ryhti.createPackage").closest("button")!;
      expect(btn).toBeDisabled();
    });
  });

  it("renders dry run note when not remote configured", async () => {
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.dryRunNote")).toBeInTheDocument();
    });
  });

  it("renders live mode note when remote configured", async () => {
    mockGetRyhtiPackage.mockResolvedValue({
      ...mockPackage,
      validation: { ...mockPackage.validation, remoteConfigured: true },
    });
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.liveMode")).toBeInTheDocument();
    });
  });

  it("shows load failed on API error", async () => {
    mockGetRyhtiPackage.mockRejectedValue(new Error("fail"));
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.loadFailed")).toBeInTheDocument();
    });
  });

  it("renders latest submission status when present", async () => {
    mockGetRyhtiPackage.mockResolvedValue({
      ...mockPackage,
      latestSubmission: {
        id: "s1",
        project_id: "p1",
        mode: "dry_run",
        status: "submitted",
        ryhti_tracking_id: "RTI-123",
        created_at: "2026-04-21T10:00:00Z",
      },
    });
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    await waitFor(() => {
      expect(screen.getByText("ryhti.latestStatus")).toBeInTheDocument();
      expect(screen.getByText("submitted")).toBeInTheDocument();
      expect(screen.getByText(/RTI-123/)).toBeInTheDocument();
    });
  });

  it("saves metadata on check button click", async () => {
    mockUpdateRyhtiMetadata.mockResolvedValue(mockPackage);
    render(<RyhtiSubmissionPanel projectId="p1" bomCount={5} />);
    // Wait for loading to complete (button becomes enabled)
    await waitFor(() => {
      const btn = screen.getByText("ryhti.check").closest("button")!;
      expect(btn).not.toBeDisabled();
    }, { timeout: 5000 });
    const checkBtn = screen.getByText("ryhti.check").closest("button")!;
    fireEvent.click(checkBtn);
    await waitFor(() => {
      expect(mockUpdateRyhtiMetadata).toHaveBeenCalled();
    }, { timeout: 5000 });
  });

  it("renders address from buildingInfo", async () => {
    render(
      <RyhtiSubmissionPanel
        projectId="p1"
        bomCount={5}
        buildingInfo={{ address: "Mannerheimintie 1, Helsinki" } as any}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Mannerheimintie 1, Helsinki")).toBeInTheDocument();
    });
  });
});
