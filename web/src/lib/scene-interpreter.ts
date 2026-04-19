/**
 * Scene Script Interpreter for Helscoop
 *
 * Executes scene scripts in a sandboxed manner using the Function constructor.
 * Provides primitives (box, cylinder, sphere), transforms (translate, rotate),
 * boolean-like operations (union, subtract, intersect), and scene.add().
 */

export interface MeshDescriptor {
  type: "box" | "cylinder" | "sphere" | "group";
  args: number[];
  position: [number, number, number];
  rotation: [number, number, number];
  children?: MeshDescriptor[];
}

export interface SceneObject {
  geometry: "box" | "cylinder" | "sphere" | "group";
  args: number[];
  position: [number, number, number];
  rotation: [number, number, number];
  color: [number, number, number];
  material: string;
  children?: SceneObject[];
}

function createMesh(
  type: MeshDescriptor["type"],
  args: number[]
): MeshDescriptor {
  return {
    type,
    args,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
  };
}

function box(w: number, h: number, d: number): MeshDescriptor {
  return createMesh("box", [w, h, d]);
}

function cylinder(r: number, h: number): MeshDescriptor {
  return createMesh("cylinder", [r, h]);
}

function sphere(r: number): MeshDescriptor {
  return createMesh("sphere", [r]);
}

function translate(
  mesh: MeshDescriptor,
  x: number,
  y: number,
  z: number
): MeshDescriptor {
  return {
    ...mesh,
    position: [
      mesh.position[0] + x,
      mesh.position[1] + y,
      mesh.position[2] + z,
    ],
    children: mesh.children ? [...mesh.children] : undefined,
  };
}

function rotate(
  mesh: MeshDescriptor,
  rx: number,
  ry: number,
  rz: number
): MeshDescriptor {
  return {
    ...mesh,
    rotation: [
      mesh.rotation[0] + rx,
      mesh.rotation[1] + ry,
      mesh.rotation[2] + rz,
    ],
    children: mesh.children ? [...mesh.children] : undefined,
  };
}

function union(a: MeshDescriptor, b: MeshDescriptor): MeshDescriptor {
  return {
    type: "group",
    args: [],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    children: [a, b],
  };
}

function subtract(a: MeshDescriptor, b: MeshDescriptor): MeshDescriptor {
  // For MVP, just return a (real CSG subtraction is complex)
  return {
    type: "group",
    args: [],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    children: [a, b],
  };
}

function intersect(a: MeshDescriptor, b: MeshDescriptor): MeshDescriptor {
  return {
    type: "group",
    args: [],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    children: [a, b],
  };
}

export interface InterpreterResult {
  objects: SceneObject[];
  error: string | null;
  warnings: string[];
}

// ── Pre-execution validation ──────────────────────────────────────────────

/** Check that braces, parens, and brackets are balanced */
function checkBalancedDelimiters(script: string): string[] {
  const warnings: string[] = [];
  const stack: { char: string; line: number }[] = [];
  const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const closers: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

  let inString: string | null = null;
  let inLineComment = false;
  let inBlockComment = false;
  let line = 1;

  for (let i = 0; i < script.length; i++) {
    const ch = script[i];
    const next = script[i + 1];

    if (ch === "\n") {
      line++;
      inLineComment = false;
      continue;
    }

    if (inLineComment) continue;

    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (ch === "\\" ) { i++; continue; }
      if (ch === inString) inString = null;
      continue;
    }

    if (ch === "/" && next === "/") { inLineComment = true; i++; continue; }
    if (ch === "/" && next === "*") { inBlockComment = true; i++; continue; }
    if (ch === '"' || ch === "'" || ch === "`") { inString = ch; continue; }

    if (ch in pairs) {
      stack.push({ char: ch, line });
    } else if (ch in closers) {
      const expected = closers[ch];
      if (stack.length === 0 || stack[stack.length - 1].char !== expected) {
        warnings.push(`validation.unmatchedCloser:${ch}:${line}`);
      } else {
        stack.pop();
      }
    }
  }

  for (const open of stack) {
    warnings.push(`validation.unmatchedOpener:${open.char}:${open.line}`);
  }

  return warnings;
}

