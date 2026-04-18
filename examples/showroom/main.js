// Showroom - Multi-object scene with varied materials and shapes
// Demonstrates PBR materials, boolean ops, warp, and patterns

const S = 0.004;
export const displayScale = S;

const GOLD = [0.83, 0.69, 0.22];
const COPPER = [0.72, 0.45, 0.20];
const STEEL = [0.77, 0.78, 0.78];
const MARBLE = [0.92, 0.91, 0.88];
const WOOD = [0.55, 0.35, 0.18];

// --- Twisted column on pedestal ---
const pedestalBase = cylinder({ height: 6, radius: 18, segments: 48 });
let col = cube({ size: [10, 10, 55], center: false });
col = translate(col, [-5, -5, 0]);
col = refineToLength(col, 6);
const twistedCol = warp(col, ([x, y, z]) => {
  const angle = (z / 55) * 120 * Math.PI / 180;
  const c = Math.cos(angle), s = Math.sin(angle);
  return [x * c - y * s, x * s + y * c, z];
});
const column = union(pedestalBase, translate(twistedCol, [0, 0, 6]));
const topSphere = translate(sphere(8), [0, 0, 66]);

// --- Ring torus ---
const ring = translate(
  rotate(torus(12, 3), [90, 0, 0]),
  [40, 0, 30]
);

// --- Hollowed cube ---
const outerCube = cube({ size: [22, 22, 22], center: true });
const hollowCube = difference(outerCube, sphere(12));
const cubeObj = translate(hollowCube, [-40, 0, 11]);

// --- Vase ---
const vaseProfile = [
  [0, 0], [10, 0], [12, 5], [8, 20], [7, 28],
  [10, 36], [11, 40], [10, 44], [0, 44]
];
const vaseOuter = revolve(vaseProfile, 32);
const vaseInner = translate(scale(revolve(vaseProfile, 32), [0.82, 0.82, 0.93]), [0, 0, 3]);
const vase = translate(difference(vaseOuter, vaseInner), [0, -42, 0]);

// --- Small bolt trio ---
const boltShaft = cylinder({ height: 16, radius: 2, segments: 12 });
const boltHead = translate(cylinder({ height: 3, radius: 4, segments: 6 }), [0, 0, 16]);
const bolt = union(boltShaft, boltHead);
const bolts = translate(linearPattern(bolt, 3, [12, 0, 0]), [-52, -40, 0]);

export const scene = [
  withPBR(scale(column, S), { color: MARBLE, roughness: 0.3, metallic: 0.0 }),
  withPBR(scale(topSphere, S), { color: GOLD, roughness: 0.15, metallic: 0.95 }),
  withPBR(scale(ring, S), { color: GOLD, roughness: 0.2, metallic: 0.9 }),
  withPBR(scale(cubeObj, S), { color: STEEL, roughness: 0.4, metallic: 0.75 }),
  withPBR(scale(vase, S), { color: COPPER, roughness: 0.35, metallic: 0.8 }),
  withPBR(scale(bolts, S), { color: STEEL, roughness: 0.5, metallic: 0.7 }),
];
