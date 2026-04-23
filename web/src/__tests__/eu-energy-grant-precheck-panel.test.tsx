import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import EuEnergyGrantPrecheckPanel from "@/components/EuEnergyGrantPrecheckPanel";
import type { BomItem, BuildingInfo, Material } from "@/types";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

const materials: Material[] = [
  {
    id: "solar-panel",
    name: "Solar panel",
    name_fi: "Aurinkopaneeli",
    name_en: "Solar panel",
    category_name: "solar",
    category_name_fi: "aurinko",
    image_url: null,
    tags: ["solar", "energy community"],
    pricing: [{ unit_price: 250, unit: "pcs", supplier_name: "Test", is_primary: true }],
  },
  {
    id: "smart-control",
    name: "Smart heating control",
    name_fi: "Alyohjaus",
    name_en: "Smart heating control",
    category_name: "controls",
    category_name_fi: "ohjaus",
    image_url: null,
    tags: ["smart controls"],
    pricing: [{ unit_price: 1200, unit: "pcs", supplier_name: "Test", is_primary: true }],
  },
];

const bom: BomItem[] = [
  { material_id: "solar-panel", quantity: 80, unit: "pcs" },
  { material_id: "smart-control", quantity: 1, unit: "pcs" },
];

const buildingInfo: BuildingInfo = { type: "kerrostalo", units: 24, year_built: 1975, address: "Testikatu 1, Helsinki" };

describe("EuEnergyGrantPrecheckPanel", () => {
  it("renders official-source grant programs with funding badge", () => {
    render(<EuEnergyGrantPrecheckPanel bom={bom} materials={materials} buildingInfo={buildingInfo} totalCost={60000} />);

    expect(screen.getByRole("heading", { name: "EU and energy grant pre-check" })).toBeInTheDocument();
    expect(screen.getByText(/Potential funding: 45,000 EUR/)).toBeInTheDocument();
    expect(screen.getByText("Business Finland Energy Aid")).toBeInTheDocument();
    expect(screen.getByText("EU Energy Communities Facility")).toBeInTheDocument();
    expect(screen.getByText("Motiva energy advice")).toBeInTheDocument();
    expect(screen.getByText(/exclude housing associations/)).toBeInTheDocument();
  });

  it("removes the EU cash signal when community scopes are unchecked", () => {
    render(<EuEnergyGrantPrecheckPanel bom={bom} materials={materials} buildingInfo={buildingInfo} totalCost={60000} />);

    fireEvent.click(screen.getByLabelText("Solar"));
    fireEvent.click(screen.getByLabelText("Smart controls"));

    expect(screen.getByText("No automatic cash signal")).toBeInTheDocument();
  });

  it("marks already-started projects as blocked for the EU facility", () => {
    render(<EuEnergyGrantPrecheckPanel bom={bom} materials={materials} buildingInfo={buildingInfo} totalCost={60000} />);

    fireEvent.change(screen.getByLabelText("Stage"), { target: { value: "ordered_or_started" } });

    expect(screen.getByText(/before implementation/)).toBeInTheDocument();
  });
});
