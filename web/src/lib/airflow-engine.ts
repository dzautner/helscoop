import type { SceneParam } from "@/lib/scene-interpreter";
import type { SceneLayer } from "@/lib/scene-layers";
import type { BuildingInfo } from "@/types";

export type AirflowAdequacy = "low" | "moderate" | "good";

export interface AirflowOptions {
  particleDensity?: number;
  speedMultiplier?: number;
  showArrows?: boolean;
  windSpeedMps?: number;
  windDirectionDeg?: number;
}

export interface AirflowAnalysis {
  particleCount: number;
  speedMultiplier: number;
  showArrows: boolean;
  openingCount: number;
  heatSourceCount: number;
  heatWatts: number;
  openingAreaM2: number;
  volumeM3: number;
  insideTempC: number;
  outsideTempC: number;
  deltaTempC: number;
  windSpeedMps: number;
  windDirectionDeg: number;
  stackVelocityMps: number;
  airChangesPerHour: number;
  adequacy: AirflowAdequacy;
}

const GRAVITY = 9.81;
const DISCHARGE_COEFFICIENT = 0.6;
const DEFAULT_INSIDE_TEMP_C = 21;
const DEFAULT_OUTSIDE_TEMP_C = -5;
const DEFAULT_WIND_SPEED_MPS = 4;
const DEFAULT_WIND_DIRECTION_DEG = 225;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ");
}

function paramValue(params: SceneParam[], patterns: RegExp[], fallback: number): number {
  for (const param of params) {
    const key = normalize(`${param.name} ${param.label} ${param.section}`);
    if (patterns.some((pattern) => pattern.test(key)) && Number.isFinite(param.value)) {
      return param.value;
    }
  }
  return fallback;
}

function sumParamValues(params: SceneParam[], patterns: RegExp[]): number {
  return params.reduce((sum, param) => {
    const key = normalize(`${param.name} ${param.label} ${param.section}`);
    return patterns.some((pattern) => pattern.test(key)) && Number.isFinite(param.value)
      ? sum + param.value
      : sum;
  }, 0);
}

function countMatchingLayers(layers: SceneLayer[], patterns: RegExp[]): number {
  return layers.filter((layer) => {
    const key = normalize(`${layer.id} ${layer.name} ${layer.materialId}`);
    return patterns.some((pattern) => pattern.test(key));
  }).length;
}

function inferOpeningArea(params: SceneParam[], openingCount: number, floorAreaM2: number): number {
  const ventWidthMm = paramValue(params, [/\bvent\b.*\b(w|width)\b/, /\bvent w\b/], 0);
  const ventHeightMm = paramValue(params, [/\bvent\b.*\b(h|height)\b/, /\bvent h\b/], 0);
  const ventArea = ventWidthMm > 0 && ventHeightMm > 0 ? (ventWidthMm / 1000) * (ventHeightMm / 1000) : 0;

  const doorAngle = paramValue(params, [/\bdoor\b.*\bangle\b/, /\bgate\b.*\bangle\b/], 45);
  const angleFactor = clamp(doorAngle / 90, 0.15, 1);
  const inferredArea = Math.max(0.04, Math.min(1.2, floorAreaM2 * 0.006));

  return round(Math.max(ventArea * Math.max(1, openingCount), inferredArea * Math.max(1, openingCount) * angleFactor), 3);
}

function inferHeatWatts(params: SceneParam[], heatSourceCount: number, floorAreaM2: number): number {
  const animalCount = sumParamValues(params, [/\bchicken(s)?\b/, /\bhen(s)?\b/, /\banimal(s)?\b/]);
  const heaterWatts = sumParamValues(params, [/\bheater\b/, /\bheat\b.*\bw(att)?\b/]);
  const animalHeat = animalCount > 0 ? animalCount * 10 : 0;
  const explicitHeat = heaterWatts > 0 ? heaterWatts : 0;
  const backgroundHeat = Math.max(40, floorAreaM2 * 3);
  return round(Math.max(backgroundHeat, explicitHeat + animalHeat + heatSourceCount * 80));
}

