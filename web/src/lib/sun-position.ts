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

export const SEASON_PRESETS: { key: string; month: number; day: number; hour: number }[] = [
  { key: "summerSolstice", month: 5, day: 21, hour: 12 },
  { key: "winterSolstice", month: 11, day: 21, hour: 12 },
  { key: "springEquinox", month: 2, day: 20, hour: 12 },
  { key: "autumnEquinox", month: 8, day: 22, hour: 12 },
];
