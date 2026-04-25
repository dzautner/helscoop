/**
 * Smoke and integration tests for the WasteEstimatePanel component.
 *
 * Tests cover: rendering, loading state, error state, empty state,
 * waste category display, asbestos warning, sorting guide, and recycling rate badge.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import WasteEstimatePanel from "@/components/WasteEstimatePanel";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        "waste.title": "Jatearvio",
        "waste.subtitle": "Arvio purkujatteesta",
        "waste.estimateLoading": "Ladataan jatearviota...",
        "waste.estimateFailed": "Jatearvion lataus epaonnistui",
        "waste.noWasteDesc": "Lisaa materiaaleja nahdaksesi jatearvio",
        "waste.totalWeight": "Kokonaispaino",
        "waste.totalVolume": "Kokonaistilavuus",
        "waste.totalDisposalCost": "Hallinointikustannus",
        "waste.containerRecommendation": "Lavat",
        "waste.categories": "Jateluokat",
        "waste.sortingGuide": "Lajitteluopas",
        "waste.puujate": "Puujate",
        "waste.metallijate": "Metallijate",
        "waste.recyclable": "Kierratettava",
        "waste.notRecyclable": "Ei kierratettava",
      };
      if (key === "waste.recyclingRate" && params) {
        return `Kierratysaste: ${params.pct}%`;
      }
      if (key === "waste.asbestosWarning" && params) {
        return `Asbestivaroitus: rakennus vuodelta ${params.year}`;
      }
      return map[key] ?? key;
    },
    locale: "fi",
  }),
}));

const mockGetWasteEstimate = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    getWasteEstimate: (...args: unknown[]) => mockGetWasteEstimate(...args),
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_ESTIMATE = {
  totalWeightKg: 1200,
  totalVolumeM3: 4.5,
  totalDisposalCost: 350,
  containerRecommendation: { count: 2, size: "5m\u00b3" },
  categories: [
    { type: "puujate", weightKg: 800, volumeM3: 3.0, recyclable: true },
    { type: "metallijate", weightKg: 200, volumeM3: 0.5, recyclable: true },
  ],
  sortingGuide: [
    {
      wasteType: "puujate",
      sortingInstruction_fi: "Lajittele puhdas puu erikseen",
      sortingInstruction_en: "Sort clean wood separately",
      acceptedAt: "Sortti-asema",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWasteEstimate.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WasteEstimatePanel", () => {
  it("renders title and subtitle", () => {
    render(<WasteEstimatePanel projectId="p1" bomCount={0} />);
    expect(screen.getByText("Jatearvio")).toBeDefined();
    expect(screen.getByText("Arvio purkujatteesta")).toBeDefined();
  });

  it("shows no-waste message when bomCount is 0", () => {
    render(<WasteEstimatePanel projectId="p1" bomCount={0} />);
    expect(screen.getByText("Lisaa materiaaleja nahdaksesi jatearvio")).toBeDefined();
  });

  it("shows no-waste message when projectId is missing", () => {
    render(<WasteEstimatePanel bomCount={5} />);
    expect(screen.getByText("Lisaa materiaaleja nahdaksesi jatearvio")).toBeDefined();
  });

  it("shows loading state when fetching", () => {
    mockGetWasteEstimate.mockReturnValue(new Promise(() => {})); // never resolves
    render(<WasteEstimatePanel projectId="p1" bomCount={5} />);
    expect(screen.getByText("Ladataan jatearviota...")).toBeDefined();
  });

  it("shows error state when API fails", async () => {
    mockGetWasteEstimate.mockRejectedValue(new Error("fail"));
    render(<WasteEstimatePanel projectId="p1" bomCount={5} />);

    await waitFor(() => {
      expect(screen.getByText("Jatearvion lataus epaonnistui")).toBeDefined();
    });
  });

  it("renders waste categories after successful fetch", async () => {
    mockGetWasteEstimate.mockResolvedValue(MOCK_ESTIMATE);
    render(<WasteEstimatePanel projectId="p1" bomCount={5} />);

    await waitFor(() => {
      expect(screen.getByText("Kokonaispaino")).toBeDefined();
    });

    expect(screen.getByText("Kokonaistilavuus")).toBeDefined();
    expect(screen.getByText("Hallinointikustannus")).toBeDefined();
    expect(screen.getByText("Lavat")).toBeDefined();
    expect(screen.getByText("Jateluokat")).toBeDefined();
  });

  it("renders recycling rate badge", async () => {
    mockGetWasteEstimate.mockResolvedValue(MOCK_ESTIMATE);
    render(<WasteEstimatePanel projectId="p1" bomCount={5} />);

    await waitFor(() => {
      // (800+200)/1200 = 83%
      expect(screen.getByText("Kierratysaste: 83%")).toBeDefined();
    });
  });

  it("renders sorting guide entries", async () => {
    mockGetWasteEstimate.mockResolvedValue(MOCK_ESTIMATE);
    render(<WasteEstimatePanel projectId="p1" bomCount={5} />);

    await waitFor(() => {
      expect(screen.getByText("Lajitteluopas")).toBeDefined();
    });
    expect(screen.getByText("Lajittele puhdas puu erikseen")).toBeDefined();
    expect(screen.getByText("Sortti-asema")).toBeDefined();
  });

  it("shows asbestos warning for pre-1994 buildings", async () => {
    mockGetWasteEstimate.mockResolvedValue(MOCK_ESTIMATE);
    render(
      <WasteEstimatePanel
        projectId="p1"
        bomCount={5}
        buildingInfo={{ year_built: 1970 }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Asbestivaroitus: rakennus vuodelta 1970")).toBeDefined();
    });
  });

  it("does not show asbestos warning for post-1994 buildings", async () => {
    mockGetWasteEstimate.mockResolvedValue(MOCK_ESTIMATE);
    render(
      <WasteEstimatePanel
        projectId="p1"
        bomCount={5}
        buildingInfo={{ year_built: 2005 }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Jateluokat")).toBeDefined();
    });
    expect(screen.queryByText(/Asbestivaroitus/)).toBeNull();
  });
});
