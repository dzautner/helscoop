// Parametric Table - DingCAD example

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
// @param apron_height "Table" Apron Height (40-120)
const apron_height = 80;
// @param apron_thickness "Table" Apron Thickness (15-30)
const apron_thickness = 20;

const S = 0.003;
export const displayScale = S;

const OAK = [0.55, 0.35, 0.18];
const OAK_DARK = [0.45, 0.28, 0.14];

const leg_h = height - top_thickness;
const apron_y = leg_h - apron_height;
const inner_w = width - 2 * leg_size;
const inner_d = depth - 2 * leg_size;

// Tabletop
const topPlaced = translate(cube([width, top_thickness, depth]),
  [-width/2, leg_h, -depth/2]);

// Four legs
const allLegs = union([
  translate(cube([leg_size, leg_h, leg_size]), [-width/2, 0, -depth/2]),
  translate(cube([leg_size, leg_h, leg_size]), [width/2 - leg_size, 0, -depth/2]),
  translate(cube([leg_size, leg_h, leg_size]), [-width/2, 0, depth/2 - leg_size]),
  translate(cube([leg_size, leg_h, leg_size]), [width/2 - leg_size, 0, depth/2 - leg_size]),
]);

// Aprons (cross-braces under tabletop between legs)
const allAprons = union([
  // Front and back aprons
  translate(cube([inner_w, apron_height, apron_thickness]),
    [-width/2 + leg_size, apron_y, -depth/2 + (leg_size - apron_thickness)/2]),
  translate(cube([inner_w, apron_height, apron_thickness]),
    [-width/2 + leg_size, apron_y, depth/2 - leg_size + (leg_size - apron_thickness)/2]),
  // Side aprons
  translate(cube([apron_thickness, apron_height, inner_d]),
    [-width/2 + (leg_size - apron_thickness)/2, apron_y, -depth/2 + leg_size]),
  translate(cube([apron_thickness, apron_height, inner_d]),
    [width/2 - leg_size + (leg_size - apron_thickness)/2, apron_y, -depth/2 + leg_size]),
]);

export const scene = [
  withColor(scale(topPlaced, S), OAK),
  withColor(scale(allLegs, S), OAK_DARK),
  withColor(scale(allAprons, S), OAK_DARK),
];
