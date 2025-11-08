// coop.js
// Parametric Nordic Chicken Coop - Ported to DingCAD/Manifold
// Units: millimeters

// ============================================================================
// PARAMETERS - Main Configuration
// ============================================================================

// Coop dimensions
const coop_len = 3000;           // Coop length (X direction)
const coop_w = 3000;             // Coop width (Y direction)
const wall_h = 2000;             // Wall height (Z direction)

// Structural members
const joist_sec = [48, 98];      // Joist cross-section [thickness, height]
const stud_sec = [48, 98];       // Stud cross-section [thickness, width]
const joist_sp = 400;            // Joist spacing
const stud_sp = 400;             // Stud spacing
const floor_th = 18;             // Floor sheet thickness

// Roof
const roof_pitch_deg = 28;       // Roof pitch in degrees
const overhang = 150;            // Roof overhang on all sides

// Base
const paver_size = [200, 200, 50]; // Paver dimensions [width, depth, height]
const max_paver_spacing = 1200;    // Maximum spacing between pavers
const skid_sec = [148, 148];       // Skid cross-section [thickness, height]
const skirting_t = 12;             // Skirting panel thickness

// Doors
const door_w = 700;              // Human door width
const door_h = 1700;             // Human door height
const pop_w = 250;               // Pop door width
const pop_opening_h = 300;       // Pop door opening height
const pop_ramp_angle = 30;       // Ramp angle in degrees

// Calculate pop door height
const pop_door_height_from_ground = paver_size[2] + skid_sec[1] + joist_sec[1] + floor_th + 200;
const pop_h = pop_door_height_from_ground / Math.sin(pop_ramp_angle * Math.PI / 180);

// Vents
const vent_w = Math.max(300, Math.sqrt(coop_len * coop_w * 0.005));
const vent_h = Math.max(150, Math.sqrt(coop_len * coop_w * 0.005));
const front_vent_enabled = false;
const vent_top_clearance = 20;
const front_vent_clearance_over_door = 20;

// Nesting boxes
const nest_boxes = 3;
const nest_box_w = 300;
const nest_box_d = 400;
const nest_box_h = 350;
const nest_height_off_floor = 200;  // Lowered from 400mm to 200mm
const nest_access_lip_h = 90;

// Calculated values
const floor_stack = paver_size[2] + skid_sec[1] + joist_sec[1] + floor_th;

// Scale factor for viewing (1/100 = cm instead of mm for easier viewing)
const DISPLAY_SCALE = 0.01;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

// Calculate paver offsets
function calc_paver_offsets(len, max_spacing = 1200) {
  const num_spans = Math.max(1, Math.floor(len / max_spacing));
  const num_pavers = num_spans + 1;
  const spacing = len / num_spans;
  const offsets = [];
  for (let i = 0; i < num_pavers; i++) {
    offsets.push(i * spacing);
  }
  return offsets;
}

// ============================================================================
// COMPONENTS
// ============================================================================

// Paver row
function paver_row(len, paver, max_spacing, y) {
  const offsets = calc_paver_offsets(len, max_spacing);
  const pavers = offsets.map((offset, i) => {
    const x_offset = i === 0 ? paver[0] / 2 :
                    i === offsets.length - 1 ? offset - paver[0] / 2 :
                    offset;

    return translate(
      cube({ size: paver, center: false }),
      [x_offset - paver[0] / 2, y - paver[1] / 2, 0]
    );
  });
  return union(...pavers);
}

// Skid base - three parallel skids on paver rows
function skid_base(len, width, skid, paver, max_spacing) {
  // Three rows of pavers
  const paver1 = paver_row(len, paver, max_spacing, paver[1] / 2);
  const paver2 = paver_row(len, paver, max_spacing, width / 2);
  const paver3 = paver_row(len, paver, max_spacing, width - paver[1] / 2);

  // Three skids
  const skid1 = translate(
    cube({ size: [len, skid[0], skid[1]], center: false }),
    [0, skid[0] / 2, paver[2]]
  );
  const skid2 = translate(
    cube({ size: [len, skid[0], skid[1]], center: false }),
    [0, width / 2 - skid[0] / 2, paver[2]]
  );
  const skid3 = translate(
    cube({ size: [len, skid[0], skid[1]], center: false }),
    [0, width - skid[0] - skid[0] / 2, paver[2]]
  );

  return union(paver1, paver2, paver3, skid1, skid2, skid3);
}

// Skirting around base
function coop_skirting(len, width, height, thickness, overhang) {
  const front = translate(
    cube({ size: [len + 2 * overhang, overhang, height], center: false }),
    [-overhang, -overhang, 0]
  );
  const back = translate(
    cube({ size: [len + 2 * overhang, overhang, height], center: false }),
    [-overhang, width, 0]
  );
  const left = translate(
    cube({ size: [overhang, width + 2 * overhang, height], center: false }),
    [-overhang, -overhang, 0]
  );
  const right = translate(
    cube({ size: [overhang, width + 2 * overhang, height], center: false }),
    [len, -overhang, 0]
  );

  return union(front, back, left, right);
}

