import { describe, expect, it } from "vitest";
import { detectRenovationCategory, estimateRenovationRoi } from "@/lib/renovation-roi";
import type { BomItem, Material } from "@/types";

const materials: Material[] = [
  {
    id: "air_water_heat_pump_unit",
    name: "Air-water heat pump unit",
    name_fi: "Ilma-vesilampopumppu",
    name_en: "Air-water heat pump",
    category_name: "hvac",
    category_name_fi: "LVI",
    image_url: null,
    pricing: [{ unit_price: 8500, unit: "kpl", supplier_name: "Test", is_primary: true }],
  },
  {
    id: "roofing_sheet",
    name: "Metal roofing sheet",
    name_fi: "Peltikatto",
    name_en: "Metal roofing",
    category_name: "roofing",
    category_name_fi: "Katto",
    image_url: null,
    pricing: [{ unit_price: 22, unit: "m2", supplier_name: "Test", is_primary: true }],
  },
];

describe("renovation ROI estimator", () => {
  it("classifies energy renovation from heat-pump materials", () => {
    const bom: BomItem[] = [{ material_id: "air_water_heat_pump_unit", quantity: 1, unit: "kpl" }];
    expect(detectRenovationCategory(bom, materials)).toBe("energy");
  });

  it("uses ELY as the best subsidy when fossil heating is replaced by a heat pump", () => {
    const result = estimateRenovationRoi(
      [{ material_id: "air_water_heat_pump_unit", quantity: 1, unit: "kpl" }],
      materials,
      { type: "omakotitalo", heating: "oljy", area_m2: 145, year_built: 1978 },
    );

    expect(result).not.toBeNull();
    expect(result?.bestSubsidy.type).toBe("ely");
    expect(result?.bestSubsidy.amount).toBe(4000);
    expect(result?.annualEnergySavings).toBeGreaterThan(0);
    expect(result?.paybackYears).toBeGreaterThan(0);
    expect(result?.timing.status).toBe("act_now");
  });

  it("falls back to household deduction when no ELY trigger exists", () => {
    const result = estimateRenovationRoi(
      [{ material_id: "roofing_sheet", quantity: 90, unit: "m2" }],
      materials,
      { type: "omakotitalo", heating: "kaukolampo", area_m2: 120, year_built: 1998 },
      { coupleMode: true },
    );

    expect(result).not.toBeNull();
    expect(result?.category).toBe("roof");
    expect(result?.bestSubsidy.type).toBe("household_deduction");
    expect(result?.netCost).toBeLessThan(result?.grossCost ?? 0);
    expect(result?.estimatedValueIncrease).toBeGreaterThan(0);
  });
});
