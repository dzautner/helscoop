import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockGetProjectMaterialTrends = vi.fn();

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
    getProjectMaterialTrends: (...args: unknown[]) => mockGetProjectMaterialTrends(...args),
  },
}));

import MaterialTrendDashboard from "@/components/MaterialTrendDashboard";
import type { ProjectMaterialTrendResponse, MaterialTrendItem } from "@/types";

const mockItem: MaterialTrendItem = {
  materialId: "m1",
  materialName: "Pine Board",
  categoryName: "wood",
  quantity: 20,
  unit: "kpl",
  currentUnitPrice: 4.5,
  currentLineCost: 90,
  average3m: 4.2,
  average12m: 4.0,
  vs3mPct: 7.1,
  vs12mPct: 12.5,
  direction: "rising",
  recommendation: "wait",
  bestBuyMonth: "2026-09",
  estimatedWaitSavingsPct: 8,
  estimatedWaitSavings: 7.2,
  confidence: "medium",
  source: "retailer_history",
  points: [
    { month: "2026-01", unitPrice: 3.8, source: "retailer_history" },
    { month: "2026-02", unitPrice: 4.0, source: "retailer_history" },
    { month: "2026-03", unitPrice: 4.5, source: "retailer_history" },
  ],
};

const mockData: ProjectMaterialTrendResponse = {
  projectId: "p1",
  generatedAt: "2026-04-22T10:00:00Z",
  dataSources: ["retailer_history"],
  totalCurrentCost: 5000,
  weightedVs12mPct: 5.3,
  estimatedWaitSavings: 120,
  bestBuyMonth: "2026-09",
  buyNowCount: 2,
  waitCount: 3,
  watchCount: 1,
  items: [mockItem],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetProjectMaterialTrends.mockResolvedValue(mockData);
});

describe("MaterialTrendDashboard", () => {
  it("returns null when no projectId", () => {
    const { container } = render(
      <MaterialTrendDashboard bomSignature="sig1" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("returns null when no bomSignature", () => {
    const { container } = render(
      <MaterialTrendDashboard projectId="p1" bomSignature="" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders section with aria-label after loading", async () => {
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByLabelText("bomTrends.title")).toBeInTheDocument();
    });
  });

  it("renders eyebrow text", async () => {
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByText("bomTrends.eyebrow")).toBeInTheDocument();
    });
  });

  it("renders title", async () => {
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByText("bomTrends.title")).toBeInTheDocument();
    });
  });

  it("renders data source badge for retailer history", async () => {
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByText("bomTrends.source.retailer_history")).toBeInTheDocument();
    });
  });

  it("renders above average trend text for positive pct", async () => {
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByText(/bomTrends\.aboveAverage/)).toBeInTheDocument();
    });
  });

  it("renders wait savings metric", async () => {
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByText("bomTrends.waitSavings")).toBeInTheDocument();
    });
  });

  it("renders best month metric", async () => {
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByText("bomTrends.bestMonth")).toBeInTheDocument();
    });
  });

  it("renders buy/wait/watch counts", async () => {
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByText(/bomTrends\.buyNowCount/)).toBeInTheDocument();
      expect(screen.getByText(/bomTrends\.waitCount/)).toBeInTheDocument();
      expect(screen.getByText(/bomTrends\.watchCount/)).toBeInTheDocument();
    });
  });

  it("renders material name in top items", async () => {
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByText("Pine Board")).toBeInTheDocument();
    });
  });

  it("renders recommendation for item", async () => {
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByText(/bomTrends\.recommendation\.wait/)).toBeInTheDocument();
    });
  });

  it("renders sparkline SVG", async () => {
    const { container } = render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      const svgs = container.querySelectorAll("svg[aria-hidden='true']");
      expect(svgs.length).toBeGreaterThan(0);
    });
  });

  it("shows loading text initially", () => {
    mockGetProjectMaterialTrends.mockReturnValue(new Promise(() => {}));
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    expect(screen.getByText("bomTrends.loading")).toBeInTheDocument();
  });

  it("returns null on API error with no data", async () => {
    mockGetProjectMaterialTrends.mockRejectedValue(new Error("fail"));
    const { container } = render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(container.querySelector("section")).not.toBeInTheDocument();
    });
  });

  it("shows near average for small pct", async () => {
    mockGetProjectMaterialTrends.mockResolvedValue({ ...mockData, weightedVs12mPct: 0.5 });
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByText("bomTrends.nearAverage")).toBeInTheDocument();
    });
  });

  it("shows below average for negative pct", async () => {
    mockGetProjectMaterialTrends.mockResolvedValue({ ...mockData, weightedVs12mPct: -5 });
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByText(/bomTrends\.belowAverage/)).toBeInTheDocument();
    });
  });

  it("shows model note for seasonal model source", async () => {
    mockGetProjectMaterialTrends.mockResolvedValue({
      ...mockData,
      dataSources: ["seasonal_model"],
    });
    render(<MaterialTrendDashboard projectId="p1" bomSignature="sig1" />);
    await waitFor(() => {
      expect(screen.getByText("bomTrends.modelNote")).toBeInTheDocument();
    });
  });
});
