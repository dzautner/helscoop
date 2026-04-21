import { describe, expect, it } from "vitest";
import {
  detectHeatingGrantOpportunity,
  hasFossilSourceHeating,
  inferHeatingGrantTarget,
} from "@/lib/heating-grant-context";

describe("heating grant context", () => {
  it("detects an air-water heat pump scene as a grant trigger", () => {
    const result = detectHeatingGrantOpportunity({
      sceneJs: 'const awhp = box(1, 1, 1); scene.add(awhp, { material: "air_water_heat_pump_unit" });',
      buildingInfo: { heating: "oljy" },
    });

    expect(result.shouldShow).toBe(true);
    expect(result.triggeredByScene).toBe(true);
    expect(result.detectedTargetHeating).toBe("air_water_heat_pump");
    expect(result.fossilSourceHeating).toBe(true);
  });

  it("detects heating systems from material metadata", () => {
    const result = detectHeatingGrantOpportunity({
      bom: [{ material_id: "m1", quantity: 1, unit: "kpl" }],
      materials: [{
        id: "m1",
        name: "Maalampo heat pump package",
        name_fi: "Maalampopaketti",
        name_en: "Ground-source heat pump package",
        category_name: "hvac",
        category_name_fi: "LVI",
        image_url: null,
        pricing: null,
      }],
      buildingInfo: { heating: "sahko" },
    });

    expect(result.shouldShow).toBe(true);
    expect(result.detectedTargetHeating).toBe("ground_source_heat_pump");
  });

  it("does not show the grant panel for unrelated scenes without fossil heating", () => {
    const result = detectHeatingGrantOpportunity({
      sceneJs: 'scene.add(box(1, 1, 1), { material: "decking" });',
      buildingInfo: { heating: "kaukolampo" },
    });

    expect(result.shouldShow).toBe(false);
    expect(result.triggeredByScene).toBe(false);
  });

  it("recognizes oil and natural gas source heating", () => {
    expect(hasFossilSourceHeating("öljylämmitys")).toBe(true);
    expect(hasFossilSourceHeating("natural gas")).toBe(true);
    expect(hasFossilSourceHeating("kaukolampo")).toBe(false);
  });

  it("keeps generic heat-pump mentions conservative", () => {
    expect(inferHeatingGrantTarget("lämpöpumppu replacement").target).toBe("other_non_fossil");
  });
});
