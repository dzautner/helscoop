import crypto from "crypto";
import { IFC_SCHEMA, IFC_VIEW_DEFINITION } from "./ifc-generator";

export type RyhtiSubmissionMode = "dry_run" | "live";
export type RyhtiSubmissionStatus =
  | "draft"
  | "ready_for_authority"
  | "submitted"
  | "accepted"
  | "rejected"
  | "failed";

export interface RyhtiPermitMetadata {
  permanentPermitIdentifier?: string;
  permanentBuildingIdentifier?: string;
  municipalityNumber?: string;
  propertyIdentifier?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  descriptionOfAction?: string;
  constructionActionType?: string;
  buildingPermitApplicationType?: string;
  permitApplicationType?: string;
  grossAreaM2?: number;
  floorAreaM2?: number;
  volumeM3?: number;
  floors?: number;
  energyClass?: string;
  suomiFiAuthenticated?: boolean;
  authorityPartner?: string;
  authorityCaseId?: string;
  siteOwnerConsent?: boolean;
  applicantRole?: string;
}

export interface RyhtiProjectInput {
  id: string;
  name: string;
  description?: string | null;
  scene_js?: string | null;
  building_info?: unknown;
}

export interface RyhtiBomInput {
  material_id: string;
  material_name?: string | null;
  category_name?: string | null;
  quantity: number;
  unit: string;
}

export interface RyhtiAttachmentSummary {
  type: "IFC4_DESIGN_MODEL";
  fileName: string;
  contentType: "application/x-step";
  ifcSchema: typeof IFC_SCHEMA;
  viewDefinition: typeof IFC_VIEW_DEFINITION;
  byteLength: number;
  sha256: string;
}

export interface RyhtiPermitPackage {
  schema: {
    title: "Ryhti API";
    version: "1";
    officialSpec: string;
    generatedBy: "Helscoop";
    generatedAt: string;
  };
  permanentPermitIdentifier: string | null;
  dateOfInitiation: string;
  lifeCycleState: "application-draft";
  municipalityNumber: string | null;
  decision: null;
  buildingPermitApplication: {
    applicationType: string;
    permitApplicationType: string;
    description: string;
    applicantRole: string;
    suomiFiAuthentication: {
      provider: "suomi.fi";
      status: "confirmed" | "required_outside_helscoop";
    };
    authorityPartner: string | null;
    authorityCaseId: string | null;
    siteOwnerConsent: boolean;
  };
  constructionAction: {
    actionType: string;
    description: string;
    targetBuilding: {
      permanentBuildingIdentifier: string | null;
      grossAreaM2: number | null;
      floorAreaM2: number | null;
      volumeM3: number | null;
      floors: number | null;
      energyClass: string | null;
    };
  };
  buildingSite: {
    propertyIdentifier: string | null;
    address: string | null;
    postalCode: string | null;
    city: string | null;
    municipalityNumber: string | null;
    coordinate: { latitude: number; longitude: number } | null;
  };
  materialData: Array<{
    materialId: string;
    materialName: string;
    categoryName: string | null;
    quantity: number;
    unit: string;
  }>;
  attachments: RyhtiAttachmentSummary[];
  helscoop: {
    projectId: string;
    projectName: string;
    packageKind: "ryhti-building-permit-pre-submission";
    issue: 105;
    note: string;
  };
}

export interface RyhtiValidationIssue {
  level: "error" | "warning" | "info";
  code: string;
  field?: string;
  message: string;
  action: string;
}

export interface RyhtiValidationResult {
  ready: boolean;
  generatedAt: string;
  mode: RyhtiSubmissionMode;
  remoteConfigured: boolean;
  issues: RyhtiValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
    info: number;
  };
}

export interface RyhtiSubmissionResult {
  mode: RyhtiSubmissionMode;
  status: RyhtiSubmissionStatus;
  trackingId: string;
  remoteConfigured: boolean;
  remoteResponse?: unknown;
  error?: string;
}

const OFFICIAL_RYHTI_OPENAPI =
  "https://github.com/sykefi/Ryhti-rajapintakuvaukset/blob/main/OpenApi/Rakentaminen/Palveluv%C3%A4yl%C3%A4/buildingService-OpenApi.json";

function cleanString(value: unknown, maxLength = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.slice(0, maxLength);
}

function cleanNumber(value: unknown, min?: number, max?: number): number | undefined {
  const num = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(num)) return undefined;
  if (min !== undefined && num < min) return undefined;
  if (max !== undefined && num > max) return undefined;
  return num;
}

function cleanBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function sanitizePermitMetadata(input: unknown): RyhtiPermitMetadata {
  const src = parseJsonObject(input);
  const metadata: RyhtiPermitMetadata = {};

  const stringFields: Array<keyof RyhtiPermitMetadata> = [
    "permanentPermitIdentifier",
    "permanentBuildingIdentifier",
    "municipalityNumber",
    "propertyIdentifier",
    "address",
    "postalCode",
    "city",
    "descriptionOfAction",
    "constructionActionType",
    "buildingPermitApplicationType",
    "permitApplicationType",
    "energyClass",
    "authorityPartner",
    "authorityCaseId",
    "applicantRole",
  ];

  for (const field of stringFields) {
    const cleaned = cleanString(src[field], field === "descriptionOfAction" ? 1200 : 120);
    if (cleaned) {
      (metadata as Record<string, unknown>)[field] = cleaned;
    }
  }

  const numericFields: Array<[keyof RyhtiPermitMetadata, number | undefined, number | undefined]> = [
    ["latitude", -90, 90],
    ["longitude", -180, 180],
    ["grossAreaM2", 0, undefined],
    ["floorAreaM2", 0, undefined],
    ["volumeM3", 0, undefined],
    ["floors", 0, undefined],
  ];

  for (const [field, min, max] of numericFields) {
    const cleaned = cleanNumber(src[field], min, max);
    if (cleaned !== undefined) {
      (metadata as Record<string, unknown>)[field] = cleaned;
    }
  }

  for (const field of ["suomiFiAuthenticated", "siteOwnerConsent"] as const) {
    const cleaned = cleanBoolean(src[field]);
    if (cleaned !== undefined) metadata[field] = cleaned;
  }

  return metadata;
}

export function normalizeBuildingInfo(input: unknown): Record<string, unknown> {
  const info = parseJsonObject(input);
  const coordinates = parseJsonObject(info.coordinates);
  const normalized: Record<string, unknown> = {
    address: info.address ?? info.osoite,
    buildingType: info.buildingType ?? info.type ?? info.kayttotarkoitus,
    yearBuilt: info.yearBuilt ?? info.year_built ?? info.valmistumisvuosi,
    floorAreaM2: info.area_m2 ?? info.area ?? info.kerrosala,
    floors: info.floors ?? info.kerrosluku,
    energyClass: info.energy_class ?? info.energyClass,
    city: info.city ?? info.kunta,
    postalCode: info.postal_code ?? info.postalCode,
    municipalityNumber: info.municipality_number ?? info.municipalityNumber ?? info.municipality_code ?? info.kuntanumero,
    propertyIdentifier: info.property_identifier ?? info.propertyIdentifier ?? info.property_id ?? info.kiinteistotunnus,
    permanentBuildingIdentifier:
      info.permanent_building_identifier ??
      info.permanentBuildingIdentifier ??
      info.permanent_building_id ??
      info.building_id ??
      info.rakennustunnus,
    latitude: info.latitude ?? coordinates.lat ?? coordinates.latitude,
    longitude: info.longitude ?? coordinates.lon ?? coordinates.longitude,
  };

  return Object.fromEntries(
    Object.entries(normalized).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }
  return undefined;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const cleaned = cleanNumber(value, 0);
    if (cleaned !== undefined) return cleaned;
  }
  return undefined;
}

function getRyhtiRuntime(): { mode: RyhtiSubmissionMode; remoteConfigured: boolean; baseUrl: string | null } {
  const mode: RyhtiSubmissionMode = process.env.RYHTI_SUBMISSION_MODE === "live" ? "live" : "dry_run";
  const baseUrl = cleanString(process.env.RYHTI_API_BASE_URL, 300) ?? null;
  const hasStaticToken = !!cleanString(process.env.RYHTI_ACCESS_TOKEN, 2000);
  const hasClientCredentials =
    !!cleanString(process.env.RYHTI_CLIENT_ID, 200) && !!cleanString(process.env.RYHTI_CLIENT_SECRET, 2000);
  return {
    mode,
    baseUrl,
    remoteConfigured: mode === "live" && !!baseUrl && (hasStaticToken || hasClientCredentials),
  };
}

export function isRyhtiRemoteConfigured(): boolean {
  return getRyhtiRuntime().remoteConfigured;
}

