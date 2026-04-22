import { describe, it, expect } from "vitest";
import {
  inferHeatingGrantTarget,
  hasFossilSourceHeating,
  detectHeatingGrantOpportunity,
} from "@/lib/heating-grant-context";

describe("inferHeatingGrantTarget", () => {
  it("returns null for empty text", () => {
    expect(inferHeatingGrantTarget("")).toEqual({ target: null, matchedTerms: [] });
  });

  it("returns null for undefined", () => {
    expect(inferHeatingGrantTarget(undefined)).toEqual({ target: null, matchedTerms: [] });
  });

  it("detects air water heat pump", () => {
    const result = inferHeatingGrantTarget("installing air water heat pump");
    expect(result.target).toBe("air_water_heat_pump");
  });

  it("detects AWHP abbreviation", () => {
    const result = inferHeatingGrantTarget("AWHP installation");
    expect(result.target).toBe("air_water_heat_pump");
  });

  it("detects ilmavesi (Finnish)", () => {
    const result = inferHeatingGrantTarget("ilma-vesi lämpöpumppu");
    expect(result.target).toBe("air_water_heat_pump");
  });

  it("detects ground source heat pump", () => {
    const result = inferHeatingGrantTarget("ground source heat pump system");
    expect(result.target).toBe("ground_source_heat_pump");
  });

  it("detects geothermal", () => {
    const result = inferHeatingGrantTarget("geothermal heating");
    expect(result.target).toBe("ground_source_heat_pump");
  });

  it("detects maalämpö (Finnish)", () => {
    const result = inferHeatingGrantTarget("maalämpö asennus");
    expect(result.target).toBe("ground_source_heat_pump");
  });

  it("detects district heat", () => {
    const result = inferHeatingGrantTarget("district heat connection");
    expect(result.target).toBe("district_heat");
  });

  it("detects kaukolämpö (Finnish)", () => {
    const result = inferHeatingGrantTarget("kaukolämpö liittymä");
    expect(result.target).toBe("district_heat");
  });

  it("detects generic heat pump as other non-fossil", () => {
    const result = inferHeatingGrantTarget("heat pump");
    expect(result.target).toBe("other_non_fossil");
  });

  it("detects pellet", () => {
    const result = inferHeatingGrantTarget("pellet boiler system");
    expect(result.target).toBe("other_non_fossil");
  });

  it("returns matched terms", () => {
    const result = inferHeatingGrantTarget("geothermal heating system");
    expect(result.matchedTerms.length).toBeGreaterThan(0);
  });

  it("returns null for unrelated text", () => {
    const result = inferHeatingGrantTarget("building a sauna with wood panels");
    expect(result.target).toBeNull();
  });
});

describe("hasFossilSourceHeating", () => {
  it("returns false for null", () => {
    expect(hasFossilSourceHeating(null)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(hasFossilSourceHeating("")).toBe(false);
  });

  it("detects oil heating", () => {
    expect(hasFossilSourceHeating("oil")).toBe(true);
  });

  it("detects gas heating", () => {
    expect(hasFossilSourceHeating("gas")).toBe(true);
  });

  it("detects natural gas", () => {
    expect(hasFossilSourceHeating("natural gas")).toBe(true);
  });

  it("detects maakaasu (Finnish for natural gas)", () => {
    expect(hasFossilSourceHeating("maakaasu")).toBe(true);
  });

  it("detects öljy (Finnish for oil)", () => {
    expect(hasFossilSourceHeating("öljy")).toBe(true);
  });

  it("returns false for electric", () => {
    expect(hasFossilSourceHeating("electric")).toBe(false);
  });

  it("returns false for heat pump", () => {
    expect(hasFossilSourceHeating("heat pump")).toBe(false);
  });
});

describe("detectHeatingGrantOpportunity", () => {
  it("returns shouldShow false for empty input", () => {
    const result = detectHeatingGrantOpportunity({});
    expect(result.shouldShow).toBe(false);
  });

  it("shows when scene mentions heat pump", () => {
    const result = detectHeatingGrantOpportunity({
      sceneJs: "// installing ground source heat pump",
    });
    expect(result.shouldShow).toBe(true);
    expect(result.triggeredByScene).toBe(true);
    expect(result.detectedTargetHeating).toBe("ground_source_heat_pump");
  });

  it("shows when buildingInfo has fossil heating", () => {
    const result = detectHeatingGrantOpportunity({
      buildingInfo: { heating: "oil" } as Parameters<typeof detectHeatingGrantOpportunity>[0]["buildingInfo"],
    });
    expect(result.shouldShow).toBe(true);
    expect(result.fossilSourceHeating).toBe(true);
  });

  it("does not show for unrelated scene", () => {
    const result = detectHeatingGrantOpportunity({
      sceneJs: "const wall = box(4, 2.8, 0.15);",
    });
    expect(result.shouldShow).toBe(false);
  });
});
