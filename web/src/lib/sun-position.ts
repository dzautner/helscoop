const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export interface SunPosition {
  azimuth: number;
  altitude: number;
  isAboveHorizon: boolean;
}

export interface SunPositionOptions {
  timezoneOffsetHours?: number;
}

export interface SunriseSunsetOptions extends SunPositionOptions {
  year?: number;
  solarAltitudeDeg?: number;
}

export interface DaylightPreset {
  key: string;
  month: number;
  day: number;
  hour: number;
  minute?: number;
}

export interface ShadowStudySample {
  timeMinutes: number;
  label: string;
  azimuth: number;
  altitude: number;
  shadowLength: number;
  shadowVector: [number, number];
  color: string;
}

export interface ShadowStudy {
  samples: ShadowStudySample[];
  totalShadowHours: number;
  startHour: number;
  endHour: number;
  intervalMinutes: number;
}

export interface ShadowStudyOptions extends SunPositionOptions {
  year?: number;
  month: number;
  day: number;
  startHour: number;
  endHour: number;
  intervalMinutes?: number;
  objectHeightM?: number;
}

export interface ShadowStudySvgOptions {
  title: string;
  latitude: number;
  longitude: number;
  month: number;
  day: number;
  year?: number;
  study: ShadowStudy;
  width?: number;
  height?: number;
}

export function calculateSunPosition(
  latitude: number,
  longitude: number,
  date: Date,
  options: SunPositionOptions = {},
): SunPosition {
  const dayOfYear = getDayOfYear(date);
  const hours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  const timezoneOffsetHours = options.timezoneOffsetHours ?? estimateTimezoneOffsetHours(latitude, longitude, date);

  const declination = 23.45 * Math.sin(DEG * (360 / 365) * (dayOfYear - 81));
  const decRad = declination * DEG;
  const latRad = latitude * DEG;

  const b = (360 / 365) * (dayOfYear - 81) * DEG;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);

  const lstm = 15 * timezoneOffsetHours;
  const tc = 4 * (longitude - lstm) + eot;
  const localSolarTime = hours + tc / 60;
  const hourAngle = (localSolarTime - 12) * 15 * DEG;

  const sinAltitude =
    Math.sin(latRad) * Math.sin(decRad) +
    Math.cos(latRad) * Math.cos(decRad) * Math.cos(hourAngle);
  const altitude = Math.asin(clamp(sinAltitude, -1, 1)) * RAD;

  const altitudeRad = altitude * DEG;
  const azimuthDenominator = Math.cos(latRad) * Math.cos(altitudeRad);
  let azimuth = 180;
  if (Math.abs(azimuthDenominator) > 1e-8) {
    const cosAzimuth =
      (Math.sin(decRad) - Math.sin(latRad) * sinAltitude) /
      azimuthDenominator;
    azimuth = Math.acos(clamp(cosAzimuth, -1, 1)) * RAD;
    if (hourAngle > 0) azimuth = 360 - azimuth;
  }

  return {
    azimuth: normalizeDegrees(azimuth),
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

export function calculateSunriseSunset(
  latitude: number,
  longitude: number,
  month: number,
  day: number,
  options: SunriseSunsetOptions = {},
): { sunrise: number; sunset: number; daylightHours: number } {
  const year = options.year ?? 2026;
  const date = new Date(year, month, day, 12, 0);
  const dayOfYear = getDayOfYear(date);
  const declination = 23.45 * Math.sin(DEG * (360 / 365) * (dayOfYear - 81));
  const decRad = declination * DEG;
  const latRad = latitude * DEG;
  const solarAltitude = (options.solarAltitudeDeg ?? -0.833) * DEG;

  const cosHourAngle =
    (Math.sin(solarAltitude) - Math.sin(latRad) * Math.sin(decRad)) /
    (Math.cos(latRad) * Math.cos(decRad));

  if (cosHourAngle <= -1) return { sunrise: 0, sunset: 24, daylightHours: 24 };
  if (cosHourAngle >= 1) return { sunrise: 12, sunset: 12, daylightHours: 0 };

  const hourAngle = Math.acos(clamp(cosHourAngle, -1, 1)) * RAD;
  const b = (360 / 365) * (dayOfYear - 81) * DEG;
  const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
  const timezoneOffsetHours = options.timezoneOffsetHours ?? estimateTimezoneOffsetHours(latitude, longitude, date);
  const lstm = 15 * timezoneOffsetHours;
  const tc = 4 * (longitude - lstm) + eot;

  const solarNoon = 12 - tc / 60;
  const sunrise = solarNoon - hourAngle / 15;
  const sunset = solarNoon + hourAngle / 15;
  const daylightHours = (2 * hourAngle) / 15;

  return {
    sunrise: clamp(sunrise, 0, 24),
    sunset: clamp(sunset, 0, 24),
    daylightHours,
  };
}

export function calculateShadowVector(
  azimuth: number,
  altitude: number,
  objectHeightM = 3,
): { length: number; vector: [number, number] } | null {
  if (altitude <= 0) return null;
  const altitudeRad = altitude * DEG;
  const azimuthRad = azimuth * DEG;
  const rawLength = objectHeightM / Math.tan(altitudeRad);
  const length = clamp(rawLength, 0.1, 80);
  return {
    length,
    vector: [
      -Math.sin(azimuthRad),
      -Math.cos(azimuthRad),
    ],
  };
}

export function calculateShadowStudy({
  latitude,
  longitude,
  month,
  day,
  startHour,
  endHour,
  intervalMinutes = 60,
  objectHeightM = 3,
  year = 2026,
  timezoneOffsetHours,
}: ShadowStudyOptions & { latitude: number; longitude: number }): ShadowStudy {
  const startMinutes = Math.round(clamp(startHour, 0, 24) * 60);
  const endMinutes = Math.round(clamp(endHour, 0, 24) * 60);
  const step = Math.max(15, intervalMinutes);
  const samples: ShadowStudySample[] = [];

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += step) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const date = new Date(year, month, day, hour, minute);
    const sun = calculateSunPosition(latitude, longitude, date, { timezoneOffsetHours });
    const shadow = calculateShadowVector(sun.azimuth, sun.altitude, objectHeightM);
    if (!shadow) continue;
    samples.push({
      timeMinutes: minutes,
      label: formatTime(minutes / 60),
      azimuth: sun.azimuth,
      altitude: sun.altitude,
      shadowLength: shadow.length,
      shadowVector: shadow.vector,
      color: colorForShadowHour(minutes / 60),
    });
  }

  return {
    samples,
    totalShadowHours: samples.length * step / 60,
    startHour,
    endHour,
    intervalMinutes: step,
  };
}

