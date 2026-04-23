const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface SunPosition {
  azimuth: number;
  altitude: number;
  isAboveHorizon: boolean;
}

export function calculateSunPosition(
  latitude: number,
  longitude: number,
  date: Date,
): SunPosition {
  const dayOfYear = getDayOfYear(date);
  const hours = date.getHours() + date.getMinutes() / 60;

  const declination = 23.45 * Math.sin(DEG * (360 / 365) * (dayOfYear - 81));
  const decRad = declination * DEG;
  const latRad = latitude * DEG;

  const B = (360 / 365) * (dayOfYear - 81) * DEG;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

  const timeZoneOffset = date.getTimezoneOffset() / -60;
  const lstm = 15 * timeZoneOffset;
  const tc = 4 * (longitude - lstm) + eot;
  const lst = hours + tc / 60;
  const hra = (lst - 12) * 15 * DEG;

  const sinAlt =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hra);
  const altitude = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * RAD;

  const cosAz =
    (Math.sin(decRad) - Math.sin(latRad) * sinAlt) /
    (Math.cos(latRad) * Math.cos(altitude * DEG));
  let azimuth = Math.acos(Math.max(-1, Math.min(1, cosAz))) * RAD;
  if (hra > 0) azimuth = 360 - azimuth;

  return {
    azimuth,
    altitude,
    isAboveHorizon: altitude > 0,
  };
}

export function sunPositionToLightDirection(
  azimuth: number,
  altitude: number,
): [number, number, number] {
  const azRad = azimuth * DEG;
  const altRad = altitude * DEG;
  const x = -Math.sin(azRad) * Math.cos(altRad);
  const y = Math.sin(altRad);
  const z = -Math.cos(azRad) * Math.cos(altRad);
  return [x, y, z];
}

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function calculateSunriseSunset(
  latitude: number,
  longitude: number,
  month: number,
  day: number,
): { sunrise: number; sunset: number; daylightHours: number } {
  const date = new Date(2026, month, day, 12, 0);
  const dayOfYear = getDayOfYear(date);
  const declination = 23.45 * Math.sin(DEG * (360 / 365) * (dayOfYear - 81));
  const decRad = declination * DEG;
  const latRad = latitude * DEG;

  const cosHa = -(Math.sin(latRad) * Math.sin(decRad)) /
    (Math.cos(latRad) * Math.cos(decRad));

  if (cosHa <= -1) return { sunrise: 0, sunset: 24, daylightHours: 24 };
  if (cosHa >= 1) return { sunrise: 12, sunset: 12, daylightHours: 0 };

  const ha = Math.acos(Math.max(-1, Math.min(1, cosHa))) * RAD;
  const B = (360 / 365) * (dayOfYear - 81) * DEG;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const timeZoneOffset = date.getTimezoneOffset() / -60;
  const lstm = 15 * timeZoneOffset;
  const tc = 4 * (longitude - lstm) + eot;

  const solarNoon = 12 - tc / 60;
  const sunrise = solarNoon - ha / 15;
  const sunset = solarNoon + ha / 15;
  const daylightHours = (2 * ha) / 15;

  return { sunrise: Math.max(0, sunrise), sunset: Math.min(24, sunset), daylightHours };
}

export type SeasonalLighting = "default" | "summer" | "winter" | "evening";

export function getSeasonalLightingPreset(month: number, hour: number): SeasonalLighting {
  if (month >= 10 || month <= 1) return "winter";
  if (month >= 4 && month <= 7) return "summer";
  if (hour >= 17 || hour <= 6) return "evening";
  return "default";
}

export const SEASON_PRESETS: { key: string; month: number; day: number; hour: number }[] = [
  { key: "januaryNoon", month: 0, day: 15, hour: 12 },
  { key: "juneEvening", month: 5, day: 15, hour: 21 },
  { key: "octoberMorning", month: 9, day: 15, hour: 9 },
  { key: "marchAfternoon", month: 2, day: 15, hour: 15 },
  { key: "summerSolstice", month: 5, day: 21, hour: 12 },
  { key: "winterSolstice", month: 11, day: 21, hour: 12 },
];
