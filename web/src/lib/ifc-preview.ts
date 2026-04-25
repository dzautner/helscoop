export type IfcValidationStatus = "pass" | "warning" | "fail";

export interface IfcBoundingBox {
  x: number;
  y: number;
  z: number;
}

export interface IfcPreviewElement {
  id: string;
  label: string;
  entityNames: string[];
  count: number;
  color: string;
}

export interface IfcValidationCheck {
  id: string;
  label: string;
  status: IfcValidationStatus;
  blocking: boolean;
  message: string;
}

export interface IfcPreviewAnalysis {
  schema: string | null;
  entityCounts: Record<string, number>;
  elementCounts: Record<string, number>;
  previewElements: IfcPreviewElement[];
  boundingBoxes: IfcBoundingBox[];
  largestSpanMeters: number | null;
  spatialStructure: {
    project: number;
    site: number;
    building: number;
    storey: number;
  };
  checks: IfcValidationCheck[];
  blockingIssueCount: number;
  warningCount: number;
  readyForLupapiste: boolean;
}

export interface IfcReadinessBadge {
  show: boolean;
  label: string;
  reasons: string[];
  checkedAt?: string;
  schema?: string | null;
}

interface StoredIfcReadiness {
  ready: boolean;
  schema: string | null;
  checkedAt: string;
  warningCount: number;
  blockingIssueCount: number;
}

type StoredIfcReadinessMap = Record<string, StoredIfcReadiness>;

const ELEMENT_GROUPS: Omit<IfcPreviewElement, "count">[] = [
  { id: "walls", label: "Walls", entityNames: ["IFCWALL", "IFCWALLSTANDARDCASE"], color: "#b7791f" },
  { id: "slabs", label: "Slabs / floors", entityNames: ["IFCSLAB"], color: "#64748b" },
  { id: "roofs", label: "Roofs", entityNames: ["IFCROOF"], color: "#7c2d12" },
  { id: "doors", label: "Doors", entityNames: ["IFCDOOR"], color: "#2563eb" },
  { id: "windows", label: "Windows", entityNames: ["IFCWINDOW"], color: "#0891b2" },
  { id: "proxies", label: "Other objects", entityNames: ["IFCBUILDINGELEMENTPROXY"], color: "#6b7280" },
];

const BUILDING_ELEMENT_ENTITIES = [
  "IFCWALL",
  "IFCWALLSTANDARDCASE",
  "IFCSLAB",
  "IFCROOF",
  "IFCDOOR",
  "IFCWINDOW",
  "IFCBUILDINGELEMENTPROXY",
  "IFCSTAIR",
  "IFCRAILING",
  "IFCCOLUMN",
  "IFCBEAM",
];

const NUMBER_PATTERN = "[-+]?\\d*\\.?\\d+(?:[Ee][-+]?\\d+)?";
const BOUNDING_BOX_RE = new RegExp(
  `IFCBOUNDINGBOX\\s*\\(\\s*[^,]+\\s*,\\s*(${NUMBER_PATTERN})\\s*,\\s*(${NUMBER_PATTERN})\\s*,\\s*(${NUMBER_PATTERN})\\s*\\)`,
  "gi",
);
export const IFC_READINESS_STORAGE_KEY = "helscoop_ifc_readiness_v1";

