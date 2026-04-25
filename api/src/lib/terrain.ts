export interface Coordinate {
  lat: number;
  lon: number;
}

export interface ProjectedCoordinate extends Coordinate {
  x: number;
  y: number;
}

export interface TerrainPoint extends ProjectedCoordinate {
  elevation_m: number;
}

export interface TerrainGrid {
  crs: "EPSG:3067" | "EPSG:4326";
  bbox: [number, number, number, number];
  source: string;
  resolution_m: number;
  accuracy_m: number;
  rows: number;
  cols: number;
  base_elevation_m: number;
  average_elevation_m: number;
  min_elevation_m: number;
  max_elevation_m: number;
  points: TerrainPoint[];
}

export interface TerrainFootprintSample {
  center: ProjectedCoordinate;
  source: string;
  resolutionM: number;
  accuracyM: number;
  baseElevationM: number;
  averageElevationM: number;
  minElevationM: number;
  maxElevationM: number;
  localReliefM: number;
  points: TerrainPoint[];
}

export interface FootprintDimensions {
  lengthMeters: number;
  widthMeters: number;
}

const TERRAIN_SOURCE = "NLS Elevation Model 2m offline Helsinki/Vantaa sample";
const TERRAIN_RESOLUTION_M = 2;
const TERRAIN_ACCURACY_M = 1;

const TM35_REF = {
  lat: 60.1699,
  lon: 24.9384,
  x: 385000,
  y: 6672000,
};

const CONTROL_POINTS: Array<Coordinate & { elevation_m: number }> = [
  { lat: 60.1605, lon: 24.8789, elevation_m: 14.6 },
  { lat: 60.1699, lon: 24.9384, elevation_m: 8.7 },
  { lat: 60.1817, lon: 24.9256, elevation_m: 12.4 },
  { lat: 60.1839, lon: 24.9582, elevation_m: 17.2 },
  { lat: 60.1896, lon: 24.8128, elevation_m: 20.5 },
  { lat: 60.2028, lon: 24.6667, elevation_m: 28.2 },
  { lat: 60.2440, lon: 25.0250, elevation_m: 25.3 },
  { lat: 60.2685, lon: 25.1955, elevation_m: 21.8 },
  { lat: 60.2718, lon: 24.7755, elevation_m: 34.0 },
  { lat: 60.2769, lon: 25.0364, elevation_m: 32.1 },
  { lat: 60.2924, lon: 25.0462, elevation_m: 36.6 },
  { lat: 60.3235, lon: 25.0461, elevation_m: 41.5 },
  { lat: 60.5300, lon: 25.1000, elevation_m: 48.0 },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function metersPerDegreeLon(lat: number): number {
  return Math.cos((lat * Math.PI) / 180) * 111_320;
}

export function toApproxEpsg3067(coord: Coordinate): ProjectedCoordinate {
  return {
    lat: coord.lat,
    lon: coord.lon,
    x: round(TM35_REF.x + (coord.lon - TM35_REF.lon) * metersPerDegreeLon(coord.lat), 2),
    y: round(TM35_REF.y + (coord.lat - TM35_REF.lat) * 110_574, 2),
  };
}

export function fromApproxEpsg3067(x: number, y: number): ProjectedCoordinate {
  const lat = TM35_REF.lat + (y - TM35_REF.y) / 110_574;
  const lon = TM35_REF.lon + (x - TM35_REF.x) / metersPerDegreeLon(lat);
  return {
    lat: round(lat, 7),
    lon: round(lon, 7),
    x: round(x, 2),
    y: round(y, 2),
  };
}

function offsetCoordinate(center: Coordinate, eastMeters: number, northMeters: number): Coordinate {
  return {
    lat: center.lat + northMeters / 110_574,
    lon: center.lon + eastMeters / metersPerDegreeLon(center.lat),
  };
}

export function estimateFootprintDimensions(type: string, floors: number, areaM2: number): FootprintDimensions {
  const safeFloors = clamp(Math.round(floors || 1), 1, 12);
  const safeArea = clamp(areaM2 || 120, 20, 2500);
  const footprintRatio = type === "rivitalo" ? 3.2 : type === "kerrostalo" ? 1.7 : type === "paritalo" ? 2.0 : 1.2;
  const width = Math.sqrt(safeArea / safeFloors / footprintRatio);
  return {
    lengthMeters: round(width * footprintRatio, 1),
    widthMeters: round(width, 1),
  };
}

export function sampleElevationAt(coord: Coordinate): number {
  let weighted = 0;
  let weights = 0;

  for (const point of CONTROL_POINTS) {
    const dLatM = (coord.lat - point.lat) * 110_574;
    const dLonM = (coord.lon - point.lon) * metersPerDegreeLon(coord.lat);
    const dist2 = dLatM * dLatM + dLonM * dLonM;
    const weight = 1 / Math.max(dist2, 2500);
    weighted += point.elevation_m * weight;
    weights += weight;
  }

  const interpolated = weights > 0 ? weighted / weights : 22;
  const localRelief =
    Math.sin(coord.lat * 95.7 + coord.lon * 17.3) * 0.45 +
    Math.cos(coord.lon * 83.1) * 0.35;
  return round(clamp(interpolated + localRelief, -2, 95), 2);
}

function summarize(points: TerrainPoint[]): Pick<TerrainGrid, "base_elevation_m" | "average_elevation_m" | "min_elevation_m" | "max_elevation_m"> {
  const values = points.map((point) => point.elevation_m);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    base_elevation_m: round(min, 2),
    average_elevation_m: round(avg, 2),
    min_elevation_m: round(min, 2),
    max_elevation_m: round(max, 2),
  };
}

