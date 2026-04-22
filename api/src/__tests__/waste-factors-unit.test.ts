import { describe, it, expect } from "vitest";
import {
  WASTE_FACTORS,
  DEFAULT_WASTE_FACTOR,
  CONTAINER_SIZES,
  SORTING_GUIDE,
  recommendContainer,
} from "../waste-factors";

describe("WASTE_FACTORS", () => {
  it("has entries for common categories", () => {
    expect(WASTE_FACTORS.lumber).toBeDefined();
    expect(WASTE_FACTORS.panels).toBeDefined();
    expect(WASTE_FACTORS.insulation).toBeDefined();
    expect(WASTE_FACTORS.roofing).toBeDefined();
    expect(WASTE_FACTORS.foundation).toBeDefined();
    expect(WASTE_FACTORS.fasteners).toBeDefined();
    expect(WASTE_FACTORS.plumbing).toBeDefined();
    expect(WASTE_FACTORS.electrical).toBeDefined();
    expect(WASTE_FACTORS.windows).toBeDefined();
    expect(WASTE_FACTORS.paint).toBeDefined();
  });

  it("lumber waste is free at Sortti", () => {
    expect(WASTE_FACTORS.lumber.disposalCostPerTonne).toBe(0);
  });

  it("metal roofing is highly recyclable", () => {
    expect(WASTE_FACTORS.roofing.recyclingRate).toBeGreaterThan(0.9);
  });

  it("paint is hazardous waste", () => {
    expect(WASTE_FACTORS.paint.wasteType).toBe("vaarallinen_jate");
    expect(WASTE_FACTORS.paint.recyclingRate).toBe(0);
  });

  it("electrical has secondary hazardous waste type", () => {
    expect(WASTE_FACTORS.electrical.secondaryWasteType).toBe("vaarallinen_jate");
  });

  it("all factors have positive kgPerUnit", () => {
    for (const [, factor] of Object.entries(WASTE_FACTORS)) {
      expect(factor.kgPerUnit).toBeGreaterThan(0);
    }
  });

  it("all recycling rates are between 0 and 1", () => {
    for (const [, factor] of Object.entries(WASTE_FACTORS)) {
      expect(factor.recyclingRate).toBeGreaterThanOrEqual(0);
      expect(factor.recyclingRate).toBeLessThanOrEqual(1);
    }
  });
});

describe("DEFAULT_WASTE_FACTOR", () => {
  it("is classified as mixed waste", () => {
    expect(DEFAULT_WASTE_FACTOR.wasteType).toBe("sekajate");
  });

  it("has conservative recycling rate", () => {
    expect(DEFAULT_WASTE_FACTOR.recyclingRate).toBe(0.3);
  });
});

describe("CONTAINER_SIZES", () => {
  it("has 3 sizes", () => {
    expect(CONTAINER_SIZES.length).toBe(3);
  });

  it("sizes are in ascending order", () => {
    for (let i = 1; i < CONTAINER_SIZES.length; i++) {
      expect(CONTAINER_SIZES[i].sizeM3).toBeGreaterThan(CONTAINER_SIZES[i - 1].sizeM3);
    }
  });

  it("costs increase with size", () => {
    for (let i = 1; i < CONTAINER_SIZES.length; i++) {
      expect(CONTAINER_SIZES[i].costEur).toBeGreaterThan(CONTAINER_SIZES[i - 1].costEur);
    }
  });

  it("has Finnish labels", () => {
    for (const size of CONTAINER_SIZES) {
      expect(size.labelFi).toContain("vaihtolavat");
    }
  });
});

describe("recommendContainer", () => {
  it("recommends smallest container for small waste", () => {
    const result = recommendContainer(2, 1000);
    expect(result.size.sizeM3).toBe(4);
    expect(result.count).toBe(1);
  });

  it("recommends container that fits volume in 1-2 units", () => {
    const result = recommendContainer(5, 2000);
    expect(result.size.sizeM3 * result.count).toBeGreaterThanOrEqual(5);
    expect(result.count).toBeLessThanOrEqual(2);
  });

  it("recommends multiple containers for large waste", () => {
    const result = recommendContainer(25, 5000);
    expect(result.count).toBeGreaterThan(1);
  });

  it("considers weight limit", () => {
    const result = recommendContainer(3, 7000);
    expect(result.size.sizeM3).toBeGreaterThanOrEqual(6);
  });

  it("total cost is count * unit cost", () => {
    const result = recommendContainer(3, 1000);
    expect(result.totalCost).toBe(result.size.costEur * result.count);
  });

  it("always returns at least 1 container", () => {
    const result = recommendContainer(0.1, 10);
    expect(result.count).toBeGreaterThanOrEqual(1);
  });

  it("falls back to largest for very large waste", () => {
    const result = recommendContainer(100, 50000);
    expect(result.size.sizeM3).toBe(10);
    expect(result.count).toBeGreaterThan(2);
  });
});

describe("SORTING_GUIDE", () => {
  it("has entries for all waste types", () => {
    const types = SORTING_GUIDE.map((e) => e.wasteType);
    expect(types).toContain("puujate");
    expect(types).toContain("metallijate");
    expect(types).toContain("kivijate");
    expect(types).toContain("sekajate");
    expect(types).toContain("vaarallinen_jate");
    expect(types).toContain("muovijate");
    expect(types).toContain("lasijate");
    expect(types).toContain("eristejate");
  });

  it("has Finnish and English instructions for each", () => {
    for (const entry of SORTING_GUIDE) {
      expect(entry.sortingInstruction_fi.length).toBeGreaterThan(0);
      expect(entry.sortingInstruction_en.length).toBeGreaterThan(0);
    }
  });

  it("has accepted location for each entry", () => {
    for (const entry of SORTING_GUIDE) {
      expect(entry.acceptedAt.length).toBeGreaterThan(0);
    }
  });
});
