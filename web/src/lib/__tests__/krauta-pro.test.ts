import { describe, expect, it } from "vitest";
import { buildKrautaProPackage, formatKrautaProPackage } from "@/lib/krauta-pro";
import type { BomItem, Material } from "@/types";

const materials: Material[] = [
  {
    id: "osb_18mm",
    name: "OSB 18mm",
    name_fi: "OSB 18mm",
    name_en: "OSB 18mm",
    category_name: "interior",
    category_name_fi: "sisatyot",
    image_url: null,
    pricing: [{ unit_price: 32, unit: "sheet", supplier_name: "K-Rauta", link: "https://www.k-rauta.fi/tuote/osb", is_primary: true }],
  },
  {
    id: "paint",
    name: "Paint",
    name_fi: "Maali",
    name_en: "Paint",
    category_name: "finish",
    category_name_fi: "pinta",
    image_url: null,
    pricing: [{ unit_price: 18, unit: "l", supplier_name: "Other", is_primary: true }],
  },
];

const bom: BomItem[] = [
  { material_id: "osb_18mm", material_name: "OSB 18mm", quantity: 10, unit: "sheet" },
  { material_id: "paint", material_name: "Paint", quantity: 5, unit: "l" },
];

describe("K-Rauta PRO package", () => {
  it("builds a contractor package from K-Rauta BOM lines", () => {
    const plan = buildKrautaProPackage({ bom, materials });

    expect(plan.eligible).toBe(true);
    expect(plan.supplierId).toBe("k-rauta");
    expect(plan.lineCount).toBe(1);
    expect(plan.coveragePercent).toBe(0.5);
    expect(plan.retailMaterialTotal).toBe(320);
    expect(plan.proMaterialEstimate).toBe(294);
    expect(plan.estimatedTradeSavings).toBe(26);
    expect(plan.estimatedReferralRevenue).toBe(12);
    expect(plan.uncoveredLines).toEqual(["Paint"]);
    expect(plan.orderUrl).toContain("hsc_source=k_rauta_pro_package");
  });

  it("uses explicit K-Rauta BOM pricing when available", () => {
    const plan = buildKrautaProPackage({
      bom: [{ material_id: "manual", material_name: "Manual line", quantity: 2, unit: "pcs", unit_price: 50, supplier: "K-Rauta" }],
      materials: [],
    });

    expect(plan.eligible).toBe(true);
    expect(plan.retailMaterialTotal).toBe(100);
  });

  it("formats a copyable order package", () => {
    const plan = buildKrautaProPackage({ bom, materials });
    const text = formatKrautaProPackage(plan, "Sauna renovation", "en");

    expect(text).toContain("Helscoop K-Rauta PRO order package");
    expect(text).toContain("Sauna renovation");
    expect(text).toContain("osb_18mm");
    expect(text).toContain("Non K-Rauta lines");
  });
});
