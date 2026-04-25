import { beforeEach, describe, expect, it } from "vitest";
import {
  buildRyhtiPermitPackage,
  sanitizePermitMetadata,
  submitRyhtiPackage,
  validateRyhtiPackage,
} from "../ryhti-client";

const project = {
  id: "project-1",
  name: "Pihasauna",
  description: "Build a small backyard sauna",
  scene_js: "const floor = box(4, 0.2, 3);\nscene.add(floor, { material: \"foundation\" });",
  building_info: {
    address: "Testikatu 1",
    area_m2: 24,
    floors: 1,
    municipalityNumber: "091",
    permanentBuildingIdentifier: "103456789A",
  },
};

const bom = [
  {
    material_id: "pine_48x148_c24",
    material_name: "Pine C24",
    category_name: "Lumber",
    quantity: 20,
    unit: "jm",
  },
];

const validIfc =
  "ISO-10303-21;\nDATA;\n#1=IFCPROJECT('p');\n#2=IFCSITE('site');\n#3=IFCBUILDING('building');\nENDSEC;\nEND-ISO-10303-21;";

beforeEach(() => {
  delete process.env.RYHTI_SUBMISSION_MODE;
  delete process.env.RYHTI_API_BASE_URL;
  delete process.env.RYHTI_ACCESS_TOKEN;
  delete process.env.RYHTI_CLIENT_ID;
  delete process.env.RYHTI_CLIENT_SECRET;
});

describe("sanitizePermitMetadata", () => {
  it("keeps only allowed Ryhti metadata fields and coerces primitives", () => {
    const metadata = sanitizePermitMetadata({
      municipalityNumber: "091",
      descriptionOfAction: "  Renovate sauna  ",
      grossAreaM2: "42.5",
      suomiFiAuthenticated: "true",
      personalIdentityCode: "010101-123A",
    });

    expect(metadata).toEqual({
      municipalityNumber: "091",
      descriptionOfAction: "Renovate sauna",
      grossAreaM2: 42.5,
      suomiFiAuthenticated: true,
    });
    expect(metadata).not.toHaveProperty("personalIdentityCode");
  });
});

describe("buildRyhtiPermitPackage", () => {
  it("maps project, BOM, IFC summary, and metadata into the Ryhti package shape", () => {
    const pkg = buildRyhtiPermitPackage({
      project,
      bom,
      permitMetadata: {
        propertyIdentifier: "91-1-2-3",
        descriptionOfAction: "Renovate backyard sauna structure",
        suomiFiAuthenticated: true,
      },
      ifcContent: validIfc,
      generatedAt: "2026-04-21T09:00:00.000Z",
    });

    expect(pkg.schema.title).toBe("Ryhti API");
    expect(pkg.dateOfInitiation).toBe("2026-04-21");
    expect(pkg.municipalityNumber).toBe("091");
    expect(pkg.buildingSite.propertyIdentifier).toBe("91-1-2-3");
    expect(pkg.constructionAction.targetBuilding.permanentBuildingIdentifier).toBe("103456789A");
    expect(pkg.materialData[0].materialId).toBe("pine_48x148_c24");
    expect(pkg.attachments[0]).toMatchObject({
      type: "IFC4_DESIGN_MODEL",
      contentType: "application/x-step",
    });
    expect(pkg.attachments[0].sha256).toHaveLength(64);
  });
});

describe("validateRyhtiPackage", () => {
  it("blocks incomplete packages with actionable validation errors", () => {
    const pkg = buildRyhtiPermitPackage({
      project: { ...project, building_info: {} },
      bom: [],
      permitMetadata: {},
      ifcContent: "",
    });

    const validation = validateRyhtiPackage(pkg);

    expect(validation.ready).toBe(false);
    expect(validation.summary.errors).toBeGreaterThan(0);
    expect(validation.issues.map((issue) => issue.code)).toContain("invalid_municipality_number");
    expect(validation.issues.map((issue) => issue.code)).toContain("missing_ifc_model");
    expect(validation.issues.every((issue) => issue.action.length > 0)).toBe(true);
  });

  it("allows dry-run authority handoff when required homeowner fields are complete", () => {
    const pkg = buildRyhtiPermitPackage({
      project,
      bom,
      permitMetadata: {
        municipalityNumber: "091",
        propertyIdentifier: "91-1-2-3",
        descriptionOfAction: "Renovate backyard sauna structure",
        suomiFiAuthenticated: true,
      },
      ifcContent: validIfc,
    });

    const validation = validateRyhtiPackage(pkg);

    expect(validation.ready).toBe(true);
    expect(validation.mode).toBe("dry_run");
    expect(validation.remoteConfigured).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain("dry_run_authority_handoff");
  });

  it("requires permanent permit identifier in live mode", () => {
    process.env.RYHTI_SUBMISSION_MODE = "live";
    process.env.RYHTI_API_BASE_URL = "https://ryhti.example.test/building";
    process.env.RYHTI_ACCESS_TOKEN = "token";

    const pkg = buildRyhtiPermitPackage({
      project,
      bom,
      permitMetadata: {
        municipalityNumber: "091",
        propertyIdentifier: "91-1-2-3",
        descriptionOfAction: "Renovate backyard sauna structure",
        suomiFiAuthenticated: true,
      },
      ifcContent: validIfc,
    });

    const validation = validateRyhtiPackage(pkg);

    expect(validation.ready).toBe(false);
    expect(validation.remoteConfigured).toBe(true);
    expect(validation.issues.map((issue) => issue.code)).toContain("missing_permanent_permit_identifier");
  });
});

describe("submitRyhtiPackage", () => {
  it("creates a deterministic trackable dry-run submission package", async () => {
    const pkg = buildRyhtiPermitPackage({
      project,
      bom,
      permitMetadata: {
        municipalityNumber: "091",
        propertyIdentifier: "91-1-2-3",
        descriptionOfAction: "Renovate backyard sauna structure",
        suomiFiAuthenticated: true,
      },
      ifcContent: validIfc,
      generatedAt: "2026-04-21T09:00:00.000Z",
    });
    const validation = validateRyhtiPackage(pkg);

    const result = await submitRyhtiPackage(pkg, validation);

    expect(result.mode).toBe("dry_run");
    expect(result.status).toBe("ready_for_authority");
    expect(result.trackingId).toMatch(/^dry-ryhti-/);
    expect(result.remoteConfigured).toBe(false);
  });
});
