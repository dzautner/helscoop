// Hole positions - inner (18.5mm) and outer (24mm) from center
const INNER_DIST = 18.5;
const OUTER_DIST = 24;
const HOLE_RADIUS = 0.75;

// MTF-02P sofa
const mtf02pSofa = (includeFloor = true, includeArms = true) => {
  const MTF_WIDTH = 16, MTF_DEPTH = 6.5, MTF_HEIGHT = 21.6;
  const BRACKET_THICK = 1.5, CLEARANCE = 1;
  const L_HEIGHT = (MTF_HEIGHT + 2) * 2 / 3;
  const L_WIDTH = MTF_WIDTH + CLEARANCE * 2 - 2; // shaved 2mm
  const L_DEPTH = MTF_DEPTH + CLEARANCE + BRACKET_THICK;
  const SIDE_WALL_HEIGHT = 8;

  const backWall = cube({ size: [L_WIDTH + BRACKET_THICK * 2, BRACKET_THICK, L_HEIGHT], center: true });
  const floor = cube({ size: [L_WIDTH + BRACKET_THICK * 2, L_DEPTH, BRACKET_THICK], center: true });
  const sideWall = cube({ size: [BRACKET_THICK, L_DEPTH, SIDE_WALL_HEIGHT], center: true });

  const parts = [
    translate(backWall, [0, -L_DEPTH / 2 + BRACKET_THICK / 2, L_HEIGHT / 2])
  ];
  if (includeArms) {
    parts.push(translate(sideWall, [L_WIDTH / 2 + BRACKET_THICK / 2, 0, SIDE_WALL_HEIGHT / 2]));
    parts.push(translate(sideWall, [-L_WIDTH / 2 - BRACKET_THICK / 2, 0, SIDE_WALL_HEIGHT / 2]));
  }
  if (includeFloor) {
    parts.push(translate(floor, [0, 0, BRACKET_THICK / 2]));
  }
  return parts.length === 1 ? parts[0] : union(...parts);
};

// ToF sofa
const tofSofa = () => {
  const TOF_W = 25.4, TOF_D = 1.6, TOF_H = 25.4;
  const BRACKET_THICK = 1.5, CLEARANCE = 1;
  const L_HEIGHT = (TOF_H + 2) * 2 / 3;
  const L_WIDTH = TOF_W + CLEARANCE * 2;
  const L_DEPTH = TOF_D + CLEARANCE + BRACKET_THICK;
  const SIDE_WALL_HEIGHT = 8;

  const backWall = cube({ size: [L_WIDTH + BRACKET_THICK * 2, BRACKET_THICK, L_HEIGHT], center: true });
  const floor = cube({ size: [L_WIDTH + BRACKET_THICK * 2, L_DEPTH, BRACKET_THICK], center: true });
  const sideWall = cube({ size: [BRACKET_THICK, L_DEPTH, SIDE_WALL_HEIGHT], center: true });

  return union(
    translate(backWall, [0, -L_DEPTH / 2 + BRACKET_THICK / 2, L_HEIGHT / 2]),
    translate(floor, [0, 0, BRACKET_THICK / 2]),
    translate(sideWall, [L_WIDTH / 2 + BRACKET_THICK / 2, 0, SIDE_WALL_HEIGHT / 2]),
    translate(sideWall, [-L_WIDTH / 2 - BRACKET_THICK / 2, 0, SIDE_WALL_HEIGHT / 2])
  );
};

