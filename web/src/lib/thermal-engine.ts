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

// --- Finnish building code reference U-values (YM decree 1010/2017) ---

export type ComplianceStatus = "pass" | "warn" | "fail";

export interface CodeComplianceResult {
  category: string;
  uValue: number;
  referenceU: number;
  status: ComplianceStatus;
}

const REFERENCE_U_VALUES: Record<string, number> = {
  insulation: 0.17,
  opening: 1.0,
  roofing: 0.09,
  cladding: 0.17,
  sheathing: 0.17,
};

export function checkCodeCompliance(
  category: string,
  uValue: number,
): CodeComplianceResult {
  const referenceU = REFERENCE_U_VALUES[category] ?? 0.17;
  let status: ComplianceStatus;
  if (uValue <= referenceU) {
    status = "pass";
  } else if (uValue <= referenceU * 1.2) {
    status = "warn";
  } else {
    status = "fail";
  }
  return { category, uValue, referenceU, status };
}

export function getComplianceSummary(
  surfaces: Map<string, SurfaceThermalData>,
): { pass: number; warn: number; fail: number; results: CodeComplianceResult[] } {
  const results: CodeComplianceResult[] = [];
  let pass = 0, warn = 0, fail = 0;
  surfaces.forEach((data) => {
    const result = checkCodeCompliance(data.category, data.uValue);
    results.push(result);
    if (result.status === "pass") pass++;
    else if (result.status === "warn") warn++;
    else fail++;
  });
  return { pass, warn, fail, results };
}

// --- Climate data and annual energy cost calculation ---

export interface ClimateLocation {
  name: string;
  code: string;
  latitude: number;
  longitude: number;
  monthlyAvgTemp: number[];
  annualHDD: number;
  designTemp: number;
}

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const CLIMATE_LOCATIONS: ClimateLocation[] = [
  {
    name: "Helsinki",
    code: "HEL",
    latitude: 60.17,
    longitude: 24.94,
    monthlyAvgTemp: [-4.7, -5.1, -1.5, 4.3, 10.5, 14.9, 17.6, 16.2, 11.2, 5.8, 1.0, -2.5],
    annualHDD: 4500,
    designTemp: -26,
  },
  {
    name: "Tampere",
    code: "TMP",
    latitude: 61.5,
    longitude: 23.79,
    monthlyAvgTemp: [-7.2, -7.0, -2.8, 3.5, 10.0, 14.5, 17.0, 15.0, 10.0, 4.5, -1.0, -5.0],
    annualHDD: 5000,
    designTemp: -29,
  },
  {
    name: "Turku",
    code: "TKU",
    latitude: 60.45,
    longitude: 22.27,
    monthlyAvgTemp: [-4.5, -5.0, -1.5, 4.0, 10.0, 14.5, 17.5, 16.0, 11.0, 6.0, 1.5, -2.0],
    annualHDD: 4400,
    designTemp: -24,
  },
  {
    name: "Oulu",
    code: "OUL",
    latitude: 65.01,
    longitude: 25.47,
    monthlyAvgTemp: [-10.2, -9.6, -5.0, 1.5, 8.0, 13.5, 16.5, 14.2, 9.0, 3.0, -3.5, -7.5],
    annualHDD: 5500,
    designTemp: -32,
  },
  {
    name: "Rovaniemi",
    code: "ROV",
    latitude: 66.5,
    longitude: 25.73,
    monthlyAvgTemp: [-13.0, -11.5, -6.5, -0.5, 6.5, 12.5, 15.0, 12.5, 7.0, 1.0, -5.5, -10.5],
    annualHDD: 6200,
    designTemp: -38,
  },
];

export interface AnnualEnergySettings {
  locationIndex: number;
  targetInsideTemp: number;
  electricityPrice_cPerKwh: number;
}

export const DEFAULT_ANNUAL_ENERGY_SETTINGS: AnnualEnergySettings = {
  locationIndex: 0,
  targetInsideTemp: 21,
  electricityPrice_cPerKwh: 12,
};

export interface MonthlyEnergy {
  month: number;
  outsideTemp: number;
  heatLoss_kWh: number;
  heatingCost_EUR: number;
}

export interface AnnualEnergyResult {
  location: ClimateLocation;
  months: MonthlyEnergy[];
  annualHeatLoss_kWh: number;
  annualHeatingCost_EUR: number;
  peakMonth: number;
  peakCost_EUR: number;
  averageMonthlyCost_EUR: number;
  totalUA: number;
}

export interface BomAreaItem {
  material_id: string;
  quantity: number;
  unit: string;
}

export function calculateAnnualEnergy(
  materials: MaterialInput[],
  bom: BomAreaItem[],
  settings: AnnualEnergySettings = DEFAULT_ANNUAL_ENERGY_SETTINGS,
  thermalSettings: ThermalSettings = DEFAULT_THERMAL_SETTINGS,
): AnnualEnergyResult | null {
  const location = CLIMATE_LOCATIONS[settings.locationIndex] ?? CLIMATE_LOCATIONS[0];

  const bomAreaMap = new Map<string, number>();
  for (const item of bom) {
    if (item.unit === "m2" || item.unit === "m²") {
      bomAreaMap.set(item.material_id, (bomAreaMap.get(item.material_id) ?? 0) + item.quantity);
    }
  }

  let totalUA = 0;

  for (const mat of materials) {
    if (!ENVELOPE_CATEGORIES.has(mat.category_name)) continue;

    const conductivity = typeof mat.thermal_conductivity === "string"
      ? parseFloat(mat.thermal_conductivity)
      : (mat.thermal_conductivity ?? 0);
    const thickness_mm = typeof mat.thermal_thickness === "string"
      ? parseFloat(mat.thermal_thickness)
      : (mat.thermal_thickness ?? 0);

    if (conductivity <= 0 || thickness_mm <= 0) continue;

    const area = bomAreaMap.get(mat.id) ?? 0;
    if (area <= 0) continue;

    const thickness_m = thickness_mm / 1000;
    const rTotal = thermalSettings.surfaceRInside + (thickness_m / conductivity) + thermalSettings.surfaceROutside;
    const uValue = 1 / rTotal;
    totalUA += uValue * area;
  }

  if (totalUA <= 0) return null;

  const months: MonthlyEnergy[] = [];
  let annualHeatLoss_kWh = 0;
  let annualHeatingCost_EUR = 0;
  let peakMonth = 0;
  let peakCost = 0;

  for (let m = 0; m < 12; m++) {
    const outsideTemp = location.monthlyAvgTemp[m];
    const deltaT = Math.max(0, settings.targetInsideTemp - outsideTemp);
    const heatLoss_W = totalUA * deltaT;
    const hoursInMonth = DAYS_PER_MONTH[m] * 24;
    const heatLoss_kWh = (heatLoss_W * hoursInMonth) / 1000;
    const heatingCost_EUR = (heatLoss_kWh * settings.electricityPrice_cPerKwh) / 100;

    months.push({ month: m, outsideTemp, heatLoss_kWh, heatingCost_EUR });
    annualHeatLoss_kWh += heatLoss_kWh;
    annualHeatingCost_EUR += heatingCost_EUR;

    if (heatingCost_EUR > peakCost) {
      peakCost = heatingCost_EUR;
      peakMonth = m;
    }
  }

  return {
    location,
    months,
    annualHeatLoss_kWh,
    annualHeatingCost_EUR,
    peakMonth,
    peakCost_EUR: peakCost,
    averageMonthlyCost_EUR: annualHeatingCost_EUR / 12,
    totalUA,
  };
}
