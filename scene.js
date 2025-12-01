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
const door_w = 649;              // Human door width
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
const DISPLAY_SCALE = 0.003;  // Smaller to see whole scene
// Export display scale for surface area calculation in C++
export const displayScale = DISPLAY_SCALE;

// ============================================================================
// VISIBILITY TOGGLES - Show/hide components to see inside
// ============================================================================
// @param show_cladding "Visibility" Show exterior cladding (0-1)
const show_cladding = 1;       // 1=show, 0=hide exterior cladding
// @param show_roof "Visibility" Show roof (0-1)
const show_roof = 1;           // 1=show, 0=hide roof
// @param show_walls "Visibility" Show wall framing (0-1)
const show_walls = 1;          // 1=show, 0=hide wall framing
// @param show_floor "Visibility" Show floor and foundation (0-1)
const show_floor = 1;          // 1=show, 0=hide floor
// @param show_insulation "Visibility" Show insulation (0-1)
const show_insulation = 1;     // 1=show, 0=hide insulation
// @param show_run "Visibility" Show chicken run (0-1)
const show_run = 1;            // 1=show, 0=hide run
// @param show_tunnel "Visibility" Show viewing tunnel (0-1)
const show_tunnel = 1;         // 1=show, 0=hide tunnel
// @param show_interior "Visibility" Show interior (roosts, nests) (0-1)
const show_interior = 1;       // 1=show, 0=hide interior
// @param show_chickens "Visibility" Show chickens (0-1)
const show_chickens = 1;       // 1=show, 0=hide chickens

// ============================================================================
// DOOR ANGLES - Simulate doors open/closed (degrees)
// ============================================================================
// @param human_door_angle "Doors" Human door swing angle (0-120)
const human_door_angle = 0;    // 0=closed, 90=fully open
// @param nest_lid_angle "Doors" Nest box lid angle (0-90)
const nest_lid_angle = 45;     // 0=closed, 90=fully open
// @param tunnel_door_angle "Doors" Tunnel access door angle (0-90)
const tunnel_door_angle = 30;  // 0=closed, 90=fully open
// @param run_gate_angle "Doors" Run gate swing angle (0-120)
const run_gate_angle = 0;      // 0=closed, 90=open

// ============================================================================
// ELECTRICITY & HEATING COSTS (Finland 2024)
// ============================================================================
// @param electricity_price "Energy" Electricity price c/kWh (5-50)
const electricity_price = 12;  // Finnish spot price ~8-15 c/kWh average
// @param heater_power "Energy" Heater power in watts (100-2000)
const heater_power = 250;      // Chicken heat plate ~250W
// @param chicken_body_heat "Energy" Heat per chicken in watts (5-15)
const chicken_body_heat = 10;  // ~10W per chicken body heat
// @param num_chickens_for_heat "Energy" Number of chickens (0-20)
const num_chickens_for_heat = 6; // 6 chickens = 60W body heat

// Calculate total heat input and monthly cost
const total_heat_input_W = heater_power + (chicken_body_heat * num_chickens_for_heat);
const monthly_kwh = (heater_power / 1000) * 24 * 30;  // kWh per month (heater only)
const monthly_cost_eur = (monthly_kwh * electricity_price) / 100;  // € per month

// Export heating info for thermal panel
export const heatingInfo = {
  heaterPower: heater_power,
  chickenHeat: chicken_body_heat * num_chickens_for_heat,
  totalHeat: total_heat_input_W,
  monthlyKwh: monthly_kwh,
  monthlyCost: monthly_cost_eur,
  electricityPrice: electricity_price
};

// ============================================================================
// MATERIALS & PRICING - Bill of Materials for cost estimation
// Finnish lumber dimensions and prices (from Sarokas, K-Rauta)
// Quantities are calculated dynamically based on coop parameters
// ============================================================================

// Calculate material quantities based on coop dimensions
const wall_perimeter = 2 * (coop_len + coop_w);  // mm
const wall_studs = Math.ceil(wall_perimeter / stud_sp) + 4;  // 4 corners
const floor_joists = Math.ceil(coop_len / joist_sp) + 1;
const floor_area_sqm = (coop_len * coop_w) / 1000000;
const wall_area_sqm = (wall_perimeter * wall_h) / 1000000;
const roof_pitch_rad = roof_pitch_deg * Math.PI / 180;
const roof_run = coop_w / 2;
const roof_slope_len = roof_run / Math.cos(roof_pitch_rad);
const roof_area_sqm = (coop_len + 2 * overhang) * (roof_slope_len + overhang) * 2 / 1000000;
const rafter_count = Math.ceil(coop_len / joist_sp) + 1;

// Finnish lumber lengths: calculate total running meters (jm) needed
const stud_length_m = wall_h / 1000;  // Studs are wall height
const plate_length_jm = (wall_perimeter * 2) / 1000;  // Top + bottom plates
const joist_length_m = coop_w / 1000;  // Joists span the width
const rafter_length_m = (roof_slope_len + overhang) / 1000;  // Rafter length

// Total running meters for each lumber type
const studs_jm = wall_studs * stud_length_m;
const joists_jm = floor_joists * joist_length_m;
const rafters_jm = rafter_count * 2 * rafter_length_m;

// Sheet counts (Finnish standard: 2440x1200mm = ~2.93 sqm each)
const floor_sheets = Math.ceil(floor_area_sqm / 2.93);
const wall_sheets = Math.ceil(wall_area_sqm / 2.93);
const roof_sheets = Math.ceil(roof_area_sqm / 2.93);

// Roofing felt rolls (~15 sqm per roll)
const felt_rolls = Math.ceil(roof_area_sqm / 15);

// Paint coverage (~10 sqm/liter, 2 coats)
const total_paint_area = wall_area_sqm + roof_area_sqm * 0.3;
const paint_liters = Math.ceil(total_paint_area / 5);

export const materials = [
  // Sahatavara - Runko (Finnish C24 lumber, prices in €/jm from Sarokas)
  { name: "48x98 Runkopuu C24", materialId: "pine_48x98_c24", category: "Sahatavara", link: "https://www.sarokas.fi/mitallistettu-48x98-c24", unit: "jm", unitPrice: 2.60, quantity: Math.ceil(studs_jm + plate_length_jm) },
  { name: "48x148 Lattiavasat C24", materialId: "pine_48x148_c24", category: "Sahatavara", link: "https://www.sarokas.fi/mitallistettu-48x148-c24", unit: "jm", unitPrice: 3.70, quantity: Math.ceil(joists_jm) },
  { name: "48x98 Kattoristikot C24", materialId: "pine_48x98_c24", category: "Sahatavara", link: "https://www.sarokas.fi/mitallistettu-48x98-c24", unit: "jm", unitPrice: 2.60, quantity: Math.ceil(rafters_jm) },
  { name: "Kestopuu 48x148 (jalat)", materialId: "pressure_treated_48x148", category: "Sahatavara", link: "https://www.sarokas.fi/kestopuu-48-148-vihrea", unit: "jm", unitPrice: 3.80, quantity: 12 },

  // Levytavara (Finnish panels)
  { name: "Havuvaneri 18mm lattiaan", materialId: "osb_18mm", category: "Levytavara", link: "https://www.sarokas.fi/vaneri-havu-18mm-iii-iii-2440x1200", unit: "levy", unitPrice: 62.78, quantity: floor_sheets },
  { name: "Havuvaneri 12mm kattoon", materialId: "galvanized_roofing", category: "Levytavara", link: "https://www.sarokas.fi/vaneri-havu-12mm", unit: "levy", unitPrice: 45.00, quantity: roof_sheets },
  { name: "Ulkovuoripaneeli 21mm", materialId: "plywood_9mm_exterior", category: "Levytavara", link: "https://www.k-rauta.fi/kategoria/puutavara", unit: "levy", unitPrice: 55.00, quantity: wall_sheets },

  // Katto (Roofing)
  { name: "Katehuopa 15 sqm", materialId: "galvanized_roofing", category: "Katto", link: "https://www.k-rauta.fi/kategoria/katto", unit: "rulla", unitPrice: 35.00, quantity: felt_rolls },
  { name: "Räystäslista 2m", materialId: "exterior_paint_white", category: "Katto", link: "https://www.k-rauta.fi/kategoria/katto", unit: "kpl", unitPrice: 8.50, quantity: Math.ceil((coop_len * 2 + coop_w * 4) / 2000) },
  { name: "Harjalista 2m", materialId: "galvanized_roofing", category: "Katto", link: "https://www.k-rauta.fi/kategoria/katto", unit: "kpl", unitPrice: 12.00, quantity: Math.ceil(coop_len / 2000) },

  // Kiinnitystarvikkeet (Hardware)
  { name: "Ruuvit 4.5x75 (500kpl)", category: "Kiinnitys", link: "https://www.k-rauta.fi/kategoria/kiinnitystarvikkeet", unit: "pak", unitPrice: 24.90, quantity: Math.ceil(wall_studs / 100) },
  { name: "Kattonaulat (1kg)", category: "Kiinnitys", link: "https://www.k-rauta.fi/kategoria/kiinnitystarvikkeet", unit: "pak", unitPrice: 12.90, quantity: Math.ceil(roof_area_sqm / 10) },
  { name: "Palkkikengät", category: "Kiinnitys", link: "https://www.k-rauta.fi/kategoria/kiinnitystarvikkeet", unit: "kpl", unitPrice: 2.50, quantity: floor_joists },
  { name: "Kulmarauta", category: "Kiinnitys", link: "https://www.k-rauta.fi/kategoria/kiinnitystarvikkeet", unit: "kpl", unitPrice: 1.80, quantity: rafter_count * 2 },
  { name: "Saranat (pari)", category: "Kiinnitys", link: "https://www.k-rauta.fi/kategoria/kiinnitystarvikkeet", unit: "pari", unitPrice: 6.90, quantity: 4 },
  { name: "Oven salpa", category: "Kiinnitys", link: "https://www.k-rauta.fi/kategoria/kiinnitystarvikkeet", unit: "kpl", unitPrice: 12.90, quantity: 2 },

  // Kanalalle (Chicken-specific)
  { name: "Hitsattu verkko 12mm", materialId: "hardware_cloth", category: "Kanala", link: "https://www.puuilo.fi/verkkotuotteet", unit: "rulla", unitPrice: 89.00, quantity: 2 },
  { name: "Kanaverkko 50mm", materialId: "hardware_cloth", category: "Kanala", link: "https://www.puuilo.fi/verkkotuotteet", unit: "rulla", unitPrice: 45.00, quantity: 1 },
  { name: "Automaattinen luukku", category: "Kanala", link: "https://www.amazon.de", unit: "kpl", unitPrice: 85.00, quantity: 1 },
  { name: "Pesälaatikon pohja", materialId: "nest_box_plywood", category: "Kanala", link: "https://www.puuilo.fi", unit: "kpl", unitPrice: 8.90, quantity: nest_boxes },
  { name: "Orsi 50mm pyöreä (2m)", materialId: "pine_48x98_c24", category: "Kanala", link: "https://www.k-rauta.fi", unit: "kpl", unitPrice: 6.90, quantity: Math.ceil(coop_len / 800) },

  // Maalaus & Pintakäsittely
  { name: "Ulkomaali (Tikkurila)", category: "Maalaus", link: "https://www.k-rauta.fi/kategoria/maalit", unit: "litra", unitPrice: 14.90, quantity: paint_liters },
  { name: "Pohjuste (puulle)", category: "Maalaus", link: "https://www.k-rauta.fi/kategoria/maalit", unit: "litra", unitPrice: 12.90, quantity: Math.ceil(paint_liters * 0.5) },

  // Eristeet (Insulation)
  { name: "Mineraalivilla 100mm (seinät)", materialId: "insulation_100mm", category: "Eristeet", link: "https://www.paroc.fi/tuotteet/seinaeristeet", unit: "sqm", unitPrice: 6.50, quantity: Math.ceil(wall_area_sqm) },
  { name: "Mineraalivilla 100mm (katto)", materialId: "insulation_100mm", category: "Eristeet", link: "https://www.paroc.fi/tuotteet/kattoeristeet", unit: "sqm", unitPrice: 6.50, quantity: Math.ceil(roof_area_sqm) },
  { name: "Mineraalivilla 100mm (lattia)", materialId: "insulation_100mm", category: "Eristeet", link: "https://www.paroc.fi/tuotteet/lattiaeristeet", unit: "sqm", unitPrice: 6.50, quantity: Math.ceil(floor_area_sqm) },

  // Lämpösillat (Thermal weak points - for thermal simulation, not BOM)
  { name: "Ovi (lämpösilta)", materialId: "door_thermal_bridge", category: "Lämpösillat", unit: "kpl", unitPrice: 0, quantity: 1 },
];

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
// CLADDING SYSTEM - Horizontal lap siding with trim
// ============================================================================

