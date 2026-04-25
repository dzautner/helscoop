import { describe, it, expect } from "vitest";
import {
  classifyEnergy,
  estimateBaselineEnergy,
  estimateSavingsFromBom,
  calculateEnergyClass,
  ENERGY_CLASS_THRESHOLDS,
} from "../energy-class";

describe("ENERGY_CLASS_THRESHOLDS", () => {
  it("has 6 classes A-F", () => {
    expect(ENERGY_CLASS_THRESHOLDS.length).toBe(6);
    expect(ENERGY_CLASS_THRESHOLDS[0].class).toBe("A");
    expect(ENERGY_CLASS_THRESHOLDS[5].class).toBe("F");
  });

  it("thresholds are in ascending order", () => {
    for (let i = 1; i < ENERGY_CLASS_THRESHOLDS.length; i++) {
      expect(ENERGY_CLASS_THRESHOLDS[i].maxKwhM2).toBeGreaterThan(
        ENERGY_CLASS_THRESHOLDS[i - 1].maxKwhM2,
      );
    }
  });
});

describe("classifyEnergy", () => {
  it("classifies 50 kWh/m2 as A", () => {
    expect(classifyEnergy(50)).toBe("A");
  });

  it("classifies 75 kWh/m2 as A (boundary)", () => {
    expect(classifyEnergy(75)).toBe("A");
  });

  it("classifies 100 kWh/m2 as B", () => {
    expect(classifyEnergy(100)).toBe("B");
  });

  it("classifies 130 kWh/m2 as C", () => {
    expect(classifyEnergy(130)).toBe("C");
  });

  it("classifies 160 kWh/m2 as D", () => {
    expect(classifyEnergy(160)).toBe("D");
  });

  it("classifies 190 kWh/m2 as E", () => {
    expect(classifyEnergy(190)).toBe("E");
  });

  it("classifies 240 kWh/m2 as F", () => {
    expect(classifyEnergy(240)).toBe("F");
  });

  it("classifies 300 kWh/m2 as G", () => {
    expect(classifyEnergy(300)).toBe("G");
  });
});

describe("estimateBaselineEnergy", () => {
  it("old buildings (pre-1960) have high consumption", () => {
    expect(estimateBaselineEnergy(1950)).toBe(280);
  });

  it("1980s buildings have moderate consumption", () => {
    expect(estimateBaselineEnergy(1985)).toBe(190);
  });

  it("modern buildings (2020s) have low consumption", () => {
    expect(estimateBaselineEnergy(2022)).toBe(80);
  });

  it("district heating reduces consumption", () => {
    const base = estimateBaselineEnergy(1985);
    const withKaukolampo = estimateBaselineEnergy(1985, "kaukolampo");
    expect(withKaukolampo).toBeLessThan(base);
  });

  it("oil heating increases consumption", () => {
    const base = estimateBaselineEnergy(1985);
    const withOil = estimateBaselineEnergy(1985, "oljy");
    expect(withOil).toBeGreaterThan(base);
  });

  it("ground source heat pump reduces significantly", () => {
    const base = estimateBaselineEnergy(1985);
    const withPump = estimateBaselineEnergy(1985, "maalampopumppu");
    expect(withPump).toBeLessThan(base * 0.7);
  });

  it("unknown heating type uses multiplier 1.0", () => {
    const base = estimateBaselineEnergy(1985);
    const withUnknown = estimateBaselineEnergy(1985, "unknown_type");
    expect(withUnknown).toBe(base);
  });
});

describe("estimateSavingsFromBom", () => {
  it("returns 0 for empty BOM", () => {
    expect(estimateSavingsFromBom([])).toBe(0);
  });

  it("detects insulation upgrade", () => {
    expect(estimateSavingsFromBom(["roof_insulation_50mm"])).toBe(15);
  });

  it("detects Finnish insulation term", () => {
    expect(estimateSavingsFromBom(["mineraalivilla_100"])).toBe(12);
  });

  it("detects window upgrade", () => {
    expect(estimateSavingsFromBom(["triple_window_kit"])).toBe(10);
  });

  it("detects heat pump", () => {
    expect(estimateSavingsFromBom(["heat_pump_unit"])).toBe(25);
  });

  it("stacks multiple upgrades", () => {
    const savings = estimateSavingsFromBom(["insulation_50", "window_triple", "led_fixture"]);
    expect(savings).toBe(15 + 10 + 3);
  });

  it("caps at 60%", () => {
    const savings = estimateSavingsFromBom([
      "insulation_100",
      "window_triple",
      "heat_pump_unit",
      "solar_panel",
      "led_light",
      "door_exterior",
    ]);
    expect(savings).toBe(60);
  });

  it("does not double-count same pattern", () => {
    const savings = estimateSavingsFromBom(["insulation_a", "insulation_b"]);
    expect(savings).toBe(15);
  });

  it("detects Finnish window term", () => {
    expect(estimateSavingsFromBom(["kolmilasi_ikkuna"])).toBe(10);
  });
});

describe("calculateEnergyClass", () => {
  it("returns before and after classes", () => {
    const result = calculateEnergyClass(
      { year_built: 1975 },
      [{ material_id: "insulation_50", quantity: 20, unit: "m2" }],
    );
    expect(result.before).toBeTruthy();
    expect(result.after).toBeTruthy();
  });

  it("after class is same or better than before", () => {
    const result = calculateEnergyClass(
      { year_built: 1975 },
      [{ material_id: "heat_pump_unit", quantity: 1, unit: "kpl" }],
    );
    const classes = "ABCDEFG";
    expect(classes.indexOf(result.after)).toBeLessThanOrEqual(classes.indexOf(result.before));
  });

  it("defaults to 1980 when year not provided", () => {
    const result = calculateEnergyClass({}, []);
    expect(result.kwhBefore).toBe(190);
  });

  it("returns 0 savings with no upgrades", () => {
    const result = calculateEnergyClass({ year_built: 2000 }, []);
    expect(result.savingsPercent).toBe(0);
    expect(result.kwhBefore).toBe(result.kwhAfter);
  });

  it("kwhAfter is less than kwhBefore with upgrades", () => {
    const result = calculateEnergyClass(
      { year_built: 1970 },
      [{ material_id: "insulation_wool", quantity: 50, unit: "m2" }],
    );
    expect(result.kwhAfter).toBeLessThan(result.kwhBefore);
  });
});