// Floor frame with joists
function floor_frame(len, width, joist, spacing, paver_h, skid_h, floor_th) {
  const base_z = paver_h + skid_h;

  // Rim joists
  const front_rim = translate(
    cube({ size: [joist[0], width, joist[1]], center: false }),
    [0, 0, base_z]
  );
  const back_rim = translate(
    cube({ size: [joist[0], width, joist[1]], center: false }),
    [len - joist[0], 0, base_z]
  );
  const left_rim = translate(
    cube({ size: [len - 2 * joist[0], joist[0], joist[1]], center: false }),
    [joist[0], 0, base_z]
  );
  const right_rim = translate(
    cube({ size: [len - 2 * joist[0], joist[0], joist[1]], center: false }),
    [joist[0], width - joist[0], base_z]
  );

  // Interior joists
  const hanger_drop = 48;
  const interior_joists = [];
  for (let x = joist[0] + spacing / 2; x < len - joist[0] - spacing / 2; x += spacing) {
    interior_joists.push(
      translate(
        cube({ size: [joist[0], width - 2 * joist[0], joist[1] - hanger_drop], center: false }),
        [x - joist[0] / 2, joist[0], base_z]
      )
    );
  }

  // Floor sheet
  const floor_sheet = translate(
    cube({ size: [len, width, floor_th], center: false }),
    [0, 0, base_z + joist[1]]
  );

  return union(front_rim, back_rim, left_rim, right_rim, ...interior_joists, floor_sheet);
}

// Single stud wall with optional cutouts
function stud_wall(len, height, stud, spacing, plate_w, cutouts = []) {
  // Bottom plate
  const bottom_plate = cube({ size: [len, plate_w, stud[0]], center: false });

  // Top plate
  const top_plate = translate(
    cube({ size: [len, plate_w, stud[0]], center: false }),
    [0, 0, height - stud[0]]
  );

  // Studs
  const studs = [];
  for (let x = 0; x <= len; x += spacing) {
    studs.push(
      translate(
        cube({ size: [stud[0], stud[1], height - 2 * stud[0]], center: false }),
        [x - stud[0] / 2, 0, stud[0]]
      )
    );
  }

  let wall = union(bottom_plate, top_plate, ...studs);

  // Apply cutouts
  if (cutouts.length > 0) {
    wall = difference(wall, ...cutouts);
  }

  return wall;
}

// Nesting box array with round entrance holes and hinged doors
function nesting_boxes(count, box_w, box_d, box_h, wall_t = 12, spacing = 18, door_angle = 45) {
  const boxes = [];
  const doors = [];

  for (let i = 0; i < count; i++) {
    const x_offset = spacing + i * (box_w + spacing);

    // Create box side panels, bottom, and top
    const left_wall = cube({ size: [wall_t, box_d, box_h], center: false });
    const right_wall = translate(
      cube({ size: [wall_t, box_d, box_h], center: false }),
      [box_w - wall_t, 0, 0]
    );
    const bottom = cube({ size: [box_w, box_d, wall_t], center: false });
    const top = translate(
      cube({ size: [box_w, box_d, wall_t], center: false }),
      [0, 0, box_h - wall_t]
    );

    // Front panel (faces into coop) - solid panel with round hole cut out
    const entrance_diameter = 250;  // 250mm round opening - bigger for chickens
    const entrance_center_h = box_h * 0.55;  // Slightly above center

    const front_panel = translate(
      cube({ size: [box_w, wall_t, box_h], center: false }),
      [0, box_d - wall_t, 0]
    );

    // Create entrance hole using cylinder
    const hole = translate(
      rotate(
        cylinder({ height: wall_t + 4, radius: entrance_diameter / 2, center: true }),
        [90, 0, 0]
      ),
      [box_w / 2, box_d - wall_t / 2, entrance_center_h]
    );

    const front_with_hole = difference(front_panel, hole);

    // Box structure (without back door) - now includes top
    const box_structure = union(left_wall, right_wall, bottom, top, front_with_hole);

    const single_box = translate(box_structure, [x_offset, 0, 0]);
    boxes.push(single_box);

    // Hinged door on back (for egg collection from outside)
    // Door is hinged at the bottom and opens downward/outward
    const door = cube({ size: [box_w - 2 * wall_t, wall_t, box_h - wall_t], center: false });

    // Rotate door around its bottom edge (hinge point)
    const door_rotated = translate(
      rotate(
        translate(door, [0, 0, -(box_h - wall_t)]),  // Move to origin at bottom
        [-door_angle, 0, 0]  // Rotate down
      ),
      [wall_t, -wall_t, box_h - wall_t]  // Move back to position
    );

    const positioned_door = translate(door_rotated, [x_offset, 0, 0]);
    doors.push(positioned_door);
  }

  return { boxes: union(...boxes), doors: union(...doors) };
}

