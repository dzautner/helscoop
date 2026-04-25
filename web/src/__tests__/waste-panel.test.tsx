import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockGetWasteEstimate = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    getWasteEstimate: (...args: unknown[]) => mockGetWasteEstimate(...args),
  },
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

import WasteEstimatePanel from "@/components/WasteEstimatePanel";
import type { WasteEstimateResponse } from "@/types";

const mockEstimate: WasteEstimateResponse = {
  totalWeightKg: 450,
  totalVolumeM3: 3.2,
  totalDisposalCost: 120,
  containerRecommendation: { count: 1, size: "4 m\u00B3", totalCost: 250 },
  categories: [
    { type: "puujate", weightKg: 200, volumeM3: 1.5, recyclable: true, disposalCostEur: 0 },
    { type: "metallijate", weightKg: 100, volumeM3: 0.4, recyclable: true, disposalCostEur: 0 },
    { type: "sekajate", weightKg: 80, volumeM3: 0.8, recyclable: false, disposalCostEur: 80 },
    { type: "vaarallinen_jate", weightKg: 70, volumeM3: 0.5, recyclable: false, disposalCostEur: 40 },
  ],
  sortingGuide: [
    {
      wasteType: "puujate",
      sortingInstruction_fi: "Puhdas puu",
      sortingInstruction_en: "Clean wood",
      acceptedAt: "Sortti-asemat",
    },
    {
      wasteType: "metallijate",
      sortingInstruction_fi: "Puhdas metalli",
      sortingInstruction_en: "Clean metal",
      acceptedAt: "Sortti-asemat",
    },
    {
      wasteType: "sekajate",
      sortingInstruction_fi: "Sekajate",
      sortingInstruction_en: "Mixed waste",
      acceptedAt: "Sortti-asemat",
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetWasteEstimate.mockResolvedValue(mockEstimate);
});

describe("WasteEstimatePanel", () => {
  it("shows title and subtitle", () => {
    render(<WasteEstimatePanel bomCount={0} />);
    expect(screen.getByText("waste.title")).toBeInTheDocument();
    expect(screen.getByText("waste.subtitle")).toBeInTheDocument();
  });

  it("shows empty state when no projectId", () => {
    render(<WasteEstimatePanel bomCount={3} />);
    expect(screen.getByText("waste.noWasteDesc")).toBeInTheDocument();
  });

  it("shows empty state when bomCount is 0", () => {
    render(<WasteEstimatePanel projectId="p1" bomCount={0} />);
    expect(screen.getByText("waste.noWasteDesc")).toBeInTheDocument();
  });

  it("shows loading state", () => {
    mockGetWasteEstimate.mockReturnValue(new Promise(() => {}));
    render(<WasteEstimatePanel projectId="p1" bomCount={3} />);
    expect(screen.getByText("waste.estimateLoading")).toBeInTheDocument();
  });

  it("shows error state on API failure", async () => {
    mockGetWasteEstimate.mockRejectedValue(new Error("fail"));
    render(<WasteEstimatePanel projectId="p1" bomCount={3} />);
    await waitFor(() => {
      expect(screen.getByText("waste.estimateFailed")).toBeInTheDocument();
    });
  });

  it("renders summary boxes after loading", async () => {
    render(<WasteEstimatePanel projectId="p1" bomCount={3} />);
    await waitFor(() => {
      expect(screen.getByText("waste.totalWeight")).toBeInTheDocument();
      expect(screen.getByText("waste.totalVolume")).toBeInTheDocument();
      expect(screen.getByText("waste.totalDisposalCost")).toBeInTheDocument();
      expect(screen.getByText("waste.containerRecommendation")).toBeInTheDocument();
    });
  });

  it("renders weight values", async () => {
    render(<WasteEstimatePanel projectId="p1" bomCount={3} />);
    await waitFor(() => {
      expect(screen.getByText(/450/)).toBeInTheDocument();
    });
  });

  it("renders category breakdown", async () => {
    render(<WasteEstimatePanel projectId="p1" bomCount={3} />);
    await waitFor(() => {
      expect(screen.getByText("waste.categories")).toBeInTheDocument();
      expect(screen.getAllByText("waste.puujate").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("waste.metallijate").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("shows recyclable/not-recyclable labels", async () => {
    render(<WasteEstimatePanel projectId="p1" bomCount={3} />);
    await waitFor(() => {
      const recyclableLabels = screen.getAllByText("waste.recyclable");
      const notRecyclableLabels = screen.getAllByText("waste.notRecyclable");
      expect(recyclableLabels.length).toBe(2);
      expect(notRecyclableLabels.length).toBe(2);
    });
  });

  it("renders sorting guide entries", async () => {
    render(<WasteEstimatePanel projectId="p1" bomCount={3} />);
    await waitFor(() => {
      expect(screen.getByText("waste.sortingGuide")).toBeInTheDocument();
      expect(screen.getByText("Clean wood")).toBeInTheDocument();
      expect(screen.getByText("Clean metal")).toBeInTheDocument();
    });
  });

  it("shows recycling rate badge", async () => {
    render(<WasteEstimatePanel projectId="p1" bomCount={3} />);
    await waitFor(() => {
      expect(screen.getByText(/waste\.recyclingRate/)).toBeInTheDocument();
    });
  });

  it("shows asbestos warning for pre-1994 buildings", async () => {
    render(
      <WasteEstimatePanel
        projectId="p1"
        bomCount={3}
        buildingInfo={{ year_built: 1970 } as any}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/waste\.asbestosWarning/)).toBeInTheDocument();
    });
  });

  it("does not show asbestos warning for post-1994 buildings", async () => {
    render(
      <WasteEstimatePanel
        projectId="p1"
        bomCount={3}
        buildingInfo={{ year_built: 2000 } as any}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("waste.categories")).toBeInTheDocument();
    });
    expect(screen.queryByText(/waste\.asbestosWarning/)).not.toBeInTheDocument();
  });

  it("shows container recommendation", async () => {
    render(<WasteEstimatePanel projectId="p1" bomCount={3} />);
    await waitFor(() => {
      expect(screen.getByText(/1 x 4/)).toBeInTheDocument();
    });
  });
});