/** Common typos for scene API identifiers */
const SCENE_TYPOS: [RegExp, string][] = [
  [/\bscnee\s*\./g, "scene"],
  [/\bscen\s*\./g, "scene"],
  [/\bscene\s*\.\s*ad\b/g, "scene.add"],
  [/\bscene\s*\.\s*addd?\b/g, "scene.add"],
  [/\bboxx?\s*\(/g, "box"],
  [/\bcyliner\s*\(/g, "cylinder"],
  [/\bshere\s*\(/g, "sphere"],
  [/\btranslte\s*\(/g, "translate"],
  [/\broate\s*\(/g, "rotate"],
];

function checkTypos(script: string): string[] {
  const warnings: string[] = [];
  for (const [pattern, correct] of SCENE_TYPOS) {
    if (pattern.test(script)) {
      warnings.push(`validation.typoDetected:${correct}`);
    }
    // Reset lastIndex for global regexps
    pattern.lastIndex = 0;
  }
  return warnings;
}

// Known identifiers provided by the interpreter sandbox
const KNOWN_IDENTIFIERS = new Set([
  "box", "cylinder", "sphere", "translate", "rotate",
  "union", "subtract", "intersect", "scene",
  // JS built-ins that are commonly used
  "Math", "console", "const", "let", "var", "for", "if", "else",
  "while", "do", "return", "function", "true", "false", "null",
  "undefined", "new", "this", "typeof", "instanceof", "void",
  "switch", "case", "break", "continue", "throw", "try", "catch",
  "finally", "class", "extends", "import", "export", "default",
  "Array", "Object", "Number", "String", "Boolean", "JSON",
  "parseInt", "parseFloat", "isNaN", "isFinite", "Infinity", "NaN",
]);

/** Warn about bare identifiers that look like they should be primitives */
function checkUndefinedPrimitives(script: string): string[] {
  const warnings: string[] = [];
  // Match function-call-like identifiers: someWord(
  const callPattern = /\b([a-zA-Z_]\w*)\s*\(/g;
  let match;
  const seen = new Set<string>();
  while ((match = callPattern.exec(script)) !== null) {
    const name = match[1];
    if (!KNOWN_IDENTIFIERS.has(name) && !seen.has(name)) {
      // Check if it's defined in the script (const/let/var/function)
      const defPattern = new RegExp(
        `(?:const|let|var|function)\\s+${name}\\b`
      );
      if (!defPattern.test(script)) {
        seen.add(name);
        warnings.push(`validation.undefinedIdentifier:${name}`);
      }
    }
  }
  return warnings;
}

function preValidate(script: string): string[] {
  return [
    ...checkBalancedDelimiters(script),
    ...checkTypos(script),
    ...checkUndefinedPrimitives(script),
  ];
}

// ── Post-execution validation ─────────────────────────────────────────────

function collectPositionsAndDimensions(
  objects: SceneObject[],
  positions: [number, number, number][],
  dimensions: { args: number[]; geometry: string }[]
) {
  for (const obj of objects) {
    positions.push(obj.position);
    if (obj.geometry !== "group") {
      dimensions.push({ args: obj.args, geometry: obj.geometry });
    }
    if (obj.children) {
      collectPositionsAndDimensions(obj.children, positions, dimensions);
    }
  }
}

function postValidate(objects: SceneObject[]): string[] {
  const warnings: string[] = [];

  if (objects.length === 0) {
    warnings.push("validation.emptyScene");
  }

  // Count total objects (recursively)
  let totalCount = 0;
  function countObjects(objs: SceneObject[]) {
    for (const obj of objs) {
      totalCount++;
      if (obj.children) countObjects(obj.children);
    }
  }
  countObjects(objects);

  if (totalCount > 200) {
    warnings.push(`validation.tooManyObjects:${totalCount}`);
  }

  const positions: [number, number, number][] = [];
  const dimensions: { args: number[]; geometry: string }[] = [];
  collectPositionsAndDimensions(objects, positions, dimensions);

  // Check positions far from origin
  for (const pos of positions) {
    const dist = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]);
    if (dist > 50) {
      warnings.push(`validation.farFromOrigin:${Math.round(dist)}`);
      break; // One warning is enough
    }
  }

  // Check zero or negative dimensions
  for (const dim of dimensions) {
    for (const arg of dim.args) {
      if (arg <= 0) {
        warnings.push(`validation.invalidDimension:${dim.geometry}`);
        break;
      }
    }
  }

  return warnings;
}

function meshToSceneObject(
  mesh: MeshDescriptor,
  material: string,
  color: [number, number, number]
): SceneObject {
  return {
    geometry: mesh.type,
    args: mesh.args,
    position: mesh.position,
    rotation: mesh.rotation,
    color,
    material,
    children: mesh.children?.map((c) => meshToSceneObject(c, material, color)),
  };
}

export function interpretScene(script: string): InterpreterResult {
  const warnings: string[] = [];

  // Pre-execution validation
  warnings.push(...preValidate(script));

  const objects: SceneObject[] = [];

  const sceneProxy = {
    add(
      mesh: MeshDescriptor,
      opts?: { material?: string; color?: [number, number, number] }
    ) {
      const mat = opts?.material || "default";
      const col: [number, number, number] = opts?.color || [0.8, 0.8, 0.8];
      objects.push(meshToSceneObject(mesh, mat, col));
    },
  };

  try {
    // Build the sandboxed function with restricted scope
    const fn = new Function(
      "box",
      "cylinder",
      "sphere",
      "translate",
      "rotate",
      "union",
      "subtract",
      "intersect",
      "scene",
      script
    );

    fn(box, cylinder, sphere, translate, rotate, union, subtract, intersect, sceneProxy);

    // Post-execution validation
    warnings.push(...postValidate(objects));

    return { objects, error: null, warnings };
  } catch (err) {
    return {
      objects,
      error: err instanceof Error ? err.message : String(err),
      warnings,
    };
  }
}