// Cladding colors
const CLADDING_MAIN = [0.93, 0.78, 0.18];  // Golden yellow siding
const CLADDING_TRIM = [1, 1, 1];            // White trim

// Horizontal cladding for walls running along X axis (front/back walls)
// Creates solid panel with cutouts, plus corner trim boards
function horizontal_cladding_x(len, height, base_pos, cutouts = [], margin = 25, thickness = 18, trim_w = 45) {
  const panel_x = base_pos[0] - margin;
  const panel_y = base_pos[1];
  const panel_z = base_pos[2];
  const panel_len = len + 2 * margin;

  // Main cladding panel
  let panel = translate(
    cube({ size: [panel_len, thickness, height], center: false }),
    [panel_x, panel_y, panel_z]
  );

  // Apply cutouts
  for (const cutout of cutouts) {
    const cutout_pos = cutout[0];
    const cutout_size = cutout[1];
    const cutout_box = translate(
      cube({ size: cutout_size, center: false }),
      cutout_pos
    );
    panel = difference(panel, cutout_box);
  }

  // Corner trim boards (vertical)
  const left_trim = translate(
    cube({ size: [trim_w, thickness, height], center: false }),
    [base_pos[0] - margin - trim_w, panel_y, panel_z]
  );
  const right_trim = translate(
    cube({ size: [trim_w, thickness, height], center: false }),
    [base_pos[0] + len + margin, panel_y, panel_z]
  );

  // Top and bottom trim (horizontal)
  const trim_total_len = len + 2 * margin + 2 * trim_w;
  const top_trim = translate(
    cube({ size: [trim_total_len, thickness, 18], center: false }),
    [base_pos[0] - margin - trim_w, panel_y, panel_z + height]
  );
  const bottom_trim = translate(
    cube({ size: [trim_total_len, thickness, 18], center: false }),
    [base_pos[0] - margin - trim_w, panel_y, panel_z - 18]
  );

  return {
    panel: panel,
    trim: union(left_trim, right_trim, top_trim, bottom_trim)
  };
}

// Horizontal cladding for walls running along Y axis (left/right walls)
function horizontal_cladding_y(width, height, base_pos, cutouts = [], margin = 25, thickness = 18, trim_w = 45) {
  const panel_x = base_pos[0];
  const panel_y = base_pos[1] - margin;
  const panel_z = base_pos[2];
  const panel_width = width + 2 * margin;

  // Main cladding panel
  let panel = translate(
    cube({ size: [thickness, panel_width, height], center: false }),
    [panel_x, panel_y, panel_z]
  );

  // Apply cutouts
  for (const cutout of cutouts) {
    const cutout_pos = cutout[0];
    const cutout_size = cutout[1];
    const cutout_box = translate(
      cube({ size: cutout_size, center: false }),
      cutout_pos
    );
    panel = difference(panel, cutout_box);
  }

  // Corner trim boards (vertical)
  const front_trim = translate(
    cube({ size: [thickness, trim_w, height], center: false }),
    [panel_x, base_pos[1] - margin - trim_w, panel_z]
  );
  const back_trim = translate(
    cube({ size: [thickness, trim_w, height], center: false }),
    [panel_x, base_pos[1] + width + margin, panel_z]
  );

  // Top and bottom trim (horizontal)
  const trim_total_width = width + 2 * margin + 2 * trim_w;
  const top_trim = translate(
    cube({ size: [thickness, trim_total_width, 18], center: false }),
    [panel_x, base_pos[1] - margin - trim_w, panel_z + height]
  );
  const bottom_trim = translate(
    cube({ size: [thickness, trim_total_width, 18], center: false }),
    [panel_x, base_pos[1] - margin - trim_w, panel_z - 18]
  );

  return {
    panel: panel,
    trim: union(front_trim, back_trim, top_trim, bottom_trim)
  };
}

// Door panel - hinged door that swings outward
function door_panel(width, height, thickness = 18) {
  return cube({ size: [width, thickness, height], center: false });
}

// Pop door panel - bottom-hinged ramp with grip cleats
function pop_door_panel(width, length, thickness = 18, num_cleats = 8) {
  // Main ramp surface
  const ramp = cube({ size: [width, thickness, length], center: false });

  // Add grip cleats
  const cleats = [];
  const cleat_spacing = length / (num_cleats + 1);
  for (let i = 1; i <= num_cleats; i++) {
    const cleat = translate(
      cube({ size: [width, 10, 10], center: false }),
      [0, thickness, i * cleat_spacing - 5]
    );
    cleats.push(cleat);
  }

  return union(ramp, ...cleats);
}

