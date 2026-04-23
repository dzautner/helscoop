export interface ThermalSettings {
  insideTemp: number;
  outsideTemp: number;
  surfaceRInside: number;
  surfaceROutside: number;
}

export const DEFAULT_THERMAL_SETTINGS: ThermalSettings = {
  insideTemp: 5,
  outsideTemp: -25,
  surfaceRInside: 0.13,
  surfaceROutside: 0.04,
};

export interface SurfaceThermalData {
  materialId: string;
  category: string;
  conductivity: number;
  thickness_m: number;
  rValue: number;
  uValue: number;
  heatFluxDensity: number;
}

export interface ThermalAnalysisResult {
  surfaces: Map<string, SurfaceThermalData>;
  totalHeatLoss_W: number;
  deltaT: number;
  minHeatFlux: number;
  maxHeatFlux: number;
}

interface MaterialInput {
  id: string;
  category_name: string;
  thermal_conductivity?: number | string | null;
  thermal_thickness?: number | string | null;
}

const ENVELOPE_CATEGORIES = new Set(["insulation", "opening"]);

export function calculateThermalLoss(
  materials: MaterialInput[],
  settings: ThermalSettings = DEFAULT_THERMAL_SETTINGS,
): ThermalAnalysisResult {
  const deltaT = settings.insideTemp - settings.outsideTemp;
  const surfaces = new Map<string, SurfaceThermalData>();
  let minHeatFlux = Infinity;
  let maxHeatFlux = 0;
  let totalHeatLoss_W = 0;

  for (const mat of materials) {
    const conductivity = typeof mat.thermal_conductivity === "string"
      ? parseFloat(mat.thermal_conductivity)
      : (mat.thermal_conductivity ?? 0);
    const thickness_mm = typeof mat.thermal_thickness === "string"
      ? parseFloat(mat.thermal_thickness)
      : (mat.thermal_thickness ?? 0);

    if (conductivity <= 0 || thickness_mm <= 0) continue;

    const thickness_m = thickness_mm / 1000;
    const rMaterial = thickness_m / conductivity;
    const rTotal = settings.surfaceRInside + rMaterial + settings.surfaceROutside;
    const uValue = 1 / rTotal;
    const heatFluxDensity = uValue * deltaT;

    surfaces.set(mat.id, {
      materialId: mat.id,
      category: mat.category_name,
      conductivity,
      thickness_m,
      rValue: rTotal,
      uValue,
      heatFluxDensity,
    });

    if (ENVELOPE_CATEGORIES.has(mat.category_name)) {
      totalHeatLoss_W += heatFluxDensity;
    }

    minHeatFlux = Math.min(minHeatFlux, heatFluxDensity);
    maxHeatFlux = Math.max(maxHeatFlux, heatFluxDensity);
  }

  if (minHeatFlux === Infinity) {
    minHeatFlux = 0;
    maxHeatFlux = 100;
  }
  if (maxHeatFlux - minHeatFlux < 10) {
    maxHeatFlux = minHeatFlux + 100;
  }

  return { surfaces, totalHeatLoss_W, deltaT, minHeatFlux, maxHeatFlux };
}

export function heatFluxToColor(
  heatFlux: number,
  minFlux: number,
  maxFlux: number,
): [number, number, number] {
  const range = maxFlux - minFlux || 1;
  const t = Math.max(0, Math.min(1, (heatFlux - minFlux) / range));

  // Infrared/ironbow palette: dark blue → purple → red → orange → yellow → white
  if (t < 0.2) {
    const s = t / 0.2;
    return [0.05 + s * 0.25, 0, 0.3 + s * 0.3];
  } else if (t < 0.4) {
    const s = (t - 0.2) / 0.2;
    return [0.3 + s * 0.5, 0, 0.6 - s * 0.3];
  } else if (t < 0.6) {
    const s = (t - 0.4) / 0.2;
    return [0.8 + s * 0.2, s * 0.2, 0.3 - s * 0.3];
  } else if (t < 0.8) {
    const s = (t - 0.6) / 0.2;
    return [1, 0.2 + s * 0.5, s * 0.1];
  } else {
    const s = (t - 0.8) / 0.2;
    return [1, 0.7 + s * 0.3, 0.1 + s * 0.9];
  }
}

export function getHeatLossRating(heatFlux: number): string {
  if (heatFlux < 20) return "excellent";
  if (heatFlux < 40) return "good";
  if (heatFlux < 80) return "moderate";
  if (heatFlux < 150) return "poor";
  return "severe";
}