// Gable roof
function gable_roof(len, width, wall_h, floor_stack, pitch_deg, overhang, roof_t) {
  const roof_pitch_rad = pitch_deg * Math.PI / 180;
  const half_width = width / 2;
  const roof_rise = half_width * Math.tan(roof_pitch_rad);
  const roof_length = half_width / Math.cos(roof_pitch_rad);
  const roof_plate_len = len + 2 * overhang;
  const roof_plate_width = roof_length + overhang;

  const base_z = floor_stack + wall_h;
  const peak_z = base_z + roof_rise;

  // Create a simple pitched roof using two rotated panels
  // Left panel (slopes down from peak toward Y=0)
  const left_panel = translate(
    rotate(
      translate(
        cube({ size: [roof_plate_len, roof_plate_width, roof_t], center: false }),
        [0, -roof_plate_width, 0]
      ),
      [pitch_deg, 0, 0]
    ),
    [-overhang, width / 2, peak_z]
  );

  // Right panel (slopes down from peak toward Y=width)
  const right_panel = translate(
    rotate(
      cube({ size: [roof_plate_len, roof_plate_width, roof_t], center: false }),
      [-pitch_deg, 0, 0]
    ),
    [-overhang, width / 2, peak_z]
  );

  return union(left_panel, right_panel);
}

// ============================================================================
// MAIN ASSEMBLY
// ============================================================================

// Build the foundation
const foundation = skid_base(coop_len, coop_w, skid_sec, paver_size, max_paver_spacing);

// Build the skirting
const skirting = coop_skirting(coop_len, coop_w, floor_stack, skirting_t, 25);

// Build the floor frame
const floor = floor_frame(coop_len, coop_w, joist_sec, joist_sp, paver_size[2], skid_sec[1], floor_th);

// Door and vent cutouts
const door_cutout = translate(
  cube({ size: [door_w, stud_sec[1] + 2, door_h], center: false }),
  [coop_len / 2 - door_w / 2, -1, stud_sec[0]]
);

const back_vent_bottom_z = wall_h - vent_top_clearance - vent_h - stud_sec[0];
const back_vent_cutout = translate(
  cube({ size: [vent_w, stud_sec[1] + 2, vent_h], center: false }),
  [coop_len / 2 - vent_w / 2, -1, back_vent_bottom_z]
);

const pop_door_cutout = translate(
  cube({ size: [stud_sec[1] + 2, pop_w, pop_opening_h], center: false }),
  [-1, stud_sec[1] + 50, stud_sec[0] + 50]
);

// Nesting box access cutout in front wall (external access to collect eggs)
// The cutout should align with the nesting boxes, leaving a lip at the bottom
const nest_total_w = nest_boxes * nest_box_w + (nest_boxes + 1) * 18;
const nest_box_x = coop_len / 2 - door_w / 2 - nest_total_w - 100;
// The wall's coordinate system starts at floor level (floor_stack in absolute coords)
// So cutout Z is just: nest_height_off_floor + nest_access_lip_h (relative to wall origin)
const nest_cutout_bottom_z = nest_height_off_floor + nest_access_lip_h;
const nest_cutout_height = nest_box_h - nest_access_lip_h;
const nest_access_cutout = translate(
  cube({ size: [nest_total_w, stud_sec[1] + 2, nest_cutout_height], center: false }),
  [nest_box_x, -1, nest_cutout_bottom_z]
);

// Build the walls with cutouts
const front_wall = translate(
  stud_wall(coop_len, wall_h, stud_sec, stud_sp, stud_sec[1], [door_cutout, nest_access_cutout]),
  [0, 0, floor_stack]
);

const back_wall = translate(
  rotate(
    stud_wall(coop_len, wall_h, stud_sec, stud_sp, stud_sec[1], [back_vent_cutout]),
    [0, 0, 180]
  ),
  [coop_len, coop_w, floor_stack]
);

// Left wall - using new Wall() primitive with stick-frame construction visible
const left_wall_frame = Wall({
  start: [0, 0],
  end: [0, coop_w],
  height: wall_h,
  construction: "stickFrame",
  studSize: stud_sec,
  studSpacing: stud_sp,
  includeSheathing: false  // No sheathing so you can see the studs
});

const left_wall = translate(left_wall_frame, [0, 0, floor_stack]);

const right_wall = translate(
  rotate(
    stud_wall(coop_w, wall_h, stud_sec, stud_sp, stud_sec[1], [pop_door_cutout]),
    [0, 0, 90]
  ),
  [coop_len, 0, floor_stack]
);

