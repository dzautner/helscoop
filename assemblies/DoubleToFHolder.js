// V-Config Sensor Mount
// 2x VL53L5CX ToF at ±25° yaw, ±7.5mm lateral offset
// 1x MTF-02P forward-facing lidar at center

const INNER_DIST = 18.5;
const OUTER_DIST = 24;
const HOLE_RADIUS = 0.75;

// MTF-02P sofa (half width, no arms)
const mtf02pSofa = () => {
  const MTF_WIDTH = 10.5, MTF_DEPTH = 6.5, MTF_HEIGHT = 21.6;
  const BRACKET_THICK = 1.5, CLEARANCE = 1;
  const FLOOR_THICK = 1;
  const L_HEIGHT = (MTF_HEIGHT + 2) * 2 / 3;
  const L_WIDTH = MTF_WIDTH + CLEARANCE * 2 - 2;
  const TOF_L_DEPTH = 1.6 + CLEARANCE + BRACKET_THICK;

  const backWall = cube({ size: [L_WIDTH + BRACKET_THICK * 2, BRACKET_THICK, L_HEIGHT], center: true });
  const floor = cube({ size: [L_WIDTH + BRACKET_THICK * 2, TOF_L_DEPTH, FLOOR_THICK], center: true });

  return union(
    translate(backWall, [0, -TOF_L_DEPTH / 2 + BRACKET_THICK / 2, L_HEIGHT / 2 + FLOOR_THICK]),
    translate(floor, [0, 0, FLOOR_THICK / 2])
  );
};

// ToF sofa (VL53L5CX) - no arms
const tofSofa = () => {
  const TOF_W = 25.4, TOF_D = 1.6, TOF_H = 25.4;
  const BRACKET_THICK = 1.5, CLEARANCE = 1;
  const FLOOR_THICK = 1; // flatter floor
  const L_HEIGHT = (TOF_H + 2) * 2 / 3;
  const L_WIDTH = TOF_W + CLEARANCE * 2;
  const L_DEPTH = TOF_D + CLEARANCE + BRACKET_THICK;

  const backWall = cube({ size: [L_WIDTH + BRACKET_THICK * 2, BRACKET_THICK, L_HEIGHT], center: true });
  const floor = cube({ size: [L_WIDTH + BRACKET_THICK * 2, L_DEPTH, FLOOR_THICK], center: true });

  return union(
    translate(backWall, [0, -L_DEPTH / 2 + BRACKET_THICK / 2, L_HEIGHT / 2 + FLOOR_THICK]),
    translate(floor, [0, 0, FLOOR_THICK / 2])
  );
};