function countEntities(ifcText: string): Record<string, number> {
  const counts: Record<string, number> = {};
  const entityRe = /=\s*(IFC[A-Z0-9]+)\s*\(/gi;
  let match: RegExpExecArray | null;
  while ((match = entityRe.exec(ifcText)) !== null) {
    const entity = match[1].toUpperCase();
    counts[entity] = (counts[entity] ?? 0) + 1;
  }
  return counts;
}

function countOf(entityCounts: Record<string, number>, entities: string | string[]): number {
  const keys = Array.isArray(entities) ? entities : [entities];
  return keys.reduce((sum, key) => sum + (entityCounts[key] ?? 0), 0);
}

function parseSchema(ifcText: string): string | null {
  const match = ifcText.match(/FILE_SCHEMA\s*\(\s*\(\s*['"]([^'"]+)['"]/i);
  return match?.[1]?.toUpperCase() ?? null;
}

function parseBoundingBoxes(ifcText: string): IfcBoundingBox[] {
  const boxes: IfcBoundingBox[] = [];
  BOUNDING_BOX_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BOUNDING_BOX_RE.exec(ifcText)) !== null) {
    boxes.push({
      x: Number.parseFloat(match[1]),
      y: Number.parseFloat(match[2]),
      z: Number.parseFloat(match[3]),
    });
  }
  return boxes;
}

function isIfc43Schema(schema: string | null): boolean {
  if (!schema) return false;
  return schema.includes("IFC4X3") || schema.includes("IFC4.3");
}

function hasStepEnvelope(ifcText: string): boolean {
  return /ISO-10303-21/i.test(ifcText)
    && /HEADER\s*;/i.test(ifcText)
    && /DATA\s*;/i.test(ifcText)
    && /END-ISO-10303-21\s*;/i.test(ifcText);
}

function buildCheck(
  id: string,
  label: string,
  status: IfcValidationStatus,
  blocking: boolean,
  message: string,
): IfcValidationCheck {
  return { id, label, status, blocking, message };
}

export function analyzeIfcStep(ifcText: string): IfcPreviewAnalysis {
  const schema = parseSchema(ifcText);
  const entityCounts = countEntities(ifcText);
  const boundingBoxes = parseBoundingBoxes(ifcText);
  const previewElements = ELEMENT_GROUPS.map((group) => ({
    ...group,
    count: countOf(entityCounts, group.entityNames),
  })).filter((group) => group.count > 0);
  const elementCounts = Object.fromEntries(previewElements.map((group) => [group.id, group.count]));
  const buildingElementCount = BUILDING_ELEMENT_ENTITIES.reduce((sum, entity) => sum + countOf(entityCounts, entity), 0);
  const hasShapeGeometry = countOf(entityCounts, "IFCSHAPEREPRESENTATION") > 0 || boundingBoxes.length > 0;
  const largestSpanMeters = boundingBoxes.length > 0
    ? Math.max(...boundingBoxes.flatMap((box) => [box.x, box.y, box.z]))
    : null;
  const spatialStructure = {
    project: countOf(entityCounts, "IFCPROJECT"),
    site: countOf(entityCounts, "IFCSITE"),
    building: countOf(entityCounts, "IFCBUILDING"),
    storey: countOf(entityCounts, "IFCBUILDINGSTOREY"),
  };
  const requiredSpatialMissing = Object.entries(spatialStructure)
    .filter(([, count]) => count === 0)
    .map(([key]) => key);
  const dimensionsArePlausible = boundingBoxes.length > 0
    && boundingBoxes.every((box) => [box.x, box.y, box.z].every((value) => Number.isFinite(value) && value >= 0.01 && value <= 120));
  const dimensionsAreExtreme = boundingBoxes.some((box) => [box.x, box.y, box.z].some((value) => !Number.isFinite(value) || value <= 0 || value > 120));
  const hasEnvelopeElements = countOf(entityCounts, ["IFCWALL", "IFCWALLSTANDARDCASE"]) > 0
    && (countOf(entityCounts, "IFCSLAB") > 0 || countOf(entityCounts, "IFCROOF") > 0);
  const openingCount = countOf(entityCounts, ["IFCDOOR", "IFCWINDOW"]);

  const checks: IfcValidationCheck[] = [
    buildCheck(
      "step-envelope",
      "STEP file envelope",
      hasStepEnvelope(ifcText) ? "pass" : "fail",
      true,
      hasStepEnvelope(ifcText)
        ? "The file has the expected ISO-10303-21 header, data section, and terminator."
        : "The file is missing the standard IFC STEP wrapper.",
    ),
    buildCheck(
      "ifc-schema",
      "IFC 4.3 schema",
      isIfc43Schema(schema) ? "pass" : "fail",
      true,
      schema
        ? `${schema} ${isIfc43Schema(schema) ? "is accepted for IFC 4.3 permit exchange." : "is older than the required IFC 4.3 family."}`
        : "The IFC schema header is missing.",
    ),
    buildCheck(
      "spatial-structure",
      "Project / site / building / storey",
      requiredSpatialMissing.length === 0 ? "pass" : "fail",
      true,
      requiredSpatialMissing.length === 0
        ? "Required spatial containers are present."
        : `Missing required spatial containers: ${requiredSpatialMissing.join(", ")}.`,
    ),
    buildCheck(
      "site-reference",
      "Site and terrain reference",
      spatialStructure.site > 0 && countOf(entityCounts, "IFCLOCALPLACEMENT") > 0 ? "pass" : spatialStructure.site > 0 ? "warning" : "fail",
      spatialStructure.site === 0,
      spatialStructure.site > 0 && countOf(entityCounts, "IFCLOCALPLACEMENT") > 0
        ? "The model includes an IfcSite with local placement."
        : spatialStructure.site > 0
          ? "IfcSite exists, but placement/georeferencing should be confirmed before authority submission."
          : "IfcSite is missing, so the model cannot be tied to a parcel or terrain reference.",
    ),
    buildCheck(
      "geometry",
      "Previewable building geometry",
      buildingElementCount > 0 && hasShapeGeometry ? "pass" : "fail",
      true,
      buildingElementCount > 0 && hasShapeGeometry
        ? `${buildingElementCount} building elements have geometry references.`
        : "No previewable building elements or shape representations were found.",
    ),
    buildCheck(
      "dimensions",
      "Plausible dimensions",
      dimensionsArePlausible ? "pass" : dimensionsAreExtreme ? "fail" : "warning",
      dimensionsAreExtreme,
      dimensionsArePlausible
        ? `Bounding dimensions are within 0.01-120 m; largest span is ${largestSpanMeters?.toFixed(1)} m.`
        : dimensionsAreExtreme
          ? "At least one bounding dimension is zero, negative, non-numeric, or above 120 m."
          : "No bounding boxes were found; inspect dimensions in a native IFC viewer before submission.",
    ),
    buildCheck(
      "enclosure",
      "Enclosed-space signal",
      hasEnvelopeElements ? "pass" : "warning",
      false,
      hasEnvelopeElements
        ? "Walls plus slab/roof elements suggest an enclosed building envelope."
        : "The model lacks enough wall, slab, or roof elements to infer enclosed spaces.",
    ),
    buildCheck(
      "openings",
      "Doors and windows",
      openingCount > 0 ? "pass" : "warning",
      false,
      openingCount > 0
        ? `${openingCount} door/window openings are present.`
        : "No doors or windows were detected; this may be fine for early massing but weak for permit review.",
    ),
  ];

  const blockingIssueCount = checks.filter((check) => check.blocking && check.status === "fail").length;
  const warningCount = checks.filter((check) => check.status === "warning").length;

  return {
    schema,
    entityCounts,
    elementCounts,
    previewElements,
    boundingBoxes,
    largestSpanMeters,
    spatialStructure,
    checks,
    blockingIssueCount,
    warningCount,
    readyForLupapiste: blockingIssueCount === 0,
  };
}

function emptyIfcBadge(): IfcReadinessBadge {
  return {
    show: false,
    label: "Ready for Lupapiste",
    reasons: [],
  };
}

function readStoredReadinessMap(): StoredIfcReadinessMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(IFC_READINESS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as StoredIfcReadinessMap
      : {};
  } catch {
    return {};
  }
}

