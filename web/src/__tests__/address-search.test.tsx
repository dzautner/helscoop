import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockGetBuilding = vi.fn();
const mockGenerateBuilding = vi.fn();
const mockTrack = vi.fn();

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
    getBuilding: (...args: unknown[]) => mockGetBuilding(...args),
    generateBuilding: (...args: unknown[]) => mockGenerateBuilding(...args),
  },
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mockTrack }),
}));

vi.mock("@/components/ConfidenceBadge", () => ({
  default: ({ provenance }: { provenance: { confidence: string } }) => (
    <span data-testid="confidence-badge">{provenance.confidence}</span>
  ),
}));

vi.mock("next/dynamic", () => ({
  default: () => () => <div data-testid="viewport3d">3D Viewport</div>,
}));

import AddressSearch from "@/components/AddressSearch";

const mockBuilding = {
  address: "Mannerheimintie 1, Helsinki",
  confidence: "verified",
  data_sources: ["DVV", "MML"],
  data_source_error: null,
  coordinates: { lat: 60.1699, lon: 24.9384 },
  building_info: {
    type: "omakotitalo",
    year_built: 1985,
    area_m2: 120,
    floors: 2,
    material: "puu",
    heating: "kaukolampo",
  },
  scene_js: "box(10,10,5)",
  bom_suggestion: [{ material_id: "m1", quantity: 10, unit: "kpl" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetBuilding.mockResolvedValue(mockBuilding);
  mockGenerateBuilding.mockResolvedValue({
    ...mockBuilding,
    confidence: "manual",
    data_sources: ["User-corrected building details"],
    building_info: { ...mockBuilding.building_info, area_m2: 180 },
    scene_js: "box(12,10,6)",
  });
});

describe("AddressSearch compact mode", () => {
  it("renders search input", () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    expect(screen.getByLabelText("search.placeholder")).toBeInTheDocument();
  });

  it("renders search button", () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    expect(screen.getByLabelText("search.searchButton")).toBeInTheDocument();
  });

  it("disables search button when query is too short", () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    const btn = screen.getByLabelText("search.searchButton");
    expect(btn).toBeDisabled();
  });

  it("enables search button when query has 3+ chars", () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Man" } });
    const btn = screen.getByLabelText("search.searchButton");
    expect(btn).not.toBeDisabled();
  });

  it("shows loading state during search", async () => {
    let resolveSearch: (value: unknown) => void;
    mockGetBuilding.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve; }));
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    expect(screen.getByText("search.searching")).toBeInTheDocument();
    await act(async () => {
      resolveSearch!(mockBuilding);
    });
    await screen.findByText("Mannerheimintie 1, Helsinki");
  });

  it("displays building result after search", async () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByText("Mannerheimintie 1, Helsinki")).toBeInTheDocument();
    });
  });

  it("shows building type badge", async () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByText("building.omakotitalo")).toBeInTheDocument();
    });
  });

  it("shows confidence badge", async () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByTestId("confidence-badge")).toHaveTextContent("verified");
    });
  });

  it("shows year and area", async () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByText(/1985/)).toBeInTheDocument();
      expect(screen.getByText(/120/)).toBeInTheDocument();
    });
  });

  it("shows create project button after search", async () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByText("search.createFromBuilding")).toBeInTheDocument();
    });
  });

  it("calls onCreateProject when create button clicked", async () => {
    const onCreateProject = vi.fn();
    render(<AddressSearch onCreateProject={onCreateProject} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByText("search.createFromBuilding")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("search.createFromBuilding"));
    await waitFor(() => {
      expect(onCreateProject).toHaveBeenCalledWith(mockBuilding);
    });
  });

  it("shows not found message when no result", async () => {
    mockGetBuilding.mockResolvedValue(null);
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "NoResult" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByText("search.notFound")).toBeInTheDocument();
    });
  });

  it("shows error message on API failure", async () => {
    mockGetBuilding.mockRejectedValue(new Error("fail"));
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "ErrorCase" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByText("search.searchError")).toBeInTheDocument();
    });
  });

  it("tracks analytics on successful search", async () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith("address_search", { query_length: 8, had_result: true });
    });
  });

  it("tracks analytics on failed search", async () => {
    mockGetBuilding.mockRejectedValue(new Error("fail"));
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "BadQuery" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(mockTrack).toHaveBeenCalledWith("address_search", { query_length: 8, had_result: false });
    });
  });

  it("searches on Enter key", async () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    const input = screen.getByLabelText("search.placeholder");
    fireEvent.change(input, { target: { value: "Helsinki" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => {
      expect(mockGetBuilding).toHaveBeenCalledWith("Helsinki");
    });
  });

  it("does not search with short query", () => {
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    const input = screen.getByLabelText("search.placeholder");
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockGetBuilding).not.toHaveBeenCalled();
  });

  it("maps template confidence to demo provenance", async () => {
    mockGetBuilding.mockResolvedValue({ ...mockBuilding, confidence: "template" });
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByTestId("confidence-badge")).toHaveTextContent("demo");
    });
  });

  it("maps estimated confidence to estimated provenance", async () => {
    mockGetBuilding.mockResolvedValue({ ...mockBuilding, confidence: "estimated" });
    render(<AddressSearch onCreateProject={vi.fn()} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByTestId("confidence-badge")).toHaveTextContent("estimated");
    });
  });

  it("shows create error on project creation failure", async () => {
    const onCreateProject = vi.fn().mockRejectedValue(new Error("create failed"));
    render(<AddressSearch onCreateProject={onCreateProject} compact />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByText("search.createFromBuilding")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("search.createFromBuilding"));
    await waitFor(() => {
      expect(screen.getByText("search.createError")).toBeInTheDocument();
    });
  });
});

