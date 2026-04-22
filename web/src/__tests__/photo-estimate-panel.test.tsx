import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PhotoEstimatePanel from "@/components/PhotoEstimatePanel";

const mockEstimatePhotoRenovation = vi.fn();
const mockToast = vi.fn();
const mockTrack = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    estimatePhotoRenovation: (...args: unknown[]) => mockEstimatePhotoRenovation(...args),
  },
  ApiError: class ApiError extends Error {
    status: number;
    statusText: string;

    constructor(message: string, status: number, statusText = "") {
      super(message);
      this.status = status;
      this.statusText = statusText;
    }
  },
}));

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    t: (key: string, vars?: Record<string, unknown>) => vars ? `${key}:${JSON.stringify(vars)}` : key,
  }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mockTrack }),
}));

const response = {
  project_id: "proj-1",
  project_name: "Sauna",
  analysis_mode: "catalog_heuristic",
  photos_analyzed: 1,
  building_context: { area_m2: 120, year_built: 1980, floors: 2, heating: "oil", roof_type: "gable" },
  estimate: { low: 1000, mid: 1500, high: 2100 },
  scopes: [
    {
      scope: "roof",
      confidence: 0.78,
      rationale: "Matched photo",
      quantity: 80,
      unit: "m2",
      low_cost: 1000,
      mid_cost: 1500,
      high_cost: 2100,
      non_catalog_cost: 900,
      bom_suggestions: [
        {
          material_id: "galvanized_roofing",
          material_name: "Peltikatto Sinkitty",
          category_name: "Roofing",
          quantity: 80,
          unit: "sqm",
          unit_price: 8.5,
          total: 680,
          supplier: "K-Rauta",
          link: "https://example.com",
          confidence: 0.78,
          note: "Roof covering estimate",
        },
      ],
    },
  ],
  subsidy_flags: [{ id: "fossil_heating_replacement", label: "Grant", reason: "Oil heating" }],
  disclaimer: "Planning only",
  credits: { cost: 5, balance: 15 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEstimatePhotoRenovation.mockResolvedValue(response);
});

describe("PhotoEstimatePanel", () => {
  it("uploads photos, shows estimate, and imports suggestions into BOM", async () => {
    const onImportBom = vi.fn();
    render(
      <PhotoEstimatePanel
        projectId="proj-1"
        projectName="Sauna"
        buildingInfo={{ area_m2: 120, heating: "oil" }}
        onImportBom={onImportBom}
      />,
    );

    const file = new File(["fake-image"], "roof.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("photoEstimate.fileInput"), {
      target: { files: [file] },
    });

    fireEvent.click(screen.getByText("photoEstimate.analyze"));

    await waitFor(() => {
      expect(mockEstimatePhotoRenovation).toHaveBeenCalledWith("proj-1", expect.objectContaining({
        building_info: { area_m2: 120, heating: "oil" },
      }));
    });
    expect(await screen.findByText("photoEstimate.rangeLabel")).toBeInTheDocument();
    expect(screen.getByText("photoEstimate.scope.roof")).toBeInTheDocument();
    expect(screen.getByText("Peltikatto Sinkitty · 80 sqm")).toBeInTheDocument();

    fireEvent.click(screen.getByText('photoEstimate.addToBom:{"count":1}'));

    expect(onImportBom).toHaveBeenCalledWith([
      expect.objectContaining({
        material_id: "galvanized_roofing",
        quantity: 80,
        unit: "sqm",
      }),
    ], "merge");
    expect(mockToast).toHaveBeenCalledWith('photoEstimate.imported:{"count":1}', "success");
  });
});
