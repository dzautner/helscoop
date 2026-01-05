const ensureLoadMeshAvailable = () => {
  if (typeof loadMesh !== 'function') {
    throw new Error('loadMesh binding is not available; rebuild the viewer with mesh import support.');
  }
};

const centerOnFloor = (manifold) => {
  const bounds = boundingBox(manifold);
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cy = (bounds.min[1] + bounds.max[1]) / 2;
  return translate(manifold, [-cx, -cy, -bounds.min[2]]);
};

const canopyBase = () => {
  ensureLoadMeshAvailable();
  const canopyFull = centerOnFloor(
    loadMesh('assemblies/library/models/canopy/75xHD_HX100_Spacer_V1.stl', true)
  );

  const canopyBounds = boundingBox(canopyFull);
  const cutZ = canopyBounds.min[2] + (canopyBounds.max[2] - canopyBounds.min[2]) * 0.20;
  const cutBox = translate(
    cube({ size: [200, 200, canopyBounds.max[2] - cutZ], center: true }),
    [0, 0, cutZ + (canopyBounds.max[2] - cutZ) / 2]
  );
  return difference(canopyFull, cutBox);
};

const WALL = 1.2;
const PCB_THICKNESS = 1.2;
const FOOT_WIDTH = WALL * 2 + PCB_THICKNESS;

const makeFoot = (height = 4, depth = 4) => {
  const wall1 = cube({ size: [WALL, depth, height], center: true });
  const wall2 = translate(
    cube({ size: [WALL, depth, height], center: true }),
    [WALL + PCB_THICKNESS, 0, 0]
  );
  const foot = union(wall1, wall2);
  return translate(foot, [-(WALL + PCB_THICKNESS) / 2, 0, height / 2]);
};

const END_WALL_WIDTH = 10;
const END_WALL_HEIGHT = 7;
const BASE_EXTEND = 3;

const makeEndWall = (yPos, direction) => {
  const wallY = yPos + direction * (1.5 + WALL / 2);
  const baseY = wallY - direction * (BASE_EXTEND / 2);
  return union(
    translate(
      cube({ size: [END_WALL_WIDTH, WALL, END_WALL_HEIGHT], center: true }),
      [0, wallY, END_WALL_HEIGHT / 2]
    ),
    translate(
      cube({ size: [END_WALL_WIDTH, BASE_EXTEND, 0.5], center: true }),
      [0, baseY, 0.25]
    )
  );
};

const HOLE_DIST = 18.5;
const holePositions = [
  [0, HOLE_DIST],
  [0, -HOLE_DIST],
  [HOLE_DIST, 0],
  [-HOLE_DIST, 0]
];

const makeMountFoot = () => {
  const outer = cylinder({ height: 3, radius: 2, center: false, segments: 64 });
  const hole = translate(cylinder({ height: 5, radius: 1.25, center: true, segments: 64 }), [0, 0, 1.5]);
  return difference(outer, hole);
};

export const buildCanopyPicoHolder = () => {
  const canopy = canopyBase();

  const foot1 = translate(makeFoot(6), [0, 25, 0]);
  const foot2 = translate(makeFoot(6), [0, -25, 0]);
  const foot3 = translate(makeFoot(6, 8), [0, 13, 0]);
  const foot4 = translate(makeFoot(6, 8), [0, -13, 0]);

  const endWall1 = makeEndWall(25, 1);
  const endWall2 = makeEndWall(-25, -1);

  const holePunches = holePositions.map(([x, y]) =>
    translate(cylinder({ height: 50, radius: 1.25, center: true, segments: 64 }), [x, y, 10])
  );

  return difference(
    union(canopy, foot1, foot2, foot3, foot4, endWall1, endWall2),
    ...holePunches
  );
};

export const buildSeparateMountFeet = () => {
  return holePositions.map(([x, y]) =>
    translate(makeMountFoot(), [x, y, 0])
  );
};

export default buildCanopyPicoHolder;