export function buildRyhtiPermitPackage(input: {
  project: RyhtiProjectInput;
  bom: RyhtiBomInput[];
  permitMetadata?: unknown;
  ifcContent?: string;
  generatedAt?: string;
}): RyhtiPermitPackage {
  const metadata = sanitizePermitMetadata(input.permitMetadata ?? {});
  const buildingInfo = normalizeBuildingInfo(input.project.building_info);
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const description =
    firstString(metadata.descriptionOfAction, input.project.description, input.project.name) ?? "Helscoop renovation plan";
  const municipalityNumber = firstString(metadata.municipalityNumber, buildingInfo.municipalityNumber) ?? null;
  const ifcContent = input.ifcContent ?? "";
  const safeName = (input.project.name || "project").replace(/[^a-zA-Z0-9_-]/g, "_");
  const attachments: RyhtiAttachmentSummary[] = ifcContent
    ? [{
        type: "IFC4_DESIGN_MODEL",
        fileName: `${safeName}.ifc`,
        contentType: "application/x-step",
        ifcSchema: IFC_SCHEMA,
        viewDefinition: IFC_VIEW_DEFINITION,
        byteLength: Buffer.byteLength(ifcContent, "utf8"),
        sha256: crypto.createHash("sha256").update(ifcContent).digest("hex"),
      }]
    : [];

  const latitude = cleanNumber(metadata.latitude ?? buildingInfo.latitude, -90, 90);
  const longitude = cleanNumber(metadata.longitude ?? buildingInfo.longitude, -180, 180);

  return {
    schema: {
      title: "Ryhti API",
      version: "1",
      officialSpec: OFFICIAL_RYHTI_OPENAPI,
      generatedBy: "Helscoop",
      generatedAt,
    },
    permanentPermitIdentifier: firstString(metadata.permanentPermitIdentifier) ?? null,
    dateOfInitiation: generatedAt.slice(0, 10),
    lifeCycleState: "application-draft",
    municipalityNumber,
    decision: null,
    buildingPermitApplication: {
      applicationType: metadata.buildingPermitApplicationType ?? "building-permit",
      permitApplicationType: metadata.permitApplicationType ?? "homeowner-renovation",
      description,
      applicantRole: metadata.applicantRole ?? "property-owner",
      suomiFiAuthentication: {
        provider: "suomi.fi",
        status: metadata.suomiFiAuthenticated ? "confirmed" : "required_outside_helscoop",
      },
      authorityPartner: metadata.authorityPartner ?? null,
      authorityCaseId: metadata.authorityCaseId ?? null,
      siteOwnerConsent: metadata.siteOwnerConsent ?? false,
    },
    constructionAction: {
      actionType: metadata.constructionActionType ?? "renovation",
      description,
      targetBuilding: {
        permanentBuildingIdentifier:
          firstString(metadata.permanentBuildingIdentifier, buildingInfo.permanentBuildingIdentifier) ?? null,
        grossAreaM2: firstNumber(metadata.grossAreaM2, buildingInfo.floorAreaM2) ?? null,
        floorAreaM2: firstNumber(metadata.floorAreaM2, buildingInfo.floorAreaM2) ?? null,
        volumeM3: firstNumber(metadata.volumeM3) ?? null,
        floors: firstNumber(metadata.floors, buildingInfo.floors) ?? null,
        energyClass: firstString(metadata.energyClass, buildingInfo.energyClass) ?? null,
      },
    },
    buildingSite: {
      propertyIdentifier: firstString(metadata.propertyIdentifier, buildingInfo.propertyIdentifier) ?? null,
      address: firstString(metadata.address, buildingInfo.address) ?? null,
      postalCode: firstString(metadata.postalCode, buildingInfo.postalCode) ?? null,
      city: firstString(metadata.city, buildingInfo.city) ?? null,
      municipalityNumber,
      coordinate: latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null,
    },
    materialData: input.bom.map((item) => ({
      materialId: item.material_id,
      materialName: item.material_name ?? item.material_id,
      categoryName: item.category_name ?? null,
      quantity: Number(item.quantity),
      unit: item.unit,
    })),
    attachments,
    helscoop: {
      projectId: input.project.id,
      projectName: input.project.name,
      packageKind: "ryhti-building-permit-pre-submission",
      issue: 105,
      note: "Default mode creates a validated package for municipal authority/Suomi.fi handoff. Live Ryhti submission requires official credentials.",
    },
  };
}

