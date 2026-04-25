import { describe, expect, it } from "vitest";
import {
  calculateSurfaceAnnualHeatLossKwh,
  calculateThermalLoss,
  checkCodeCompliance,
  classifyThermalReferenceCategory,
  CLIMATE_LOCATIONS,
  estimateBomAreaM2,
} from "@/lib/thermal-engine";

const materials = [
  {
    id: "wall_insulation",
    category_name: "insulation",
    thermal_conductivity: 0.035,
    thermal_thickness: 200,
  },
  {
    id: "triple_glass_window",
    category_name: "opening",
    thermal_conductivity: 0.8,
    thermal_thickness: 40,
  },
];

describe("thermal-engine", () => {
  it("calculates heat flux and surface temperatures from thermal settings", () => {
    const cold = calculateThermalLoss(materials, {
      insideTemp: 21,
      outsideTemp: -20,
      surfaceRInside: 0.13,
      surfaceROutside: 0.04,
    });
    const mild = calculateThermalLoss(materials, {
      insideTemp: 21,
      outsideTemp: 5,
      surfaceRInside: 0.13,
      surfaceROutside: 0.04,
    });

    const coldWall = cold.surfaces.get("wall_insulation");
    const mildWall = mild.surfaces.get("wall_insulation");

    expect(coldWall?.heatFluxDensity).toBeGreaterThan(mildWall?.heatFluxDensity ?? 0);
    expect(coldWall?.insideSurfaceTempC).toBeLessThan(21);
    expect(coldWall?.outsideSurfaceTempC).toBeGreaterThan(-20);
    expect(cold.deltaT).toBe(41);
  });

  it("normalizes Finnish and English categories to code reference groups", () => {
    expect(classifyThermalReferenceCategory("Katto", "metal_roof_sheet")).toBe("roof");
    expect(classifyThermalReferenceCategory("Perustus", "foundation_slab")).toBe("floor");
    expect(classifyThermalReferenceCategory("Aukko", "front_door")).toBe("opening");
    expect(classifyThermalReferenceCategory("Eristys", "wall_insulation")).toBe("wall");
  });

  it("checks code compliance against the normalized reference U-values", () => {
    const roof = checkCodeCompliance("roofing", 0.08, "roof_panel");
    const window = checkCodeCompliance("opening", 1.4, "window");

    expect(roof.referenceCategory).toBe("roof");
    expect(roof.status).toBe("pass");
    expect(window.referenceCategory).toBe("opening");
    expect(window.status).toBe("fail");
  });

  it("estimates annual heat loss for a material area in the selected climate", () => {
    const analysis = calculateThermalLoss(materials, {
      insideTemp: 21,
      outsideTemp: -20,
      surfaceRInside: 0.13,
      surfaceROutside: 0.04,
    });
    const surface = analysis.surfaces.get("wall_insulation");
    expect(surface).toBeTruthy();

    const areaM2 = estimateBomAreaM2("wall_insulation", [
      { material_id: "wall_insulation", quantity: 30, unit: "m2" },
      { material_id: "wall_insulation", quantity: 12, unit: "kpl" },
    ]);
    const annualLoss = calculateSurfaceAnnualHeatLossKwh(surface!, areaM2, CLIMATE_LOCATIONS[0], 21);

    expect(areaM2).toBe(30);
    expect(annualLoss).toBeGreaterThan(0);
  });
});