export function rememberIfcReadiness(projectId: string, analysis: IfcPreviewAnalysis): void {
  if (typeof window === "undefined") return;
  try {
    const current = readStoredReadinessMap();
    current[projectId] = {
      ready: analysis.readyForLupapiste,
      schema: analysis.schema,
      checkedAt: new Date().toISOString(),
      warningCount: analysis.warningCount,
      blockingIssueCount: analysis.blockingIssueCount,
    };
    window.localStorage.setItem(IFC_READINESS_STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Local storage is advisory only; validation still works without it.
  }
}

export function readIfcReadinessBadge(projectId: string, projectUpdatedAt?: string | null): IfcReadinessBadge {
  const record = readStoredReadinessMap()[projectId];
  if (!record || !record.ready || record.blockingIssueCount > 0) return emptyIfcBadge();
  if (projectUpdatedAt && Date.parse(record.checkedAt) < Date.parse(projectUpdatedAt)) return emptyIfcBadge();
  return {
    show: true,
    label: "Ready for Lupapiste",
    schema: record.schema,
    checkedAt: record.checkedAt,
    reasons: [
      record.schema ? record.schema : "IFC 4.3",
      record.warningCount > 0 ? `${record.warningCount} warnings` : "no blocking issues",
    ],
  };
}
