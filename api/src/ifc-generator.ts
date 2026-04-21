/**
 * IFC 4x3 STEP file generator for Finnish building permit submission.
 *
 * Produces a minimal IFC4x3 file (ISO 10303-21) from project data,
 * mapping scene objects to standard IFC building elements: IfcWall,
 * IfcRoof, IfcDoor, IfcWindow, IfcSlab. Includes IfcProject, IfcSite,
 * IfcBuilding, and IfcBuildingStorey hierarchy with material assignments
 * and permit metadata for Ryhti/Lupapiste review workflows.
 *
 * Related issue: https://github.com/dzautner/helscoop/issues/360
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const IFC_SCHEMA = "IFC4X3_ADD2";
export const IFC_VIEW_DEFINITION = "ReferenceView_V1.2";
export const IFC_PERMIT_EXPORT_PURPOSE = "Rakentamislaki 2026 permit export";

export interface IFCBuildingInfo {
  address?: string;
  buildingType?: string;
  yearBuilt?: number;
  area?: number;
  floorAreaM2?: number;
  grossAreaM2?: number;
  floors?: number;
  permanentBuildingIdentifier?: string;
  propertyIdentifier?: string;
  municipalityNumber?: string;
  latitude?: number;
  longitude?: number;
  energyClass?: string;
}

export interface IFCPermitMetadata {
  permanentBuildingIdentifier?: string;
  propertyIdentifier?: string;
  municipalityNumber?: string;
  latitude?: number;
  longitude?: number;
  grossAreaM2?: number;
  floorAreaM2?: number;
  floors?: number;
  energyClass?: string;
  constructionActionType?: string;
  permitApplicationType?: string;
}

export interface IFCBomItem {
  material_id: string;
  material_name: string;
  quantity: number;
  unit: string;
  category_name?: string;
}

export interface IFCSceneObject {
  name: string;
  type: "wall" | "roof" | "door" | "window" | "slab" | "generic";
  dimensions: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  material?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a GUID-like identifier for IFC (22-char base64 compact form). */
function ifcGuid(index: number): string {
  // IFC uses 22-char base64-encoded GUIDs. For reproducibility we derive
  // them from the index rather than using true UUIDs.
  const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  let guid = "";
  let val = index + 1000000;
  for (let i = 0; i < 22; i++) {
    guid += chars[val % 64];
    val = Math.floor(val / 64) + i + 1;
  }
  return guid;
}

function isoTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").split(".")[0];
}

