import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockEstimateRoi = vi.fn();

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

vi.mock("@/lib/renovation-roi", () => ({
  estimateRenovationRoi: (...args: unknown[]) => mockEstimateRoi(...args),
  ROI_MARKET_CONFIG_2026: {
    sourceCheckedAt: "2026-04-21",
    euribor12mPercent: 2.685,
  },
}));

import RenovationRoiPanel from "@/components/RenovationRoiPanel";
import type { BomItem, Material } from "@/types";

const mockBom: BomItem[] = [
  { material_id: "m1", quantity: 10, unit: "kpl" },
];

const mockMaterials: Material[] = [
  {
    id: "m1",
    name: "Insulation",
    name_fi: "Eriste",
    name_en: "Insulation",
    category_name: "insulation",
    category_name_fi: "eristys",
    image_url: null,
    pricing: [{ unit_price: 12, unit: "m2", supplier_name: "Stark", is_primary: true }],
  },
];

const mockEstimate = {
  category: "energy" as const,
  materialCost: 3000,
  labourCost: 2000,
  grossCost: 5000,
  bestSubsidy: { type: "household_deduction" as const, amount: 700, warning: "Apply by Dec 2026" },
  netCost: 4300,
  estimatedValueIncrease: 8000,
  valueRetentionRate: 0.6,
  annualEnergySavings: 500,
  paybackYears: 6.2,
  roiPercent: 74,
  timing: {
    status: "act_now" as const,
    headline: "Good time to renovate",
    reasons: ["Low interest rates", "Contractor availability"],
  },
  assumptions: [],
  summary: "Positive ROI expected",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEstimateRoi.mockReturnValue(mockEstimate);
});

describe("RenovationRoiPanel", () => {
  it("returns null when estimate is null", () => {
    mockEstimateRoi.mockReturnValue(null);
    const { container } = render(
      <RenovationRoiPanel bom={mockBom} materials={mockMaterials} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders section with aria-label", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByLabelText("renovationRoi.title")).toBeInTheDocument();
  });

  it("renders eyebrow text", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("renovationRoi.eyebrow")).toBeInTheDocument();
  });

  it("renders title", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("renovationRoi.title")).toBeInTheDocument();
  });

  it("renders category badge", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("renovationRoi.category.energy")).toBeInTheDocument();
  });

  it("renders gross cost metric", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("renovationRoi.grossCost")).toBeInTheDocument();
    expect(screen.getByText(/5,000/)).toBeInTheDocument();
  });

  it("renders net cost metric", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("renovationRoi.netCost")).toBeInTheDocument();
    expect(screen.getByText(/4,300/)).toBeInTheDocument();
  });

  it("renders material cost metric", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("renovationRoi.materialCost")).toBeInTheDocument();
    expect(screen.getByText(/3,000/)).toBeInTheDocument();
  });

  it("renders labour cost metric", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("renovationRoi.labourCost")).toBeInTheDocument();
    expect(screen.getByText(/2,000/)).toBeInTheDocument();
  });

  it("renders subsidy amount", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("renovationRoi.bestSubsidy")).toBeInTheDocument();
    expect(screen.getByText(/-700/)).toBeInTheDocument();
  });

  it("renders value impact", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("renovationRoi.valueImpact")).toBeInTheDocument();
    expect(screen.getByText(/8,000/)).toBeInTheDocument();
  });

  it("renders energy payback years", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("renovationRoi.energyPayback")).toBeInTheDocument();
    expect(screen.getByText(/6.2/)).toBeInTheDocument();
  });

  it("renders no payback text when null", () => {
    mockEstimateRoi.mockReturnValue({ ...mockEstimate, paybackYears: null });
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("No energy payback")).toBeInTheDocument();
  });

  it("renders positive ROI percent", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("renovationRoi.tenYearRoi")).toBeInTheDocument();
    expect(screen.getByText("+74%")).toBeInTheDocument();
  });

  it("renders negative ROI without plus sign", () => {
    mockEstimateRoi.mockReturnValue({ ...mockEstimate, roiPercent: -12 });
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("-12%")).toBeInTheDocument();
  });

  it("renders timing headline", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("Good time to renovate")).toBeInTheDocument();
  });

  it("renders timing reasons", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("Low interest rates")).toBeInTheDocument();
    expect(screen.getByText("Contractor availability")).toBeInTheDocument();
  });

  it("renders subsidy warning", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText("Apply by Dec 2026")).toBeInTheDocument();
  });

  it("renders assumption note with config values", () => {
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    expect(screen.getByText(/renovationRoi\.assumptionNote/)).toBeInTheDocument();
  });

  it("shows 0 for subsidy when amount is 0", () => {
    mockEstimateRoi.mockReturnValue({
      ...mockEstimate,
      bestSubsidy: { type: "none", amount: 0, warning: "" },
    });
    render(<RenovationRoiPanel bom={mockBom} materials={mockMaterials} />);
    const subsidyLabel = screen.getByText("renovationRoi.bestSubsidy");
    const subsidyMetric = subsidyLabel.closest("div")!.parentElement!;
    expect(subsidyMetric.textContent).toContain("0 €");
  });
});