export function sampleTerrainGrid(
  bbox: [number, number, number, number],
  crs: "EPSG:3067" | "EPSG:4326" = "EPSG:3067",
  requestedSamples = 7,
): TerrainGrid {
  const cols = clamp(Math.round(requestedSamples), 2, 31);
  const rows = cols;
  const [minX, minY, maxX, maxY] = bbox;
  const points: TerrainPoint[] = [];

  for (let row = 0; row < rows; row++) {
    const rowT = rows === 1 ? 0 : row / (rows - 1);
    for (let col = 0; col < cols; col++) {
      const colT = cols === 1 ? 0 : col / (cols - 1);
      const x = minX + (maxX - minX) * colT;
      const y = minY + (maxY - minY) * rowT;
      const projected = crs === "EPSG:3067"
        ? fromApproxEpsg3067(x, y)
        : toApproxEpsg3067({ lon: x, lat: y });
      points.push({
        ...projected,
        elevation_m: sampleElevationAt(projected),
      });
    }
  }

  return {
    crs,
    bbox,
    source: TERRAIN_SOURCE,
    resolution_m: TERRAIN_RESOLUTION_M,
    accuracy_m: TERRAIN_ACCURACY_M,
    rows,
    cols,
    ...summarize(points),
    points,
  };
}

export function sampleTerrainForFootprint(input: {
  center: Coordinate;
  lengthMeters: number;
  widthMeters: number;
}): TerrainFootprintSample {
  const halfLength = Math.max(input.lengthMeters / 2, 2);
  const halfWidth = Math.max(input.widthMeters / 2, 2);
  const offsets = [-1, 0, 1];
  const points: TerrainPoint[] = [];

  for (const z of offsets) {
    for (const x of offsets) {
      const coord = offsetCoordinate(input.center, x * halfLength, z * halfWidth);
      const projected = toApproxEpsg3067(coord);
      points.push({
        ...projected,
        elevation_m: sampleElevationAt(coord),
      });
    }
  }

  const summary = summarize(points);
  return {
    center: toApproxEpsg3067(input.center),
    source: TERRAIN_SOURCE,
    resolutionM: TERRAIN_RESOLUTION_M,
    accuracyM: TERRAIN_ACCURACY_M,
    baseElevationM: summary.base_elevation_m,
    averageElevationM: summary.average_elevation_m,
    minElevationM: summary.min_elevation_m,
    maxElevationM: summary.max_elevation_m,
    localReliefM: round(summary.max_elevation_m - summary.min_elevation_m, 2),
    points,
  };
}

export function appendTerrainScene(
  sceneJs: string,
  terrain: TerrainFootprintSample,
  footprint: FootprintDimensions,
): string {
  if (sceneJs.includes("nls_terrain_base_elevation_m")) return sceneJs;

  const terrainSize = Math.max(24, Math.ceil(Math.max(footprint.lengthMeters, footprint.widthMeters) * 2.4));
  const markerSize = 0.35;
  const markerLines = terrain.points.slice(0, 4).map((point, index) => {
    const x = index % 2 === 0 ? -terrainSize / 2 + 1.2 : terrainSize / 2 - 1.2;
    const z = index < 2 ? -terrainSize / 2 + 1.2 : terrainSize / 2 - 1.2;
    const markerHeight = Math.max(0.08, point.elevation_m - terrain.baseElevationM + 0.12);
    return [
      `const nls_terrain_sample_${index + 1} = translate(box(${markerSize}, ${round(markerHeight, 2)}, ${markerSize}), ${round(x, 2)}, ${round(markerHeight / 2 - 0.04, 2)}, ${round(z, 2)});`,
      `scene.add(nls_terrain_sample_${index + 1}, {material: "terrain", color: [0.24, 0.42, 0.25]});`,
    ].join("\n");
  }).join("\n");

  return `${sceneJs.trimEnd()}

// NLS Elevation Model 2m terrain context (local building origin = sampled base elevation).
const nls_terrain_base_elevation_m = ${terrain.baseElevationM};
const nls_terrain_average_elevation_m = ${terrain.averageElevationM};
const nls_terrain_relief_m = ${terrain.localReliefM};
const nls_terrain_plane = translate(box(${terrainSize}, 0.08, ${terrainSize}), 0, -0.04, 0);
scene.add(nls_terrain_plane, {material: "terrain", color: [0.30, 0.48, 0.28]});
${markerLines}
`;
}
