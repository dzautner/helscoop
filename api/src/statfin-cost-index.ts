export const FINNISH_VAT_RATE = 0.255;
export const STATFIN_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FALLBACK_CACHE_TTL_MS = 30 * 60 * 1000;
const STATFIN_BASE_YEAR_CODE = "2021_100";
const STATFIN_BASE_YEAR_LABEL = "2021=100";
const STATFIN_TABLE_ID = "statfin_rki_pxt_118p";
const STATFIN_BROWSER_URL =
  "https://pxdata.stat.fi/PxWeb/pxweb/en/StatFin/StatFin__rki/statfin_rki_pxt_118p.px/";
const DEFAULT_STATFIN_API_URL =
  "https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin/rki/statfin_rki_pxt_118p.px";

const INDEX_CODES = {
  total: "Kokonaisindeksi",
  labour: "Työpanokset",
  materials: "Tarvikepanokset",
  services: "Palvelut",
} as const;

export const STATFIN_COST_INDEX_ATTRIBUTION = "Lähde: Tilastokeskus, Rakennuskustannusindeksi";

export type RenovationCostUnit = "m2" | "m" | "unit" | "project";
export type StatFinIndexSourceStatus = "live" | "fallback";

export interface RenovationBaseCost {
  id: string;
  labelFi: string;
  labelEn: string;
  unit: RenovationCostUnit;
  baseCostExVat: number;
  materialShare: number;
  labourShare: number;
  serviceShare: number;
  notes: string;
}

export interface StatFinCostIndex {
  period: string;
  updatedAt: string | null;
  baseYear: string;
  values: {
    total: number;
    labour: number;
    materials: number;
    services: number;
  };
  multipliers: {
    total: number;
    labour: number;
    materials: number;
    services: number;
  };
}

export interface RenovationCostCategory extends RenovationBaseCost {
  statfinMultiplier: number;
  currentCostExVat: number;
  currentCostInclVat: number;
}

export interface RenovationCostIndexCatalog {
  generatedAt: string;
  source: {
    name: "Tilastokeskus";
    statistic: "Rakennuskustannusindeksi";
    attribution: string;
    tableId: string;
    apiUrl: string;
    url: string;
    status: StatFinIndexSourceStatus;
    latestPeriod: string;
    updatedAt: string | null;
    error?: string;
  };
  cache: {
    hit: boolean;
    ttlHours: number;
    expiresAt: string;
  };
  vatRate: number;
  baseYear: string;
  index: StatFinCostIndex;
  categories: RenovationCostCategory[];
}

export interface RenovationCostEstimate {
  generatedAt: string;
  category: RenovationCostCategory;
  quantity: number;
  unit: RenovationCostUnit;
  subtotalExVat: number;
  vatRate: number;
  vatAmount: number;
  totalInclVat: number;
  formula: string;
  source: RenovationCostIndexCatalog["source"];
}

interface PxWebVariable {
  code: string;
  values: string[];
  valueTexts?: string[];
  time?: boolean;
}

interface PxWebMetadata {
  title?: string;
  variables: PxWebVariable[];
}

interface JsonStatCategory {
  index?: Record<string, number> | string[];
  label?: Record<string, string>;
}

interface JsonStatDataset {
  source?: string;
  updated?: string;
  id?: string[];
  size?: number[];
  dimension?: Record<string, { category?: JsonStatCategory }>;
  value?: number[] | Record<string, number | null> | null;
}

interface CacheEntry {
  index: StatFinCostIndex;
  status: StatFinIndexSourceStatus;
  error?: string;
  expiresAtMs: number;
  ttlMs: number;
}

