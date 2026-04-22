import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { Material, BomItem } from "@/types";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: vi.fn(),
}));

vi.mock("@/lib/material-affiliate", () => ({
  buildAffiliateRetailerUrl: vi.fn((link: string | null) => link ? `aff:${link}` : null),
}));

import MaterialPicker from "@/components/MaterialPicker";

const baseMaterial: Material = {
  id: "m1",
  name: "Pine Board 22x100",
  name_fi: "Mäntylankku 22x100",
  name_en: "Pine Board 22x100",
  category_name: "lumber",
  category_name_fi: "Sahatavara",
  image_url: null,
  pricing: [
    { unit_price: 4.5, unit: "jm", supplier_name: "K-Rauta", is_primary: true, link: "https://k-rauta.fi/123" },
  ],
  thermal_conductivity: 0.13,
  thermal_thickness: null,
  fire_rating: null,
  tags: ["wood", "pine"],
  visual_albedo: [0.6, 0.45, 0.3],
};

const cheapMaterial: Material = {
  ...baseMaterial,
  id: "m2",
  name: "Spruce Board 22x100",
  name_fi: "Kuusilankku 22x100",
  name_en: "Spruce Board 22x100",
  pricing: [
    { unit_price: 3.0, unit: "jm", supplier_name: "Stark", is_primary: true, link: null },
  ],
  thermal_conductivity: 0.12,
};

const insulationMaterial: Material = {
  ...baseMaterial,
  id: "m3",
  name: "Rockwool 100mm",
  name_fi: "Kivivilla 100mm",
  name_en: "Rockwool 100mm",
  category_name: "insulation",
  category_name_fi: "Eristeet",
  pricing: [
    { unit_price: 8.5, unit: "m2", supplier_name: "K-Rauta", is_primary: true, link: null },
  ],
  thermal_conductivity: 0.035,
  fire_rating: "A1",
  tags: ["mineral", "rockwool"],
};

const bomItem: BomItem = {
  material_id: "m1",
  quantity: 20,
  unit: "jm",
};

const materials = [baseMaterial, cheapMaterial, insulationMaterial];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MaterialPicker", () => {
  it("renders dialog with title", () => {
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("materialPicker.title")).toBeInTheDocument();
  });

  it("renders subtitle", () => {
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("materialPicker.subtitle")).toBeInTheDocument();
  });

  it("renders close button", () => {
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("dialog.close")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={onClose}
        onSelect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("dialog.close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows current material info", () => {
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("materialPicker.current")).toBeInTheDocument();
    expect(screen.getAllByText("Pine Board 22x100").length).toBeGreaterThanOrEqual(1);
  });

  it("renders search input", () => {
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("materialPicker.search")).toBeInTheDocument();
  });

  it("renders sort dropdown with options", () => {
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("materialPicker.sortPriceAsc")).toBeInTheDocument();
    expect(screen.getByText("materialPicker.sortPriceDesc")).toBeInTheDocument();
    expect(screen.getByText("materialPicker.sortThermal")).toBeInTheDocument();
    expect(screen.getByText("materialPicker.sortAvailability")).toBeInTheDocument();
  });

  it("renders category tabs", () => {
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("materialPicker.allMaterials")).toBeInTheDocument();
  });

  it("renders affiliate disclosure", () => {
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("materialPicker.affiliateDisclosure")).toBeInTheDocument();
  });

  it("has aria-modal on dialog", () => {
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("renders eyebrow label", () => {
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText("materialPicker.eyebrow")).toBeInTheDocument();
  });

  it("renders price and conductivity sliders", () => {
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByText(/materialPicker\.maxPrice/)).toBeInTheDocument();
    expect(screen.getByText(/materialPicker\.maxConductivity/)).toBeInTheDocument();
  });

  it("closes when overlay is clicked", () => {
    const onClose = vi.fn();
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={onClose}
        onSelect={vi.fn()}
      />,
    );
    const overlay = screen.getByRole("presentation");
    fireEvent.mouseDown(overlay);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders tablist for categories", () => {
    render(
      <MaterialPicker
        currentMaterialId="m1"
        bomItem={bomItem}
        materials={materials}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });
});
