interface AffiliateUrlOptions {
  materialId: string;
  supplier?: string | null;
  source?: string;
}

const AFFILIATE_PARAMS = {
  utm_source: "helscoop",
  utm_medium: "material_configurator",
  utm_campaign: "bom_to_retailer",
} as const;

function appendParamsToRelativeUrl(link: string, params: URLSearchParams): string {
  const hashIndex = link.indexOf("#");
  const hash = hashIndex >= 0 ? link.slice(hashIndex) : "";
  const base = hashIndex >= 0 ? link.slice(0, hashIndex) : link;
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}${params.toString()}${hash}`;
}

export function buildAffiliateRetailerUrl(
  link: string | null | undefined,
  { materialId, supplier, source = "material_configurator" }: AffiliateUrlOptions,
): string | null {
  if (!link) return null;

  const params = new URLSearchParams(AFFILIATE_PARAMS);
  params.set("hsc_material", materialId);
  params.set("hsc_source", source);
  if (supplier) params.set("hsc_supplier", supplier);

  try {
    const url = new URL(link);
    params.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    return url.toString();
  } catch {
    return appendParamsToRelativeUrl(link, params);
  }
}
