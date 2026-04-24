import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import RoomScanImportPanel from "@/components/RoomScanImportPanel";

const mockImportRoomScan = vi.fn();
const mockToast = vi.fn();
const mockTrack = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    importRoomScan: (...args: unknown[]) => mockImportRoomScan(...args),
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
  project_name: "Scan project",
  analysis_mode: "roomplan_import",
  source_format: "usda",
  source_detail: "Parsed ASCII USD/USDA scan export.",
  source_files: [{ name: "scan.usda", mime_type: "model/vnd.usd", size: 1000 }],
  floor_label: "Ground floor",
  width_m: 8,
  depth_m: 6,
  floor_area_m2: 48,
  rooms: [
    { id: "living", name: "Living", type: "living", x: 0, z: 0, width_m: 4, depth_m: 5, area_m2: 20, confidence: 0.74 },
  ],
  walls: [
    { id: "wall_north", start: [-4, -3], end: [4, -3], length_m: 8, height_m: 2.7, thickness_m: 0.16, confidence: 0.72 },
  ],
  openings: [
    { id: "front_door", type: "door", wall_id: null, x: -2, z: 3, width_m: 0.9, height_m: 2.1, confidence: 0.68 },
  ],
  surfaces: {
    floor_area_m2: 48,
    ceiling_area_m2: 48,
    wall_area_m2: 64,
    wet_room_area_m2: 0,
    opening_count: 1,
  },
  quality: {
    coverage_percent: 86,
    detected_feature_count: 3,
    parser: "roomplan_text",
    warnings: [],
  },
  scene_js: "const room_scan_floor = box(8, 0.08, 6);\nscene.add(room_scan_floor, { material: \"foundation\" });\n",
  estimate: { materials_total: 500, non_catalog_allowance: 100, low: 492, mid: 600, high: 744 },
  bom_suggestions: [
    {
      material_id: "pine_48x98_c24",
      material_name: "48x98 Runkopuu C24",
      category_name: "Lumber",
      quantity: 24,
      unit: "jm",
      unit_price: 2.6,
      total: 62.4,
      supplier: "Sarokas",
      link: null,
      confidence: 0.7,
      note: "Stud allowance",
    },
  ],
  assumptions: ["RoomPlan/LiDAR import is a planning model"],
  disclaimer: "Planning only",
  credits: { cost: 10, balance: 12 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockImportRoomScan.mockResolvedValue(response);
});

describe("RoomScanImportPanel", () => {
  it("imports a RoomPlan scan, appends scene geometry, and imports BOM suggestions", async () => {
    const onApplyScene = vi.fn();
    const onImportBom = vi.fn();
    render(
      <RoomScanImportPanel
        projectId="proj-1"
        projectName="Scan project"
        buildingInfo={{ area_m2: 96, floors: 2 }}
        currentSceneJs="const shell = box(10, 3, 8);"
        onApplyScene={onApplyScene}
        onImportBom={onImportBom}
      />,
    );

    const file = new File(["#usda 1.0"], "scan.usda", { type: "model/vnd.usd" });
    fireEvent.change(screen.getByLabelText("Room scan file"), {
      target: { files: [file] },
    });
    fireEvent.change(screen.getByLabelText("Known width (m)"), {
      target: { value: "8" },
    });
    fireEvent.change(screen.getByLabelText("Known depth (m)"), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import room scan" }));

    await waitFor(() => {
      expect(mockImportRoomScan).toHaveBeenCalledWith("proj-1", expect.objectContaining({
        building_info: { area_m2: 96, floors: 2 },
        options: expect.objectContaining({ width_m: 8, depth_m: 6 }),
      }));
    });

    expect(await screen.findByText("Scan quality")).toBeInTheDocument();
    expect(screen.getByText("Detected scan footprint")).toBeInTheDocument();
    expect(screen.getByText("48x98 Runkopuu C24")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Append scan to 3D scene" }));
    expect(onApplyScene).toHaveBeenCalledWith(expect.stringContaining("Imported LiDAR / RoomPlan scan overlay"));
    expect(onApplyScene).toHaveBeenCalledWith(expect.stringContaining("room_scan_floor"));
    expect(mockTrack).toHaveBeenCalledWith("room_scan_applied", expect.objectContaining({
      project_id: "proj-1",
      merge_mode: "append",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Add 1 rows to BOM" }));
    expect(onImportBom).toHaveBeenCalledWith([
      expect.objectContaining({
        material_id: "pine_48x98_c24",
        quantity: 24,
        unit: "jm",
      }),
    ], "merge");
    expect(mockToast).toHaveBeenCalledWith("1 scan rows added to BOM", "success");
  });
});
