import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import SharedProjectContent from "@/app/shared/[token]/SharedProjectContent";
import { ApiError, api } from "@/lib/api";

vi.mock("next/dynamic", () => ({
  default: () => function MockViewport() {
    return <div data-testid="readonly-viewport">Readonly viewport</div>;
  },
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

const mockTrack = vi.fn();
vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mockTrack }),
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

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      getSharedProject: vi.fn(),
      createSharedComment: vi.fn(),
      cloneGalleryProject: vi.fn(),
    },
  };
});

const sharedProject = {
  id: "project-1",
  name: "Sauna contractor pack",
  description: "Read-only quote view",
  scene_js: "scene.add(box(1,1,1));",
  estimated_cost: 1234,
  created_at: "2026-04-20T00:00:00.000Z",
  updated_at: "2026-04-23T00:00:00.000Z",
  share_token_expires_at: "2026-05-23T00:00:00.000Z",
  is_public: true,
  bom: [
    {
      material_id: "tile",
      material_name: "Sauna tile",
      quantity: 12,
      unit: "m2",
      unit_price: 42,
      supplier_name: "K-Rauta",
      total: 504,
    },
  ],
  comments: [
    {
      id: "comment-1",
      commenter_name: "Builder Oy",
      message: "Can quote this for June.",
      created_at: "2026-04-23T00:00:00.000Z",
    },
  ],
};

describe("SharedProjectContent contractor view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getSharedProject).mockResolvedValue(sharedProject);
    vi.mocked(api.createSharedComment).mockResolvedValue({
      id: "comment-2",
      commenter_name: "New Builder",
      message: "Available next month.",
      created_at: "2026-04-24T00:00:00.000Z",
    });
    vi.mocked(api.cloneGalleryProject).mockResolvedValue({
      id: "clone-1",
      name: "Inspired by Sauna contractor pack",
      description: "",
      estimated_cost: 0,
      created_at: "2026-04-24T00:00:00.000Z",
      updated_at: "2026-04-24T00:00:00.000Z",
    });
  });

  it("renders read-only viewport, BOM unit prices, and existing comments", async () => {
    render(<SharedProjectContent token="share-token" />);

    expect(await screen.findByText("Sauna contractor pack")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-viewport")).toBeInTheDocument();
    expect(screen.getByText("Sauna tile")).toBeInTheDocument();
    expect(screen.getByText(/42.00 EUR\/m2/)).toBeInTheDocument();
    expect(screen.getByText("Builder Oy")).toBeInTheDocument();
    expect(screen.getByText("Can quote this for June.")).toBeInTheDocument();
  });

  it("submits contractor comments without requiring auth", async () => {
    render(<SharedProjectContent token="share-token" />);

    await screen.findByText("Sauna contractor pack");
    fireEvent.change(screen.getByLabelText("share.commentName"), { target: { value: "New Builder" } });
    fireEvent.change(screen.getByLabelText("share.commentMessage"), { target: { value: "Available next month." } });
    fireEvent.click(screen.getByRole("button", { name: "share.commentSend" }));

    await waitFor(() => expect(api.createSharedComment).toHaveBeenCalledWith("share-token", {
      name: "New Builder",
      message: "Available next month.",
    }));
    expect(await screen.findByText("Available next month.")).toBeInTheDocument();
    expect(screen.getByText("share.commentSent")).toBeInTheDocument();
  });

  it("shows a friendly expired-link state", async () => {
    vi.mocked(api.getSharedProject).mockRejectedValue(new ApiError("Shared project link has expired", 410, "Gone"));

    render(<SharedProjectContent token="expired-token" />);

    expect(await screen.findByText("share.expired")).toBeInTheDocument();
    expect(screen.getByText("share.expiredDesc")).toBeInTheDocument();
  });

  it("offers cloning for public inspiration projects", async () => {
    render(<SharedProjectContent token="share-token" />);

    await screen.findByText("Sauna contractor pack");
    fireEvent.click(screen.getAllByRole("button", { name: "share.inspireOwn" })[0]);

    await waitFor(() => expect(api.cloneGalleryProject).toHaveBeenCalledWith("project-1"));
    expect(mockTrack).toHaveBeenCalledWith("gallery_project_cloned", {
      project_id: "project-1",
      source: "shared_viewer",
    });
  });
});
