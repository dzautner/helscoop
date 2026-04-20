/**
 * Finnish building code compliance checker.
 *
 * Pure-function library that parses a Three.js-like scene string and checks it
 * against key rules from the Finnish building code (Maankäyttö- ja rakennuslaki,
 * Ympäristöministeriön asetus).
 *
 * Geometry is extracted via regex matching of `box(w, h, d)` / `translate(…, x, y, z)`
 * and `subtract()` calls used for door/window openings.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ComplianceWarning {
  ruleId: string;
  severity: "error" | "warning" | "info";
  messageKey: string;
  params: Record<string, string | number>;
  affectedMesh?: string;
}

export interface BuildingInfo {
  type?: string;   // e.g. "omakotitalo", "rivitalo", "kerrostalo"
  year?: number;   // construction year
}

// ---------------------------------------------------------------------------
// Internal geometry helpers
// ---------------------------------------------------------------------------

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

/**
 * Parse all mesh definitions from the scene JS string.
 *
 * Supports the dingcad scene DSL:
 *   const name = box(w, h, d);
 *   const name = translate(box(w, h, d), x, y, z);
 *   const name = subtract(base, cutter);   // marks cutter as a void
 *
 * Also detects scene.add(name, { material: "..." }) to tag materials.
 */
function parseMeshes(sceneJs: string): ParsedMesh[] {
  const meshes: ParsedMesh[] = [];
  const meshMap = new Map<string, ParsedMesh>();

  // Match: const <name> = box(w, h, d)
  const boxRe = /(?:const|let|var)\s+(\w+)\s*=\s*box\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g;
  let m: RegExpExecArray | null;

  while ((m = boxRe.exec(sceneJs)) !== null) {
    const mesh: ParsedMesh = {
      name: m[1],
      w: parseFloat(m[2]),
      h: parseFloat(m[3]),
      d: parseFloat(m[4]),
      x: 0,
      y: 0,
      z: 0,
    };
    meshMap.set(mesh.name, mesh);
    meshes.push(mesh);
  }

  // Match: const <name> = translate(box(w, h, d), x, y, z)
  const translateBoxRe = /(?:const|let|var)\s+(\w+)\s*=\s*translate\(\s*box\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g;

  while ((m = translateBoxRe.exec(sceneJs)) !== null) {
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

  // Match: const <name> = translate(<ref>, x, y, z) — for meshes already defined
  const translateRefRe = /(?:const|let|var)\s+(\w+)\s*=\s*translate\(\s*(\w+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/g;

  while ((m = translateRefRe.exec(sceneJs)) !== null) {
    const refName = m[2];
    const existing = meshMap.get(refName);
    if (existing && refName !== m[1]) {
      const mesh: ParsedMesh = {
        ...existing,
        name: m[1],
        x: parseFloat(m[3]),
        y: parseFloat(m[4]),
        z: parseFloat(m[5]),
      };
      meshMap.set(mesh.name, mesh);
      meshes.push(mesh);
    }
  }

  // Match subtract() calls to identify voids (door/window openings)
  const subtractRe = /(?:const|let|var)\s+(\w+)\s*=\s*subtract\(\s*(\w+)\s*,\s*(\w+)\s*\)/g;

  while ((m = subtractRe.exec(sceneJs)) !== null) {
    const cutterName = m[3];
    const cutter = meshMap.get(cutterName);
    if (cutter) {
      cutter.isSubtract = true;
    }
  }

  // Match scene.add() to extract material tags
  const addRe = /scene\.add\(\s*(\w+)\s*,\s*\{[^}]*material:\s*["'](\w+)["'][^}]*\}/g;

  while ((m = addRe.exec(sceneJs)) !== null) {
    const meshRef = meshMap.get(m[1]);
    if (meshRef) {
      meshRef.material = m[2];
    }
  }

  return meshes;
}

// ---------------------------------------------------------------------------
// THREE.BoxGeometry fallback parser (for raw Three.js scenes)
// ---------------------------------------------------------------------------

function parseThreeBoxGeometries(sceneJs: string): ParsedMesh[] {
  const meshes: ParsedMesh[] = [];
  const re = /new\s+THREE\.BoxGeometry\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g;
  let m: RegExpExecArray | null;
  let idx = 0;

  while ((m = re.exec(sceneJs)) !== null) {
    meshes.push({
      name: `three_box_${idx++}`,
      w: parseFloat(m[1]),
      h: parseFloat(m[2]),
      d: parseFloat(m[3]),
      x: 0,
      y: 0,
      z: 0,
    });
  }

  return meshes;
}

// ---------------------------------------------------------------------------
// Rule implementations
// ---------------------------------------------------------------------------

/** Rule 1: Minimum ceiling height 2500mm for residential buildings */
function checkMinCeilingHeight(
  meshes: ParsedMesh[],
  buildingInfo?: BuildingInfo
): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  const MIN_HEIGHT_M = 2.5; // 2500mm

  // Only apply to residential buildings (or when type is unknown — default to residential)
  const isResidential =
    !buildingInfo?.type ||
    ["omakotitalo", "rivitalo", "paritalo"].includes(buildingInfo.type);

  if (!isResidential) return warnings;

  // Look for wall meshes: tall thin elements (h > 1.5m, at least one thin dimension)
  const walls = meshes.filter(
    (m) =>
      !m.isSubtract &&
      m.h > 1.5 &&
      (m.w <= 0.3 || m.d <= 0.3) // wall thickness
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

/** Rule 2: Minimum door opening width 800mm */
function checkMinDoorWidth(meshes: ParsedMesh[]): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  const MIN_DOOR_WIDTH_M = 0.8; // 800mm

  // Doors are subtract voids that are tall (>1.8m) and narrow
  const doors = meshes.filter(
    (m) => m.isSubtract && m.h >= 1.8
  );

  for (const door of doors) {
    // Door width is the wider horizontal dimension (not the wall thickness)
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

/** Rule 3: Handrail required for elevated platforms/terraces > 500mm */
function checkHandrailRequired(meshes: ParsedMesh[]): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  const HANDRAIL_THRESHOLD_M = 0.5; // 500mm

  // Look for deck/platform meshes: flat-ish (h < 0.3m), elevated (y > 0.5m)
  const platforms = meshes.filter(
    (m) =>
      !m.isSubtract &&
      m.h <= 0.3 &&            // flat element (deck)
      m.y > HANDRAIL_THRESHOLD_M && // elevated
      m.w >= 1.0 &&            // at least 1m wide
      m.d >= 1.0               // at least 1m deep
  );

  // Check if there are any post-like elements nearby that could be handrail posts
  const posts = meshes.filter(
    (m) =>
      !m.isSubtract &&
      m.h >= 0.8 &&   // at least 800mm tall
      m.w <= 0.2 &&   // thin
      m.d <= 0.2      // thin
  );

  for (const platform of platforms) {
    const elevationMm = Math.round(platform.y * 1000);

    // Check if there are posts near this platform's perimeter
    const hasPosts = posts.some((post) => {
      const dx = Math.abs(post.x - platform.x);
      const dz = Math.abs(post.z - platform.z);
      // Post should be roughly at the edge of the platform
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

/** Rule 4: Maximum building height 12m for residential areas */
function checkMaxBuildingHeight(
  meshes: ParsedMesh[],
): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];

  // Default max height for residential areas
  const MAX_HEIGHT_M = 12.0;

  // Find the highest point of any mesh (position.y + height/2)
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

/** Rule 5: Minimum room area 7m² */
function checkMinRoomArea(meshes: ParsedMesh[]): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  const MIN_AREA_M2 = 7.0;

  // Look for floor meshes: flat elements at or near ground level
  const floors = meshes.filter(
    (m) =>
      !m.isSubtract &&
      m.h <= 0.3 &&    // flat
      m.y <= 0.5 &&    // near ground level
      m.w >= 1.0 &&    // at least 1m wide
      m.d >= 1.0        // at least 1m deep
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const ALL_RULES = [
  { id: "FI-RakMK-G1-2.1", check: checkMinCeilingHeight },
  { id: "FI-RakMK-F1-2.3", check: checkMinDoorWidth },
  { id: "FI-RakMK-F2-3.2", check: checkHandrailRequired },
  { id: "FI-MRL-115", check: checkMaxBuildingHeight },
  { id: "FI-RakMK-G1-2.2", check: checkMinRoomArea },
] as const;

/**
 * Check a scene against Finnish building code rules.
 *
 * @param sceneJs  — the scene script string (dingcad DSL or Three.js)
 * @param buildingInfo — optional building metadata (type, year)
 * @returns Array of compliance warnings
 */
export function checkCompliance(
  sceneJs: string,
  buildingInfo?: BuildingInfo
): ComplianceWarning[] {
  if (!sceneJs || sceneJs.trim().length === 0) {
    return [];
  }

  // Parse meshes from scene — try dingcad DSL first, fall back to Three.js
  let meshes = parseMeshes(sceneJs);
  if (meshes.length === 0) {
    meshes = parseThreeBoxGeometries(sceneJs);
  }

  if (meshes.length === 0) {
    return [];
  }

  const warnings: ComplianceWarning[] = [];

  for (const rule of ALL_RULES) {
    const ruleWarnings = rule.check(meshes, buildingInfo);
    warnings.push(...ruleWarnings);
  }

  return warnings;
}

/** Total number of rules that are checked. */
export const RULE_COUNT = ALL_RULES.length;