// Nesting box support structure
// Build a proper platform with posts directly under joists
const nest_ledger_h = 48;  // Support frame height
const support_platform_top_z = floor_stack + nest_height_off_floor;
const support_platform_bottom_z = support_platform_top_z - nest_ledger_h;
const post_height = support_platform_bottom_z - floor_stack;

// Horizontal ledger attached to wall (back edge)
const nest_ledger = translate(
  cube({ size: [nest_total_w, 48, nest_ledger_h], center: false }),
  [nest_box_x, stud_sec[1], support_platform_bottom_z]
);

// Front cross-member (front edge)
const front_member = translate(
  cube({ size: [nest_total_w, 48, nest_ledger_h], center: false }),
  [nest_box_x, stud_sec[1] + nest_box_d - 48, support_platform_bottom_z]
);

// Cross joists running front-to-back, connecting ledger to front member
const cross_joists = [];
const num_joists = Math.floor(nest_total_w / 600) + 2;

for (let i = 0; i < num_joists; i++) {
  const joist_x = nest_box_x + (i * nest_total_w) / (num_joists - 1);
  const joist = translate(
    cube({ size: [48, nest_box_d, nest_ledger_h], center: false }),
    [joist_x - 24, stud_sec[1], support_platform_bottom_z]
  );
  cross_joists.push(joist);

  // Post directly under this joist
  const post = translate(
    cube({ size: [48, 48, post_height], center: false }),
    [joist_x - 24, stud_sec[1] + nest_box_d / 2 - 24, floor_stack]
  );
  cross_joists.push(post);
}

const nest_support_structure = union(nest_ledger, front_member, ...cross_joists);

// Nesting boxes sitting ON TOP of the ledger
// Bottom of boxes should be at nest_height_off_floor
const nest_result = nesting_boxes(nest_boxes, nest_box_w, nest_box_d, nest_box_h);
const nesting_box_array = translate(
  nest_result.boxes,
  [nest_box_x, stud_sec[1], floor_stack + nest_height_off_floor]
);
const nesting_box_doors = translate(
  nest_result.doors,
  [nest_box_x, stud_sec[1], floor_stack + nest_height_off_floor]
);

// Build the roof
const roof = gable_roof(coop_len, coop_w, wall_h, floor_stack, roof_pitch_deg, overhang, 8);

// Define realistic colors for architectural elements
const CONCRETE_GRAY = [0.65, 0.65, 0.68];     // Pavers
const WOOD_TAN = [0.76, 0.60, 0.42];          // Skids (pressure-treated wood)
const PLYWOOD_LIGHT = [0.85, 0.75, 0.60];     // Floor
const WOOD_NATURAL = [0.72, 0.57, 0.38];      // Wall framing
const ROOF_CHARCOAL = [0.30, 0.30, 0.32];     // Roof shingles
const SKIRTING_DARK = [0.45, 0.36, 0.28];     // Skirting panels
const NEST_BOX_WOOD = [0.68, 0.53, 0.35];     // Nesting boxes (slightly darker wood)
const DOOR_WOOD = [0.60, 0.45, 0.30];         // Doors (darker stained wood)

// Scale down for display and apply colors
const scaledFoundation = withColor(scale(foundation, DISPLAY_SCALE), CONCRETE_GRAY);
const scaledSkirting = withColor(scale(skirting, DISPLAY_SCALE), SKIRTING_DARK);
const scaledFloor = withColor(scale(floor, DISPLAY_SCALE), PLYWOOD_LIGHT);
const scaledFrontWall = withColor(scale(front_wall, DISPLAY_SCALE), WOOD_NATURAL);
const scaledBackWall = withColor(scale(back_wall, DISPLAY_SCALE), WOOD_NATURAL);
const scaledLeftWall = withColor(scale(left_wall, DISPLAY_SCALE), WOOD_NATURAL);
const scaledRightWall = withColor(scale(right_wall, DISPLAY_SCALE), WOOD_NATURAL);
const scaledRoof = withColor(scale(roof, DISPLAY_SCALE), ROOF_CHARCOAL);
const scaledNestSupport = withColor(scale(nest_support_structure, DISPLAY_SCALE), WOOD_NATURAL);
const scaledNestingBoxes = withColor(scale(nesting_box_array, DISPLAY_SCALE), NEST_BOX_WOOD);
const scaledNestDoors = withColor(scale(nesting_box_doors, DISPLAY_SCALE), DOOR_WOOD);

// Export as array of colored objects
export const scene = [
  scaledFoundation,
  scaledSkirting,
  scaledFloor,
  scaledFrontWall,
  scaledBackWall,
  scaledLeftWall,
  scaledRightWall,
  scaledRoof,
  scaledNestSupport,
  scaledNestingBoxes,
  scaledNestDoors
];
