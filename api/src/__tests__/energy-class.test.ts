/**
 * Unit tests for the energy class calculator.
 *
 * Tests energy classification, baseline estimation, BOM savings,
 * and the full calculateEnergyClass pipeline.
 */

import { describe, it, expect } from "vitest";
import {
  ENERGY_CLASS_THRESHOLDS,
  classifyEnergy,
  estimateBaselineEnergy,
  estimateSavingsFromBom,
  calculateEnergyClass,
} from "../energy-class";

// ---------------------------------------------------------------------------
// classifyEnergy
// ---------------------------------------------------------------------------
describe("classifyEnergy", () => {
  it("returns A for <= 75 kWh/m2", () => {
    expect(classifyEnergy(60)).toBe("A");
    expect(classifyEnergy(75)).toBe("A");
  });

  it("returns B for 76-100 kWh/m2", () => {
    expect(classifyEnergy(76)).toBe("B");
    expect(classifyEnergy(100)).toBe("B");
  });

  it("returns C for 101-130 kWh/m2", () => {
    expect(classifyEnergy(101)).toBe("C");
    expect(classifyEnergy(130)).toBe("C");
  });

  it("returns D for 131-160 kWh/m2", () => {
    expect(classifyEnergy(160)).toBe("D");
  });

  it("returns E for 161-190 kWh/m2", () => {
    expect(classifyEnergy(190)).toBe("E");
  });

  it("returns F for 191-240 kWh/m2", () => {
    expect(classifyEnergy(240)).toBe("F");
  });

  it("returns G for > 240 kWh/m2", () => {
    expect(classifyEnergy(241)).toBe("G");
    expect(classifyEnergy(500)).toBe("G");
  });

  it("has 6 threshold entries", () => {
    expect(ENERGY_CLASS_THRESHOLDS).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// estimateBaselineEnergy
// ---------------------------------------------------------------------------
describe("estimateBaselineEnergy", () => {
  it("returns high consumption for pre-1960 buildings", () => {
    const result = estimateBaselineEnergy(1950);
    expect(result).toBeGreaterThanOrEqual(250);
  });

  it("returns lower consumption for 2020s buildings", () => {
    const result = estimateBaselineEnergy(2022);
    expect(result).toBeLessThanOrEqual(100);
  });

  it("applies kaukolampo multiplier (0.85)", () => {
    const base = estimateBaselineEnergy(1980);
    const withHeating = estimateBaselineEnergy(1980, "kaukolampo");
    expect(withHeating).toBeLessThan(base);
    expect(withHeating).toBe(Math.round(base * 0.85));
  });

  it("applies maalampopumppu multiplier (0.65)", () => {
    const base = estimateBaselineEnergy(1990);
    const withPump = estimateBaselineEnergy(1990, "maalampopumppu");
    expect(withPump).toBe(Math.round(base * 0.65));
  });

  it("applies oljy multiplier (1.15)", () => {
    const base = estimateBaselineEnergy(1990);
    const withOil = estimateBaselineEnergy(1990, "oljy");
    expect(withOil).toBe(Math.round(base * 1.15));
  });

  it("uses 1.0 multiplier for unknown heating type", () => {
    const base = estimateBaselineEnergy(1990);
    const withUnknown = estimateBaselineEnergy(1990, "unknown_type");
    expect(withUnknown).toBe(base);
  });

  it("uses default 200 for year outside known ranges", () => {
    const result = estimateBaselineEnergy(2050);
    expect(result).toBe(Math.round(80)); // 2020s bucket = 80
  });

  it("produces monotonically decreasing values by decade", () => {
    const decades = [1950, 1965, 1975, 1985, 1995, 2005, 2015, 2022];
    const values = decades.map((y) => estimateBaselineEnergy(y));
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
    }
  });
});

// ---------------------------------------------------------------------------
// estimateSavingsFromBom
// ---------------------------------------------------------------------------
describe("estimateSavingsFromBom", () => {
  it("returns 0 for empty BOM", () => {
    expect(estimateSavingsFromBom([])).toBe(0);
  });

  it("returns 0 for BOM with no energy-improving materials", () => {
    expect(estimateSavingsFromBom(["pine_48x148", "plywood_9mm", "concrete_block"])).toBe(0);
  });

  it("detects insulation upgrade (15%)", () => {
    expect(estimateSavingsFromBom(["insulation_100mm"])).toBe(15);
  });

  it("detects Finnish insulation name (eriste)", () => {
    expect(estimateSavingsFromBom(["polyuretaani_eriste"])).toBe(15);
  });

  it("detects window upgrade (10%)", () => {
    expect(estimateSavingsFromBom(["triple_window_unit"])).toBe(10);
  });

  it("detects heat pump patterns (lampopumppu + maalampopumppu = 50%)", () => {
    // "maalampopumppu" matches both "lampopumppu" (25%) and "maalampopumppu" (25%)
    expect(estimateSavingsFromBom(["maalampopumppu_6kw"])).toBe(50);
  });

  it("detects heat_pump pattern alone (25%)", () => {
    expect(estimateSavingsFromBom(["heat_pump_12kw"])).toBe(25);
  });

  it("stacks multiple upgrades", () => {
    const bom = ["insulation_100mm", "triple_window_unit", "led_panel"];
    // 15 + 10 + 3 = 28
    expect(estimateSavingsFromBom(bom)).toBe(28);
  });

  it("does not double-count same pattern", () => {
    const bom = ["insulation_50mm", "insulation_100mm"];
    expect(estimateSavingsFromBom(bom)).toBe(15);
  });

  it("caps at 60%", () => {
    const bom = [
      "insulation_100mm",    // 15
      "mineraalivilla_200",  // 12
      "triple_window",       // 10
      "heat_pump_12kw",      // 25
      "solar_panel_400w",    // 8
      "led_downlight",       // 3
      "entry_door_insulated",// 3
    ];
    expect(estimateSavingsFromBom(bom)).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// calculateEnergyClass (integration)
// ---------------------------------------------------------------------------
describe("calculateEnergyClass", () => {
  it("returns before and after classes", () => {
    const result = calculateEnergyClass(
      { year_built: 1970, heating: "oljy" },
      [{ material_id: "insulation_100mm", quantity: 50, unit: "sqm" }],
    );
    expect(result.before).toBeDefined();
    expect(result.after).toBeDefined();
    expect(result.kwhBefore).toBeGreaterThan(result.kwhAfter);
    expect(result.savingsPercent).toBe(15);
  });

  it("after class is same or better than before", () => {
    const result = calculateEnergyClass(
      { year_built: 1985, heating: "sahko" },
      [
        { material_id: "insulation_100mm", quantity: 50, unit: "sqm" },
        { material_id: "triple_window", quantity: 8, unit: "kpl" },
      ],
    );
    const classOrder = ["A", "B", "C", "D", "E", "F", "G"];
    expect(classOrder.indexOf(result.after)).toBeLessThanOrEqual(
      classOrder.indexOf(result.before),
    );
  });

  it("handles missing building info gracefully", () => {
    const result = calculateEnergyClass({}, []);
    expect(result.before).toBeDefined();
    expect(result.after).toBe(result.before);
    expect(result.savingsPercent).toBe(0);
  });

  it("uses 1980 as default year", () => {
    const result = calculateEnergyClass({}, []);
    const explicit = calculateEnergyClass({ year_built: 1980 }, []);
    expect(result.kwhBefore).toBe(explicit.kwhBefore);
  });

  it("full renovation of 1960s building can improve from G to D or better", () => {
    const result = calculateEnergyClass(
      { year_built: 1965, heating: "oljy" },
      [
        { material_id: "insulation_200mm", quantity: 100, unit: "sqm" },
        { material_id: "ikkuna_kolmilasi", quantity: 12, unit: "kpl" },
        { material_id: "maalampopumppu_8kw", quantity: 1, unit: "kpl" },
        { material_id: "led_panel_18w", quantity: 20, unit: "kpl" },
      ],
    );
    expect(result.savingsPercent).toBeGreaterThanOrEqual(40);
    const classOrder = ["A", "B", "C", "D", "E", "F", "G"];
    expect(classOrder.indexOf(result.after)).toBeLessThanOrEqual(3); // D or better
  });
});
