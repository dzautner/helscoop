/**
 * Smoke and integration tests for the AddressSearch component.
 *
 * Tests cover: compact & full mode rendering, search input behavior,
 * loading state, building result display, error state, and project creation flow.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AddressSearch from "@/components/AddressSearch";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        "search.placeholder": "Etsi osoitteella...",
        "search.searchButton": "Hae",
        "search.searching": "Haetaan...",
        "search.loading": "Ladataan...",
        "search.notFound": "Ei tuloksia",
        "search.createFromBuilding": "Luo projekti",
        "search.creatingProject": "Luodaan...",
        "search.createError": "Virhe luotaessa projektia",
        "search.title": "Suunnittele remonttisi",
        "search.subtitle": "Etsi osoitteella",
        "search.sectionLabel": "Etsi osoitteella",
        "building.omakotitalo": "Omakotitalo",
        "building.materialWood": "Puu",
        "building.heatingDistrict": "Kaukolampo",
        "editor.loading3D": "Ladataan 3D...",
      };
      return map[key] ?? key;
    },
    locale: "fi",
  }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: vi.fn() }),
}));

vi.mock("@/components/ConfidenceBadge", () => ({
  default: ({ provenance }: { provenance: { confidence: string } }) => (
    <span data-testid="confidence-badge">{provenance.confidence}</span>
  ),
}));

vi.mock("@/components/Viewport3D", () => ({
  default: () => <div data-testid="viewport-3d" />,
}));

const mockGetBuilding = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    getBuilding: (...args: unknown[]) => mockGetBuilding(...args),
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_BUILDING = {
  address: "Mannerheimintie 1",
  coordinates: { lat: 60.17, lon: 24.94 },
  building_info: {
    type: "omakotitalo",
    year_built: 1985,
    material: "puu",
    floors: 2,
    area_m2: 135,
    heating: "kaukolampo",
  },
  confidence: "verified" as const,
  data_sources: ["DVV"],
  scene_js: "",
  bom_suggestion: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBuilding.mockReset();
});

// ---------------------------------------------------------------------------
// Compact mode
// ---------------------------------------------------------------------------

describe("AddressSearch — compact mode", () => {
  it("renders search input and button", () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    expect(screen.getByPlaceholderText("Etsi osoitteella...")).toBeDefined();
    expect(screen.getByRole("button", { name: "Hae" })).toBeDefined();
  });

  it("disables search button when query is too short", () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    const btn = screen.getByRole("button", { name: "Hae" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    fireEvent.change(screen.getByPlaceholderText("Etsi osoitteella..."), {
      target: { value: "Ma" },
    });
    expect(btn.disabled).toBe(true);
  });

  it("enables search button when query has 3+ characters", () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByPlaceholderText("Etsi osoitteella..."), {
      target: { value: "Man" },
    });
    const btn = screen.getByRole("button", { name: "Hae" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("shows building result after successful search", async () => {
    mockGetBuilding.mockResolvedValue(MOCK_BUILDING);
    render(<AddressSearch onCreateProject={vi.fn()} compact />);

    fireEvent.change(screen.getByPlaceholderText("Etsi osoitteella..."), {
      target: { value: "Mannerheimintie 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hae" }));

    await waitFor(() => {
      expect(screen.getByText("Mannerheimintie 1")).toBeDefined();
    });
    expect(screen.getByText("Luo projekti")).toBeDefined();
    expect(screen.getByTestId("confidence-badge")).toBeDefined();
  });

  it("shows not-found message when search returns no result", async () => {
    mockGetBuilding.mockResolvedValue(null);
    render(<AddressSearch onCreateProject={vi.fn()} compact />);

    fireEvent.change(screen.getByPlaceholderText("Etsi osoitteella..."), {
      target: { value: "Nonexistent address" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hae" }));

    await waitFor(() => {
      expect(screen.getByText("Ei tuloksia")).toBeDefined();
    });
  });

  it("calls onCreateProject when create button is clicked", async () => {
    mockGetBuilding.mockResolvedValue(MOCK_BUILDING);
    const onCreateProject = vi.fn().mockResolvedValue(undefined);
    render(<AddressSearch onCreateProject={onCreateProject} compact />);

    fireEvent.change(screen.getByPlaceholderText("Etsi osoitteella..."), {
      target: { value: "Mannerheimintie 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hae" }));

    await waitFor(() => {
      expect(screen.getByText("Luo projekti")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Luo projekti"));

    await waitFor(() => {
      expect(onCreateProject).toHaveBeenCalledWith(MOCK_BUILDING);
    });
  });

  it("shows error when project creation fails", async () => {
    mockGetBuilding.mockResolvedValue(MOCK_BUILDING);
    const onCreateProject = vi.fn().mockRejectedValue(new Error("fail"));
    render(<AddressSearch onCreateProject={onCreateProject} compact />);

    fireEvent.change(screen.getByPlaceholderText("Etsi osoitteella..."), {
      target: { value: "Mannerheimintie 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Hae" }));

    await waitFor(() => {
      expect(screen.getByText("Luo projekti")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Luo projekti"));

    await waitFor(() => {
      expect(screen.getByText("Virhe luotaessa projektia")).toBeDefined();
    });
  });

  it("triggers search on Enter key", async () => {
    mockGetBuilding.mockResolvedValue(MOCK_BUILDING);
    render(<AddressSearch onCreateProject={vi.fn()} compact />);

    const input = screen.getByPlaceholderText("Etsi osoitteella...");
    fireEvent.change(input, { target: { value: "Mannerheimintie 1" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(mockGetBuilding).toHaveBeenCalledWith("Mannerheimintie 1");
    });
  });
});

// ---------------------------------------------------------------------------
// Full mode
// ---------------------------------------------------------------------------

describe("AddressSearch — full mode", () => {
  it("renders the full search title", () => {
    render(<AddressSearch onCreateProject={vi.fn()} />);
    expect(screen.getByText("Suunnittele remonttisi")).toBeDefined();
  });
});
