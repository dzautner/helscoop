import * as cheerio from "cheerio";

export type StockLevel = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

export function extractPrice(html: string, config: Record<string, string>): number | null {
  const $ = cheerio.load(html);

  const selectors = [
    config.priceSelector,
    "[data-price]",
    ".product-price",
    ".price__current",
    ".product__price",
    ".price-tag",
    'meta[property="product:price:amount"]',
  ].filter(Boolean) as string[];

  for (const sel of selectors) {
    const el = $(sel).first();
    if (!el.length) continue;

    let text = el.attr("content") || el.attr("data-price") || el.text();
    if (!text) continue;

    text = text.replace(/[^\d.,]/g, "").replace(",", ".");
    const price = parseFloat(text);
    if (!isNaN(price) && price > 0 && price < 100000) return price;
  }
  return null;
}

export function classifyStockText(text: string): { stockLevel: StockLevel; inStock: boolean | null } {
  const normalized = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return { stockLevel: "unknown", inStock: null };

  const outOfStock = [
    "ei saatavilla",
    "ei varastossa",
    "loppu",
    "tilapäisesti loppu",
    "out of stock",
    "unavailable",
    "sold out",
  ];
  if (outOfStock.some((term) => normalized.includes(term))) {
    return { stockLevel: "out_of_stock", inStock: false };
  }

  const lowStock = [
    "vähän varastossa",
    "rajoitetusti",
    "niukasti",
    "low stock",
    "limited stock",
    "few left",
  ];
  if (lowStock.some((term) => normalized.includes(term))) {
    return { stockLevel: "low_stock", inStock: true };
  }

  const inStock = [
    "varastossa",
    "saatavilla",
    "noutettavissa",
    "toimitettavissa",
    "in stock",
    "available",
  ];
  if (inStock.some((term) => normalized.includes(term))) {
    return { stockLevel: "in_stock", inStock: true };
  }

  return { stockLevel: "unknown", inStock: null };
}

export function extractStock(
  html: string,
  config: Record<string, string>,
): { stockLevel: StockLevel; inStock: boolean | null; storeLocation: string | null; checked: boolean } {
  const $ = cheerio.load(html);
  const stockSelectors = [
    config.stockSelector,
    "[data-stock-status]",
    "[data-availability]",
    ".availability",
    ".stock-status",
    ".product-availability",
    ".store-availability",
    ".availability__text",
  ].filter(Boolean) as string[];
  const storeSelectors = [
    config.storeSelector,
    "[data-store-name]",
    ".store-name",
    ".selected-store",
    ".pickup-store",
  ].filter(Boolean) as string[];

  let stockText = "";
  for (const sel of stockSelectors) {
    const el = $(sel).first();
    if (!el.length) continue;
    stockText = [
      el.attr("content"),
      el.attr("data-stock-status"),
      el.attr("data-availability"),
      el.text(),
    ].filter(Boolean).join(" ");
    if (stockText.trim()) break;
  }

  let storeLocation: string | null = null;
  for (const sel of storeSelectors) {
    const text = $(sel).first().text().replace(/\s+/g, " ").trim();
    if (text) {
      storeLocation = text;
      break;
    }
  }

  const classified = classifyStockText(stockText);
  return {
    ...classified,
    storeLocation,
    checked: classified.stockLevel !== "unknown" || storeLocation !== null,
  };
}
