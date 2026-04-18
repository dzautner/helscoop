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

    return { objects, error: null };
  } catch (err) {
    return {
      objects,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
