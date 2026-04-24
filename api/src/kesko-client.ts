export type KeskoStockLevel = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

export interface KeskoProduct {
  id: string;
  materialId: string;
  name: string;
  ean: string | null;
  sku: string | null;
  unitPrice: number | null;
  regularUnitPrice: number | null;
  priceText: string | null;
  regularPriceText: string | null;
  campaignLabel: string | null;
  campaignEndsAt: string | null;
  currency: string;
  unit: string;
  imageUrl: string | null;
  productUrl: string | null;
  stockLevel: KeskoStockLevel;
  stockQuantity: number | null;
  storeName: string | null;
  storeLocation: string | null;
  categoryName: string | null;
  branchCode: string;
  lastCheckedAt: string;
}

export interface KeskoSearchResponse {
  configured: boolean;
  source: "live" | "cache" | "not_configured" | "error";
  branchCode: string;
  products: KeskoProduct[];
  cachedAt?: string;
  error?: string;
}

interface CacheEntry {
  response: KeskoSearchResponse;
  expiresAt: number;
}

const searchCache = new Map<string, CacheEntry>();
const importCache = new Map<string, { product: KeskoProduct; expiresAt: number }>();

function getConfig() {
  const apiKey = process.env.KESKO_API_KEY || process.env.KESKO_SUBSCRIPTION_KEY || "";
  return {
    apiKey,
    baseUrl: (process.env.KESKO_API_BASE_URL || "https://keskoapi.com/api").replace(/\/+$/, ""),
    branchCode: process.env.KESKO_BRANCH_CODE || "PK035-K-rauta-Lielahti",
    keyHeader: process.env.KESKO_API_KEY_HEADER || "Ocp-Apim-Subscription-Key",
    productsPathTemplate: process.env.KESKO_PRODUCTS_PATH_TEMPLATE || "/products/{branchCode}",
    searchParam: process.env.KESKO_SEARCH_PARAM || "search",
    cacheTtlSeconds: parsePositiveInt(process.env.KESKO_CACHE_TTL_SECONDS, 3600),
    timeoutMs: parsePositiveInt(process.env.KESKO_TIMEOUT_MS, 8000),
  };
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function isKeskoConfigured(): boolean {
  return Boolean(getConfig().apiKey);
}

export function toKeskoMaterialId(product: Pick<KeskoProduct, "id" | "ean" | "sku">): string {
  const raw = product.ean || product.sku || product.id;
  const slug = raw
    .toLowerCase()
    .replace(/^kesko_/, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return `kesko_${slug || "product"}`;
}

export function mapKeskoCategory(categoryName: string | null | undefined, productName = ""): string {
  const haystack = `${categoryName || ""} ${productName}`.toLowerCase();
  if (/(puutavara|sahatavara|runkopuu|kestopuu|lumber|timber|wood)/.test(haystack)) return "lumber";
  if (/(eriste|villa|insulation|paroc|rockwool)/.test(haystack)) return "insulation";
  if (/(katto|roof|kattopelti|peltikate|bitumi)/.test(haystack)) return "roofing";
  if (/(levy|osb|vaneri|kipsilevy|panel|board|plywood)/.test(haystack)) return "sheathing";
  if (/(ruuvi|naula|kiinnike|fastener|screw|nail)/.test(haystack)) return "fasteners";
  if (/(maali|lakka|paint|finish|pintakasittely)/.test(haystack)) return "finish";
  if (/(betoni|harkko|laasti|sementti|masonry|concrete)/.test(haystack)) return "masonry";
  if (/(kalvo|muovi|barrier|membrane|hoyrynsulku)/.test(haystack)) return "membrane";
  return "hardware";
}

export async function searchKeskoProducts(
  searchTerm: string,
  requestedBranchCode?: string,
): Promise<KeskoSearchResponse> {
  const config = getConfig();
  const branchCode = normalizeBranchCode(requestedBranchCode || config.branchCode);
  const q = searchTerm.trim();
  const now = Date.now();
  const cacheKey = `${branchCode}:${q.toLowerCase()}`;

  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return {
      ...cached.response,
      source: "cache",
      cachedAt: new Date(cached.expiresAt - config.cacheTtlSeconds * 1000).toISOString(),
    };
  }

  if (!config.apiKey) {
    return {
      configured: false,
      source: "not_configured",
      branchCode,
      products: [],
      error: "Kesko API credentials are not configured",
    };
  }

  try {
    const url = buildSearchUrl(config.baseUrl, config.productsPathTemplate, branchCode, config.searchParam, q);
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json",
        [config.keyHeader]: config.apiKey,
      },
    }, config.timeoutMs);

    if (!response.ok) {
      return {
        configured: true,
        source: "error",
        branchCode,
        products: [],
        error: `Kesko API returned ${response.status}`,
      };
    }

    const payload = await response.json();
    const checkedAt = new Date().toISOString();
    const products = extractProductRows(payload)
      .map((row) => normalizeKeskoProduct(row, branchCode, checkedAt))
      .filter((row): row is KeskoProduct => row !== null);

    rememberKeskoProducts(products, config.cacheTtlSeconds);

    const result: KeskoSearchResponse = {
      configured: true,
      source: "live",
      branchCode,
      products,
    };
    searchCache.set(cacheKey, { response: result, expiresAt: now + config.cacheTtlSeconds * 1000 });
    return result;
  } catch (err) {
    return {
      configured: true,
      source: "error",
      branchCode,
      products: [],
      error: err instanceof Error ? err.message : "Kesko API request failed",
    };
  }
}

