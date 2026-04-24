import { describe, expect, it } from "vitest";
import { analyzeAirflow } from "@/lib/airflow-engine";
import type { SceneParam } from "@/lib/scene-interpreter";
import type { SceneLayer } from "@/lib/scene-layers";

const layers: SceneLayer[] = [
  {
    id: "ridge_vent",
    objectId: "ridge_vent",
    materialId: "vent_thermal_bridge",
    color: [0.3, 0.3, 0.35],
    meshCount: 1,
    name: "Ridge Vent",
    approxCost: 20,
  },
  {
    id: "front_door",
    objectId: "front_door",
    materialId: "exterior_door",
    color: [0.7, 0.7, 0.7],
    meshCount: 1,
    name: "Front Door",
    approxCost: 200,
  },
  {
    id: "electric_heater",
    objectId: "electric_heater",
    materialId: "heater",
    color: [1, 0.4, 0.2],
    meshCount: 1,
    name: "Electric Heater",
    approxCost: 120,
  },
];

const params: SceneParam[] = [
  { name: "outside_temp", section: "Climate", label: "Outside temperature", min: -30, max: 20, value: -10, step: 1 },
  { name: "inside_temp", section: "Climate", label: "Inside temperature", min: 0, max: 25, value: 20, step: 1 },
  { name: "vent_w", section: "Ventilation", label: "Vent width", min: 100, max: 800, value: 500, step: 5 },
  { name: "vent_h", section: "Ventilation", label: "Vent height", min: 100, max: 800, value: 300, step: 5 },
  { name: "human_door_angle", section: "Ventilation", label: "Door angle", min: 0, max: 90, value: 90, step: 1 },
  { name: "chicken_count", section: "Animals", label: "Chickens", min: 0, max: 20, value: 6, step: 1 },
];

describe("airflow-engine", () => {
  it("estimates stack-effect airflow, openings, heat sources, and ACH", () => {
    const analysis = analyzeAirflow(layers, params, { area_m2: 18, floors: 1 }, {
      particleDensity: 650,
      speedMultiplier: 1.5,
      windSpeedMps: 5,
      windDirectionDeg: 180,
    });

    expect(analysis.particleCount).toBe(650);
    expect(analysis.speedMultiplier).toBe(1.5);
    expect(analysis.openingCount).toBeGreaterThanOrEqual(2);
    expect(analysis.heatSourceCount).toBe(1);
    expect(analysis.heatWatts).toBeGreaterThan(100);
    expect(analysis.stackVelocityMps).toBeGreaterThan(0);
    expect(analysis.airChangesPerHour).toBeGreaterThan(0);
    expect(["low", "moderate", "good"]).toContain(analysis.adequacy);
  });

  it("responds to warmer outdoor temperature by reducing stack velocity", () => {
    const cold = analyzeAirflow(layers, params, { area_m2: 18, floors: 1 });
    const mild = analyzeAirflow(
      layers,
      params.map((param) => param.name === "outside_temp" ? { ...param, value: 18 } : param),
      { area_m2: 18, floors: 1 },
    );

    expect(cold.deltaTempC).toBeGreaterThan(mild.deltaTempC);
    expect(cold.stackVelocityMps).toBeGreaterThan(mild.stackVelocityMps);
  });

  it("clamps visualization controls to the supported performance envelope", () => {
    const analysis = analyzeAirflow([], [], null, {
      particleDensity: 5000,
      speedMultiplier: 10,
      windSpeedMps: 40,
      windDirectionDeg: -90,
      showArrows: false,
    });

    expect(analysis.particleCount).toBe(1000);
    expect(analysis.speedMultiplier).toBe(3);
    expect(analysis.windSpeedMps).toBe(15);
    expect(analysis.windDirectionDeg).toBe(270);
    expect(analysis.showArrows).toBe(false);
  });
});
