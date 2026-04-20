import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BomPanel from "@/components/BomPanel";
import type { BomItem, Material } from "@/types";

// Mock API calls so no network requests are made
vi.mock("@/lib/api", () => ({
  api: {
    getCategories: vi.fn().mockResolvedValue([]),
    getMaterialPrices: vi.fn().mockResolvedValue({ prices: [], savings_per_unit: 0 }),
    getPriceHistory: vi.fn().mockResolvedValue([]),
  },
}));

// Mock scene interpreter
vi.mock("@/lib/scene-interpreter", () => ({
  interpretScene: vi.fn().mockReturnValue({ error: "no scene", objects: [] }),
  extractSceneMaterials: vi.fn().mockReturnValue([]),
}));

// Mock animated number hook
vi.mock("@/hooks/useAnimatedNumber", () => ({
  useAnimatedNumber: (n: number) => n,
}));

// Mock LocaleProvider
vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    t: (key: string, params?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "editor.materialList": "Material List",
        "editor.bomRowCount": "0 items",
        "editor.estimatedTotal": "Estimated Total",
        "editor.inclVat": "incl. VAT",
        "editor.noMaterials": "No materials",
        "editor.noMaterialsHint": "Add materials to get started",
        "editor.noMaterialsCta": "Browse materials",
        "editor.confirmRemoveItem": "Remove?",
        "editor.removeMaterial": "Remove",
        "editor.add": "Add",
        "editor.quantityFor": "Quantity",
        "editor.bomItemRow": "BOM item",
        "pricing.browseMaterials": "Browse materials",
        "pricing.searchMaterials": "Search materials",
        "pricing.allCategories": "All",
        "pricing.noResults": "No results",
        "pricing.setQuantity": "Qty",
        "pricing.addMaterial": params ? `Add ${params.name} to BOM` : "Add to BOM",
      };
      return map[key] ?? key;
    },
  }),
}));

const makeMaterial = (id: string, name: string): Material => ({
  id,
  name,
  name_fi: null,
  name_en: name,
  category_name: "Lumber",
  category_name_fi: null,
  image_url: null,
  pricing: [{ unit_price: 12.5, unit: "m", supplier_name: "TestShop", is_primary: true }],
});

const defaultProps = {
  bom: [] as BomItem[],
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onUpdateQty: vi.fn(),
};

describe("BomPanel material browser cards – keyboard accessibility (#619)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders material cards with role=button", () => {
    const materials = [makeMaterial("mat-1", "Pine Beam")];
    render(<BomPanel {...defaultProps} materials={materials} />);
    const cards = screen.getAllByRole("button", { name: /Add Pine Beam/i });
    expect(cards.length).toBeGreaterThan(0);
  });

  it("material cards have tabIndex=0", () => {
    const materials = [makeMaterial("mat-1", "Pine Beam")];
    render(<BomPanel {...defaultProps} materials={materials} />);
    const card = screen.getByRole("button", { name: /Add Pine Beam/i });
    expect(card.getAttribute("tabindex")).toBe("0");
  });

  it("material cards have a descriptive aria-label containing the material name", () => {
    const materials = [makeMaterial("mat-2", "Spruce Plank")];
    render(<BomPanel {...defaultProps} materials={materials} />);
    const card = screen.getByRole("button", { name: /Spruce Plank/i });
    expect(card.getAttribute("aria-label")).toContain("Spruce Plank");
  });

  it("pressing Enter on a material card triggers the quick-add action", () => {
    const onAdd = vi.fn();
    const materials = [makeMaterial("mat-3", "Roof Tile")];
    render(<BomPanel {...defaultProps} materials={materials} onAdd={onAdd} />);
    const card = screen.getByRole("button", { name: /Roof Tile/i });
    fireEvent.keyDown(card, { key: "Enter" });
    // Card should now show as selected (aria-pressed="true")
    expect(card.getAttribute("aria-pressed")).toBe("true");
  });

  it("pressing Space on a material card triggers the quick-add action", () => {
    const onAdd = vi.fn();
    const materials = [makeMaterial("mat-4", "Insulation")];
    render(<BomPanel {...defaultProps} materials={materials} onAdd={onAdd} />);
    const card = screen.getByRole("button", { name: /Insulation/i });
    fireEvent.keyDown(card, { key: " " });
    expect(card.getAttribute("aria-pressed")).toBe("true");
  });

  it("other keys do not trigger the quick-add action", () => {
    const materials = [makeMaterial("mat-5", "Membrane")];
    render(<BomPanel {...defaultProps} materials={materials} />);
    const card = screen.getByRole("button", { name: /Membrane/i });
    fireEvent.keyDown(card, { key: "Tab" });
    expect(card.getAttribute("aria-pressed")).toBe("false");
  });

  it("cards start with aria-pressed=false (not selected)", () => {
    const materials = [makeMaterial("mat-6", "Concrete")];
    render(<BomPanel {...defaultProps} materials={materials} />);
    const card = screen.getByRole("button", { name: /Concrete/i });
    expect(card.getAttribute("aria-pressed")).toBe("false");
  });
});