export function buildShadowStudySvg({
  title,
  latitude,
  longitude,
  month,
  day,
  year = 2026,
  study,
  width = 720,
  height = 480,
}: ShadowStudySvgOptions): string {
  const centerX = width / 2;
  const centerY = height / 2 + 28;
  const maxLength = Math.max(1, ...study.samples.map((sample) => sample.shadowLength));
  const scale = Math.min(8, Math.max(2.2, (Math.min(width, height) * 0.28) / maxLength));
  const footprintW = 74;
  const footprintH = 48;
  const titleText = escapeXml(title);
  const dateText = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const coordinateText = `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;

  const shadowPolygons = study.samples.map((sample, index) => {
    const [vx, vz] = sample.shadowVector;
    const length = sample.shadowLength * scale;
    const px = -vz;
    const py = vx;
    const nearWidth = footprintW * 0.55;
    const farWidth = footprintW * 0.36;
    const baseX = centerX + vx * 12;
    const baseY = centerY + vz * 12;
    const farX = centerX + vx * length;
    const farY = centerY + vz * length;
    const points = [
      [baseX + px * nearWidth / 2, baseY + py * nearWidth / 2],
      [baseX - px * nearWidth / 2, baseY - py * nearWidth / 2],
      [farX - px * farWidth / 2, farY - py * farWidth / 2],
      [farX + px * farWidth / 2, farY + py * farWidth / 2],
    ].map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
    const opacity = (0.12 + Math.min(0.16, index * 0.012)).toFixed(2);
    return `<polygon points="${points}" fill="${sample.color}" opacity="${opacity}" data-time="${escapeXml(sample.label)}" />`;
  }).join("\n  ");

  const sampleLabels = study.samples
    .filter((_, index) => index % 2 === 0)
    .map((sample, index) => {
      const y = height - 96 + index * 18;
      return `<text x="32" y="${y}" font-size="11" fill="#3f4854">${escapeXml(sample.label)} ${sample.azimuth.toFixed(0)} deg / ${sample.altitude.toFixed(0)} deg</text>`;
    })
    .join("\n  ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${titleText}">
  <rect width="100%" height="100%" fill="#f8faf7" />
  <text x="32" y="42" font-size="22" font-family="Arial, sans-serif" font-weight="700" fill="#16211b">${titleText}</text>
  <text x="32" y="64" font-size="12" font-family="Arial, sans-serif" fill="#4b5563">${dateText} / ${coordinateText}</text>
  <text x="${width - 88}" y="42" font-size="12" font-family="Arial, sans-serif" fill="#4b5563">N</text>
  <path d="M${width - 82} 68 L${width - 82} 24 M${width - 82} 24 L${width - 91} 39 M${width - 82} 24 L${width - 73} 39" stroke="#16211b" stroke-width="2" fill="none" />
  <circle cx="${centerX}" cy="${centerY}" r="${Math.min(width, height) * 0.33}" fill="none" stroke="#d7ded4" stroke-width="1" />
  ${shadowPolygons}
  <rect x="${centerX - footprintW / 2}" y="${centerY - footprintH / 2}" width="${footprintW}" height="${footprintH}" rx="2" fill="#ffffff" stroke="#16211b" stroke-width="2" />
  <line x1="${centerX - footprintW / 2}" y1="${centerY}" x2="${centerX + footprintW / 2}" y2="${centerY}" stroke="#9ca3af" stroke-width="1" />
  <line x1="${centerX}" y1="${centerY - footprintH / 2}" x2="${centerX}" y2="${centerY + footprintH / 2}" stroke="#9ca3af" stroke-width="1" />
  <text x="${centerX}" y="${centerY + footprintH / 2 + 18}" font-size="11" font-family="Arial, sans-serif" text-anchor="middle" fill="#16211b">building footprint</text>
  <rect x="24" y="${height - 126}" width="232" height="104" rx="8" fill="#ffffff" stroke="#d7ded4" />
  <text x="32" y="${height - 108}" font-size="12" font-family="Arial, sans-serif" font-weight="700" fill="#16211b">Sampled sun positions</text>
  ${sampleLabels}
  <rect x="${width - 214}" y="${height - 76}" width="16" height="10" fill="#5aa6d6" opacity="0.45" />
  <text x="${width - 190}" y="${height - 67}" font-size="11" font-family="Arial, sans-serif" fill="#3f4854">morning</text>
  <rect x="${width - 214}" y="${height - 56}" width="16" height="10" fill="#6fbf73" opacity="0.45" />
  <text x="${width - 190}" y="${height - 47}" font-size="11" font-family="Arial, sans-serif" fill="#3f4854">midday</text>
  <rect x="${width - 214}" y="${height - 36}" width="16" height="10" fill="#d9973e" opacity="0.45" />
  <text x="${width - 190}" y="${height - 27}" font-size="11" font-family="Arial, sans-serif" fill="#3f4854">evening</text>
</svg>`;
}