export function rememberKeskoProducts(products: KeskoProduct[], ttlSeconds = 3600) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  for (const product of products) {
    importCache.set(product.id, { product, expiresAt });
    importCache.set(product.materialId, { product, expiresAt });
    if (product.ean) importCache.set(product.ean, { product, expiresAt });
    if (product.sku) importCache.set(product.sku, { product, expiresAt });
  }
}

export function getCachedKeskoProduct(productId: string): KeskoProduct | null {
  const cached = importCache.get(productId);
  if (!cached || cached.expiresAt <= Date.now()) return null;
  return cached.product;
}

function normalizeBranchCode(branchCode: string): string {
  return branchCode.trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80) || "PK035-K-rauta-Lielahti";
}

function buildSearchUrl(
  baseUrl: string,
  pathTemplate: string,
  branchCode: string,
  searchParam: string,
  q: string,
): string {
  const path = pathTemplate
    .replace("{branchCode}", encodeURIComponent(branchCode))
    .replace("{query}", encodeURIComponent(q));
  const url = new URL(path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`);
  if (!pathTemplate.includes("{query}")) {
    url.searchParams.set(searchParam, q);
  }
  return url.toString();
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractProductRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter(isRecord);
  if (!isRecord(payload)) return [];

  const candidates = [
    payload.products,
    payload.items,
    payload.data,
    isRecord(payload.data) ? payload.data.products : undefined,
    isRecord(payload.data) ? payload.data.items : undefined,
    payload.results,
    isRecord(payload.response) ? payload.response.products : undefined,
    isRecord(payload.response) ? payload.response.items : undefined,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord);
  }
  return [];
}

export function normalizeKeskoProduct(
  raw: Record<string, unknown>,
  branchCode: string,
  lastCheckedAt: string,
): KeskoProduct | null {
  const name = pickString(raw, [
    "name",
    "productName",
    "title",
    "displayName",
    "description",
  ]);
  if (!name) return null;

  const ean = pickString(raw, ["ean", "gtin", "barcode", "barCode"]);
  const sku = pickString(raw, ["sku", "productCode", "code", "articleNumber", "itemNumber"]);
  const id = pickString(raw, ["id", "productId", "productID", "keskoProductId"]) || ean || sku;
  if (!id) return null;

  const priceText = pickMoneyString(raw, [
    "unitPrice",
    "salesPrice",
    "currentPrice",
    "campaignPrice",
    "campaign.price",
    "promotion.price",
    "price",
    "pricing.price",
    "price.value",
    "price.amount",
  ]);
  const unitPrice = priceText === null ? null : parseMoney(priceText);
  const regularPriceText = pickMoneyString(raw, [
    "regularPrice",
    "normalPrice",
    "listPrice",
    "originalPrice",
    "wasPrice",
    "comparisonPrice",
    "pricing.regularPrice",
    "price.regularPrice",
    "price.normalPrice",
    "campaign.regularPrice",
    "promotion.regularPrice",
  ]);
  const rawRegularUnitPrice = regularPriceText === null ? null : parseMoney(regularPriceText);
  const regularUnitPrice = rawRegularUnitPrice !== null && unitPrice !== null && rawRegularUnitPrice > unitPrice
    ? rawRegularUnitPrice
    : null;
  const categoryName = pickString(raw, ["categoryName", "category", "categoryPath", "department"]);

  const product: KeskoProduct = {
    id,
    materialId: toKeskoMaterialId({ id, ean, sku }),
    name,
    ean,
    sku,
    unitPrice,
    regularUnitPrice,
    priceText,
    regularPriceText,
    campaignLabel: regularUnitPrice ? pickString(raw, [
      "campaignLabel",
      "campaignName",
      "promotionName",
      "offerText",
      "campaign.title",
      "promotion.title",
    ]) || "Campaign price" : null,
    campaignEndsAt: regularUnitPrice ? pickDateString(raw, [
      "campaignEndsAt",
      "campaignEndDate",
      "campaignValidTo",
      "validTo",
      "offerEndDate",
      "campaign.endDate",
      "promotion.endDate",
    ]) : null,
    currency: pickString(raw, ["currency", "price.currency", "pricing.currency"]) || "EUR",
    unit: normalizeUnit(pickString(raw, ["unit", "priceUnit", "salesUnit", "unitOfMeasure", "measurementUnit"])),
    imageUrl: pickUrl(raw, ["imageUrl", "image", "productImage", "mainImage", "images.0.url", "images.0"]),
    productUrl: pickUrl(raw, ["productUrl", "url", "link", "webUrl"]),
    stockLevel: deriveStockLevel(raw),
    stockQuantity: pickNumber(raw, ["stockQuantity", "availableQuantity", "quantity", "stock.quantity", "availability.quantity"]),
    storeName: pickString(raw, ["storeName", "branchName", "shopName", "availability.storeName"]),
    storeLocation: pickString(raw, ["storeLocation", "branchName", "location", "availability.storeName"]),
    categoryName,
    branchCode,
    lastCheckedAt,
  };
  return product;
}

function deriveStockLevel(raw: Record<string, unknown>): KeskoStockLevel {
  const quantity = pickNumber(raw, ["stockQuantity", "availableQuantity", "quantity", "stock.quantity", "availability.quantity"]);
  if (quantity !== null) {
    if (quantity <= 0) return "out_of_stock";
    if (quantity <= 5) return "low_stock";
    return "in_stock";
  }

  const text = (pickString(raw, [
    "stockLevel",
    "stockStatus",
    "availability",
    "availabilityStatus",
    "stock.status",
    "availability.status",
  ]) || "").toLowerCase();

  if (/(out|loppu|ei saatav|unavailable|sold out)/.test(text)) return "out_of_stock";
  if (/(low|vahan|vähän|limited|rajoitettu)/.test(text)) return "low_stock";
  if (/(in stock|varastossa|available|saatavilla)/.test(text)) return "in_stock";
  return "unknown";
}

function normalizeUnit(unit: string | null): string {
  if (!unit) return "kpl";
  const normalized = unit.trim();
  if (normalized === "m²") return "m2";
  if (normalized === "m³") return "m3";
  return normalized.slice(0, 24);
}

function pickString(raw: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    const value = getPath(raw, path);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function pickMoneyString(raw: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    const value = getPath(raw, path);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return value.toFixed(2);
    if (isRecord(value)) {
      const nested = pickMoneyString(value, ["value", "amount", "price"]);
      if (nested) return nested;
    }
  }
  return null;
}

function pickNumber(raw: Record<string, unknown>, paths: string[]): number | null {
  for (const path of paths) {
    const value = getPath(raw, path);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value.replace(",", ".").replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function pickDateString(raw: Record<string, unknown>, paths: string[]): string | null {
  for (const path of paths) {
    const value = getPath(raw, path);
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === "string" && value.trim()) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }
  return null;
}

function pickUrl(raw: Record<string, unknown>, paths: string[]): string | null {
  const value = pickString(raw, paths);
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parseMoney(value: string): number | null {
  const cleaned = value
    .replace(/\s/g, "")
    .replace("EUR", "")
    .replace("eur", "")
    .replace("€", "");
  const normalized = cleaned.includes(",") && !cleaned.includes(".")
    ? cleaned.replace(",", ".")
    : cleaned.replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function getPath(raw: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = raw;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      current = Number.isFinite(index) ? current[index] : undefined;
      continue;
    }
    if (!isRecord(current)) return undefined;
    current = current[part];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