export function validateRyhtiPackage(
  pkg: RyhtiPermitPackage,
  options: { requirePermanentPermitIdentifier?: boolean } = {},
): RyhtiValidationResult {
  const runtime = getRyhtiRuntime();
  const requirePermanentPermitIdentifier =
    options.requirePermanentPermitIdentifier ?? runtime.remoteConfigured;
  const issues: RyhtiValidationIssue[] = [];

  const add = (issue: RyhtiValidationIssue) => issues.push(issue);

  if (requirePermanentPermitIdentifier && !pkg.permanentPermitIdentifier) {
    add({
      level: "error",
      code: "missing_permanent_permit_identifier",
      field: "permanentPermitIdentifier",
      message: "Live Ryhti submission requires a permanent building permit identifier.",
      action: "Get or enter the Ryhti permanent permit identifier before live submission.",
    });
  } else if (!pkg.permanentPermitIdentifier) {
    add({
      level: "warning",
      code: "permit_identifier_authority_supplied",
      field: "permanentPermitIdentifier",
      message: "No permanent permit identifier is present yet.",
      action: "The municipality or live Ryhti integration must supply this before official submission.",
    });
  }

  if (!pkg.municipalityNumber || !/^\d{3}$/.test(pkg.municipalityNumber)) {
    add({
      level: "error",
      code: "invalid_municipality_number",
      field: "municipalityNumber",
      message: "Municipality number must be a three-digit Finnish municipality code.",
      action: "Enter the municipality code for the building site.",
    });
  }

  if (!pkg.buildingSite.propertyIdentifier && !pkg.buildingSite.address) {
    add({
      level: "error",
      code: "missing_building_site",
      field: "buildingSite",
      message: "Ryhti package needs a property identifier or address.",
      action: "Add the property identifier or verify the project address.",
    });
  }

  if (pkg.buildingPermitApplication.description.length < 10) {
    add({
      level: "error",
      code: "missing_action_description",
      field: "descriptionOfAction",
      message: "Permit action description is too short.",
      action: "Describe the planned renovation in at least 10 characters.",
    });
  }

  if (!pkg.constructionAction.actionType) {
    add({
      level: "error",
      code: "missing_construction_action",
      field: "constructionActionType",
      message: "Construction action type is missing.",
      action: "Classify the work, for example renovation, extension, or new-building.",
    });
  }

  if (pkg.attachments.length === 0 || pkg.attachments[0].byteLength < 100) {
    add({
      level: "error",
      code: "missing_ifc_model",
      field: "attachments",
      message: "Ryhti package needs a generated IFC4x3 design model.",
      action: "Generate the project's IFC model before creating the Ryhti package.",
    });
  }

  if (
    pkg.buildingPermitApplication.suomiFiAuthentication.status !== "confirmed" &&
    !pkg.buildingPermitApplication.authorityPartner
  ) {
    add({
      level: "error",
      code: "missing_strong_identification",
      field: "suomiFiAuthenticated",
      message: "Homeowner identity or authority partner handoff is not confirmed.",
      action: "Confirm Suomi.fi identification or select the authority partner handling the submission.",
    });
  }

  if (!pkg.constructionAction.targetBuilding.permanentBuildingIdentifier) {
    add({
      level: "warning",
      code: "missing_building_identifier",
      field: "permanentBuildingIdentifier",
      message: "Permanent building identifier is missing.",
      action: "Add rakennustunnus when available from DVV/Ryhti, especially for existing buildings.",
    });
  }

  if (pkg.materialData.length === 0) {
    add({
      level: "warning",
      code: "missing_material_data",
      field: "materialData",
      message: "No BOM material rows are included.",
      action: "Add materials so the package can include product/material data for review.",
    });
  }

  if (!runtime.remoteConfigured) {
    add({
      level: "info",
      code: "dry_run_authority_handoff",
      message: "Ryhti live credentials are not configured, so submission creates a trackable authority-handoff package.",
      action: "Set RYHTI_SUBMISSION_MODE=live with official Ryhti credentials when available.",
    });
  }

  const summary = {
    errors: issues.filter((issue) => issue.level === "error").length,
    warnings: issues.filter((issue) => issue.level === "warning").length,
    info: issues.filter((issue) => issue.level === "info").length,
  };

  return {
    ready: summary.errors === 0,
    generatedAt: new Date().toISOString(),
    mode: runtime.mode,
    remoteConfigured: runtime.remoteConfigured,
    issues,
    summary,
  };
}