export const buildDoubleToFHolder = () => {
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

  // Platform for Teensy
  const PLATFORM_PADDING = 1.5;
  const PLATFORM_LENGTH = TEENSY_LENGTH + PLATFORM_PADDING * 2;
  const PLATFORM_WIDTH = TEENSY_WIDTH + PLATFORM_PADDING * 2;

  // Wall dimensions
  const WALL_THICKNESS = 1.2;
  const WALL_HEIGHT = 4;

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

  // V-config ToF sensors: ±25° yaw, ±7.5mm lateral offset (on back side, -X)
  const TOF_YAW_ANGLE = 25; // degrees
  const TOF_LATERAL_OFFSET = 20; // mm from center
  const TOF_BACK_DIST = 18; // distance back from center
  const TOF_SOFA_DEPTH = 1.6 + 1 + 1.5;

  const EXTENSION_HEIGHT = BAR_HEIGHT;
  const EXTENSION_WIDTH = BAR_WIDTH;

  // Left ToF sofa - pointing back-left (outward V)
  const tofLeft = translate(
    rotate(tofSofa(), [0, 0, 90 - TOF_YAW_ANGLE]),
    [-TOF_BACK_DIST - TOF_SOFA_DEPTH / 2, TOF_LATERAL_OFFSET, 0]
  );

  // Right ToF sofa - pointing back-right (outward V)
  const tofRight = translate(
    rotate(tofSofa(), [0, 0, 90 + TOF_YAW_ANGLE]),
    [-TOF_BACK_DIST - TOF_SOFA_DEPTH / 2, -TOF_LATERAL_OFFSET, 0]
  );

  // Extension arms for ToF sensors (back direction)
  const tofExtensionLength = TOF_BACK_DIST + TOF_SOFA_DEPTH - PLATFORM_LENGTH / 2;
  const tofExtensionArm = cube({ size: [tofExtensionLength, EXTENSION_WIDTH, EXTENSION_HEIGHT], center: true });
  const extensionTofLeft = translate(tofExtensionArm, [-PLATFORM_LENGTH / 2 - tofExtensionLength / 2, TOF_LATERAL_OFFSET, EXTENSION_HEIGHT / 2]);
  const extensionTofRight = translate(tofExtensionArm, [-PLATFORM_LENGTH / 2 - tofExtensionLength / 2, -TOF_LATERAL_OFFSET, EXTENSION_HEIGHT / 2]);

  // MTF-02P forward-facing lidar at center back (covers 5.5° center gap)
  const MTF_BACK_DIST = 24.45;
  const MTF_SOFA_DEPTH = 1.6 + 1 + 1.5; // same as tof lip
  const bracketBack = translate(
    rotate(mtf02pSofa(), [0, 0, 90]),
    [-MTF_BACK_DIST - MTF_SOFA_DEPTH / 2, 0, 0]
  );
  // Diagonal struts from center to ToF wings at 45 degrees
  const STRUT_WIDTH = 2.5;
  const STRUT_HEIGHT = 0.5;
  const strutLength = Math.sqrt(Math.pow(TOF_LATERAL_OFFSET, 2) + Math.pow(TOF_BACK_DIST, 2));
  const strutLeft = translate(
    rotate(
      cube({ size: [strutLength, STRUT_WIDTH, STRUT_HEIGHT], center: true }),
      [0, 0, -45]
    ),
    [-TOF_BACK_DIST / 2, TOF_LATERAL_OFFSET / 2, STRUT_HEIGHT / 2]
  );
  const strutRight = translate(
    rotate(
      cube({ size: [strutLength, STRUT_WIDTH, STRUT_HEIGHT], center: true }),
      [0, 0, 45]
    ),
    [-TOF_BACK_DIST / 2, -TOF_LATERAL_OFFSET / 2, STRUT_HEIGHT / 2]
  );
  const STRUT_OFFSET = 4;
  const strutLength2 = strutLength * 2.1;
  const strutLeft2 = translate(
    rotate(
      cube({ size: [strutLength2, STRUT_WIDTH, STRUT_HEIGHT], center: true }),
      [0, 0, -45]
    ),
    [-TOF_BACK_DIST / 2 + STRUT_OFFSET + 9.4, TOF_LATERAL_OFFSET / 2 + STRUT_OFFSET, STRUT_HEIGHT / 2]
  );
  const strutRight2 = translate(
    rotate(
      cube({ size: [strutLength2, STRUT_WIDTH, STRUT_HEIGHT], center: true }),
      [0, 0, 45]
    ),
    [-TOF_BACK_DIST / 2 + STRUT_OFFSET + 9.4, -TOF_LATERAL_OFFSET / 2 - STRUT_OFFSET, STRUT_HEIGHT / 2]
  );

  const yHoles = [
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [0, INNER_DIST, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [0, -INNER_DIST, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [0, OUTER_DIST, 0]),
    translate(cylinder({ height: 5, radius: HOLE_RADIUS, center: true, segments: 64 }), [0, -OUTER_DIST, 0])
  ];

  const assembly = union(
    barWithHoles,
    tofLeft, tofRight,
    bracketBack, strutLeft, strutRight, strutLeft2, strutRight2
  );
  return difference(assembly, ...yHoles);
};

export default buildDoubleToFHolder;