export const RENOVATION_BASE_COSTS: RenovationBaseCost[] = [
  {
    id: "facade_cladding",
    labelFi: "Julkisivulaudoituksen uusinta",
    labelEn: "Facade cladding renewal",
    unit: "m2",
    baseCostExVat: 155,
    materialShare: 0.48,
    labourShare: 0.45,
    serviceShare: 0.07,
    notes: "Planning baseline for detached-house exterior cladding renewal.",
  },
  {
    id: "roof_sheet_metal",
    labelFi: "Peltikaton uusinta",
    labelEn: "Sheet-metal roof renewal",
    unit: "m2",
    baseCostExVat: 135,
    materialShare: 0.58,
    labourShare: 0.36,
    serviceShare: 0.06,
    notes: "Roof covering, battens, flashings, and normal installation labour.",
  },
  {
    id: "roof_tile",
    labelFi: "Tiilikaton uusinta",
    labelEn: "Tile roof renewal",
    unit: "m2",
    baseCostExVat: 175,
    materialShare: 0.55,
    labourShare: 0.39,
    serviceShare: 0.06,
    notes: "Heavier roof-covering renewal where structure is otherwise reusable.",
  },
  {
    id: "window_replacement",
    labelFi: "Ikkunoiden vaihto",
    labelEn: "Window replacement",
    unit: "unit",
    baseCostExVat: 760,
    materialShare: 0.62,
    labourShare: 0.33,
    serviceShare: 0.05,
    notes: "One installed standard window, excluding unusual facade repairs.",
  },
  {
    id: "exterior_door_replacement",
    labelFi: "Ulko-oven vaihto",
    labelEn: "Exterior door replacement",
    unit: "unit",
    baseCostExVat: 1180,
    materialShare: 0.58,
    labourShare: 0.36,
    serviceShare: 0.06,
    notes: "One installed exterior door with normal trim work.",
  },
  {
    id: "attic_insulation",
    labelFi: "Yläpohjan lisäeristys",
    labelEn: "Attic insulation upgrade",
    unit: "m2",
    baseCostExVat: 52,
    materialShare: 0.50,
    labourShare: 0.42,
    serviceShare: 0.08,
    notes: "Added insulation for an accessible detached-house attic.",
  },
  {
    id: "bathroom_renovation",
    labelFi: "Kylpyhuoneremontti",
    labelEn: "Bathroom renovation",
    unit: "m2",
    baseCostExVat: 1420,
    materialShare: 0.46,
    labourShare: 0.47,
    serviceShare: 0.07,
    notes: "Wet-room surfaces, waterproofing, fixtures, and installation labour.",
  },
  {
    id: "kitchen_renovation",
    labelFi: "Keittiöremontti",
    labelEn: "Kitchen renovation",
    unit: "m2",
    baseCostExVat: 1180,
    materialShare: 0.60,
    labourShare: 0.34,
    serviceShare: 0.06,
    notes: "Cabinetry-led renovation baseline excluding premium appliances.",
  },
  {
    id: "air_to_water_heat_pump",
    labelFi: "Ilma-vesilämpöpumppu",
    labelEn: "Air-to-water heat pump",
    unit: "project",
    baseCostExVat: 13800,
    materialShare: 0.68,
    labourShare: 0.26,
    serviceShare: 0.06,
    notes: "Installed system baseline for a detached-house heating upgrade.",
  },
  {
    id: "geothermal_heating",
    labelFi: "Maalämpöjärjestelmä",
    labelEn: "Geothermal heating system",
    unit: "project",
    baseCostExVat: 23800,
    materialShare: 0.52,
    labourShare: 0.32,
    serviceShare: 0.16,
    notes: "Heat pump, borehole/service work, and installation baseline.",
  },
  {
    id: "electrical_upgrade",
    labelFi: "Sähköjärjestelmän päivitys",
    labelEn: "Electrical system upgrade",
    unit: "m2",
    baseCostExVat: 86,
    materialShare: 0.34,
    labourShare: 0.58,
    serviceShare: 0.08,
    notes: "Planning baseline for wiring and distribution-board upgrade.",
  },
  {
    id: "foundation_drainage",
    labelFi: "Salaojaremontti",
    labelEn: "Foundation drainage renewal",
    unit: "m",
    baseCostExVat: 420,
    materialShare: 0.38,
    labourShare: 0.42,
    serviceShare: 0.20,
    notes: "Perimeter drainage renewal with excavation-heavy service share.",
  },
];

const FALLBACK_INDEX: StatFinCostIndex = {
  period: "2026M03",
  updatedAt: "2026-04-15T05:00:00Z",
  baseYear: STATFIN_BASE_YEAR_LABEL,
  values: {
    total: 112.7,
    labour: 113.5,
    materials: 113.8,
    services: 103,
  },
  multipliers: {
    total: 1.127,
    labour: 1.135,
    materials: 1.138,
    services: 1.03,
  },
};

let cache: CacheEntry | null = null;
let inFlight: Promise<CacheEntry> | null = null;

