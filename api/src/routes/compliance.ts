/**
 * Compliance check API route.
 *
 * POST /compliance/check — validates a scene against Finnish building code rules.
 * Does not require authentication so it can be used from the editor preview
 * and shared project views.
 */

import { Router } from "express";

// ---------------------------------------------------------------------------
// Inline compliance checker — mirrors web/src/lib/compliance.ts
//
// We duplicate the pure logic here instead of sharing a package so the API
// stays self-contained and deployable without a monorepo build step.
// ---------------------------------------------------------------------------

export interface ComplianceWarning {
  ruleId: string;
  severity: "error" | "warning" | "info";
  messageKey: string;
  params: Record<string, string | number>;
  affectedMesh?: string;
}

interface BuildingInfo {
  type?: string;
  year?: number;
}

interface ParsedMesh {
  name: string;
  w: number;
  h: number;
  d: number;
  x: number;
  y: number;
  z: number;
  material?: string;
  isSubtract?: boolean;
}

/** Reusable pattern fragment that matches both integer and float numbers. */
const NUM = `[\\d]+(?:\\.[\\d]+)?`;
const SIGNED_NUM = `-?${NUM}`;

/**
 * Pre-process scene source before regex parsing:
 * 1. Strip single-line comments (// ...)
 * 2. Strip block comments (/* ... *​/)
 * 3. Collapse newlines so multiline box() / translate() calls become single-line
 */
function preprocessScene(sceneJs: string): string {
  // Strip single-line comments
  let cleaned = sceneJs.replace(/\/\/.*$/gm, "");
  // Strip block comments
  cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, "");
  // Collapse newlines into spaces so multiline calls become parseable
  cleaned = cleaned.replace(/\n/g, " ");
  // Collapse multiple spaces
  cleaned = cleaned.replace(/\s+/g, " ");
  return cleaned;
}

export interface ParseWarning {
  type: "unparsed_box" | "unparsed_translate";
  lineFragment: string;
}

