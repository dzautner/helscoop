import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import QuantityTakeoffPanel from "@/components/QuantityTakeoffPanel";

const mockAnalyzeQuantityTakeoff = vi.fn();
const mockToast = vi.fn();
const mockTrack = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    analyzeQuantityTakeoff: (...args: unknown[]) => mockAnalyzeQuantityTakeoff(...args),
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
  useTranslation: () => ({ locale: "en" }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mockTrack }),
}));

const response = {
  project_id: "proj-1",
  project_name: "Kitchen",
  analysis_mode: "catalog_heuristic",
  drawings_analyzed: 1,
  source_files: [{ name: "pohja.pdf", mime_type: "application/pdf", size: 1000 }],
  drawing_context: {
    drawing_type: "floor_plan",
    floor_label: "Main floor",
    scale_text: null,
    scale_source: "user_dimensions",
    width_m: 10,
    depth_m: 8,
    floor_area_m2: 80,
    room_count: 4,
    door_count: 5,
    window_count: 6,
  },
  detected_quantities: {
    width_m: 10,
    depth_m: 8,
    floor_area_m2: 80,
    exterior_wall_lm: 36,
    partition_wall_lm: 18,
    exterior_wall_area_m2: 78,
    interior_wall_board_m2: 194,
    ceiling_area_m2: 80,
    wet_room_area_m2: 9,
    door_count: 5,
    window_count: 6,
  },
  rooms: [
    { id: "living", name: "Living", type: "living", x: 1, z: 0, width_m: 4, depth_m: 4, area_m2: 16, confidence: 0.7 },
    { id: "kitchen", name: "Kitchen", type: "kitchen", x: 3, z: 2, width_m: 3, depth_m: 2, area_m2: 6, confidence: 0.7 },
  ],
  estimate: { materials_total: 1200, non_catalog_allowance: 300, low: 1230, mid: 1500, high: 1860 },
  bom_suggestions: [
    {
      material_id: "pine_48x98_c24",
      material_name: "48x98 Runkopuu C24",
      category_name: "Lumber",
      quantity: 120,
      unit: "jm",
      unit_price: 2.6,
      total: 312,
      supplier: "Sarokas",
      link: null,
      confidence: 0.7,
      note: "Stud allowance",
    },
  ],
  assumptions: ["Planning takeoff only"],
  disclaimer: "Planning only",
  credits: { cost: 10, balance: 10 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockAnalyzeQuantityTakeoff.mockResolvedValue(response);
});

describe("QuantityTakeoffPanel", () => {
  it("uploads a drawing, shows detected takeoff, and imports suggestions into BOM", async () => {
    const onImportBom = vi.fn();
    render(
      <QuantityTakeoffPanel
        projectId="proj-1"
        projectName="Kitchen"
        buildingInfo={{ area_m2: 80 }}
        onImportBom={onImportBom}
      />,
    );

    const file = new File(["fake-pdf"], "pohja.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Floor plan drawing file"), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText("Known width (m)"), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByLabelText("Known depth (m)"), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Analyze drawing takeoff" }));

    await waitFor(() => {
      expect(mockAnalyzeQuantityTakeoff).toHaveBeenCalledWith("proj-1", expect.objectContaining({
        building_info: { area_m2: 80 },
        options: expect.objectContaining({ width_m: 10, depth_m: 8 }),
      }));
    });

    expect(await screen.findByText("Planning range")).toBeInTheDocument();
    expect(screen.getByText("Detected takeoff overlay")).toBeInTheDocument();
    expect(screen.getByText("48x98 Runkopuu C24")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add 1 rows to BOM" }));

    expect(onImportBom).toHaveBeenCalledWith([
      expect.objectContaining({
        material_id: "pine_48x98_c24",
        quantity: 120,
        unit: "jm",
      }),
    ], "merge");
    expect(mockToast).toHaveBeenCalledWith("1 takeoff rows added to BOM", "success");
    expect(mockTrack).toHaveBeenCalledWith("quantity_takeoff_imported", expect.objectContaining({
      project_id: "proj-1",
      item_count: 1,
    }));
  });
});
