import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PhasedRenovationPlannerPanel from "@/components/PhasedRenovationPlannerPanel";
import type { BomItem, Material } from "@/types";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

const materials: Material[] = [
  {
    id: "kitchen_cabinet",
    name: "Kitchen cabinet",
    name_fi: "Keittiökaappi",
    name_en: "Kitchen cabinet",
    category_name: "interior",
    category_name_fi: "Sisätyöt",
    image_url: null,
    pricing: [{ unit_price: 1000, unit: "pcs", supplier_name: "K-Rauta", is_primary: true }],
    tags: ["interior"],
  },
  {
    id: "roof_tile",
    name: "Roof tile",
    name_fi: "Kattotiili",
    name_en: "Roof tile",
    category_name: "roof",
    category_name_fi: "Katto",
    image_url: null,
    pricing: [{ unit_price: 900, unit: "m2", supplier_name: "K-Rauta", is_primary: true }],
    tags: ["roof"],
  },
];

const bom: BomItem[] = [
  { material_id: "kitchen_cabinet", material_name: "Kitchen cabinet", quantity: 14, unit: "pcs", total: 14000 },
  { material_id: "roof_tile", material_name: "Roof tile", quantity: 12, unit: "m2", total: 10800 },
];

beforeEach(() => {
  vi.useRealTimers();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("PhasedRenovationPlannerPanel", () => {
  it("renders phased renovation metrics and yearly plan", () => {
    render(<PhasedRenovationPlannerPanel bom={bom} materials={materials} coupleMode={true} />);

    expect(screen.getByRole("heading", { name: "Phased renovation planner" })).toBeInTheDocument();
    expect(screen.getByText("Total deduction")).toBeInTheDocument();
    expect(screen.getByText("Extra phasing benefit")).toBeInTheDocument();
    expect(screen.getByText("Year-by-year deduction")).toBeInTheDocument();
    expect(screen.getAllByText("Interior finishes").length).toBeGreaterThan(0);
  });

  it("notifies parent when claimant mode changes", () => {
    const onCoupleModeChange = vi.fn();
    render(
      <PhasedRenovationPlannerPanel
        bom={bom}
        materials={materials}
        coupleMode={false}
        onCoupleModeChange={onCoupleModeChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "2 claimants" }));

    expect(onCoupleModeChange).toHaveBeenCalledWith(true);
  });

  it("allows manually moving a phase to a later tax year", () => {
    render(<PhasedRenovationPlannerPanel bom={bom} materials={materials} />);

    const yearSelect = screen.getByLabelText("Interior finishes Year");
    const laterYear = String(new Date().getFullYear() + 3);
    fireEvent.change(yearSelect, { target: { value: laterYear } });

    expect(screen.getByLabelText("Interior finishes Year")).toHaveValue(laterYear);
  });

  it("copies a contractor handoff summary", async () => {
    render(<PhasedRenovationPlannerPanel bom={bom} materials={materials} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy for contractor" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("Helscoop phased renovation plan"));
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
