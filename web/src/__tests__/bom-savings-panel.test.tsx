import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockBuildSavingsRecommendations = vi.fn();
const mockSumSavings = vi.fn();
const mockTrack = vi.fn();

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

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mockTrack }),
}));

vi.mock("@/lib/bom-savings", () => ({
  buildSavingsRecommendations: (...args: unknown[]) => mockBuildSavingsRecommendations(...args),
  sumSavings: (...args: unknown[]) => mockSumSavings(...args),
}));

import BomSavingsPanel from "@/components/BomSavingsPanel";
import type { BomItem, Material } from "@/types";

const mockBom: BomItem[] = [
  { material_id: "m1", quantity: 10, unit: "kpl" },
];

const mockMaterials: Material[] = [
  {
    id: "m1",
    name: "Board",
    name_fi: "Lauta",
    name_en: "Board",
    category_name: "wood",
    category_name_fi: "puu",
    image_url: null,
    pricing: [{ unit_price: 5, unit: "kpl", supplier_name: "K-Rauta", is_primary: true }],
  },
];

const mockRecommendation = {
  id: "rec-1",
  type: "supplier_switch" as const,
  materialId: "m1",
  materialName: "Board",
  currentUnitPrice: 5,
  targetUnitPrice: 3.5,
  unit: "kpl",
  savingsAmount: 15,
  savingsPercent: 30,
  fromSupplier: "K-Rauta",
  toSupplier: "Stark",
  link: null,
  stockLevel: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildSavingsRecommendations.mockReturnValue([mockRecommendation]);
  mockSumSavings.mockReturnValue(15);
});

describe("BomSavingsPanel", () => {
  it("returns null for empty bom", () => {
    const { container } = render(
      <BomSavingsPanel
        bom={[]}
        materials={mockMaterials}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders section with aria-label", () => {
    render(
      <BomSavingsPanel
        bom={mockBom}
        materials={mockMaterials}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("bomSavings.title")).toBeInTheDocument();
  });

  it("renders eyebrow text", () => {
    render(
      <BomSavingsPanel
        bom={mockBom}
        materials={mockMaterials}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    expect(screen.getByText("bomSavings.eyebrow")).toBeInTheDocument();
  });

  it("renders title", () => {
    render(
      <BomSavingsPanel
        bom={mockBom}
        materials={mockMaterials}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    expect(screen.getByText("bomSavings.title")).toBeInTheDocument();
  });

  it("renders total savings", () => {
    render(
      <BomSavingsPanel
        bom={mockBom}
        materials={mockMaterials}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    expect(screen.getByText("bomSavings.totalAvailable")).toBeInTheDocument();
    const totalEl = screen.getByText("bomSavings.totalAvailable").closest(".bom-savings-total")!;
    expect(totalEl.textContent).toContain("15");
  });

  it("renders saving type group toggles", () => {
    render(
      <BomSavingsPanel
        bom={mockBom}
        materials={mockMaterials}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    expect(screen.getByText("bomSavings.supplier_switch")).toBeInTheDocument();
    expect(screen.getByText("bomSavings.material_substitution")).toBeInTheDocument();
    expect(screen.getByText("bomSavings.bulk_discount")).toBeInTheDocument();
    expect(screen.getByText("bomSavings.seasonal_stock")).toBeInTheDocument();
  });

  it("shows no savings message when empty", () => {
    mockBuildSavingsRecommendations.mockReturnValue([]);
    mockSumSavings.mockReturnValue(0);
    render(
      <BomSavingsPanel
        bom={mockBom}
        materials={mockMaterials}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    expect(screen.getByText("bomSavings.noSavings")).toBeInTheDocument();
  });

  it("renders recommendation text", () => {
    render(
      <BomSavingsPanel
        bom={mockBom}
        materials={mockMaterials}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    expect(screen.getByText(/bomSavings\.supplierSwitchText/)).toBeInTheDocument();
  });

  it("renders apply button", () => {
    render(
      <BomSavingsPanel
        bom={mockBom}
        materials={mockMaterials}
        onApplySupplierPrice={vi.fn()}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    expect(screen.getByText("bomSavings.applySupplier")).toBeInTheDocument();
  });

  it("calls onApplySupplierPrice when apply clicked", () => {
    const onApply = vi.fn();
    render(
      <BomSavingsPanel
        bom={mockBom}
        materials={mockMaterials}
        onApplySupplierPrice={onApply}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("bomSavings.applySupplier"));
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        materialId: "m1",
        unitPrice: 3.5,
        unit: "kpl",
        supplier: "Stark",
      }),
    );
  });

  it("tracks analytics on apply", () => {
    render(
      <BomSavingsPanel
        bom={mockBom}
        materials={mockMaterials}
        onApplySupplierPrice={vi.fn()}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("bomSavings.applySupplier"));
    expect(mockTrack).toHaveBeenCalledWith("bom_optimization_applied", expect.objectContaining({ type: "supplier_switch" }));
  });

  it("dismisses recommendation on dismiss click", () => {
    render(
      <BomSavingsPanel
        bom={mockBom}
        materials={mockMaterials}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("bom.dismiss"));
    expect(mockTrack).toHaveBeenCalledWith("bom_optimization_dismissed", expect.objectContaining({ type: "supplier_switch" }));
  });

  it("toggles group expansion", () => {
    render(
      <BomSavingsPanel
        bom={mockBom}
        materials={mockMaterials}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );
    const toggle = screen.getByText("bomSavings.supplier_switch").closest("button")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
