import * as THREE from "three";

/**
 * Type guard that safely checks whether a material is a MeshStandardMaterial.
 * Use this instead of bare `as THREE.MeshStandardMaterial` casts to avoid
 * runtime crashes when the material is a ShaderMaterial, LineBasicMaterial, etc.
 */
export function isMeshStandardMaterial(
  mat: unknown,
): mat is THREE.MeshStandardMaterial {
  return mat instanceof THREE.MeshStandardMaterial;
}