function parseMeshes(sceneJs: string, parseWarnings?: ParseWarning[]): ParsedMesh[] {
  const meshes: ParsedMesh[] = [];
  const meshMap = new Map<string, ParsedMesh>();

  const cleaned = preprocessScene(sceneJs);

  const boxRe = new RegExp(
    `(?:const|let|var)\\s+(\\w+)\\s*=\\s*box\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\)`,
    "g"
  );
  let m: RegExpExecArray | null;

  while ((m = boxRe.exec(cleaned)) !== null) {
    const mesh: ParsedMesh = {
      name: m[1],
      w: parseFloat(m[2]),
      h: parseFloat(m[3]),
      d: parseFloat(m[4]),
      x: 0, y: 0, z: 0,
    };
    meshMap.set(mesh.name, mesh);
    meshes.push(mesh);
  }

  const translateBoxRe = new RegExp(
    `(?:const|let|var)\\s+(\\w+)\\s*=\\s*translate\\(\\s*box\\(\\s*(${NUM})\\s*,\\s*(${NUM})\\s*,\\s*(${NUM})\\s*\\)\\s*,\\s*(${SIGNED_NUM})\\s*,\\s*(${SIGNED_NUM})\\s*,\\s*(${SIGNED_NUM})\\s*\\)`,
    "g"
  );

  while ((m = translateBoxRe.exec(cleaned)) !== null) {
    const mesh: ParsedMesh = {
      name: m[1],
      w: parseFloat(m[2]),
      h: parseFloat(m[3]),
      d: parseFloat(m[4]),
      x: parseFloat(m[5]),
      y: parseFloat(m[6]),
      z: parseFloat(m[7]),
    };
    meshMap.set(mesh.name, mesh);
    meshes.push(mesh);
  }

  const subtractRe = /(?:const|let|var)\s+(\w+)\s*=\s*subtract\(\s*(\w+)\s*,\s*(\w+)\s*\)/g;

  while ((m = subtractRe.exec(cleaned)) !== null) {
    const cutterName = m[3];
    const cutter = meshMap.get(cutterName);
    if (cutter) {
      cutter.isSubtract = true;
    }
  }

  const addRe = /scene\.add\(\s*(\w+)\s*,\s*\{[^}]*material:\s*["'](\w+)["'][^}]*\}/g;

  while ((m = addRe.exec(cleaned)) !== null) {
    const meshRef = meshMap.get(m[1]);
    if (meshRef) {
      meshRef.material = m[2];
    }
  }

  // Emit warnings for box()/translate(box()) calls that contain variable
  // references or other non-numeric arguments we could not parse.
  if (parseWarnings) {
    const anyBoxRe = /(?:const|let|var)\s+(\w+)\s*=\s*box\s*\(/g;
    while ((m = anyBoxRe.exec(cleaned)) !== null) {
      if (!meshMap.has(m[1])) {
        parseWarnings.push({
          type: "unparsed_box",
          lineFragment: cleaned.slice(m.index, m.index + 80).trim(),
        });
      }
    }
    const anyTranslateBoxRe = /(?:const|let|var)\s+(\w+)\s*=\s*translate\s*\(\s*box\s*\(/g;
    while ((m = anyTranslateBoxRe.exec(cleaned)) !== null) {
      if (!meshMap.has(m[1])) {
        parseWarnings.push({
          type: "unparsed_translate",
          lineFragment: cleaned.slice(m.index, m.index + 100).trim(),
        });
      }
    }
  }

  return meshes;
}

function checkMinCeilingHeight(meshes: ParsedMesh[], buildingInfo?: BuildingInfo): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  const MIN_HEIGHT_M = 2.5;

  const isResidential =
    !buildingInfo?.type ||
    ["omakotitalo", "rivitalo", "paritalo"].includes(buildingInfo.type);

  if (!isResidential) return warnings;

  const walls = meshes.filter(
    (m) => !m.isSubtract && m.h > 1.5 && (m.w <= 0.3 || m.d <= 0.3)
  );

  for (const wall of walls) {
    const heightMm = Math.round(wall.h * 1000);
    if (wall.h < MIN_HEIGHT_M) {
      warnings.push({
        ruleId: "FI-RakMK-G1-2.1",
        severity: "error",
        messageKey: "compliance.minCeilingHeight",
        params: { height: heightMm },
        affectedMesh: wall.name,
      });
    }
  }

  return warnings;
}

function checkMinDoorWidth(meshes: ParsedMesh[]): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  const MIN_DOOR_WIDTH_M = 0.8;

  const doors = meshes.filter((m) => m.isSubtract && m.h >= 1.8);

  for (const door of doors) {
    const width = door.w > door.d ? door.w : door.d;
    const widthMm = Math.round(width * 1000);

    if (width < MIN_DOOR_WIDTH_M) {
      warnings.push({
        ruleId: "FI-RakMK-F1-2.3",
        severity: "error",
        messageKey: "compliance.minDoorWidth",
        params: { width: widthMm },
        affectedMesh: door.name,
      });
    }
  }

  return warnings;
}

function checkHandrailRequired(meshes: ParsedMesh[]): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  const HANDRAIL_THRESHOLD_M = 0.5;

  const platforms = meshes.filter(
    (m) => !m.isSubtract && m.h <= 0.3 && m.y > HANDRAIL_THRESHOLD_M && m.w >= 1.0 && m.d >= 1.0
  );

  const posts = meshes.filter(
    (m) => !m.isSubtract && m.h >= 0.8 && m.w <= 0.2 && m.d <= 0.2
  );

  for (const platform of platforms) {
    const elevationMm = Math.round(platform.y * 1000);

    const hasPosts = posts.some((post) => {
      const dx = Math.abs(post.x - platform.x);
      const dz = Math.abs(post.z - platform.z);
      return dx <= platform.w / 2 + 0.3 && dz <= platform.d / 2 + 0.3;
    });

    if (!hasPosts) {
      warnings.push({
        ruleId: "FI-RakMK-F2-3.2",
        severity: "warning",
        messageKey: "compliance.handrailRequired",
        params: { elevation: elevationMm },
        affectedMesh: platform.name,
      });
    }
  }

  return warnings;
}

function checkMaxBuildingHeight(meshes: ParsedMesh[]): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  const MAX_HEIGHT_M = 12.0;

  let maxTop = 0;
  let highestMesh = "";

  for (const mesh of meshes) {
    if (mesh.isSubtract) continue;
    const top = mesh.y + mesh.h / 2;
    if (top > maxTop) {
      maxTop = top;
      highestMesh = mesh.name;
    }
  }

  if (maxTop > MAX_HEIGHT_M) {
    const heightMm = Math.round(maxTop * 1000);
    warnings.push({
      ruleId: "FI-MRL-115",
      severity: "error",
      messageKey: "compliance.maxBuildingHeight",
      params: { height: heightMm, limit: MAX_HEIGHT_M * 1000 },
      affectedMesh: highestMesh,
    });
  }

  return warnings;
}

function checkMinRoomArea(meshes: ParsedMesh[]): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  const MIN_AREA_M2 = 7.0;

  const floors = meshes.filter(
    (m) => !m.isSubtract && m.h <= 0.3 && m.y <= 0.5 && m.w >= 1.0 && m.d >= 1.0
  );

  for (const floor of floors) {
    const area = floor.w * floor.d;
    const areaSqm = Math.round(area * 10) / 10;

    if (area < MIN_AREA_M2) {
      warnings.push({
        ruleId: "FI-RakMK-G1-2.2",
        severity: "warning",
        messageKey: "compliance.minRoomArea",
        params: { area: areaSqm, limit: MIN_AREA_M2 },
        affectedMesh: floor.name,
      });
    }
  }

  return warnings;
}

