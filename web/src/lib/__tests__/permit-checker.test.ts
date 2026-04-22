import { describe, expect, it } from "vitest";
import { assessPermitNeed, inferPermitMunicipality } from "../permit-checker";

describe("permit checker rule engine", () => {
  it("detects Helsinki from project address", () => {
    const municipality = inferPermitMunicipality({ address: "Ribbingintie 109, 00890 Helsinki" });

    expect(municipality.id).toBe("helsinki");
    expect(municipality.municipalityNumber).toBe("091");
  });

  it("classifies load-bearing work as likely building permit", () => {
    const assessment = assessPermitNeed({
      categoryId: "load_bearing",
      answers: { loadBearing: true },
      buildingInfo: { address: "Hämeenkatu 1, Tampere" },
    });

    expect(assessment.outcome).toBe("building_permit");
    expect(assessment.confidence).toBe("high");
  });

  it("classifies ordinary interior surface work as likely permit-free", () => {
    const assessment = assessPermitNeed({
      categoryId: "interior_surface",
      answers: { detachedHouse: true },
      buildingInfo: { address: "Testitie 1, Espoo" },
    });

    expect(assessment.outcome).toBe("no_permit_likely");
    expect(assessment.severity).toBe("success");
  });

  it("routes facade material and insulation changes to municipal review", () => {
    const assessment = assessPermitNeed({
      categoryId: "facade",
      answers: { detachedHouse: true, changesExterior: true, facadeMaterialOrInsulation: true },
      buildingInfo: { address: "Mannerheimintie 1, Helsinki" },
    });

    expect(assessment.outcome).toBe("action_or_review");
    expect(assessment.reasons.map((reason) => reason.en).join(" ")).toContain("Facade material");
  });

  it("uses Helsinki-specific lighter wet-room path when no technical scope changes", () => {
    const assessment = assessPermitNeed({
      categoryId: "wet_room",
      answers: {},
      buildingInfo: { address: "Ulvilantie 2, 00350 Helsinki" },
    });

    expect(assessment.outcome).toBe("no_permit_likely");
    expect(assessment.reasons.map((reason) => reason.en).join(" ")).toContain("Helsinki");
  });

  it("turns protected or zoning-restricted projects into authority checks", () => {
    const assessment = assessPermitNeed({
      categoryId: "roof",
      answers: { protectedOrPlanRestricted: true, detachedHouse: true, changesExterior: true },
      buildingInfo: { address: "Vanha talo, Turku" },
    });

    expect(assessment.outcome).toBe("authority_check");
    expect(assessment.confidence).toBe("low");
  });

  it("classifies geothermal wells as action or municipal review", () => {
    const assessment = assessPermitNeed({
      categoryId: "energy_system",
      answers: { geothermalWell: true },
      buildingInfo: { address: "Kotikatu 5, Oulu" },
    });

    expect(assessment.outcome).toBe("action_or_review");
  });
});