export function analyzeAirflow(
  layers: SceneLayer[],
  params: SceneParam[],
  buildingInfo: BuildingInfo | null | undefined,
  options: AirflowOptions = {},
): AirflowAnalysis {
  const floorAreaM2 = clamp(Number(buildingInfo?.area_m2) || 24, 4, 500);
  const floors = clamp(Number(buildingInfo?.floors) || 1, 1, 12);
  const heightM = Math.max(2.2, floors * 2.7);
  const volumeM3 = floorAreaM2 * heightM;

  const insideTempC = paramValue(params, [/\binside\b.*\btemp/, /\bindoor\b.*\btemp/, /\btarget\b.*\btemp/], DEFAULT_INSIDE_TEMP_C);
  const outsideTempC = paramValue(params, [/\boutside\b.*\btemp/, /\boutdoor\b.*\btemp/, /\bexternal\b.*\btemp/], DEFAULT_OUTSIDE_TEMP_C);
  const deltaTempC = Math.max(0, insideTempC - outsideTempC);

  const openingCount = Math.max(0, countMatchingLayers(layers, [
    /\bvent\b/,
    /\bwindow\b/,
    /\bdoor\b/,
    /\bgate\b/,
    /\bopening\b/,
    /\bflap\b/,
    /\bovi\b/,
    /\bikkuna\b/,
  ]));
  const heatSourceCount = Math.max(0, countMatchingLayers(layers, [
    /\bheater\b/,
    /\bheat\b/,
    /\blamp\b/,
    /\bbrooder\b/,
    /\bchicken\b/,
    /\bhen\b/,
    /\banimal\b/,
  ]));

  const effectiveOpenings = Math.max(openingCount, params.some((param) => /\bvent\b|\bdoor\b|\bgate\b/i.test(param.name)) ? 2 : 1);
  const openingAreaM2 = inferOpeningArea(params, effectiveOpenings, floorAreaM2);
  const heatWatts = inferHeatWatts(params, heatSourceCount, floorAreaM2);
  const windSpeedMps = clamp(options.windSpeedMps ?? DEFAULT_WIND_SPEED_MPS, 0, 15);
  const windDirectionDeg = ((options.windDirectionDeg ?? DEFAULT_WIND_DIRECTION_DEG) % 360 + 360) % 360;

  const insideK = insideTempC + 273.15;
  const outsideK = outsideTempC + 273.15;
  const stackVelocityMps = deltaTempC > 0
    ? DISCHARGE_COEFFICIENT * Math.sqrt((2 * GRAVITY * heightM * Math.max(insideK - outsideK, 0)) / Math.max(outsideK, 1))
    : 0;
  const windAssistMps = windSpeedMps * 0.18;
  const flowM3s = openingAreaM2 * (stackVelocityMps + windAssistMps) * DISCHARGE_COEFFICIENT;
  const airChangesPerHour = volumeM3 > 0 ? (flowM3s * 3600) / volumeM3 : 0;
  const adequacy: AirflowAdequacy = airChangesPerHour >= 6 ? "good" : airChangesPerHour >= 3 ? "moderate" : "low";

  return {
    particleCount: clamp(Math.round(options.particleDensity ?? 500), 50, 1000),
    speedMultiplier: clamp(options.speedMultiplier ?? 1, 0.5, 3),
    showArrows: options.showArrows ?? true,
    openingCount: effectiveOpenings,
    heatSourceCount,
    heatWatts,
    openingAreaM2,
    volumeM3: round(volumeM3, 1),
    insideTempC: round(insideTempC, 1),
    outsideTempC: round(outsideTempC, 1),
    deltaTempC: round(deltaTempC, 1),
    windSpeedMps: round(windSpeedMps, 1),
    windDirectionDeg: round(windDirectionDeg),
    stackVelocityMps: round(stackVelocityMps, 3),
    airChangesPerHour: round(airChangesPerHour, 1),
    adequacy,
  };
}