function stepString(s: string): string {
  // IFC STEP strings use single quotes with special escaping
  return "'" + s.replace(/'/g, "''") + "'";
}

function stepStringOrUnset(s?: string): string {
  return s ? stepString(s) : "$";
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return `${n}.`;
  return Number(n.toFixed(6)).toString();
}

function stepValue(value: string | number | boolean): string {
  if (typeof value === "number") {
    return Number.isInteger(value) ? `IFCINTEGER(${value})` : `IFCREAL(${formatNumber(value)})`;
  }
  if (typeof value === "boolean") {
    return value ? "IFCBOOLEAN(.T.)" : "IFCBOOLEAN(.F.)";
  }
  return `IFCLABEL(${stepString(value)})`;
}

/** Map a scene variable/material name to an IFC element type. */
export function classifyElement(name: string, material?: string): IFCSceneObject["type"] {
  const n = name.toLowerCase();
  if (n.includes("roof") || n.includes("katto")) return "roof";
  if (n.includes("door") || n.includes("ovi") || n.includes("gate") || n.includes("portti")) return "door";
  if (n.includes("window") || n.includes("ikkuna")) return "window";
  if (n.includes("floor") || n.includes("slab") || n.includes("deck")
    || n.includes("lattia") || n.includes("laatta") || n.includes("foundation")) return "slab";
  if (n.includes("wall") || n.includes("sein")) return "wall";

  // Fallback: check material
  const m = (material || "").toLowerCase();
  if (m.includes("roofing") || m.includes("katto")) return "roof";
  if (m.includes("foundation") || m.includes("concrete") || m.includes("betoni")) return "slab";

  return "wall"; // default to wall for unclassified structural elements
}

/**
 * Parse scene.js source to extract scene objects with their names, dimensions,
 * positions, and material assignments.
 */
export function parseSceneObjects(sceneJs: string): IFCSceneObject[] {
  const objects: IFCSceneObject[] = [];

  // Match variable assignments: const <name> = translate(box(...), x, y, z)
  // or const <name> = box(w, h, d)
  // Also handles rotate(box(...), ...) wrapped in translate
  const lines = sceneJs.split("\n");
  const varDims: Map<string, { w: number; h: number; d: number; x: number; y: number; z: number }> = new Map();

  for (const line of lines) {
    const trimmed = line.trim();

    // Match: const <name> = translate(box(w,h,d), x, y, z)
    // Also: const <name> = translate(rotate(box(w,h,d), ...), x, y, z)
    const translateMatch = trimmed.match(
      /const\s+(\w+)\s*=\s*translate\s*\((?:rotate\s*\()?box\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)(?:\s*,\s*[\d.,-]+\s*\))?\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*,\s*([\d.-]+)\s*\)/
    );
    if (translateMatch) {
      varDims.set(translateMatch[1], {
        w: parseFloat(translateMatch[2]),
        h: parseFloat(translateMatch[3]),
        d: parseFloat(translateMatch[4]),
        x: parseFloat(translateMatch[5]),
        y: parseFloat(translateMatch[6]),
        z: parseFloat(translateMatch[7]),
      });
      continue;
    }

    // Match: const <name> = box(w, h, d)
    const boxMatch = trimmed.match(
      /const\s+(\w+)\s*=\s*box\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/
    );
    if (boxMatch) {
      varDims.set(boxMatch[1], {
        w: parseFloat(boxMatch[2]),
        h: parseFloat(boxMatch[3]),
        d: parseFloat(boxMatch[4]),
        x: 0,
        y: 0,
        z: 0,
      });
    }
  }

  // Match scene.add calls to pick up material assignments
  const addRegex = /scene\.add\s*\(\s*(\w+)\s*(?:,\s*\{([^}]*)\})?\s*\)/g;
  let match;
  while ((match = addRegex.exec(sceneJs)) !== null) {
    const varName = match[1];
    const optsStr = match[2] || "";
    const dims = varDims.get(varName);
    if (!dims) continue;

    // Extract material from options
    const matMatch = optsStr.match(/material\s*:\s*["']([^"']+)["']/);
    const materialStr = matMatch ? matMatch[1] : undefined;

    const elementType = classifyElement(varName, materialStr);

    objects.push({
      name: varName,
      type: elementType,
      dimensions: { x: dims.w, y: dims.h, z: dims.d },
      position: { x: dims.x, y: dims.y, z: dims.z },
      material: materialStr,
    });
  }

  return objects;
}

// ---------------------------------------------------------------------------
// IFC element type to STEP entity
// ---------------------------------------------------------------------------

const IFC_TYPE_MAP: Record<IFCSceneObject["type"], string> = {
  wall: "IFCWALL",
  roof: "IFCROOF",
  door: "IFCDOOR",
  window: "IFCWINDOW",
  slab: "IFCSLAB",
  generic: "IFCBUILDINGELEMENTPROXY",
};

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

export interface GenerateIFCInput {
  project: {
    id: string;
    name: string;
    description?: string;
    scene_js?: string;
  };
  bom: IFCBomItem[];
  buildingInfo?: IFCBuildingInfo;
  permitMetadata?: IFCPermitMetadata;
}

/**
 * Generate a minimal IFC4x3 STEP file from project data.
 *
 * The output follows ISO 10303-21 encoding and is accepted by standard IFC
 * validators (e.g. BIM Collaboration Format tools, Solibri, Lupapiste).
 */