function statfinApiUrl(): string {
  return process.env.STATFIN_RKI_API_URL || DEFAULT_STATFIN_API_URL;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundMultiplier(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function normalizeShare(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

function weightedMultiplier(baseCost: RenovationBaseCost, index: StatFinCostIndex): number {
  const materialShare = normalizeShare(baseCost.materialShare);
  const labourShare = normalizeShare(baseCost.labourShare);
  const serviceShare = normalizeShare(baseCost.serviceShare);
  const totalShare = materialShare + labourShare + serviceShare;

  if (totalShare <= 0) return index.multipliers.total;

  return roundMultiplier(
    ((materialShare / totalShare) * index.multipliers.materials) +
      ((labourShare / totalShare) * index.multipliers.labour) +
      ((serviceShare / totalShare) * index.multipliers.services),
  );
}

function buildCategories(index: StatFinCostIndex): RenovationCostCategory[] {
  return RENOVATION_BASE_COSTS.map((baseCost) => {
    const statfinMultiplier = weightedMultiplier(baseCost, index);
    const currentCostExVat = roundMoney(baseCost.baseCostExVat * statfinMultiplier);
    return {
      ...baseCost,
      statfinMultiplier,
      currentCostExVat,
      currentCostInclVat: roundMoney(currentCostExVat * (1 + FINNISH_VAT_RATE)),
    };
  });
}

function latestMonthFromMetadata(metadata: PxWebMetadata): string {
  const monthVariable = metadata.variables.find((variable) => variable.code === "Kuukausi" || variable.time);
  const latestMonth = monthVariable?.values.at(-1);
  if (!latestMonth) {
    throw new Error("StatFin RKI metadata did not include a latest month");
  }
  return latestMonth;
}

function buildStatFinQuery(month: string) {
  return {
    query: [
      { code: "Kuukausi", selection: { filter: "item", values: [month] } },
      { code: "Perusvuosi", selection: { filter: "item", values: [STATFIN_BASE_YEAR_CODE] } },
      {
        code: "Indeksi",
        selection: {
          filter: "item",
          values: [
            INDEX_CODES.total,
            INDEX_CODES.labour,
            INDEX_CODES.materials,
            INDEX_CODES.services,
          ],
        },
      },
      { code: "Tiedot", selection: { filter: "item", values: ["pisteluku"] } },
    ],
    response: { format: "json-stat2" },
  };
}

function jsonStatIndexPosition(dataset: JsonStatDataset, dimensionId: string, code: string): number | null {
  const categoryIndex = dataset.dimension?.[dimensionId]?.category?.index;
  if (!categoryIndex) return null;

  if (Array.isArray(categoryIndex)) {
    const index = categoryIndex.indexOf(code);
    return index >= 0 ? index : null;
  }

  const index = categoryIndex[code];
  return Number.isInteger(index) ? index : null;
}

function readJsonStatValue(dataset: JsonStatDataset, coordinates: Record<string, string>): number {
  const ids = dataset.id;
  const sizes = dataset.size;
  const values = dataset.value;

  if (!ids || !sizes || !values) {
    throw new Error("StatFin RKI response is missing JSON-stat dimensions or values");
  }

  let offset = 0;
  let stride = 1;

  for (let index = ids.length - 1; index >= 0; index -= 1) {
    const id = ids[index];
    const size = sizes[index] ?? 1;
    const code = coordinates[id];
    const dimensionIndex = code ? jsonStatIndexPosition(dataset, id, code) : 0;

    if (dimensionIndex == null) {
      throw new Error(`StatFin RKI response is missing ${id}=${code}`);
    }

    offset += dimensionIndex * stride;
    stride *= size;
  }

  const rawValue = Array.isArray(values) ? values[offset] : values[String(offset)];
  const value = Number(rawValue);
  if (!Number.isFinite(value)) {
    throw new Error(`StatFin RKI value at offset ${offset} is not numeric`);
  }

  return value;
}

export function parseStatFinCostIndex(dataset: JsonStatDataset, period: string): StatFinCostIndex {
  const coordinates = {
    Kuukausi: period,
    Perusvuosi: STATFIN_BASE_YEAR_CODE,
    Tiedot: "pisteluku",
  };

  const total = readJsonStatValue(dataset, { ...coordinates, Indeksi: INDEX_CODES.total });
  const labour = readJsonStatValue(dataset, { ...coordinates, Indeksi: INDEX_CODES.labour });
  const materials = readJsonStatValue(dataset, { ...coordinates, Indeksi: INDEX_CODES.materials });
  const services = readJsonStatValue(dataset, { ...coordinates, Indeksi: INDEX_CODES.services });

  return {
    period,
    updatedAt: dataset.updated ?? null,
    baseYear: STATFIN_BASE_YEAR_LABEL,
    values: { total, labour, materials, services },
    multipliers: {
      total: roundMultiplier(total / 100),
      labour: roundMultiplier(labour / 100),
      materials: roundMultiplier(materials / 100),
      services: roundMultiplier(services / 100),
    },
  };
}

async function fetchJson<T>(
  fetchImpl: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchImpl(url, init);
  if (!response.ok) {
    throw new Error(`StatFin RKI request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchCurrentStatFinCostIndex(fetchImpl: typeof fetch = globalThis.fetch): Promise<StatFinCostIndex> {
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch is not available for StatFin RKI client");
  }

  const apiUrl = statfinApiUrl();
  const metadata = await fetchJson<PxWebMetadata>(fetchImpl, apiUrl);
  const latestMonth = latestMonthFromMetadata(metadata);
  const dataset = await fetchJson<JsonStatDataset>(fetchImpl, apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildStatFinQuery(latestMonth)),
  });

  return parseStatFinCostIndex(dataset, latestMonth);
}

async function refreshCache(nowMs: number, fetchImpl: typeof fetch): Promise<CacheEntry> {
  try {
    const index = await fetchCurrentStatFinCostIndex(fetchImpl);
    const entry: CacheEntry = {
      index,
      status: "live",
      expiresAtMs: nowMs + STATFIN_CACHE_TTL_MS,
      ttlMs: STATFIN_CACHE_TTL_MS,
    };
    cache = entry;
    return entry;
  } catch (error) {
    const entry: CacheEntry = {
      index: FALLBACK_INDEX,
      status: "fallback",
      error: error instanceof Error ? error.message : "Unknown StatFin RKI fetch error",
      expiresAtMs: nowMs + FALLBACK_CACHE_TTL_MS,
      ttlMs: FALLBACK_CACHE_TTL_MS,
    };
    cache = entry;
    return entry;
  }
}

export async function getRenovationCostIndexCatalog(options: {
  now?: Date;
  fetchImpl?: typeof fetch;
  forceRefresh?: boolean;
} = {}): Promise<RenovationCostIndexCatalog> {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  let cacheHit = false;

  if (!options.forceRefresh && cache && cache.expiresAtMs > nowMs) {
    cacheHit = true;
  } else {
    inFlight ??= refreshCache(nowMs, fetchImpl).finally(() => {
      inFlight = null;
    });
    cache = await inFlight;
  }

  const entry = cache;
  if (!entry) {
    throw new Error("StatFin RKI cache was not initialized");
  }

  return {
    generatedAt: now.toISOString(),
    source: {
      name: "Tilastokeskus",
      statistic: "Rakennuskustannusindeksi",
      attribution: STATFIN_COST_INDEX_ATTRIBUTION,
      tableId: STATFIN_TABLE_ID,
      apiUrl: statfinApiUrl(),
      url: STATFIN_BROWSER_URL,
      status: entry.status,
      latestPeriod: entry.index.period,
      updatedAt: entry.index.updatedAt,
      ...(entry.error ? { error: entry.error } : {}),
    },
    cache: {
      hit: cacheHit,
      ttlHours: entry.ttlMs / (60 * 60 * 1000),
      expiresAt: new Date(entry.expiresAtMs).toISOString(),
    },
    vatRate: FINNISH_VAT_RATE,
    baseYear: entry.index.baseYear,
    index: entry.index,
    categories: buildCategories(entry.index),
  };
}

export function estimateRenovationCost(
  catalog: RenovationCostIndexCatalog,
  categoryId: string,
  quantity: number,
): RenovationCostEstimate {
  const category = catalog.categories.find((item) => item.id === categoryId);
  if (!category) {
    throw new Error(`Unknown renovation cost category: ${categoryId}`);
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive number");
  }

  const subtotalExVat = roundMoney(category.currentCostExVat * quantity);
  const vatAmount = roundMoney(subtotalExVat * FINNISH_VAT_RATE);

  return {
    generatedAt: catalog.generatedAt,
    category,
    quantity,
    unit: category.unit,
    subtotalExVat,
    vatRate: FINNISH_VAT_RATE,
    vatAmount,
    totalInclVat: roundMoney(subtotalExVat + vatAmount),
    formula: "base_cost x quantity x tilastokeskus_index_multiplier x (1 + ALV 25.5%)",
    source: catalog.source,
  };
}

export function isRenovationCostCategoryId(value: unknown): value is string {
  return typeof value === "string" && RENOVATION_BASE_COSTS.some((category) => category.id === value);
}

export function clearRenovationCostIndexCache(): void {
  cache = null;
  inFlight = null;
}