export const buildMultiSensorHoist = () => {
  const BAR_LENGTH = 59;
  const BAR_WIDTH = 10;
  const BAR_HEIGHT = 1;

  const bar = translate(
    cube({ size: [BAR_LENGTH, BAR_WIDTH, BAR_HEIGHT], center: true }),
    [0, 0, BAR_HEIGHT / 2]
  );

  // Center cutout
  const CENTER_CUT_LENGTH = 27.5;
  const CENTER_CUT_WIDTH = 11;
  const centerCut = cube({ size: [CENTER_CUT_LENGTH, CENTER_CUT_WIDTH, BAR_HEIGHT + 2], center: true });

  const holes = [
    // X axis (front/back)
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [INNER_DIST, 0, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [-INNER_DIST, 0, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [OUTER_DIST, 0, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [-OUTER_DIST, 0, 0]),
    // Y axis (left/right)
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [0, INNER_DIST, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [0, -INNER_DIST, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [0, OUTER_DIST, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [0, -OUTER_DIST, 0])
  ];

  // Teensy 4.0 dimensions
  const TEENSY_LENGTH = 35.6;
  const TEENSY_WIDTH = 17.8;
  const PIN_SPACING = 2.54;

  // Platform for Teensy - slightly larger for walls
  const PLATFORM_PADDING = 1.5;
  const PLATFORM_LENGTH = TEENSY_LENGTH + PLATFORM_PADDING * 2;
  const PLATFORM_WIDTH = TEENSY_WIDTH + PLATFORM_PADDING * 2;

  // Wall dimensions
  const WALL_THICKNESS = 1.2;
  const WALL_HEIGHT = 4;

  // Pin notch function
  const makePinNotch = (side, pin, notchWidth = 3.5, notchHeight = WALL_HEIGHT) => {
    const firstPinX = TEENSY_LENGTH / 2 - 1.5;
    const pinX = firstPinX - pin * PIN_SPACING;
    const yPos = side === 'left' ? PLATFORM_WIDTH / 2 : -PLATFORM_WIDTH / 2;
    return translate(
      cube({ size: [notchWidth, WALL_THICKNESS + 2, notchHeight + 2], center: true }),
      [pinX, yPos, BAR_HEIGHT + notchHeight / 2]
    );
  };

  const platform = translate(
    cube({ size: [PLATFORM_LENGTH, PLATFORM_WIDTH, BAR_HEIGHT], center: true }),
    [0, 0, BAR_HEIGHT / 2]
  );
  const wallOuter = translate(
    cube({ size: [PLATFORM_LENGTH, PLATFORM_WIDTH, WALL_HEIGHT], center: true }),
    [0, 0, BAR_HEIGHT + WALL_HEIGHT / 2]
  );
  const wallInner = translate(
    cube({ size: [TEENSY_LENGTH + 0.4, TEENSY_WIDTH + 0.4, WALL_HEIGHT + 2], center: true }),
    [0, 0, BAR_HEIGHT + WALL_HEIGHT / 2]
  );
  const usbCutout = translate(
    cube({ size: [WALL_THICKNESS + 2, TEENSY_WIDTH, WALL_HEIGHT + 2], center: true }),
    [PLATFORM_LENGTH / 2, 0, BAR_HEIGHT + WALL_HEIGHT / 2]
  );
  const backCutout = translate(
    cube({ size: [WALL_THICKNESS + 2, 10, WALL_HEIGHT + 2], center: true }),
    [-PLATFORM_LENGTH / 2, 0, BAR_HEIGHT + WALL_HEIGHT / 2]
  );

  const pinNotches = [
    makePinNotch('left', 0), makePinNotch('left', 1), makePinNotch('left', 2), makePinNotch('left', 3),
    makePinNotch('right', 0), makePinNotch('right', 1), makePinNotch('right', 2),
    makePinNotch('right', 5), makePinNotch('right', 6),
    makePinNotch('right', 9), makePinNotch('right', 10), makePinNotch('right', 11), makePinNotch('right', 12)
  ];

  const walls = difference(wallOuter, wallInner, usbCutout, backCutout, ...pinNotches);
  const barWithPlatform = union(bar, platform, walls);
  const barWithHoles = difference(barWithPlatform, centerCut, ...holes);

  const SENSOR_DIST = 18;
  const SOFA_DEPTH = 6.5 + 1 + 1.5;
  const SOFA_WIDTH = 16 + 1 * 2 + 1.5 * 2 - 2; // shaved 2mm
  const EXTENSION_HEIGHT = BAR_HEIGHT;
  const EXTENSION_WIDTH = BAR_WIDTH; // same as bar with holes
  const extensionLength = OUTER_DIST + 5 - CENTER_CUT_WIDTH / 2; // shortened to not cover center hole

  // Extension arm with two holes (hole positions relative to arm center)
  const extensionArmBase = cube({ size: [EXTENSION_WIDTH, extensionLength, EXTENSION_HEIGHT], center: true });
  const extensionHole = cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 });
  const armCenterY = CENTER_CUT_WIDTH / 2 + extensionLength / 2;
  const extensionArm = difference(
    extensionArmBase,
    translate(extensionHole, [0, INNER_DIST - armCenterY, 0]),
    translate(extensionHole, [0, OUTER_DIST - armCenterY, 0])
  );

  const bracketLeft = translate(mtf02pSofa(true, false), [0, SENSOR_DIST + SOFA_DEPTH / 2, 0]);
  const extensionLeft = translate(extensionArm, [0, armCenterY, EXTENSION_HEIGHT / 2]);

  const bracketRight = translate(scale(mtf02pSofa(true, true), [1, -1, 1]), [0, -SENSOR_DIST - SOFA_DEPTH / 2, 0]);
  const extensionRight = translate(scale(extensionArm, [1, -1, 1]), [0, -armCenterY, EXTENSION_HEIGHT / 2]);

  const BACK_SOFA_DEPTH = 6.5 + 1 + 1.5;
  const BACK_SOFA_WIDTH = 16 + 1 * 2 + 1.5 * 2 - 3;
  const BACK_OFFSET = 5;
  const backExtensionLength = SENSOR_DIST + BACK_OFFSET - PLATFORM_LENGTH / 2 + BACK_SOFA_DEPTH / 2;
  const backExtensionArm = cube({ size: [backExtensionLength, BACK_SOFA_WIDTH, EXTENSION_HEIGHT], center: true });
  const bracketBack = translate(rotate(mtf02pSofa(false, true), [0, 0, 90]), [-SENSOR_DIST - BACK_OFFSET - BACK_SOFA_DEPTH / 2, 0, 0]);
  const extensionBack = translate(backExtensionArm, [-PLATFORM_LENGTH / 2 - backExtensionLength / 2, 0, EXTENSION_HEIGHT / 2]);

  // Front bracket (+X direction)
  const FRONT_OFFSET = 5;
  const frontExtensionLength = SENSOR_DIST + FRONT_OFFSET - PLATFORM_LENGTH / 2 + BACK_SOFA_DEPTH / 2;
  const frontExtensionArm = cube({ size: [frontExtensionLength, BACK_SOFA_WIDTH, EXTENSION_HEIGHT], center: true });
  const bracketFront = translate(rotate(mtf02pSofa(false, true), [0, 0, -90]), [SENSOR_DIST + FRONT_OFFSET + BACK_SOFA_DEPTH / 2, 0, 0]);
  const extensionFront = translate(frontExtensionArm, [PLATFORM_LENGTH / 2 + frontExtensionLength / 2, 0, EXTENSION_HEIGHT / 2]);

  const yHoles = [
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [0, INNER_DIST, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [0, -INNER_DIST, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [0, OUTER_DIST, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [0, -OUTER_DIST, 0])
  ];

  const assembly = union(barWithHoles, bracketLeft, bracketRight, bracketBack, bracketFront, extensionLeft, extensionRight, extensionBack, extensionFront);
  return difference(assembly, ...yHoles);
};

// Small strip with two holes at INNER and OUTER distance
export const stripWithHoles = () => {
  const STRIP_LENGTH = OUTER_DIST + 5;
  const STRIP_WIDTH = 8;
  const STRIP_HEIGHT = 1;

  const strip = translate(
    cube({ size: [STRIP_LENGTH, STRIP_WIDTH, STRIP_HEIGHT], center: true }),
    [STRIP_LENGTH / 2, 0, STRIP_HEIGHT / 2]
  );

  const holes = [
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [INNER_DIST, 0, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [OUTER_DIST, 0, 0])
  ];

  return difference(strip, ...holes);
};

// Standing strip with two holes
export const standingStrip = () => {
  const STRIP_LENGTH = OUTER_DIST + 5;
  const STRIP_WIDTH = 8;
  const STRIP_HEIGHT = 2;

  const strip = translate(
    cube({ size: [STRIP_LENGTH, STRIP_HEIGHT, STRIP_WIDTH], center: true }),
    [STRIP_LENGTH / 2, 0, STRIP_WIDTH / 2]
  );

  // Holes go through Y (thickness), centered in Z
  const hole = rotate(cylinder({ height: 10, radius: HOLE_RADIUS, center: true, segments: 64 }), [90, 0, 0]);
  const holes = [
    translate(hole, [INNER_DIST, 0, STRIP_WIDTH / 2]),
    translate(hole, [OUTER_DIST, 0, STRIP_WIDTH / 2])
  ];

  return difference(strip, ...holes);
};

export default buildMultiSensorHoist;
