import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BomSavingsPanel from "@/components/BomSavingsPanel";
import type { BomItem, Material } from "@/types";

const mocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === "bomSavings.substitutionText") return `${params?.from} to ${params?.to}`;
      return key;
    },
  }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({
    track: mocks.track,
  }),
}));

function makeMaterial(overrides: Partial<Material> = {}): Material {
  return {
    id: "pine_48x148_c24",
    name: "Pine C24",
    name_fi: "Pine C24",
    name_en: "Pine C24",
    category_name: "Lumber",
    category_name_fi: "Sahatavara",
    image_url: null,
    design_unit: "jm",
    substitution_group: "framing_48",
    pricing: [{ unit_price: 5, unit: "jm", supplier_name: "K-Rauta", is_primary: true }],
    ...overrides,
  };
}

function makeBomItem(overrides: Partial<BomItem> = {}): BomItem {
  return {
    material_id: "pine_48x148_c24",
    material_name: "Pine C24",
    category_name: "Lumber",
    quantity: 10,
    unit: "jm",
    unit_price: 5,
    total: 50,
    supplier: "K-Rauta",
    ...overrides,
  };
}

describe("BomSavingsPanel", () => {
  beforeEach(() => {
    mocks.track.mockClear();
  });

  it("dismisses a recommendation without applying it", () => {
    const onReplaceMaterial = vi.fn();
    const materials = [
      makeMaterial(),
      makeMaterial({
        id: "spruce_48x148_c24",
        name: "Spruce C24",
        name_fi: "Spruce C24",
        name_en: "Spruce C24",
        pricing: [{ unit_price: 3, unit: "jm", supplier_name: "STARK", is_primary: true }],
      }),
    ];

    render(
      <BomSavingsPanel
        bom={[makeBomItem()]}
        materials={materials}
        onReplaceMaterial={onReplaceMaterial}
        onCompareMaterial={vi.fn()}
        onOpenMaterialPicker={vi.fn()}
      />,
    );

    expect(screen.getByText("Pine C24 to Spruce C24")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "bom.dismiss" }));

    expect(screen.queryByText("Pine C24 to Spruce C24")).not.toBeInTheDocument();
    expect(screen.getByText("bomSavings.noSavings")).toBeInTheDocument();
    expect(onReplaceMaterial).not.toHaveBeenCalled();
    expect(mocks.track).toHaveBeenCalledWith("bom_optimization_dismissed", {
      type: "material_substitution",
      material_id: "pine_48x148_c24",
      savings_amount: 20,
    });
  });
});
