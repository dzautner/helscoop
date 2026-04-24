import { describe, expect, it } from "vitest";
import { calculateTaloyhtioCostModel, parseShareholderShareRows } from "../taloyhtio";
import type { BomItem } from "@/types";

describe("taloyhtio cost model", () => {
  it("multiplies per-unit BOM totals into a building total", () => {
    const bom = [
      { material_id: "pipe", quantity: 2, unit: "m", total: 150 },
      { material_id: "tile", quantity: 1, unit: "m2", unit_price: 50 },
    ] as BomItem[];

    const model = calculateTaloyhtioCostModel(bom, 24);

    expect(model.unitCount).toBe(24);
    expect(model.perUnitTotal).toBe(200);
    expect(model.buildingTotal).toBe(4800);
  });

  it("allocates building total by shareholder percentage", () => {
    const model = calculateTaloyhtioCostModel(
      [{ material_id: "pipe", quantity: 1, unit: "kpl", total: 1000 }] as BomItem[],
      10,
      [
        { apartment: "A1", share_pct: 12.5 },
        { apartment: "A2", share_pct: 7.5, owner_name: "Owner" },
      ],
    );

    expect(model.shares).toEqual([
      { apartment: "A1", owner_name: null, share_pct: 12.5, cost: 1250 },
      { apartment: "A2", owner_name: "Owner", share_pct: 7.5, cost: 750 },
    ]);
    expect(model.shareTotalPct).toBe(20);
    expect(model.shareDeltaPct).toBe(80);
  });

  it("parses paste-friendly shareholder rows", () => {
    expect(parseShareholderShareRows("A1, 12.5, Smith\nB2; 7.5")).toEqual([
      { apartment: "A1", share_pct: 12.5, owner_name: "Smith" },
      { apartment: "B2", share_pct: 7.5, owner_name: null },
    ]);
  });
});