// Roosting perch - cylindrical roost
function roosting_perch(length, diameter = 50) {
  return rotate(
    cylinder({ height: length, radius: diameter / 2, center: false }),
    [0, 90, 0]
  );
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

// Gable roof with complete enclosure
function gable_roof(len, width, wall_h, floor_stack, pitch_deg, overhang, roof_t) {
  const roof_pitch_rad = pitch_deg * Math.PI / 180;
  const half_width = width / 2;
  const roof_rise = half_width * Math.tan(roof_pitch_rad);
  const roof_length = half_width / Math.cos(roof_pitch_rad);
  const roof_plate_len = len + 2 * overhang;
  const roof_plate_width = roof_length + overhang;

  const base_z = floor_stack + wall_h;
  const peak_z = base_z + roof_rise;

  // Gable end panel thickness - matches wall framing for solid integration
  const gable_thickness = 98;  // Match stud width for proper wall integration

  // Create pitched roof panels
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

  // Gable end infill - solid triangular walls using hull()
  // Use thin vertical plates at triangle vertices for clean hull geometry
  const vertex_size = 10;  // Size of hull vertex elements

  // Extra height to ensure overlap with roof underside (avoid gaps)
  const overlap = 20;

  // Front gable - triangular infill above front wall
  // Triangle vertices: bottom-left (Y=0), bottom-right (Y=width), peak (Y=width/2)
  const front_gable = translate(
    hull(
      // Bottom-left vertex
      cube({ size: [gable_thickness, vertex_size, vertex_size], center: false }),
      // Bottom-right vertex
      translate(
        cube({ size: [gable_thickness, vertex_size, vertex_size], center: false }),
        [0, width - vertex_size, 0]
      ),
      // Peak vertex (with overlap to ensure contact with roof)
      translate(
        cube({ size: [gable_thickness, vertex_size, vertex_size], center: false }),
        [0, half_width - vertex_size / 2, roof_rise + overlap]
      )
    ),
    [0, 0, base_z]
  );

  // Back gable - same triangle at the back of the coop
  const back_gable = translate(
    hull(
      cube({ size: [gable_thickness, vertex_size, vertex_size], center: false }),
      translate(
        cube({ size: [gable_thickness, vertex_size, vertex_size], center: false }),
        [0, width - vertex_size, 0]
      ),
      translate(
        cube({ size: [gable_thickness, vertex_size, vertex_size], center: false }),
        [0, half_width - vertex_size / 2, roof_rise + overlap]
      )
    ),
    [len - gable_thickness, 0, base_z]
  );

  // Ridge board - structural member at the peak
  const ridge_height = 50;
  const ridge_thickness = 25;
  const ridge_board = translate(
    cube({ size: [len, ridge_thickness, ridge_height], center: false }),
    [0, width / 2 - ridge_thickness / 2, peak_z - ridge_height]
  );

  // Barge boards (verge boards) - trim along the gable rake edges
  // These follow the roof pitch at each gable end
  const barge_width = 150;
  const barge_thickness = 25;

  // Front gable barge boards (left and right of peak)
  const front_barge_left = translate(
    rotate(
      translate(
        cube({ size: [barge_thickness, roof_length + overhang, barge_width], center: false }),
        [0, -(roof_length + overhang), 0]
      ),
      [pitch_deg, 0, 0]
    ),
    [-overhang, width / 2, peak_z]
  );

  const front_barge_right = translate(
    rotate(
      cube({ size: [barge_thickness, roof_length + overhang, barge_width], center: false }),
      [-pitch_deg, 0, 0]
    ),
    [-overhang, width / 2, peak_z]
  );

  // Back gable barge boards
  const back_barge_left = translate(
    rotate(
      translate(
        cube({ size: [barge_thickness, roof_length + overhang, barge_width], center: false }),
        [0, -(roof_length + overhang), 0]
      ),
      [pitch_deg, 0, 0]
    ),
    [len + overhang - barge_thickness, width / 2, peak_z]
  );

  const back_barge_right = translate(
    rotate(
      cube({ size: [barge_thickness, roof_length + overhang, barge_width], center: false }),
      [-pitch_deg, 0, 0]
    ),
    [len + overhang - barge_thickness, width / 2, peak_z]
  );

  return union(
    left_panel, right_panel,
    front_gable, back_gable,
    ridge_board,
    front_barge_left, front_barge_right,
    back_barge_left, back_barge_right
  );
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

// Nesting box access cutout in front wall (external access to collect eggs)
// The cutout should align with the nesting boxes, leaving a lip at the bottom
const nest_spacing = 18;
const nest_total_w = nest_boxes * nest_box_w + (nest_boxes + 1) * nest_spacing;
const nest_box_x = coop_len / 2 - door_w / 2 - nest_total_w - 100;
// Cutout should match actual box positions (excluding outer spacing)
const nest_cutout_w = nest_boxes * nest_box_w + (nest_boxes - 1) * nest_spacing;
const nest_cutout_x = nest_box_x + nest_spacing;  // Start where first box starts
// The wall's coordinate system starts at floor level (floor_stack in absolute coords)
// So cutout Z is just: nest_height_off_floor + nest_access_lip_h (relative to wall origin)
const nest_cutout_bottom_z = nest_height_off_floor + nest_access_lip_h;
const nest_cutout_height = nest_box_h - nest_access_lip_h;
const nest_access_cutout = translate(
  cube({ size: [nest_cutout_w, stud_sec[1] + 2, nest_cutout_height], center: false }),
  [nest_cutout_x, -1, nest_cutout_bottom_z]
);

// Build the walls using Wall() primitive with stick-frame construction

// Front wall - along X axis from [0,0] to [coop_len, 0]
const front_wall_frame = Wall({
  start: [0, 0],
  end: [coop_len, 0],
  height: wall_h,
  construction: "stickFrame",
  studSize: stud_sec,
  studSpacing: stud_sp,
  includeSheathing: false
});
const front_wall = difference(
  translate(front_wall_frame, [0, 0, floor_stack]),
  translate(door_cutout, [0, 0, floor_stack]),
  translate(nest_access_cutout, [0, 0, floor_stack])
);

// Back wall - along X axis from [0, coop_w] to [coop_len, coop_w]
const back_wall_frame = Wall({
  start: [0, coop_w],
  end: [coop_len, coop_w],
  height: wall_h,
  construction: "stickFrame",
  studSize: stud_sec,
  studSpacing: stud_sp,
  includeSheathing: false
});
const back_wall = difference(
  translate(back_wall_frame, [0, 0, floor_stack]),
  translate(back_vent_cutout, [0, 0, floor_stack])
);

// Left wall - along Y axis from [0, coop_w] to [0, 0]
const left_wall_frame = Wall({
  start: [0, coop_w],
  end: [0, 0],
  height: wall_h,
  construction: "stickFrame",
  studSize: stud_sec,
  studSpacing: stud_sp,
  includeSheathing: false
});
const left_wall = translate(left_wall_frame, [0, 0, floor_stack]);

// Right wall - along Y axis from [coop_len, 0] to [coop_len, coop_w]
const right_wall_frame = Wall({
  start: [coop_len, 0],
  end: [coop_len, coop_w],
  height: wall_h,
  construction: "stickFrame",
  studSize: stud_sec,
  studSpacing: stud_sp,
  includeSheathing: false
});
const right_wall = translate(right_wall_frame, [0, 0, floor_stack]);

// Nesting box support structure
// Build a proper platform with posts directly under joists
const nest_ledger_h = 48;  // Support frame height
const support_platform_top_z = floor_stack + nest_height_off_floor;
const support_platform_bottom_z = support_platform_top_z - nest_ledger_h;
const post_height = support_platform_bottom_z - floor_stack;

// Horizontal ledger attached to wall (back edge) - now at Y=0 to match boxes
const nest_ledger = translate(
  cube({ size: [nest_total_w, 48, nest_ledger_h], center: false }),
  [nest_box_x, 0, support_platform_bottom_z]
);

// Front cross-member (front edge)
const front_member = translate(
  cube({ size: [nest_total_w, 48, nest_ledger_h], center: false }),
  [nest_box_x, nest_box_d - 48, support_platform_bottom_z]
);

// Cross joists running front-to-back, connecting ledger to front member
const cross_joists = [];
const num_joists = Math.floor(nest_total_w / 600) + 2;

for (let i = 0; i < num_joists; i++) {
  const joist_x = nest_box_x + (i * nest_total_w) / (num_joists - 1);
  const joist = translate(
    cube({ size: [48, nest_box_d, nest_ledger_h], center: false }),
    [joist_x - 24, 0, support_platform_bottom_z]
  );
  cross_joists.push(joist);

  // Post directly under this joist
  const post = translate(
    cube({ size: [48, 48, post_height], center: false }),
    [joist_x - 24, nest_box_d / 2 - 24, floor_stack]
  );
  cross_joists.push(post);
}

const nest_support_structure = union(nest_ledger, front_member, ...cross_joists);

// Nesting boxes sitting ON TOP of the ledger
// Bottom of boxes should be at nest_height_off_floor
// Position at Y=0 (flush with front wall) so access doors face exterior
// and wall cutout aligns with boxes
const nest_result = nesting_boxes(nest_boxes, nest_box_w, nest_box_d, nest_box_h, 12, 18, nest_lid_angle);
const nesting_box_array = translate(
  nest_result.boxes,
  [nest_box_x, 0, floor_stack + nest_height_off_floor]
);
const nesting_box_doors = translate(
  nest_result.doors,
  [nest_box_x, 0, floor_stack + nest_height_off_floor]
);

// Build the roof
const roof = gable_roof(coop_len, coop_w, wall_h, floor_stack, roof_pitch_deg, overhang, 8);

// ============================================================================
// ROOF INSULATION - 100mm mineral wool under roof panels
// ============================================================================

const insulation_thickness = 100;  // 100mm mineral wool batts

// Calculate roof geometry (must match gable_roof function)
const roof_base_z = floor_stack + wall_h;
const roof_half_width = coop_w / 2;
const roof_rise = roof_half_width * Math.tan(roof_pitch_deg * Math.PI / 180);
const roof_slope_length = roof_half_width / Math.cos(roof_pitch_deg * Math.PI / 180);
const roof_peak_z = roof_base_z + roof_rise;
const insulation_plate_len = coop_len;  // No overhang for insulation (stays inside)
const insulation_plate_width = roof_slope_length;  // Match roof slope length

// Left roof insulation panel - positioned below metal roofing
// The insulation sits on the underside of the roof, between rafters
const roof_insulation_left = translate(
  rotate(
    translate(
      cube({ size: [insulation_plate_len, insulation_plate_width, insulation_thickness], center: false }),
      [0, -insulation_plate_width, -insulation_thickness]  // Below roof panel
    ),
    [roof_pitch_deg, 0, 0]
  ),
  [0, coop_w / 2, roof_peak_z]
);

// Right roof insulation panel - mirror of left
const roof_insulation_right = translate(
  rotate(
    cube({ size: [insulation_plate_len, insulation_plate_width, insulation_thickness], center: false }),
    [-roof_pitch_deg, 0, 0]
  ),
  [0, coop_w / 2, roof_peak_z - insulation_thickness]
);

// Combined roof insulation
const roof_insulation = union(roof_insulation_left, roof_insulation_right);

// ============================================================================
// WALL INSULATION - 100mm mineral wool in wall cavities
// ============================================================================

// Wall insulation fills the stud cavities (between interior and exterior)
// Stud depth is 98mm, so 100mm insulation will compress slightly (realistic)
const wall_insulation_depth = stud_sec[1];  // Match stud depth (98mm)

// Front wall insulation (along X axis at Y=0) - with door and nest access cutouts
const front_wall_insulation_base = translate(
  cube({ size: [coop_len, wall_insulation_depth, wall_h], center: false }),
  [0, 0, floor_stack]
);
// Door cutout in front insulation
// Make cutout extend beyond insulation boundaries to ensure clean cut
const front_insulation_door_cutout = translate(
  cube({ size: [door_w + 10, wall_insulation_depth + 20, door_h + 10], center: false }),
  [coop_len / 2 - door_w / 2 - 5, -10, floor_stack + stud_sec[0] - 5]
);
// Nesting box access cutout in front insulation
const front_insulation_nest_cutout = translate(
  cube({ size: [nest_cutout_w, wall_insulation_depth + 2, nest_cutout_height], center: false }),
  [nest_cutout_x, -1, floor_stack + nest_cutout_bottom_z]
);
const front_wall_insulation = difference(
  difference(front_wall_insulation_base, front_insulation_door_cutout),
  front_insulation_nest_cutout
);

// Back wall insulation (along X axis at Y=coop_w) - with vent cutout
const back_wall_insulation_base = translate(
  cube({ size: [coop_len, wall_insulation_depth, wall_h], center: false }),
  [0, coop_w, floor_stack]
);
// Vent cutout in back insulation
const back_insulation_vent_cutout = translate(
  cube({ size: [vent_w, wall_insulation_depth + 2, vent_h], center: false }),
  [coop_len / 2 - vent_w / 2, coop_w - 1, floor_stack + back_vent_bottom_z]
);
const back_wall_insulation = difference(back_wall_insulation_base, back_insulation_vent_cutout);

// Left wall insulation (along Y axis at X=0) - no cutouts
const left_wall_insulation = translate(
  cube({ size: [wall_insulation_depth, coop_w, wall_h], center: false }),
  [0, 0, floor_stack]
);

// Right wall insulation (along Y axis at X=coop_len) - with nesting box cutout
const right_wall_insulation_base = translate(
  cube({ size: [wall_insulation_depth, coop_w, wall_h], center: false }),
  [coop_len, 0, floor_stack]
);
// Nesting box exterior cutout - boxes protrude through right wall
// The boxes are positioned at nest_box_x (X position) and extend nest_box_d into the wall
// We need to cut through at Y position where boxes sit (centered around coop_w/2)
const nest_box_y_start = 0;  // Nesting boxes span from front wall
const nest_box_y_end = nest_box_d + 50;  // Box depth plus some margin
const right_insulation_nest_cutout = translate(
  cube({ size: [wall_insulation_depth + 2, nest_box_y_end - nest_box_y_start, nest_box_h + 50], center: false }),
  [coop_len - 1, nest_box_y_start, floor_stack + nest_height_off_floor]
);
const right_wall_insulation = difference(right_wall_insulation_base, right_insulation_nest_cutout);

// Combined wall insulation
const wall_insulation = union(
  front_wall_insulation,
  back_wall_insulation,
  left_wall_insulation,
  right_wall_insulation
);

// ============================================================================
// THERMAL NOTE: Openings (doors, vents) use ACTUAL geometry with thermal materials
// ============================================================================
// The thermal calculation works correctly because:
// 1. Wall insulation has cutouts where doors/vents are (CSG difference)
// 2. The actual door/vent geometry has materials with "opening" category
// 3. Heat loss is calculated separately for insulation (R=2.86) and openings (lower R)
// No fake "thermal slab" geometry needed - the real geometry provides the area.

// ============================================================================
// FLOOR INSULATION - 100mm mineral wool between floor joists
// ============================================================================

// Floor insulation sits between joists, below the OSB floor sheet
// Positioned at the bottom of the joist cavities (on top of skids)
const floor_insulation_z = paver_size[2] + skid_sec[1];  // Top of skids
const floor_insulation_height = joist_sec[1];  // Fill joist cavity depth (98mm)

// Single slab covering the entire floor area (simplified representation)
// In reality, it would be cut to fit between joists, but for thermal calc
// the total area is what matters
const floor_insulation = translate(
  cube({ size: [coop_len, coop_w, floor_insulation_height], center: false }),
  [0, 0, floor_insulation_z]
);

// ============================================================================
// CLADDING - Apply to all four walls
// ============================================================================

const cladding_th = 18;
const cladding_margin = 25;

// Front wall cladding (at Y = -cladding_th, facing outward)
const front_cladding_cutouts = [
  // Human door cutout
  [[coop_len / 2 - door_w / 2, -cladding_th - 1, floor_stack + stud_sec[0]],
   [door_w, cladding_th + 2, door_h]],
  // Nesting box access cutout
  [[nest_cutout_x, -cladding_th - 1, floor_stack + nest_cutout_bottom_z],
   [nest_cutout_w, cladding_th + 2, nest_cutout_height]]
];
const front_cladding = horizontal_cladding_x(
  coop_len, wall_h,
  [0, -cladding_th, floor_stack],
  front_cladding_cutouts
);

// Back wall cladding (at Y = coop_w + stud depth, facing outward)
// The Wall() studs extend 98mm (studSize[1]) outward from Y=coop_w, so cladding must be outside them
const back_cladding_y = coop_w + stud_sec[1];  // Outside the wall studs (stud depth is 98mm)
const back_cladding_cutouts = [
  // Vent cutout
  [[coop_len / 2 - vent_w / 2, back_cladding_y - 1, floor_stack + back_vent_bottom_z],
   [vent_w, cladding_th + 2, vent_h]]
];
const back_cladding = horizontal_cladding_x(
  coop_len, wall_h,
  [0, back_cladding_y, floor_stack],
  back_cladding_cutouts
);

// Left wall cladding (at X = -cladding_th)
const left_cladding = horizontal_cladding_y(
  coop_w, wall_h,
  [-cladding_th, 0, floor_stack],
  []  // No cutouts on left wall
);

// Right wall cladding (at X = coop_len + stud depth) - solid wall (tunnel connects to run, no pop door)
const pop_door_y = stud_sec[1] + 50;  // Used for tunnel positioning
const right_cladding = horizontal_cladding_y(
  coop_w, wall_h,
  [coop_len + stud_sec[1], 0, floor_stack],  // Outside the wall studs (stud depth is 98mm)
  []  // No cutouts - pop door removed, tunnel exits to run
);

// ============================================================================
// DOOR PANELS
// ============================================================================

// Human door - positioned at front wall, hinged on left edge
// Rotates around the left hinge point based on human_door_angle parameter
const human_door_panel = door_panel(door_w, door_h, 18);
const human_door_hinge_x = coop_len / 2 - door_w / 2;
const human_door_hinge_y = -cladding_th - 18;
const human_door = translate(
  rotate(
    human_door_panel,
    [0, 0, -human_door_angle]  // Swing outward (negative Y direction)
  ),
  [human_door_hinge_x, human_door_hinge_y, floor_stack + stud_sec[0]]
);


// ============================================================================
// ROOSTING PERCHES
// ============================================================================

const roost_dia = 50;
const roost_color = [0.55, 0.35, 0.20];  // Dark brown

// Lower roost - runs front to back (Y direction), above nesting boxes
const lower_roost_h = floor_stack + nest_box_h + 200;
const lower_roost_length = coop_w - 2 * (stud_sec[1] + 100);
const lower_roost = translate(
  rotate(
    cylinder({ height: lower_roost_length, radius: roost_dia / 2, center: false }),
    [90, 0, 0]
  ),
  [coop_len / 2 - door_w / 2 - nest_total_w / 2, stud_sec[1] + 100 + lower_roost_length, lower_roost_h]
);

// Mid roost - runs left to right (X direction), higher up
const mid_roost_h = lower_roost_h + 400;
const mid_roost_length = coop_len - 2 * (stud_sec[1] + 100);
const mid_roost = translate(
  rotate(
    cylinder({ height: mid_roost_length, radius: roost_dia / 2, center: false }),
    [0, 90, 0]
  ),
  [stud_sec[1] + 100, coop_w * 0.75, mid_roost_h]
);

// Upper roost - runs left to right (X direction), at back
const upper_roost_h = mid_roost_h + 400;
const upper_roost_length = coop_len - 2 * (stud_sec[1] + 100);
const upper_roost = translate(
  rotate(
    cylinder({ height: upper_roost_length, radius: roost_dia / 2, center: false }),
    [0, 90, 0]
  ),
  [stud_sec[1] + 100, coop_w - stud_sec[1] - 100, upper_roost_h]
);


// ============================================================================
// VIEWING TUNNEL - Enclosed structure from coop to run
// ============================================================================

const tunnel_width = 600;
const tunnel_length = 1200;
const tunnel_height = 600;
const tunnel_wall_t = 18;
const tunnel_roof_pitch = 45;
const tunnel_roof_t = 8;
const tunnel_window_inset = 50;
const tunnel_window_height = tunnel_height - 200;

// Tunnel position - attached to right wall, centered on pop door
const tunnel_base_x = coop_len;
const tunnel_base_y = pop_door_y + pop_w / 2 - tunnel_width / 2;
const tunnel_base_z = floor_stack;

// Create tunnel floor
const tunnel_floor = translate(
  cube({ size: [tunnel_length, tunnel_width, tunnel_wall_t], center: false }),
  [tunnel_base_x, tunnel_base_y, tunnel_base_z]
);

// Front wall (end facing run) - with chicken door opening at floor level
const tunnel_front_wall_base = translate(
  cube({ size: [tunnel_wall_t, tunnel_width, tunnel_height], center: false }),
  [tunnel_base_x + tunnel_length - tunnel_wall_t, tunnel_base_y, tunnel_base_z]
);
// Chicken door opening - centered, at floor level, sized for chickens to walk through
const chicken_door_width = 350;  // Wide enough for chickens
const chicken_door_height = 400; // Tall enough for chickens
const tunnel_chicken_door = translate(
  cube({ size: [tunnel_wall_t + 2, chicken_door_width, chicken_door_height], center: false }),
  [tunnel_base_x + tunnel_length - tunnel_wall_t - 1, tunnel_base_y + tunnel_width / 2 - chicken_door_width / 2, tunnel_base_z + tunnel_wall_t]
);
const tunnel_front_wall = difference(tunnel_front_wall_base, tunnel_chicken_door);

// Left wall - with large hinged access door for humans (feeding access)
const tunnel_left_wall_base = translate(
  cube({ size: [tunnel_length, tunnel_wall_t, tunnel_height], center: false }),
  [tunnel_base_x, tunnel_base_y, tunnel_base_z]
);
// Large door opening - almost full wall for easy access
const tunnel_access_door_width = tunnel_length - 100;  // Leave 50mm frame on each side
const tunnel_access_door_height = tunnel_height - 80;  // Leave frame at top and bottom
const tunnel_access_door_cutout = translate(
  cube({ size: [tunnel_access_door_width, tunnel_wall_t + 2, tunnel_access_door_height], center: false }),
  [tunnel_base_x + 50, tunnel_base_y - 1, tunnel_base_z + 40]
);
const tunnel_left_wall = difference(tunnel_left_wall_base, tunnel_access_door_cutout);

// Hinged access door panel - uses tunnel_door_angle parameter
const tunnel_access_door_panel = translate(
  rotate(
    cube({ size: [tunnel_access_door_width, tunnel_wall_t, tunnel_access_door_height], center: false }),
    [0, 0, -tunnel_door_angle]  // Swing outward based on parameter
  ),
  [tunnel_base_x + 50, tunnel_base_y, tunnel_base_z + 40]
);

// Right wall - with window cutout
const tunnel_right_wall_base = translate(
  cube({ size: [tunnel_length, tunnel_wall_t, tunnel_height], center: false }),
  [tunnel_base_x, tunnel_base_y + tunnel_width - tunnel_wall_t, tunnel_base_z]
);
const tunnel_right_window = translate(
  cube({ size: [tunnel_length - 2 * tunnel_window_inset, tunnel_wall_t + 2, tunnel_window_height], center: false }),
  [tunnel_base_x + tunnel_window_inset, tunnel_base_y + tunnel_width - tunnel_wall_t - 1, tunnel_base_z + 100]
);
const tunnel_right_wall = difference(tunnel_right_wall_base, tunnel_right_window);

// Tunnel roof - two pitched panels meeting at ridge
const tunnel_rise = (tunnel_width / 2) * Math.tan(tunnel_roof_pitch * Math.PI / 180);
const tunnel_roof_panel_width = Math.sqrt(Math.pow(tunnel_width / 2, 2) + Math.pow(tunnel_rise, 2));
const tunnel_peak_z = tunnel_base_z + tunnel_height + tunnel_rise;

// Left roof panel - slopes down from peak toward front (Y=tunnel_base_y)
const tunnel_roof_left = translate(
  rotate(
    translate(
      cube({ size: [tunnel_length, tunnel_roof_panel_width, tunnel_roof_t], center: false }),
      [0, -tunnel_roof_panel_width, 0]  // Move so rotation pivot is at far edge
    ),
    [tunnel_roof_pitch, 0, 0]
  ),
  [tunnel_base_x, tunnel_base_y + tunnel_width / 2, tunnel_peak_z]
);

// Right roof panel - slopes down from peak toward back (Y=tunnel_base_y + tunnel_width)
const tunnel_roof_right = translate(
  rotate(
    cube({ size: [tunnel_length, tunnel_roof_panel_width, tunnel_roof_t], center: false }),
    [-tunnel_roof_pitch, 0, 0]
  ),
  [tunnel_base_x, tunnel_base_y + tunnel_width / 2, tunnel_peak_z]
);

// Combine tunnel walls and roof
const tunnel_walls = union(tunnel_floor, tunnel_front_wall, tunnel_left_wall, tunnel_right_wall);
const tunnel_roof = union(tunnel_roof_left, tunnel_roof_right);

// Extended skid for tunnel support
const tunnel_skid = translate(
  cube({ size: [tunnel_length, skid_sec[0], skid_sec[1]], center: false }),
  [coop_len, tunnel_base_y + tunnel_width / 2 - skid_sec[0] / 2, paver_size[2]]
);

// ============================================================================
// ATTACHED RUN STRUCTURE
// ============================================================================

const run_length = 4000;  // Run extends along X axis from tunnel
const run_width = 3000;   // Run width along Y axis
const run_height = 2000;  // Run height (to eaves)
const post_sec = [98, 98]; // Run posts cross-section

// Run position - starts at end of viewing tunnel
const run_base_x = tunnel_base_x + tunnel_length;
const run_base_y = tunnel_base_y + tunnel_width / 2 - run_width / 2;
const run_base_z = paver_size[2];

// Corner posts
const run_posts = [];
const run_post_positions = [
  [run_base_x, run_base_y, run_base_z],
  [run_base_x, run_base_y + run_width - post_sec[1], run_base_z],
  [run_base_x + run_length - post_sec[0], run_base_y, run_base_z],
  [run_base_x + run_length - post_sec[0], run_base_y + run_width - post_sec[1], run_base_z]
];
for (const pos of run_post_positions) {
  run_posts.push(translate(
    cube({ size: [post_sec[0], post_sec[1], run_height], center: false }),
    pos
  ));
}

// Top rails connecting posts
const run_top_rails = [];
// Front and back rails (along X)
run_top_rails.push(translate(
  cube({ size: [run_length, post_sec[1], post_sec[0]], center: false }),
  [run_base_x, run_base_y, run_base_z + run_height - post_sec[0]]
));
run_top_rails.push(translate(
  cube({ size: [run_length, post_sec[1], post_sec[0]], center: false }),
  [run_base_x, run_base_y + run_width - post_sec[1], run_base_z + run_height - post_sec[0]]
));
// Left and right rails (along Y)
run_top_rails.push(translate(
  cube({ size: [post_sec[0], run_width, post_sec[1]], center: false }),
  [run_base_x, run_base_y, run_base_z + run_height - post_sec[0]]
));
run_top_rails.push(translate(
  cube({ size: [post_sec[0], run_width, post_sec[1]], center: false }),
  [run_base_x + run_length - post_sec[0], run_base_y, run_base_z + run_height - post_sec[0]]
));

// Lower rails (for mesh attachment)
const run_lower_rails = [];
const lower_rail_z = run_base_z + 100;
// Front and back
run_lower_rails.push(translate(
  cube({ size: [run_length, post_sec[1] / 2, post_sec[0] / 2], center: false }),
  [run_base_x, run_base_y, lower_rail_z]
));
run_lower_rails.push(translate(
  cube({ size: [run_length, post_sec[1] / 2, post_sec[0] / 2], center: false }),
  [run_base_x, run_base_y + run_width - post_sec[1] / 2, lower_rail_z]
));

// Gate opening - in front left corner
const gate_width = 900;
const gate_post = translate(
  cube({ size: [post_sec[0], post_sec[1], run_height], center: false }),
  [run_base_x + gate_width, run_base_y, run_base_z]
);

// Gate top beam
const gate_beam = translate(
  cube({ size: [gate_width, post_sec[1], post_sec[0]], center: false }),
  [run_base_x, run_base_y, run_base_z + run_height - post_sec[0]]
);

// Run roof - A-frame structure (matching OpenSCAD approach)
const run_roof_pitch = 30;
const half_width = run_width / 2;
const rise = half_width * Math.tan(run_roof_pitch * Math.PI / 180);
const beam_size = 48; // Match OpenSCAD beam cross-section
const beam_length = Math.sqrt(half_width * half_width + rise * rise);
const beam_angle = Math.atan2(rise, half_width) * 180 / Math.PI;
const post_top_z = run_base_z + run_height;
const beam_base_z = post_top_z - beam_size;
const ridge_z = post_top_z + rise;
const beam_spacing = 1000;

// Ridge beam running along length at peak
const ridge_beam = translate(
  cube({ size: [run_length + 50, beam_size, beam_size], center: false }),
  [run_base_x, run_base_y + half_width - beam_size / 2, ridge_z - beam_size]
);

// A-frame diagonal beams - proper triangular A-frames meeting at ridge
// Mirror around the run's centerline (Y = run_base_y + half_width)
const run_center_y = run_base_y + half_width;
const run_rafters = [];
for (let x_offset = 0; x_offset <= run_length; x_offset += beam_spacing) {
  const x = run_base_x + x_offset;
  const x_clamped = Math.min(x, run_base_x + run_length - beam_size);

  // LEFT rafter - starts at front rail, goes UP to ridge
  let left_beam = cube({ size: [beam_size, beam_length, beam_size], center: false });
  left_beam = translate(left_beam, [0, -beam_size / 2, 0]);
  left_beam = rotate(left_beam, [beam_angle, 0, 0]);
  left_beam = translate(left_beam, [0, beam_size / 2, 0]);
  left_beam = translate(left_beam, [x_clamped, run_base_y, beam_base_z]);

  // RIGHT rafter - mirror left beam around the run's centerline
  let right_beam = cube({ size: [beam_size, beam_length, beam_size], center: false });
  right_beam = translate(right_beam, [0, -beam_size / 2, 0]);
  right_beam = rotate(right_beam, [beam_angle, 0, 0]);
  right_beam = translate(right_beam, [0, beam_size / 2, 0]);
  right_beam = translate(right_beam, [x_clamped, run_base_y, beam_base_z]);
  // Move to center the run at Y=0, mirror, then move back
  right_beam = translate(right_beam, [0, -run_center_y, 0]);
  right_beam = scale(right_beam, [1, -1, 1]);
  right_beam = translate(right_beam, [0, run_center_y, 0]);

  run_rafters.push(left_beam, right_beam);
}

// Combine run structure
const run_frame = union(
  ...run_posts, ...run_top_rails, ...run_lower_rails,
  gate_post, gate_beam, ridge_beam, ...run_rafters
);

// ============================================================================
// CHICKEN GYM - Multi-level enrichment structure inside run
// ============================================================================

const gym_width = 1500;
const gym_depth = 1000;
const gym_height = 1800;
const gym_stud = 98;
const gym_platform_t = 18;

// Gym position - in the back portion of the run
const gym_base_x = run_base_x + run_length - gym_width - 200;
const gym_base_y = run_base_y + run_width / 2 - gym_depth / 2;
const gym_base_z = run_base_z;

// Main vertical posts
const gym_post_1 = translate(
  cube({ size: [gym_stud, gym_stud, gym_height * 0.85], center: false }),
  [gym_base_x + gym_width * 0.3, gym_base_y + gym_depth * 0.4, gym_base_z]
);
const gym_post_2 = translate(
  cube({ size: [gym_stud, gym_stud, gym_height * 0.7], center: false }),
  [gym_base_x + gym_width * 0.65, gym_base_y + gym_depth * 0.55, gym_base_z]
);
const gym_post_3 = translate(
  cube({ size: [gym_stud, gym_stud, gym_height * 0.95], center: false }),
  [gym_base_x + gym_width * 0.45, gym_base_y + gym_depth * 0.25, gym_base_z]
);

// Platforms at various heights
const gym_platform_1 = translate(
  cube({ size: [400, 350, gym_platform_t], center: false }),
  [gym_base_x + gym_width * 0.3 - 100, gym_base_y + gym_depth * 0.4 - 80, gym_base_z + 400]
);
const gym_platform_2 = translate(
  cube({ size: [380, 380, gym_platform_t], center: false }),
  [gym_base_x + gym_width * 0.65 - 80, gym_base_y + gym_depth * 0.55 - 100, gym_base_z + 480]
);
const gym_platform_3 = translate(
  cube({ size: [420, 320, gym_platform_t], center: false }),
  [gym_base_x + gym_width * 0.45 - 120, gym_base_y + gym_depth * 0.25 - 60, gym_base_z + 720]
);
const gym_platform_4 = translate(
  cube({ size: [360, 340, gym_platform_t], center: false }),
  [gym_base_x + gym_width * 0.3 - 90, gym_base_y + gym_depth * 0.4 - 100, gym_base_z + 1050]
);

// Perches between posts (horizontal bars)
const gym_perch_1 = translate(
  rotate(
    cylinder({ height: gym_width * 0.4, radius: 25, center: false }),
    [0, 90, 0]
  ),
  [gym_base_x + gym_width * 0.3, gym_base_y + gym_depth * 0.4, gym_base_z + 550]
);
const gym_perch_2 = translate(
  rotate(
    cylinder({ height: gym_width * 0.3, radius: 25, center: false }),
    [0, 90, 0]
  ),
  [gym_base_x + gym_width * 0.45, gym_base_y + gym_depth * 0.25, gym_base_z + 850]
);
const gym_perch_3 = translate(
  rotate(
    cylinder({ height: gym_depth * 0.5, radius: 25, center: false }),
    [90, 0, 0]
  ),
  [gym_base_x + gym_width * 0.5, gym_base_y + gym_depth * 0.55 + gym_depth * 0.5, gym_base_z + 1200]
);

// Combine gym structure
const chicken_gym = union(
  gym_post_1, gym_post_2, gym_post_3,
  gym_platform_1, gym_platform_2, gym_platform_3, gym_platform_4,
  gym_perch_1, gym_perch_2, gym_perch_3
);

// ============================================================================
// DECORATIVE BUSHES - around the run
// ============================================================================

// Simple bush approximation using spheres
function bush(size, position) {
  // Create a bush using a large sphere for the main body
  const main = translate(
    sphere({ radius: size * 0.5 }),
    [position[0], position[1], position[2] + size * 0.3]
  );
  return main;
}

// Place bushes around the run
const bush_positions = [
  [run_base_x + 500, run_base_y - 300, run_base_z],
  [run_base_x + run_length - 500, run_base_y - 300, run_base_z],
  [run_base_x + run_length + 200, run_base_y + run_width / 2, run_base_z],
  [run_base_x + run_length - 500, run_base_y + run_width + 300, run_base_z]
];

const bushes = bush_positions.map(pos => bush(400, pos));
const all_bushes = union(...bushes);

// ============================================================================
// TUNNEL SKIRTING - Covers tunnel foundation
// ============================================================================

const tunnel_skirting_front = translate(
  cube({ size: [skirting_t, tunnel_width, floor_stack], center: false }),
  [tunnel_base_x - skirting_t, tunnel_base_y, 0]
);
const tunnel_skirting_back = translate(
  cube({ size: [skirting_t, tunnel_width, floor_stack], center: false }),
  [tunnel_base_x + tunnel_length, tunnel_base_y, 0]
);
const tunnel_skirting_left = translate(
  cube({ size: [tunnel_length, skirting_t, floor_stack], center: false }),
  [tunnel_base_x, tunnel_base_y - skirting_t, 0]
);
const tunnel_skirting_right = translate(
  cube({ size: [tunnel_length, skirting_t, floor_stack], center: false }),
  [tunnel_base_x, tunnel_base_y + tunnel_width, 0]
);
const tunnel_skirting = union(tunnel_skirting_front, tunnel_skirting_back, tunnel_skirting_left, tunnel_skirting_right);

// ============================================================================
// FEEDER AND WATERER - Inside viewing tunnel
// ============================================================================

// Feeder - red cylinder with tray
function chicken_feeder(diameter = 250, height = 300) {
  const container = translate(
    cylinder({ height: height * 0.7, radius: diameter * 0.4, center: false }),
    [0, 0, height * 0.3]
  );
  const tray = cylinder({ height: height * 0.2, radius: diameter * 0.5, center: false });
  return union(container, tray);
}

// Waterer - blue cylinder with trough
function chicken_waterer(diameter = 250, height = 280) {
  const reservoir = translate(
    cylinder({ height: height * 0.6, radius: diameter * 0.35, center: false }),
    [0, 0, height * 0.25]
  );
  const trough = cylinder({ height: height * 0.15, radius: diameter * 0.45, center: false });
  return union(reservoir, trough);
}

// Position feeder and waterer in tunnel
const feeder = translate(
  chicken_feeder(250, 300),
  [tunnel_base_x + tunnel_length - 400, tunnel_base_y + tunnel_width / 2 - 100, tunnel_base_z + 18]
);
const waterer = translate(
  chicken_waterer(250, 280),
  [tunnel_base_x + tunnel_length - 600, tunnel_base_y + tunnel_width / 2 + 100, tunnel_base_z + 18]
);

// ============================================================================
// RUN GATE - Hinged gate panel
// ============================================================================

const gate_height = 1800;
const gate_frame_w = 48;

// Gate frame
const gate_left_stile = translate(
  cube({ size: [gate_frame_w, gate_frame_w, gate_height], center: false }),
  [run_base_x, run_base_y - gate_frame_w, run_base_z]
);
const gate_right_stile = translate(
  cube({ size: [gate_frame_w, gate_frame_w, gate_height], center: false }),
  [run_base_x + gate_width - gate_frame_w, run_base_y - gate_frame_w, run_base_z]
);
const gate_top_rail = translate(
  cube({ size: [gate_width, gate_frame_w, gate_frame_w], center: false }),
  [run_base_x, run_base_y - gate_frame_w, run_base_z + gate_height - gate_frame_w]
);
const gate_bottom_rail = translate(
  cube({ size: [gate_width, gate_frame_w, gate_frame_w], center: false }),
  [run_base_x, run_base_y - gate_frame_w, run_base_z]
);
const gate_mid_rail = translate(
  cube({ size: [gate_width, gate_frame_w, gate_frame_w], center: false }),
  [run_base_x, run_base_y - gate_frame_w, run_base_z + gate_height / 2]
);

// Combine gate frame, then apply rotation based on run_gate_angle parameter
// Gate hinges on left edge, swings outward (negative Y direction)
const run_gate_frame = union(gate_left_stile, gate_right_stile, gate_top_rail, gate_bottom_rail, gate_mid_rail);
const run_gate = translate(
  rotate(
    translate(run_gate_frame, [-run_base_x, -run_base_y + gate_frame_w, -run_base_z]),  // Move to origin for rotation
    [0, 0, -run_gate_angle]  // Swing outward
  ),
  [run_base_x, run_base_y - gate_frame_w, run_base_z]  // Move back to position
);

// ============================================================================
// RUN ROOF - Ridge beam only (rafters disabled - too complex for now)
// ============================================================================

// The ridge beam is already in run_frame, no additional rafters needed
// Just create a dummy object for the rafters variable
const run_roof_rafters = cube({ size: [1, 1, 1], center: false });

// ============================================================================
// CHICKENS - Parametric chicken models
// ============================================================================

// Simple chicken model using basic primitives
function chicken(scale_factor = 1.0, pose = 0) {
  const s = scale_factor * 100;

  // Body (ellipsoid approximated by scaled sphere)
  const body = translate(
    sphere({ radius: s * 0.4 }),
    [0, 0, s * 0.5]
  );

  // Head
  const head = translate(
    sphere({ radius: s * 0.15 }),
    [s * 0.35, 0, s * 0.75]
  );

  // Beak (small cone approximated by cylinder)
  const beak = translate(
    rotate(
      cylinder({ height: s * 0.12, radius: s * 0.04, center: false }),
      [0, 90, 0]
    ),
    [s * 0.45, 0, s * 0.72]
  );

  // Comb (on top of head)
  const comb = translate(
    cube({ size: [s * 0.08, s * 0.03, s * 0.12], center: true }),
    [s * 0.32, 0, s * 0.88]
  );

  // Tail
  const tail = translate(
    rotate(
      cube({ size: [s * 0.15, s * 0.08, s * 0.35], center: true }),
      [30, 0, 0]
    ),
    [-s * 0.35, 0, s * 0.65]
  );

  // Legs (two cylinders)
  const leg1 = translate(
    cylinder({ height: s * 0.25, radius: s * 0.03, center: false }),
    [s * 0.05, s * 0.08, 0]
  );
  const leg2 = translate(
    cylinder({ height: s * 0.25, radius: s * 0.03, center: false }),
    [s * 0.05, -s * 0.08, 0]
  );

  return union(body, head, beak, comb, tail, leg1, leg2);
}

// Place chickens around the scene
const chicken_scale = 2.5;

// Chicken in run near entrance
const chicken1 = translate(
  rotate(chicken(chicken_scale, 0), [0, 0, 45]),
  [run_base_x + 600, run_base_y + 800, run_base_z]
);

// Chicken mid-run
const chicken2 = translate(
  rotate(chicken(chicken_scale, 0.1), [0, 0, -120]),
  [run_base_x + run_length * 0.4, run_base_y + run_width * 0.3, run_base_z]
);

// Chicken near gym
const chicken3 = translate(
  rotate(chicken(chicken_scale, 0.4), [0, 0, 200]),
  [run_base_x + run_length * 0.7, run_base_y + run_width * 0.6, run_base_z]
);

// Chicken in viewing tunnel
const chicken4 = translate(
  rotate(chicken(chicken_scale * 0.9, 0.9), [0, 0, -45]),
  [tunnel_base_x + tunnel_length - 350, tunnel_base_y + tunnel_width / 2 - 50, tunnel_base_z + 18]
);

// Chicken at waterer
const chicken5 = translate(
  rotate(chicken(chicken_scale * 0.9, 0.7), [0, 0, 120]),
  [tunnel_base_x + tunnel_length - 550, tunnel_base_y + tunnel_width / 2 + 80, tunnel_base_z + 18]
);

// Chicken on gym platform
const chicken6 = translate(
  rotate(chicken(chicken_scale * 0.9, 0), [0, 0, 90]),
  [gym_base_x + gym_width * 0.4, gym_base_y + gym_depth * 0.4, gym_base_z + 420]
);

// Chicken in nesting box
const chicken7 = translate(
  rotate(chicken(chicken_scale * 0.8, 0), [0, 0, 90]),
  [nest_box_x + nest_spacing + nest_box_w / 2, nest_box_d / 2, floor_stack + 68]
);

// Another in run
const chicken8 = translate(
  rotate(chicken(chicken_scale, 0.6), [0, 0, -30]),
  [run_base_x + run_length * 0.5, run_base_y + run_width * 0.6, run_base_z]
);

const all_chickens = union(chicken1, chicken2, chicken3, chicken4, chicken5, chicken6, chicken7, chicken8);

// ============================================================================
// MESH APRON - Predator-proof skirt around run base
// ============================================================================

const apron_width = 400;
const apron_thickness = 5;

// Front apron (extends outward from front of run)
const apron_front = translate(
  cube({ size: [run_length, apron_width, apron_thickness], center: false }),
  [run_base_x, run_base_y - apron_width, run_base_z]
);

// Back apron
const apron_back = translate(
  cube({ size: [run_length, apron_width, apron_thickness], center: false }),
  [run_base_x, run_base_y + run_width, run_base_z]
);

// Left apron (at tunnel end)
const apron_left = translate(
  cube({ size: [apron_width, run_width + 2 * apron_width, apron_thickness], center: false }),
  [run_base_x - apron_width, run_base_y - apron_width, run_base_z]
);

// Right apron (far end)
const apron_right = translate(
  cube({ size: [apron_width, run_width + 2 * apron_width, apron_thickness], center: false }),
  [run_base_x + run_length, run_base_y - apron_width, run_base_z]
);

const mesh_apron = union(apron_front, apron_back, apron_left, apron_right);

// ============================================================================
// L-EXTENSION - Optional L-shaped extension to run
// ============================================================================

const l_extension_enabled = true;
const l_extension_length = 2000;  // Along X from corner
const l_extension_width = 4000;   // Along -Y (extending forward)

// L-extension position - extends from back-right corner of run
const l_junction_x = run_base_x + run_length - l_extension_length;
const l_junction_y = run_base_y;
const l_junction_z = run_base_z;

// L-extension corner posts
const l_posts = [];
if (l_extension_enabled) {
  // Front-left corner (at junction)
  l_posts.push(translate(
    cube({ size: [post_sec[0], post_sec[1], run_height], center: false }),
    [l_junction_x, l_junction_y - l_extension_width, l_junction_z]
  ));

  // Front-right corner
  l_posts.push(translate(
    cube({ size: [post_sec[0], post_sec[1], run_height], center: false }),
    [l_junction_x + l_extension_length - post_sec[0], l_junction_y - l_extension_width, l_junction_z]
  ));

  // Back-right corner (connects to main run)
  l_posts.push(translate(
    cube({ size: [post_sec[0], post_sec[1], run_height], center: false }),
    [l_junction_x + l_extension_length - post_sec[0], l_junction_y - post_sec[1], l_junction_z]
  ));
}

// L-extension top rails
const l_top_rails = [];
if (l_extension_enabled) {
  // Front rail (along X)
  l_top_rails.push(translate(
    cube({ size: [l_extension_length, post_sec[1], post_sec[0]], center: false }),
    [l_junction_x, l_junction_y - l_extension_width, l_junction_z + run_height - post_sec[0]]
  ));

  // Left rail (along Y)
  l_top_rails.push(translate(
    cube({ size: [post_sec[0], l_extension_width, post_sec[1]], center: false }),
    [l_junction_x, l_junction_y - l_extension_width, l_junction_z + run_height - post_sec[0]]
  ));

  // Right rail (along Y, connecting to main run)
  l_top_rails.push(translate(
    cube({ size: [post_sec[0], l_extension_width - post_sec[1], post_sec[1]], center: false }),
    [l_junction_x + l_extension_length - post_sec[0], l_junction_y - l_extension_width + post_sec[1], l_junction_z + run_height - post_sec[0]]
  ));
}

// L-extension ridge beam - DISABLED for now (was flying off)
// The L-extension has different dimensions (4000mm wide) so its ridge would be much higher
// For now, just use posts and rails without a ridge
const l_ridge_rise = (l_extension_width / 2) * Math.tan(run_roof_pitch * Math.PI / 180);
// const l_ridge_beam = ...disabled...

const l_extension_frame = l_extension_enabled ? union(...l_posts, ...l_top_rails) : cube({ size: [1, 1, 1], center: false });

// ============================================================================
// LOUNGE AREA - Table and chairs in L-extension corner
// ============================================================================

const table_diameter = 700;
const table_height = 550;
const chair_spacing = 800;

// Table position - in center of L-extension
const table_x = l_junction_x + l_extension_length / 2;
const table_y = l_junction_y - l_extension_width / 2;
const table_z = l_junction_z;

// Table top (circular - approximated with cylinder)
const table_top = translate(
  cylinder({ height: 40, radius: table_diameter / 2, center: false }),
  [table_x, table_y, table_z + table_height]
);

// Table pedestal
const table_pedestal = translate(
  cylinder({ height: table_height, radius: 80, center: false }),
  [table_x, table_y, table_z]
);

// Simple chair (seat + back)
function make_chair(x, y, z, angle) {
  const seat_w = 450;
  const seat_h = 450;
  const seat = translate(
    rotate(
      cube({ size: [seat_w, seat_w, 40], center: true }),
      [0, 0, angle]
    ),
    [x, y, z + seat_h]
  );
  const back = translate(
    rotate(
      cube({ size: [seat_w, 40, 400], center: true }),
      [0, 0, angle]
    ),
    [x - seat_w / 3 * Math.cos(angle * Math.PI / 180),
     y - seat_w / 3 * Math.sin(angle * Math.PI / 180),
     z + seat_h + 200]
  );
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const leg_angle = i * 90 + 45;
    const leg_x = x + 150 * Math.cos((angle + leg_angle) * Math.PI / 180);
    const leg_y = y + 150 * Math.sin((angle + leg_angle) * Math.PI / 180);
    legs.push(translate(
      cylinder({ height: seat_h, radius: 20, center: false }),
      [leg_x, leg_y, z]
    ));
  }
  return union(seat, back, ...legs);
}

// Four chairs around the table
const chair1 = l_extension_enabled ? make_chair(table_x + chair_spacing, table_y, table_z, 180) : cube({ size: [1, 1, 1], center: false });
const chair2 = l_extension_enabled ? make_chair(table_x - chair_spacing, table_y, table_z, 0) : cube({ size: [1, 1, 1], center: false });
const chair3 = l_extension_enabled ? make_chair(table_x, table_y + chair_spacing, table_z, 270) : cube({ size: [1, 1, 1], center: false });
const chair4 = l_extension_enabled ? make_chair(table_x, table_y - chair_spacing, table_z, 90) : cube({ size: [1, 1, 1], center: false });

const lounge_table = l_extension_enabled ? union(table_top, table_pedestal) : cube({ size: [1, 1, 1], center: false });
const lounge_chairs = l_extension_enabled ? union(chair1, chair2, chair3, chair4) : cube({ size: [1, 1, 1], center: false });

// ============================================================================
// MATERIAL HELPER - Use material references from materials.json database
// ============================================================================

// Helper to create object with material reference (colors auto-loaded from materials.json)
function withMaterial(geometry, materialId) {
  return { geometry: geometry, material: materialId };
}

// Define realistic colors for architectural elements (fallback for non-material items)
const CONCRETE_GRAY = [0.65, 0.65, 0.68];     // Pavers
const WOOD_TAN = [0.76, 0.60, 0.42];          // Skids (pressure-treated wood)
const PLYWOOD_LIGHT = [0.85, 0.75, 0.60];     // Floor
const WOOD_NATURAL = [0.72, 0.57, 0.38];      // Wall framing
const ROOF_CHARCOAL = [0.30, 0.30, 0.32];     // Roof shingles
const SKIRTING_DARK = [0.45, 0.36, 0.28];     // Skirting panels
const NEST_BOX_WOOD = [0.68, 0.53, 0.35];     // Nesting boxes (slightly darker wood)
const DOOR_WOOD = [0.60, 0.45, 0.30];         // Doors (darker stained wood)
const ROOST_BROWN = [0.55, 0.35, 0.20];       // Roosting perches
const RAMP_WOOD = [0.65, 0.50, 0.32];         // Ramps

// Scale down for display and apply colors/materials
// Using material references from materials.json where applicable
const scaledFoundation = withMaterial(scale(foundation, DISPLAY_SCALE), 'concrete_block');
const scaledSkirting = withColor(scale(skirting, DISPLAY_SCALE), SKIRTING_DARK);
const scaledFloor = withMaterial(scale(floor, DISPLAY_SCALE), 'osb_18mm');
const scaledFrontWall = withMaterial(scale(front_wall, DISPLAY_SCALE), 'pine_48x98_c24');
const scaledBackWall = withMaterial(scale(back_wall, DISPLAY_SCALE), 'pine_48x98_c24');
const scaledLeftWall = withMaterial(scale(left_wall, DISPLAY_SCALE), 'pine_48x98_c24');
const scaledRightWall = withMaterial(scale(right_wall, DISPLAY_SCALE), 'pine_48x98_c24');
const scaledRoof = withMaterial(scale(roof, DISPLAY_SCALE), 'galvanized_roofing');
const scaledNestSupport = withMaterial(scale(nest_support_structure, DISPLAY_SCALE), 'pine_48x98_c24');
const scaledNestingBoxes = withMaterial(scale(nesting_box_array, DISPLAY_SCALE), 'nest_box_plywood');
const scaledNestDoors = withColor(scale(nesting_box_doors, DISPLAY_SCALE), DOOR_WOOD);

// Cladding - using plywood for exterior panels, trim for trim boards
const scaledFrontCladding = withMaterial(scale(front_cladding.panel, DISPLAY_SCALE), 'plywood_9mm_exterior');
const scaledFrontTrim = withMaterial(scale(front_cladding.trim, DISPLAY_SCALE), 'exterior_paint_white');
const scaledBackCladding = withMaterial(scale(back_cladding.panel, DISPLAY_SCALE), 'plywood_9mm_exterior');
const scaledBackTrim = withMaterial(scale(back_cladding.trim, DISPLAY_SCALE), 'exterior_paint_white');
const scaledLeftCladding = withMaterial(scale(left_cladding.panel, DISPLAY_SCALE), 'plywood_9mm_exterior');
const scaledLeftTrim = withMaterial(scale(left_cladding.trim, DISPLAY_SCALE), 'exterior_paint_white');
const scaledRightCladding = withMaterial(scale(right_cladding.panel, DISPLAY_SCALE), 'plywood_9mm_exterior');
const scaledRightTrim = withMaterial(scale(right_cladding.trim, DISPLAY_SCALE), 'exterior_paint_white');

// Doors
const scaledHumanDoor = withMaterial(scale(human_door, DISPLAY_SCALE), 'door_thermal_bridge');

// Roosting perches
const scaledLowerRoost = withColor(scale(lower_roost, DISPLAY_SCALE), ROOST_BROWN);
const scaledMidRoost = withColor(scale(mid_roost, DISPLAY_SCALE), ROOST_BROWN);
const scaledUpperRoost = withColor(scale(upper_roost, DISPLAY_SCALE), ROOST_BROWN);

// Viewing tunnel
const TUNNEL_WALL_COLOR = [0.87, 0.72, 0.53];  // BurlyWood
const scaledTunnelWalls = withColor(scale(tunnel_walls, DISPLAY_SCALE), TUNNEL_WALL_COLOR);
const scaledTunnelRoof = withColor(scale(tunnel_roof, DISPLAY_SCALE), ROOF_CHARCOAL);
const scaledTunnelSkid = withColor(scale(tunnel_skid, DISPLAY_SCALE), WOOD_TAN);
const scaledTunnelAccessDoor = withColor(scale(tunnel_access_door_panel, DISPLAY_SCALE), DOOR_WOOD);

// Run structure
const RUN_FRAME_COLOR = [0.55, 0.45, 0.35];  // Cedar-ish brown
const scaledRunFrame = withColor(scale(run_frame, DISPLAY_SCALE), RUN_FRAME_COLOR);

// Chicken gym
const GYM_WOOD = [0.87, 0.72, 0.53];  // BurlyWood
const scaledChickenGym = withColor(scale(chicken_gym, DISPLAY_SCALE), GYM_WOOD);

// Bushes
const BUSH_GREEN = [0.33, 0.42, 0.18];  // DarkOliveGreen
const scaledBushes = withColor(scale(all_bushes, DISPLAY_SCALE), BUSH_GREEN);

// Tunnel skirting
const scaledTunnelSkirting = withColor(scale(tunnel_skirting, DISPLAY_SCALE), SKIRTING_DARK);

// Feeder and waterer
const FEEDER_RED = [0.8, 0.2, 0.15];
const WATERER_BLUE = [0.2, 0.4, 0.8];
const scaledFeeder = withColor(scale(feeder, DISPLAY_SCALE), FEEDER_RED);
const scaledWaterer = withColor(scale(waterer, DISPLAY_SCALE), WATERER_BLUE);

// Run gate
const GATE_WOOD = [0.5, 0.35, 0.2];
const scaledRunGate = withColor(scale(run_gate, DISPLAY_SCALE), GATE_WOOD);

// Run roof rafters
const scaledRunRafters = withColor(scale(run_roof_rafters, DISPLAY_SCALE), RUN_FRAME_COLOR);

// Chickens
const CHICKEN_WHITE = [0.95, 0.95, 0.9];
const scaledChickens = withColor(scale(all_chickens, DISPLAY_SCALE), CHICKEN_WHITE);

// Mesh apron - hardware cloth for predator protection
const scaledMeshApron = withMaterial(scale(mesh_apron, DISPLAY_SCALE), 'hardware_cloth');

// Insulation - 100mm mineral wool batts
const scaledRoofInsulation = withMaterial(scale(roof_insulation, DISPLAY_SCALE), 'insulation_100mm');
// Wall insulation as separate panels (so thermal area calculation can detect them as thin slabs)
const scaledFrontWallInsulation = withMaterial(scale(front_wall_insulation, DISPLAY_SCALE), 'insulation_100mm');
const scaledBackWallInsulation = withMaterial(scale(back_wall_insulation, DISPLAY_SCALE), 'insulation_100mm');
const scaledLeftWallInsulation = withMaterial(scale(left_wall_insulation, DISPLAY_SCALE), 'insulation_100mm');
const scaledRightWallInsulation = withMaterial(scale(right_wall_insulation, DISPLAY_SCALE), 'insulation_100mm');
const scaledFloorInsulation = withMaterial(scale(floor_insulation, DISPLAY_SCALE), 'insulation_100mm');

// L-extension
const scaledLExtension = withColor(scale(l_extension_frame, DISPLAY_SCALE), RUN_FRAME_COLOR);

// Lounge area
const TABLE_WOOD = [0.87, 0.72, 0.53];
const scaledLoungeTable = withColor(scale(lounge_table, DISPLAY_SCALE), TABLE_WOOD);
const scaledLoungeChairs = withColor(scale(lounge_chairs, DISPLAY_SCALE), TABLE_WOOD);

// Export as array of colored objects (with visibility toggles)
export const scene = [
  // Foundation & base (conditional)
  ...(show_floor ? [scaledFoundation, scaledSkirting, scaledFloor] : []),
  // Wall framing (conditional)
  ...(show_walls ? [scaledFrontWall, scaledBackWall, scaledLeftWall, scaledRightWall] : []),
  // Cladding (conditional)
  ...(show_cladding ? [
    scaledFrontCladding, scaledFrontTrim,
    scaledBackCladding, scaledBackTrim,
    scaledLeftCladding, scaledLeftTrim,
    scaledRightCladding, scaledRightTrim
  ] : []),
  // Roof (conditional)
  ...(show_roof ? [scaledRoof] : []),
  // Insulation (conditional)
  ...(show_insulation && show_roof ? [scaledRoofInsulation] : []),
  ...(show_insulation && show_walls ? [scaledFrontWallInsulation, scaledBackWallInsulation, scaledLeftWallInsulation, scaledRightWallInsulation] : []),
  ...(show_insulation && show_floor ? [scaledFloorInsulation] : []),
  // Interior elements (nesting, roosts) - conditional
  ...(show_interior ? [
    scaledNestSupport,
    scaledNestingBoxes,
    scaledNestDoors,
    scaledLowerRoost,
    scaledMidRoost,
    scaledUpperRoost
  ] : []),
  // Doors (show with cladding OR insulation for thermal calculation)
  ...((show_cladding || show_insulation) ? [scaledHumanDoor] : []),
  // Viewing tunnel (conditional)
  ...(show_tunnel ? [
    scaledTunnelWalls,
    scaledTunnelSkid,
    scaledTunnelAccessDoor,
    scaledTunnelSkirting,
    scaledFeeder,
    scaledWaterer
  ] : []),
  ...(show_tunnel && show_roof ? [scaledTunnelRoof] : []),
  // Attached run (conditional)
  ...(show_run ? [
    scaledRunFrame,
    scaledRunGate,
    scaledRunRafters,
    scaledMeshApron,
    scaledChickenGym,
    scaledLExtension
  ] : []),
  // Landscaping (always shown)
  scaledBushes,
  // Chickens (conditional)
  ...(show_chickens ? [scaledChickens] : []),
  // Lounge area (always shown)
  scaledLoungeTable,
  scaledLoungeChairs
];
