// Single DSTM sleeve - battery sleeve + lidar module holder assembly

const buildSleeve = ({
  width,
  height,
  length,
  wall,
  rotation = [0, 0, 0],
  translation = [0, 0, 0],
}) => {
  const outerSize = [width, height, length];
  const innerSize = [width - 2 * wall, height - 2 * wall, length];
  if (innerSize[0] <= 0 || innerSize[1] <= 0 || length <= 0) {
    throw new Error('Sleeve dimensions invalid: wall thickness too large or length non-positive.');
  }

  const outer = cube({ size: outerSize, center: true });
  const inner = cube({ size: innerSize, center: true });
  const sleeveBody = difference(outer, inner);
  return translate(rotate(sleeveBody, rotation), translation);
};

// Battery sleeve config
const BATTERY_SLEEVE = {
  width: 8,
  height: 19,
  length: 8,
  wall: 0.6,
  rotation: [0, 0, 0],
  translation: [0, 0, 0],
};

// DTS PCB (lidar module) dimensions - used for cutout
const pcbWidth = 21;
const pcbHeight = 15;
const pcbThickness = 2.6;
const componentSize = 8.8;
const componentTotalHeight = 8.1;
const smallComponentSize = 5.1;
const smallComponentTotalHeight = 6.2;
const connectorWidth = 6.0;
const connectorDepth = 8.0;
const connectorTotalHeight = 2.6;
const connectorGapX = 0.4;

const buildDTSPCB = () => {
  const pcb = cube({ size: [pcbWidth, pcbHeight, pcbThickness], center: false });

  const componentHeight = componentTotalHeight - pcbThickness;
  const componentOffsetX = pcbWidth - 3.7 - componentSize;
  const componentOffsetY = pcbHeight - 3 - componentSize;

  const component = translate(
    cube({ size: [componentSize, componentSize, componentHeight], center: false }),
    [componentOffsetX, componentOffsetY, pcbThickness]
  );

  const smallComponentHeight = smallComponentTotalHeight - pcbThickness;
  const smallGapX = 1.4;
  const smallOverlapX = 0.2;
  const smallComponentLength = smallComponentSize + smallGapX + smallOverlapX;
  const smallOffsetX = componentOffsetX - smallGapX - smallComponentSize;
  const marginY = (pcbHeight - smallComponentSize) / 2;

  const smallComponent = translate(
    cube({ size: [smallComponentLength, smallComponentSize, smallComponentHeight], center: false }),
    [smallOffsetX, marginY, pcbThickness]
  );

  const connectorHeight = connectorTotalHeight - pcbThickness;
  const connectorOffsetX = Math.min(componentOffsetX + componentSize + connectorGapX, pcbWidth - connectorWidth);
  const connectorOffsetY = componentOffsetY + componentSize / 2 - connectorDepth / 2;

  const connector = translate(
    cube({ size: [connectorWidth, connectorDepth, connectorHeight], center: false }),
    [connectorOffsetX, connectorOffsetY, pcbThickness]
  );

  return union(pcb, component, smallComponent, connector);
};

const centerOnXY = (manifold) => {
  const bounds = boundingBox(manifold);
  const centerX = (bounds.min[0] + bounds.max[0]) / 2;
  const centerY = (bounds.min[1] + bounds.max[1]) / 2;
  return translate(manifold, [-centerX, -centerY, 0]);
};

const roundedRectPrism = (width, height, depth, radius) => {
  const clampedRadius = Math.min(Math.max(radius, 0), width / 2, height / 2);
  if (clampedRadius === 0) {
    return cube({ size: [width, height, depth], center: false });
  }
  const corner = cylinder({ height: depth, radius: clampedRadius, center: true });
  const offsets = [
    [-width / 2 + clampedRadius, -height / 2 + clampedRadius],
    [width / 2 - clampedRadius, -height / 2 + clampedRadius],
    [-width / 2 + clampedRadius, height / 2 - clampedRadius],
    [width / 2 - clampedRadius, height / 2 - clampedRadius],
  ];
  const corners = offsets.map(([x, y]) => translate(corner, [x, y, 0]));
  const roundedCenter = hull(...corners);
  return translate(roundedCenter, [width / 2, height / 2, depth / 2]);
};

// Single holder for DTS module
const buildModuleHolder = () => {
  const holderPcbWidth = 16;
  const holderPcbHeight = 13;
  const holderPcbThickness = 3.8;
  const behindScale = 1.35;

  const behindSize = [holderPcbWidth * behindScale, holderPcbHeight * behindScale, holderPcbThickness * (behindScale + 0.1)];
  const behindDelta = [
    behindSize[0] - holderPcbWidth,
    behindSize[1] - holderPcbHeight,
    behindSize[2] - holderPcbThickness,
  ];
  const pcbBehind = translate(
    roundedRectPrism(behindSize[0], behindSize[1], behindSize[2], 0),
    [-behindDelta[0] / 2, -behindDelta[1] / 2, -2 - behindDelta[2] / 2]
  );

  const centeredBehind = centerOnXY(pcbBehind);
  const centeredModule = centerOnXY(buildDTSPCB());

  const rotatedModule = rotate(centeredModule, [0, 90, 0]);
  const rotatedBehind = rotate(centeredBehind, [0, 90, 0]);
  const offsetBehind = translate(rotatedBehind, [3, 0, 1]);

  const holder = difference(offsetBehind, rotatedModule);

  const bounds = boundingBox(holder);
  return translate(holder, [
    -(bounds.min[0] + bounds.max[0]) / 2,
    -(bounds.min[1] + bounds.max[1]) / 2,
    -bounds.min[2],
  ]);
};

export const buildSingleDstmSleeve = () => {
  const batterySleeve = buildSleeve(BATTERY_SLEEVE);
  const moduleHolder = buildModuleHolder();

  // Get bounds
  const sleeveBounds = boundingBox(batterySleeve);
  const holderBounds = boundingBox(moduleHolder);

  // Move holder so bottom is at Z=0
  const raisedHolder = translate(moduleHolder, [0, 0, -holderBounds.min[2]]);
  const raisedHolderBounds = boundingBox(raisedHolder);

  // Place battery sleeve on top of module holder, offset in -X
  const raisedSleeve = translate(batterySleeve, [
    -6.5,
    0,
    raisedHolderBounds.max[2] - sleeveBounds.min[2] - 1
  ]);

  // Right-angle triangular prism - slope faces +X, right angle on Y axis, centered on Y
  const triangularPrism = (width, height, depth) => {
    const triangle = [
      [[0, 0], [width, 0], [0, height]]
    ];
    // Extrude along Z, then rotate so slope faces X
    const base = extrude(triangle, { height: depth });
    const rotated = rotate(base, [90, 0, 0]);
    // Center on Y
    const bounds = boundingBox(rotated);
    const centerY = (bounds.min[1] + bounds.max[1]) / 2;
    return translate(rotated, [0, -centerY, 0]);
  };

  const prism = translate(triangularPrism(5.4, 5.4, 14.4), [-3, 0, 21.20]);

  return union(raisedHolder, raisedSleeve, prism);
};

export default buildSingleDstmSleeve;