async function readJsonOrText(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

function ryhtiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function authenticateRyhti(baseUrl: string): Promise<string> {
  const staticToken = cleanString(process.env.RYHTI_ACCESS_TOKEN, 2000);
  if (staticToken) return staticToken;

  const clientId = cleanString(process.env.RYHTI_CLIENT_ID, 200);
  const clientSecret = cleanString(process.env.RYHTI_CLIENT_SECRET, 2000);
  if (!clientId || !clientSecret) {
    throw new Error("RYHTI_CLIENT_ID and RYHTI_CLIENT_SECRET are required for live Ryhti submission");
  }

  const res = await fetch(ryhtiUrl(baseUrl, `/api/Authenticate?clientId=${encodeURIComponent(clientId)}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(clientSecret),
  });
  const body = await readJsonOrText(res);
  if (!res.ok) {
    throw new Error(`Ryhti authentication failed: ${JSON.stringify(body)}`);
  }

  if (typeof body === "string") return body;
  if (body && typeof body === "object") {
    const token = (body as Record<string, unknown>).access_token ?? (body as Record<string, unknown>).token;
    if (typeof token === "string") return token;
  }
  throw new Error("Ryhti authentication response did not include an access token");
}

async function postRyhtiJson(baseUrl: string, path: string, token: string, body: unknown): Promise<unknown> {
  const res = await fetch(ryhtiUrl(baseUrl, path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const responseBody = await readJsonOrText(res);
  if (!res.ok) {
    const err = new Error(`Ryhti API returned ${res.status}`);
    (err as Error & { status?: number; responseBody?: unknown }).status = res.status;
    (err as Error & { status?: number; responseBody?: unknown }).responseBody = responseBody;
    throw err;
  }
  return responseBody;
}

export async function submitRyhtiPackage(
  pkg: RyhtiPermitPackage,
  validation: RyhtiValidationResult,
): Promise<RyhtiSubmissionResult> {
  const runtime = getRyhtiRuntime();
  const fingerprint = crypto
    .createHash("sha256")
    .update(`${pkg.helscoop.projectId}:${pkg.schema.generatedAt}:${pkg.attachments[0]?.sha256 ?? "no-ifc"}`)
    .digest("hex")
    .slice(0, 12);

  if (!runtime.remoteConfigured || !runtime.baseUrl) {
    return {
      mode: "dry_run",
      status: "ready_for_authority",
      trackingId: `dry-ryhti-${fingerprint}`,
      remoteConfigured: false,
      remoteResponse: {
        validation,
        packageGeneratedAt: pkg.schema.generatedAt,
        handoff: "authority_or_suomi_fi_required",
      },
    };
  }

  if (!validation.ready) {
    return {
      mode: "live",
      status: "failed",
      trackingId: `blocked-ryhti-${fingerprint}`,
      remoteConfigured: true,
      error: "Local Ryhti validation failed",
      remoteResponse: validation,
    };
  }

  const permitIdentifier = pkg.permanentPermitIdentifier;
  if (!permitIdentifier) {
    return {
      mode: "live",
      status: "failed",
      trackingId: `blocked-ryhti-${fingerprint}`,
      remoteConfigured: true,
      error: "Permanent permit identifier is required for live Ryhti submission",
    };
  }

  try {
    const token = await authenticateRyhti(runtime.baseUrl);
    const validateResponse = await postRyhtiJson(runtime.baseUrl, "/api/BuildingPermit/Validate", token, pkg);
    const submitResponse = await postRyhtiJson(
      runtime.baseUrl,
      `/api/BuildingPermit/${encodeURIComponent(permitIdentifier)}`,
      token,
      pkg,
    );

    return {
      mode: "live",
      status: "submitted",
      trackingId: typeof submitResponse === "string" ? submitResponse : permitIdentifier,
      remoteConfigured: true,
      remoteResponse: {
        validate: validateResponse,
        submit: submitResponse,
      },
    };
  } catch (err) {
    const status = (err as Error & { status?: number }).status;
    const responseBody = (err as Error & { responseBody?: unknown }).responseBody;
    return {
      mode: "live",
      status: status === 400 || status === 422 ? "rejected" : "failed",
      trackingId: `failed-ryhti-${fingerprint}`,
      remoteConfigured: true,
      error: err instanceof Error ? err.message : "Ryhti submission failed",
      remoteResponse: responseBody,
    };
  }
}
