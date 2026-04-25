import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { isMeshStandardMaterial } from "@/lib/three-material-guards";

describe("isMeshStandardMaterial", () => {
  it("returns true for MeshStandardMaterial", () => {
    const mat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    expect(isMeshStandardMaterial(mat)).toBe(true);
  });

  it("returns true for MeshPhysicalMaterial (subclass of MeshStandardMaterial)", () => {
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x00ff00 });
    expect(isMeshStandardMaterial(mat)).toBe(true);
  });

  it("returns false for MeshBasicMaterial", () => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x0000ff });
    expect(isMeshStandardMaterial(mat)).toBe(false);
  });

  it("returns false for LineBasicMaterial", () => {
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff });
    expect(isMeshStandardMaterial(mat)).toBe(false);
  });

  it("returns false for ShaderMaterial", () => {
    const mat = new THREE.ShaderMaterial();
    expect(isMeshStandardMaterial(mat)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isMeshStandardMaterial(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isMeshStandardMaterial(undefined)).toBe(false);
  });

  it("returns false for a plain object with a color property", () => {
    const fake = { color: { setRGB: () => {} } };
    expect(isMeshStandardMaterial(fake)).toBe(false);
  });

  it("guards .color.setRGB access safely", () => {
    // This is the exact crash scenario from the bug: calling .color.setRGB()
    // on a material that doesn't have a Color property.
    const materials: THREE.Material[] = [
      new THREE.MeshStandardMaterial({ color: 0xff0000 }),
      new THREE.LineBasicMaterial({ color: 0x00ff00 }),
      new THREE.ShaderMaterial(),
    ];

    // Without the guard, iterating and casting would crash on ShaderMaterial.
    // With the guard, only MeshStandardMaterial gets color-modified.
    for (const mat of materials) {
      if (isMeshStandardMaterial(mat)) {
        // This should only execute for the first material
        mat.color.setRGB(0.5, 0.5, 0.5);
        expect(mat.color.r).toBeCloseTo(0.5);
        expect(mat.color.g).toBeCloseTo(0.5);
        expect(mat.color.b).toBeCloseTo(0.5);
      }
    }
  });
});
