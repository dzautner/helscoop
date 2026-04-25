import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import RenovationFinancingPanel from "@/components/RenovationFinancingPanel";
import type { BomItem, BuildingInfo, Material } from "@/types";

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mocks.track }),
}));

const materials: Material[] = [
  {
    id: "heat-pump",
    name: "Air-water heat pump",
    name_fi: "Ilma-vesilampopumppu",
    name_en: "Air-water heat pump",
    category_name: "heating",
    category_name_fi: "lammitys",
    image_url: null,
    tags: ["energy", "air-water heat pump"],
    pricing: [{ unit_price: 4500, unit: "pcs", supplier_name: "Test supplier", is_primary: true }],
  },
  {
    id: "tile",
    name: "Tile",
    name_fi: "Laatta",
    name_en: "Tile",
    category_name: "interior",
    category_name_fi: "sisustus",
    image_url: null,
    pricing: [{ unit_price: 45, unit: "m2", supplier_name: "Test supplier", is_primary: true }],
  },
];

const eligibleBom: BomItem[] = [
  { material_id: "heat-pump", material_name: "Air-water heat pump", quantity: 1, unit: "pcs" },
  { material_id: "tile", material_name: "Tile", quantity: 200, unit: "m2" },
];

const buildingInfo: BuildingInfo = {
  type: "omakotitalo",
  year_built: 1978,
  area_m2: 140,
  heating: "oil",
};

describe("RenovationFinancingPanel", () => {
  beforeEach(() => {
    mocks.track.mockClear();
  });

  it("does not render below the financing threshold", () => {
    const smallBom: BomItem[] = [{ material_id: "tile", material_name: "Tile", quantity: 1, unit: "m2" }];
    const { container } = render(
      <RenovationFinancingPanel bom={smallBom} materials={materials} />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("renders financing offers and contextual subsidy notices", async () => {
    render(<RenovationFinancingPanel bom={eligibleBom} materials={materials} buildingInfo={buildingInfo} />);

    expect(screen.getByRole("heading", { name: "Finance this renovation" })).toBeInTheDocument();
    expect(screen.getByText("Unsecured remonttilaina")).toBeInTheDocument();
    expect(screen.getByText("Secured bank loan")).toBeInTheDocument();
    expect(screen.getByText("Material payment split")).toBeInTheDocument();
    expect(screen.getByText(/Household expense tax credit may reduce cash need/)).toBeInTheDocument();
    expect(screen.getByText(/Energy-upgrade grant signal detected/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.track).toHaveBeenCalledWith("financing_widget_viewed", expect.objectContaining({
      energy_grant_signal: true,
      offer_count: 3,
    })));
  });

  it("updates estimates when the term changes", () => {
    render(<RenovationFinancingPanel bom={eligibleBom} materials={materials} buildingInfo={buildingInfo} />);

    fireEvent.change(screen.getByLabelText("Loan term"), { target: { value: "10" } });

    expect(screen.getAllByText(/120 months/).length).toBeGreaterThan(0);
  });

  it("tracks partner click-throughs", () => {
    render(<RenovationFinancingPanel bom={eligibleBom} materials={materials} buildingInfo={buildingInfo} />);

    const link = screen.getByRole("link", { name: "Compare renovation loans" });
    expect(link).toHaveAttribute("href", expect.stringContaining("utm_source=helscoop"));

    fireEvent.click(link);

    expect(mocks.track).toHaveBeenCalledWith("financing_partner_clicked", expect.objectContaining({
      partner: "sortter-remonttilaina",
      target: "loan_comparison",
    }));
  });
});
