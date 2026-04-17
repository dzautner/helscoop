// Parametric Spur Gear - DingCAD polygon extrusion example
// Coordinate convention: X=width, Y=depth, Z=height (up)

// @param num_teeth "Gear" Number of Teeth (8-40)
const num_teeth = 20;
// @param module_val "Gear" Module (3-15)
const module_val = 8;
// @param gear_width "Gear" Width (5-40)
const gear_width = 15;
// @param bore_radius "Gear" Bore Radius (3-30)
const bore_radius = 12;
// @param hub_radius "Gear" Hub Radius (0-50)
const hub_radius = 0;
// @param hub_width "Gear" Hub Width (0-30)
const hub_width = 10;

const S = 0.003;
export const displayScale = S;

const STEEL = [0.58, 0.57, 0.55];
const STEEL_DARK = [0.40, 0.39, 0.38];

function polar(r, angle) {
  return [r * Math.cos(angle), r * Math.sin(angle)];
}

function gearProfile(m, z) {
  const pitch_r = m * z / 2;
  const outer_r = pitch_r + m;
  const root_r = pitch_r - 1.25 * m;

  const points = [];
  const tooth_angle = 2 * Math.PI / z;

  for (let i = 0; i < z; i++) {
    const a = i * tooth_angle;
    // Root arc
    points.push(polar(root_r, a - tooth_angle * 0.45));
    points.push(polar(root_r, a - tooth_angle * 0.25));
    // Rising flank
    points.push(polar(pitch_r, a - tooth_angle * 0.12));
    // Tooth tip
    points.push(polar(outer_r, a - tooth_angle * 0.06));
    points.push(polar(outer_r, a + tooth_angle * 0.06));
    // Falling flank
    points.push(polar(pitch_r, a + tooth_angle * 0.12));
    // Return to root
    points.push(polar(root_r, a + tooth_angle * 0.25));
    points.push(polar(root_r, a + tooth_angle * 0.45));
  }

  return [points];
}

const profile = gearProfile(module_val, num_teeth);
const gearBody = extrude(profile, { height: gear_width });

// Center bore
const bore = cylinder({ height: gear_width + 2, radius: bore_radius });
const boreCentered = translate(bore, [0, 0, -1]);

let gear = difference(gearBody, boreCentered);

// Optional raised hub
const parts = [withColor(scale(gear, S), STEEL)];

if (hub_radius > bore_radius && hub_width > 0) {
  const hubBody = cylinder({ height: gear_width + hub_width, radius: hub_radius });
  const hubBore = translate(
    cylinder({ height: gear_width + hub_width + 2, radius: bore_radius }),
    [0, 0, -1]
  );
  const hub = difference(hubBody, hubBore);
  parts.push(withColor(scale(hub, S), STEEL_DARK));
}

export const scene = parts;
