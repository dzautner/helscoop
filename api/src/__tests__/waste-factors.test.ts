import { describe, it, expect } from "vitest";
import {
  WASTE_FACTORS,
  DEFAULT_WASTE_FACTOR,
  CONTAINER_SIZES,
  SORTING_GUIDE,
  recommendContainer,
  type WasteType,
} from "../waste-factors";

describe("WASTE_FACTORS data", () => {
  const categories = Object.keys(WASTE_FACTORS);

  it("has at least 8 material categories", () => {
    expect(categories.length).toBeGreaterThanOrEqual(8);
  });

  it.each(categories)("%s has positive kgPerUnit", (cat) => {
    expect(WASTE_FACTORS[cat].kgPerUnit).toBeGreaterThan(0);
  });

  it.each(categories)("%s has recycling rate between 0 and 1", (cat) => {
    const rate = WASTE_FACTORS[cat].recyclingRate;
    expect(rate).toBeGreaterThanOrEqual(0);
    expect(rate).toBeLessThanOrEqual(1);
  });

  it.each(categories)("%s has non-negative disposal cost", (cat) => {
    expect(WASTE_FACTORS[cat].disposalCostPerTonne).toBeGreaterThanOrEqual(0);
  });

  it.each(categories)("%s has positive volumePerKg", (cat) => {
    expect(WASTE_FACTORS[cat].volumePerKg).toBeGreaterThan(0);
  });

  it("paint is classified as hazardous waste", () => {
    expect(WASTE_FACTORS["paint"].wasteType).toBe("vaarallinen_jate");
    expect(WASTE_FACTORS["paint"].recyclingRate).toBe(0);
  });

  it("metal roofing has highest recycling rate", () => {
    expect(WASTE_FACTORS["roofing"].recyclingRate).toBe(0.95);
  });

  it("fasteners have highest recycling rate", () => {
    expect(WASTE_FACTORS["fasteners"].recyclingRate).toBe(0.98);
  });

  it("clean wood and metal have zero disposal cost", () => {
    expect(WASTE_FACTORS["lumber"].disposalCostPerTonne).toBe(0);
    expect(WASTE_FACTORS["roofing"].disposalCostPerTonne).toBe(0);
    expect(WASTE_FACTORS["fasteners"].disposalCostPerTonne).toBe(0);
  });

  it("plumbing has secondary waste type", () => {
    expect(WASTE_FACTORS["plumbing"].secondaryWasteType).toBe("muovijate");
  });

  it("electrical has secondary hazardous waste type", () => {
    expect(WASTE_FACTORS["electrical"].secondaryWasteType).toBe("vaarallinen_jate");
  });
});

describe("DEFAULT_WASTE_FACTOR", () => {
  it("is classified as mixed waste", () => {
    expect(DEFAULT_WASTE_FACTOR.wasteType).toBe("sekajate");
  });

  it("has conservative 30% recycling rate", () => {
    expect(DEFAULT_WASTE_FACTOR.recyclingRate).toBe(0.3);
  });

  it("has 150 EUR/tonne disposal cost", () => {
    expect(DEFAULT_WASTE_FACTOR.disposalCostPerTonne).toBe(150);
  });
});

describe("CONTAINER_SIZES", () => {
  it("has 3 sizes in ascending order", () => {
    expect(CONTAINER_SIZES).toHaveLength(3);
    for (let i = 1; i < CONTAINER_SIZES.length; i++) {
      expect(CONTAINER_SIZES[i].sizeM3).toBeGreaterThan(CONTAINER_SIZES[i - 1].sizeM3);
    }
  });

  it("costs increase with size", () => {
    for (let i = 1; i < CONTAINER_SIZES.length; i++) {
      expect(CONTAINER_SIZES[i].costEur).toBeGreaterThan(CONTAINER_SIZES[i - 1].costEur);
    }
  });

  it("max load increases with size", () => {
    for (let i = 1; i < CONTAINER_SIZES.length; i++) {
      expect(CONTAINER_SIZES[i].maxLoadKg).toBeGreaterThan(CONTAINER_SIZES[i - 1].maxLoadKg);
    }
  });

  it("all sizes have bilingual labels", () => {
    for (const size of CONTAINER_SIZES) {
      expect(size.label.length).toBeGreaterThan(0);
      expect(size.labelFi.length).toBeGreaterThan(0);
    }
  });
});

describe("recommendContainer", () => {
  it("recommends smallest container for small jobs", () => {
    const result = recommendContainer(2, 1000);
    expect(result.size.sizeM3).toBe(4);
    expect(result.count).toBe(1);
  });

  it("recommends 2x4m3 for medium volume that fits in <= 2 small skips", () => {
    const result = recommendContainer(5, 2000);
    expect(result.size.sizeM3).toBe(4);
    expect(result.count).toBe(2);
  });

  it("recommends 2x6m3 for 9m3 volume (fits in <= 2 containers)", () => {
    const result = recommendContainer(9, 5000);
    expect(result.size.sizeM3).toBe(6);
    expect(result.count).toBe(2);
  });

  it("uses multiple containers when volume exceeds single", () => {
    const result = recommendContainer(7, 2000);
    expect(result.size.sizeM3).toBe(4);
    expect(result.count).toBe(2);
    expect(result.totalCost).toBe(500);
  });

  it("considers weight limit for heavy materials", () => {
    const result = recommendContainer(3, 7000);
    expect(result.size.sizeM3).toBe(6);
    expect(result.count).toBe(2);
  });

  it("falls back to largest for very large jobs", () => {
    const result = recommendContainer(50, 20000);
    expect(result.size.sizeM3).toBe(10);
    expect(result.count).toBeGreaterThan(2);
    expect(result.totalCost).toBe(result.count * 500);
  });

  it("returns at least 1 container", () => {
    const result = recommendContainer(0.1, 1);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("weight-limited result uses correct count", () => {
    const result = recommendContainer(1, 9000);
    expect(result.size.sizeM3).toBe(6);
    expect(result.count).toBe(2);
  });
});

describe("SORTING_GUIDE", () => {
  const allWasteTypes: WasteType[] = [
    "puujate", "metallijate", "kivijate", "sekajate",
    "vaarallinen_jate", "muovijate", "lasijate", "eristejate",
  ];

  it("covers all 8 waste types", () => {
    const coveredTypes = SORTING_GUIDE.map((e) => e.wasteType);
    for (const wt of allWasteTypes) {
      expect(coveredTypes).toContain(wt);
    }
  });

  it("has bilingual instructions for each entry", () => {
    for (const entry of SORTING_GUIDE) {
      expect(entry.sortingInstruction_fi.length).toBeGreaterThan(0);
      expect(entry.sortingInstruction_en.length).toBeGreaterThan(0);
    }
  });

  it("has acceptedAt location for each entry", () => {
    for (const entry of SORTING_GUIDE) {
      expect(entry.acceptedAt.length).toBeGreaterThan(0);
    }
  });

  it("hazardous waste mentions separate collection", () => {
    const hazardous = SORTING_GUIDE.find((e) => e.wasteType === "vaarallinen_jate")!;
    expect(hazardous.sortingInstruction_en.toLowerCase()).toContain("separate");
  });
});
