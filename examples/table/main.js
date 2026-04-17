// Parametric Table - minimal DingCAD example

// @param width "Table" Width (400-2000)
const width = 1200;
// @param depth "Table" Depth (300-1200)
const depth = 600;
// @param height "Table" Height (400-900)
const height = 750;
// @param top_thickness "Table" Top Thickness (15-50)
const top_thickness = 25;
// @param leg_size "Table" Leg Size (30-80)
const leg_size = 50;

const S = 0.003;
export const displayScale = S;

const OAK = [0.55, 0.35, 0.18];
const OAK_DARK = [0.45, 0.28, 0.14];

const leg_h = height - top_thickness;

// Tabletop
const top = cube([width, top_thickness, depth]);
const topPlaced = translate(top, [-width/2, leg_h, -depth/2]);

// Four legs
const l1 = translate(cube([leg_size, leg_h, leg_size]), [-width/2, 0, -depth/2]);
const l2 = translate(cube([leg_size, leg_h, leg_size]), [width/2 - leg_size, 0, -depth/2]);
const l3 = translate(cube([leg_size, leg_h, leg_size]), [-width/2, 0, depth/2 - leg_size]);
const l4 = translate(cube([leg_size, leg_h, leg_size]), [width/2 - leg_size, 0, depth/2 - leg_size]);
const allLegs = union([l1, l2, l3, l4]);

// Scale and color
const scaledTop = withColor(scale(topPlaced, S), OAK);
const scaledLegs = withColor(scale(allLegs, S), OAK_DARK);

export const scene = [scaledTop, scaledLegs];