describe("AddressSearch full mode", () => {
  it("renders title and subtitle when no result", () => {
    render(<AddressSearch onCreateProject={vi.fn()} />);
    expect(screen.getByText("search.title")).toBeInTheDocument();
    expect(screen.getByText("search.subtitle")).toBeInTheDocument();
  });

  it("renders search input", () => {
    render(<AddressSearch onCreateProject={vi.fn()} />);
    expect(screen.getByLabelText("search.placeholder")).toBeInTheDocument();
  });

  it("hides title after search result", async () => {
    render(<AddressSearch onCreateProject={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.queryByText("search.title")).not.toBeInTheDocument();
    });
  });

  it("shows building info grid after search", async () => {
    render(<AddressSearch onCreateProject={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByText("search.yearBuilt")).toBeInTheDocument();
      expect(screen.getByText("search.type")).toBeInTheDocument();
      expect(screen.getByText("search.area")).toBeInTheDocument();
      expect(screen.getByText("search.floors")).toBeInTheDocument();
      expect(screen.getByText("search.material")).toBeInTheDocument();
      expect(screen.getByText("search.heating")).toBeInTheDocument();
      expect(screen.getByText("search.roofType")).toBeInTheDocument();
      expect(screen.getByText("search.bomRows")).toBeInTheDocument();
    });
  });

  it("allows estimated building details to be corrected", async () => {
    mockGetBuilding.mockResolvedValue({ ...mockBuilding, confidence: "estimated" });
    render(<AddressSearch onCreateProject={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));

    await waitFor(() => {
      expect(screen.getByText("search.editHint")).toBeInTheDocument();
    });

    fireEvent.blur(screen.getByLabelText("search.area"), { target: { value: "180" } });

    await waitFor(() => {
      expect(mockGenerateBuilding).toHaveBeenCalledWith(expect.objectContaining({
        address: mockBuilding.address,
        coordinates: mockBuilding.coordinates,
        building_info: expect.objectContaining({ area_m2: 180 }),
      }));
    });
    await waitFor(() => {
      expect(screen.getByTestId("confidence-badge")).toHaveTextContent("manual");
    });
  });

  it("shows data sources section", async () => {
    render(<AddressSearch onCreateProject={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByLabelText("search.dataSources")).toBeInTheDocument();
    });
  });

  it("expands data sources on click", async () => {
    render(<AddressSearch onCreateProject={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByLabelText("search.dataSources")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText("search.dataSources"));
    expect(screen.getByText("DVV")).toBeInTheDocument();
    expect(screen.getByText("MML")).toBeInTheDocument();
  });

  it("shows coordinates", async () => {
    render(<AddressSearch onCreateProject={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("search.placeholder"), { target: { value: "Helsinki" } });
    fireEvent.click(screen.getByLabelText("search.searchButton"));
    await waitFor(() => {
      expect(screen.getByText(/60\.1699/)).toBeInTheDocument();
      expect(screen.getByText(/24\.9384/)).toBeInTheDocument();
    });
  });
});