export type SeasonalLighting = "default" | "summer" | "winter" | "evening";

export function getSeasonalLightingPreset(month: number, hour: number): SeasonalLighting {
  if (month >= 10 || month <= 1) return "winter";
  if (month >= 4 && month <= 7) return "summer";
  if (hour >= 17 || hour <= 6) return "evening";
  return "default";
}

export const SEASON_PRESETS: DaylightPreset[] = [
  { key: "summerSolstice", month: 5, day: 21, hour: 12 },
  { key: "winterSolstice", month: 11, day: 21, hour: 12 },
  { key: "springEquinox", month: 2, day: 20, hour: 12 },
  { key: "autumnEquinox", month: 8, day: 22, hour: 12 },
];

export function estimateTimezoneOffsetHours(latitude: number, longitude: number, date: Date): number {
  if (latitude >= 59 && latitude <= 71 && longitude >= 19 && longitude <= 32) {
    return isFinnishDaylightSavingTime(date) ? 3 : 2;
  }
  return clamp(Math.round(longitude / 15), -12, 14);
}

function getDayOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const current = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((current - start) / (1000 * 60 * 60 * 24));
}

function isFinnishDaylightSavingTime(date: Date): boolean {
  const year = date.getFullYear();
  const dstStart = lastSundayOfMonth(year, 2);
  const dstEnd = lastSundayOfMonth(year, 9);
  return date >= dstStart && date < dstEnd;
}

function lastSundayOfMonth(year: number, month: number): Date {
  const date = new Date(year, month + 1, 0, 4, 0);
  date.setDate(date.getDate() - date.getDay());
  return date;
}

function colorForShadowHour(hour: number): string {
  if (hour < 10) return "#5aa6d6";
  if (hour > 16) return "#d9973e";
  return "#6fbf73";
}

function formatTime(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
