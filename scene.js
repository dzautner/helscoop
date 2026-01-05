import buildCanopyPicoHolder from './assemblies/CanopyPicoHolder.js';

const holder = buildCanopyPicoHolder();

// X-shaped base using two crossed rectangles, 1mm tall
const makeXBase = () => {
  const LENGTH = 59;  // arm length
  const WIDTH = 10;   // arm width
  const HEIGHT = 1;   // extrusion height

  const rect1 = cube({ size: [LENGTH, WIDTH, HEIGHT], center: true });
  const centerCut = cube({ size: [LENGTH - 34, WIDTH + 2, HEIGHT + 2], center: true });
  const hollowRect = difference(rect1, centerCut);

  return translate(rotate(hollowRect, [0, 0, 90]), [0, 0, HEIGHT / 2]);
};

// Pico feet - same as assembly
const WALL = 1.2;
const PCB_THICKNESS = 1.2;

const makeFoot = (height = 4, depth = 4) => {
  const wall1 = cube({ size: [WALL, depth, height], center: true });
  const wall2 = translate(
    cube({ size: [WALL, depth, height], center: true }),
    [WALL + PCB_THICKNESS, 0, 0]
  );
  const foot = union(wall1, wall2);
  return translate(foot, [-(WALL + PCB_THICKNESS) / 2, 0, height / 2]);
};

// End walls
const END_WALL_WIDTH = 10;
const END_WALL_HEIGHT = 14;

const foot1 = translate(makeFoot(END_WALL_HEIGHT, 8), [0, 23.5, 0]);
const foot4 = translate(makeFoot(3, 8), [0, -13, 0]);
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

const endWall1 = makeEndWall(25, 1);

// Punch 8 holes - inner (18.5mm) and outer (24mm)
const INNER_DIST = 18.5;
const OUTER_DIST = 24;
const SMALL_HOLE = 0.75;
const BIG_HOLE = 1.25;

// Big holes for wall (bolts fit through) - start at z=1 to not affect base
const wallHoles = [
  translate(cylinder({ height: END_WALL_HEIGHT, radius: BIG_HOLE, center: false, segments: 64 }), [0, INNER_DIST, 1]),
  translate(cylinder({ height: END_WALL_HEIGHT, radius: BIG_HOLE, center: false, segments: 64 }), [0, OUTER_DIST, 1])
];

const baseHoles = [
  translate(cylinder({ height: 5, radius: SMALL_HOLE, center: true, segments: 64 }), [0, INNER_DIST, 0]),
  translate(cylinder({ height: 5, radius: SMALL_HOLE, center: true, segments: 64 }), [0, -INNER_DIST, 0]),
  translate(cylinder({ height: 5, radius: SMALL_HOLE, center: true, segments: 64 }), [INNER_DIST, 0, 0]),
  translate(cylinder({ height: 5, radius: SMALL_HOLE, center: true, segments: 64 }), [-INNER_DIST, 0, 0]),
  translate(cylinder({ height: 5, radius: SMALL_HOLE, center: true, segments: 64 }), [0, OUTER_DIST, 0]),
  translate(cylinder({ height: 5, radius: SMALL_HOLE, center: true, segments: 64 }), [0, -OUTER_DIST, 0]),
  translate(cylinder({ height: 5, radius: SMALL_HOLE, center: true, segments: 64 }), [OUTER_DIST, 0, 0]),
  translate(cylinder({ height: 5, radius: SMALL_HOLE, center: true, segments: 64 }), [-OUTER_DIST, 0, 0])
];

const holes = [...wallHoles, ...baseHoles];

const xBase = makeXBase();

// Cage - two vertical walls with a top bar
const CAGE_HEIGHT = 25;
const CAGE_WALL_THICKNESS = 1;
const CAGE_LENGTH = 70;

const CAGE_WIDTH = 5;
const leftWall = translate(
  cube({ size: [CAGE_WALL_THICKNESS, CAGE_WIDTH, CAGE_HEIGHT], center: true }),
  [-CAGE_LENGTH / 2 + CAGE_WALL_THICKNESS / 2, 0, CAGE_HEIGHT / 2]
);
const rightWall = translate(
  cube({ size: [CAGE_WALL_THICKNESS, CAGE_WIDTH, CAGE_HEIGHT], center: true }),
  [CAGE_LENGTH / 2 - CAGE_WALL_THICKNESS / 2, 0, CAGE_HEIGHT / 2]
);
const topBar = translate(
  cube({ size: [CAGE_LENGTH, CAGE_WIDTH, CAGE_WALL_THICKNESS], center: true }),
  [0, 0, CAGE_HEIGHT - CAGE_WALL_THICKNESS / 2]
);
const baseBarFull = cube({ size: [CAGE_LENGTH, CAGE_WIDTH, 1], center: true });
const baseBarCut = cube({ size: [CAGE_LENGTH - 40, 12, 3], center: true });
const baseBar = translate(difference(baseBarFull, baseBarCut), [0, 0, 0.5]);

// Holes in cage base
const cageHoles = [
  translate(cylinder({ height: 10, radius: 0.625, center: true, segments: 64 }), [INNER_DIST, 0, 0]),
  translate(cylinder({ height: 10, radius: 0.625, center: true, segments: 64 }), [-INNER_DIST, 0, 0]),
  translate(cylinder({ height: 10, radius: 0.625, center: true, segments: 64 }), [OUTER_DIST, 0, 0]),
  translate(cylinder({ height: 10, radius: 0.625, center: true, segments: 64 }), [-OUTER_DIST, 0, 0])
];

const cage = difference(union(leftWall, rightWall, topBar, baseBar), ...cageHoles);

const assembly = difference(
  union(xBase, foot1, foot4, endWall1),
  ...holes
);

// export const scene = union(assembly, cage);
// export const scene = cage;
export const scene = assembly;