const ALL_RULES = [
  { id: "FI-RakMK-G1-2.1", check: checkMinCeilingHeight },
  { id: "FI-RakMK-F1-2.3", check: checkMinDoorWidth },
  { id: "FI-RakMK-F2-3.2", check: checkHandrailRequired },
  { id: "FI-MRL-115", check: checkMaxBuildingHeight },
  { id: "FI-RakMK-G1-2.2", check: checkMinRoomArea },
] as const;

const RULE_COUNT = ALL_RULES.length;

export function checkCompliance(
  sceneJs: string,
  buildingInfo?: BuildingInfo
): ComplianceWarning[] {
  if (!sceneJs || sceneJs.trim().length === 0) return [];

  const parseWarnings: ParseWarning[] = [];
  const meshes = parseMeshes(sceneJs, parseWarnings);

  // Emit compliance warnings for geometry that could not be parsed
  const warnings: ComplianceWarning[] = [];
  for (const pw of parseWarnings) {
    warnings.push({
      ruleId: "PARSE-WARN",
      severity: "warning",
      messageKey: "compliance.unparsedGeometry",
      params: { fragment: pw.lineFragment.slice(0, 120) },
    });
  }

  if (meshes.length === 0) return warnings;

  for (const rule of ALL_RULES) {
    warnings.push(...rule.check(meshes, buildingInfo));
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Express Router
// ---------------------------------------------------------------------------

const router = Router();

router.post("/check", (req, res) => {
  const { sceneJs, buildingInfo } = req.body;

  if (!sceneJs || typeof sceneJs !== "string") {
    return res.status(400).json({ error: "sceneJs is required and must be a string" });
  }

  // Cap input size to prevent regex DoS
  if (sceneJs.length > 500_000) {
    return res.status(400).json({ error: "sceneJs exceeds maximum allowed size (500 KB)" });
  }

  const warnings = checkCompliance(sceneJs, buildingInfo);

  const failedRuleIds = new Set(warnings.map((w) => w.ruleId));
  const passedRules = RULE_COUNT - failedRuleIds.size;

  res.json({
    warnings,
    checkedRules: RULE_COUNT,
    passedRules,
  });
});

export default router;