export function generateIFC(input: GenerateIFCInput): string {
  const { project, bom, buildingInfo, permitMetadata } = input;
  const ts = isoTimestamp();
  const projectName = project.name || "Helscoop Project";
  const projectDesc = project.description || "";
  const permitInfo = {
    ...buildingInfo,
    ...permitMetadata,
    floorAreaM2: permitMetadata?.floorAreaM2 ?? buildingInfo?.floorAreaM2 ?? buildingInfo?.area,
    grossAreaM2: permitMetadata?.grossAreaM2 ?? buildingInfo?.grossAreaM2 ?? buildingInfo?.area,
    floors: permitMetadata?.floors ?? buildingInfo?.floors,
    energyClass: permitMetadata?.energyClass ?? buildingInfo?.energyClass,
    permanentBuildingIdentifier:
      permitMetadata?.permanentBuildingIdentifier ?? buildingInfo?.permanentBuildingIdentifier,
    propertyIdentifier: permitMetadata?.propertyIdentifier ?? buildingInfo?.propertyIdentifier,
    municipalityNumber: permitMetadata?.municipalityNumber ?? buildingInfo?.municipalityNumber,
    latitude: permitMetadata?.latitude ?? buildingInfo?.latitude,
    longitude: permitMetadata?.longitude ?? buildingInfo?.longitude,
  };

  // Parse scene objects from scene_js
  const sceneObjects = project.scene_js ? parseSceneObjects(project.scene_js) : [];

  // Build entity lines — IFC STEP uses incrementing #N entity IDs
  let entityId = 0;
  const lines: string[] = [];

  function next(): number {
    return ++entityId;
  }

  function emit(content: string): number {
    const id = next();
    lines.push(`#${id}=${content};`);
    return id;
  }

  function emitPropertySet(
    name: string,
    properties: Record<string, string | number | boolean | undefined>,
    targetId: number,
    guidBase: number,
  ): void {
    const propertyIds: number[] = [];
    for (const [propertyName, value] of Object.entries(properties)) {
      if (value === undefined || value === "") continue;
      propertyIds.push(
        emit(`IFCPROPERTYSINGLEVALUE(${stepString(propertyName)},$,${stepValue(value)},$)`)
      );
    }
    if (propertyIds.length === 0) return;

    const psetId = emit(
      `IFCPROPERTYSET('${ifcGuid(guidBase)}',#${ownerHistId},${stepString(name)},$,(#${propertyIds.join(",#")}))`
    );
    emit(
      `IFCRELDEFINESBYPROPERTIES('${ifcGuid(guidBase + 1)}',#${ownerHistId},${stepString(`${name}Relation`)},$,(#${targetId}),#${psetId})`
    );
  }

  // --- Header entities ---

  // #1 IFCPERSON
  const personId = emit("IFCPERSON($,$,'',$,$,$,$,$)");

  // #2 IFCORGANIZATION
  const orgId = emit("IFCORGANIZATION($,'Helscoop','Helscoop.fi renovation planning tool',$,$)");

  // #3 IFCPERSONANDORGANIZATION
  const persOrgId = emit(`IFCPERSONANDORGANIZATION(#${personId},#${orgId},$)`);

  // #4 IFCAPPLICATION
  const appId = emit(`IFCAPPLICATION(#${orgId},'1.0','Helscoop','Helscoop')`);

  // #5 IFCOWNERHISTORY
  const ownerHistId = emit(
    `IFCOWNERHISTORY(#${persOrgId},#${appId},$,.NOCHANGE.,$,$,$,${Math.floor(Date.now() / 1000)})`
  );

  // #6 IFCDIRECTION (Z axis)
  const dirZId = emit("IFCDIRECTION((0.,0.,1.))");

  // #7 IFCDIRECTION (X axis)
  const dirXId = emit("IFCDIRECTION((1.,0.,0.))");

  // #8 IFCCARTESIANPOINT (origin)
  const originId = emit("IFCCARTESIANPOINT((0.,0.,0.))");

  // #9 IFCAXIS2PLACEMENT3D (world coordinate system)
  const wcsId = emit(`IFCAXIS2PLACEMENT3D(#${originId},#${dirZId},#${dirXId})`);

  // #10 IFCGEOMETRICREPRESENTATIONCONTEXT
  const contextId = emit(
    `IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#${wcsId},$)`
  );

  // #11 IFCSIUNIT (length — meters)
  const siLengthId = emit("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");

  // #12 IFCSIUNIT (area — square meters)
  const siAreaId = emit("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");

  // #13 IFCSIUNIT (volume — cubic meters)
  const siVolumeId = emit("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");

  // #14 IFCSIUNIT (angle — radians)
  const siAngleId = emit("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");

  // #15 IFCUNITASSIGNMENT
  const unitsId = emit(`IFCUNITASSIGNMENT((#${siLengthId},#${siAreaId},#${siVolumeId},#${siAngleId}))`);

  // #16 IFCPROJECT
  const projectId = emit(
    `IFCPROJECT('${ifcGuid(0)}',#${ownerHistId},${stepString(projectName)},${stepString(projectDesc)},$,$,$,(#${contextId}),#${unitsId})`
  );

  // --- Spatial structure ---

  const sitePlacementId = emit(`IFCLOCALPLACEMENT($,#${wcsId})`);
  const buildingPlacementId = emit(`IFCLOCALPLACEMENT(#${sitePlacementId},#${wcsId})`);
  const storeyPlacementId = emit(`IFCLOCALPLACEMENT(#${buildingPlacementId},#${wcsId})`);

  // IFCSITE
  const siteId = emit(
    `IFCSITE('${ifcGuid(1)}',#${ownerHistId},${stepString(buildingInfo?.address || "Site")},$,$,#${sitePlacementId},$,$,.ELEMENT.,$,$,$,$,$)`
  );

  // IFCBUILDING
  const buildingId = emit(
    `IFCBUILDING('${ifcGuid(2)}',#${ownerHistId},${stepString(projectName)},${stepStringOrUnset(buildingInfo?.buildingType)},$,#${buildingPlacementId},$,$,.ELEMENT.,$,$,$)`
  );

  // IFCBUILDINGSTOREY
  const storeyId = emit(
    `IFCBUILDINGSTOREY('${ifcGuid(3)}',#${ownerHistId},'Ground Floor',$,$,#${storeyPlacementId},$,$,.ELEMENT.,0.)`
  );

  emitPropertySet("Pset_HelscoopPermitMetadata", {
    IFCSchema: IFC_SCHEMA,
    ExportPurpose: IFC_PERMIT_EXPORT_PURPOSE,
    HelscoopProjectId: project.id,
    Address: buildingInfo?.address,
    BuildingType: buildingInfo?.buildingType,
    YearBuilt: buildingInfo?.yearBuilt,
    FloorAreaM2: permitInfo.floorAreaM2,
    GrossAreaM2: permitInfo.grossAreaM2,
    Floors: permitInfo.floors,
    EnergyClass: permitInfo.energyClass,
    PermanentBuildingIdentifier: permitInfo.permanentBuildingIdentifier,
    PropertyIdentifier: permitInfo.propertyIdentifier,
    MunicipalityNumber: permitInfo.municipalityNumber,
    Latitude: permitInfo.latitude,
    Longitude: permitInfo.longitude,
    ConstructionActionType: permitMetadata?.constructionActionType,
    PermitApplicationType: permitMetadata?.permitApplicationType,
  }, buildingId, 500);

  // --- Spatial containment relationships ---

  // IFCRELAGGREGATES: Project -> Site
  emit(
    `IFCRELAGGREGATES('${ifcGuid(100)}',#${ownerHistId},'ProjectSite',$,#${projectId},(#${siteId}))`
  );

  // IFCRELAGGREGATES: Site -> Building
  emit(
    `IFCRELAGGREGATES('${ifcGuid(101)}',#${ownerHistId},'SiteBuilding',$,#${siteId},(#${buildingId}))`
  );

  // IFCRELAGGREGATES: Building -> Storey
  emit(
    `IFCRELAGGREGATES('${ifcGuid(102)}',#${ownerHistId},'BuildingStorey',$,#${buildingId},(#${storeyId}))`
  );

  // --- Building elements from scene ---
  const elementIds: number[] = [];
  const materialElements: Map<string, number[]> = new Map();

  for (let i = 0; i < sceneObjects.length; i++) {
    const obj = sceneObjects[i];
    const ifcType = IFC_TYPE_MAP[obj.type];

    // Cartesian point for element position
    const ptId = emit(
      `IFCCARTESIANPOINT((${obj.position.x.toFixed(3)},${obj.position.z.toFixed(3)},${obj.position.y.toFixed(3)}))`
    );

    // Axis placement for element
    const placementId = emit(`IFCAXIS2PLACEMENT3D(#${ptId},#${dirZId},#${dirXId})`);

    // Local placement
    const localPlacementId = emit(`IFCLOCALPLACEMENT(#${storeyPlacementId},#${placementId})`);

    // Bounding box representation (geometry placeholder)
    const bbId = emit(`IFCBOUNDINGBOX(#${originId},${obj.dimensions.x.toFixed(3)},${obj.dimensions.z.toFixed(3)},${obj.dimensions.y.toFixed(3)})`);

    // Shape representation
    const shapeRepId = emit(
      `IFCSHAPEREPRESENTATION(#${contextId},'Box','BoundingBox',(#${bbId}))`
    );
    const prodShapeId = emit(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}))`);

    // The building element itself
    let elemId: number;
    if (obj.type === "window") {
      elemId = emit(
        `${ifcType}('${ifcGuid(200 + i)}',#${ownerHistId},${stepString(obj.name)},$,$,#${localPlacementId},#${prodShapeId},$,$)`
      );
    } else if (obj.type === "door") {
      elemId = emit(
        `${ifcType}('${ifcGuid(200 + i)}',#${ownerHistId},${stepString(obj.name)},$,$,#${localPlacementId},#${prodShapeId},$,$,$)`
      );
    } else {
      elemId = emit(
        `${ifcType}('${ifcGuid(200 + i)}',#${ownerHistId},${stepString(obj.name)},$,$,#${localPlacementId},#${prodShapeId},$)`
      );
    }

    elementIds.push(elemId);

    // Track material assignments
    if (obj.material) {
      if (!materialElements.has(obj.material)) {
        materialElements.set(obj.material, []);
      }
      materialElements.get(obj.material)!.push(elemId);
    }
  }

  // IFCRELCONTAINEDINSPATIALSTRUCTURE: Storey -> elements
  if (elementIds.length > 0) {
    const elemRefs = elementIds.map((id) => `#${id}`).join(",");
    emit(
      `IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid(300)}',#${ownerHistId},'StoreyElements',$,(${elemRefs}),#${storeyId})`
    );
  }

  // --- Material assignments from BOM ---
  let matIdx = 0;
  for (const [matKey, elemIds] of materialElements) {
    // Find matching BOM item for display name
    const bomItem = bom.find(
      (b) => b.material_id === matKey || (b.material_name || "").toLowerCase().includes(matKey.toLowerCase())
    );
    const matName = bomItem?.material_name || matKey;

    const matId = emit(`IFCMATERIAL(${stepString(matName)})`);
    const elemRefs = elemIds.map((id) => `#${id}`).join(",");
    emit(
      `IFCRELASSOCIATESMATERIAL('${ifcGuid(400 + matIdx)}',#${ownerHistId},'MaterialAssignment',$,(${elemRefs}),#${matId})`
    );
    matIdx++;
  }

  // --- Assemble the STEP file ---
  const header = [
    "ISO-10303-21;",
    "HEADER;",
    `FILE_DESCRIPTION(('ViewDefinition [${IFC_VIEW_DEFINITION}]'),'2;1');`,
    `FILE_NAME('${projectName.replace(/'/g, "")}.ifc','${ts}',(''),(''),'Helscoop IFC Generator','Helscoop 1.0','');`,
    `FILE_SCHEMA(('${IFC_SCHEMA}'));`,
    "ENDSEC;",
    "",
    "DATA;",
  ].join("\n");

  const footer = ["ENDSEC;", "END-ISO-10303-21;"].join("\n");

  return header + "\n" + lines.join("\n") + "\n" + footer + "\n";
}
