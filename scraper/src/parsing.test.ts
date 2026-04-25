import { describe, expect, it } from "vitest";
import { classifyStockText, extractPrice, extractStock } from "./parsing";

describe("scraper parsing", () => {
  it("extracts prices from configured selectors and Finnish decimal text", () => {
    const html = `<main><span class="price">12,95 € / kpl</span></main>`;

    expect(extractPrice(html, { priceSelector: ".price" })).toBe(12.95);
  });

  it("extracts prices from product metadata fallbacks", () => {
    const html = `<meta property="product:price:amount" content="49.90">`;

    expect(extractPrice(html, {})).toBe(49.9);
  });

  it("rejects missing, zero, and implausibly large prices", () => {
    expect(extractPrice(`<span data-price="0"></span>`, {})).toBeNull();
    expect(extractPrice(`<span data-price="1000000"></span>`, {})).toBeNull();
    expect(extractPrice(`<span>No price here</span>`, {})).toBeNull();
  });

  it("classifies Finnish and English stock labels", () => {
    expect(classifyStockText("Vähän varastossa")).toEqual({
      stockLevel: "low_stock",
      inStock: true,
    });
    expect(classifyStockText("Ei varastossa")).toEqual({
      stockLevel: "out_of_stock",
      inStock: false,
    });
    expect(classifyStockText("Available for pickup")).toEqual({
      stockLevel: "in_stock",
      inStock: true,
    });
    expect(classifyStockText("")).toEqual({
      stockLevel: "unknown",
      inStock: null,
    });
  });

  it("extracts stock state and store location from configured selectors", () => {
    const html = `
      <section>
        <span class="availability">Saatavilla tänään</span>
        <strong class="store">K-Rauta Ruoholahti</strong>
      </section>
    `;

    expect(extractStock(html, { storeSelector: ".store" })).toEqual({
      stockLevel: "in_stock",
      inStock: true,
      storeLocation: "K-Rauta Ruoholahti",
      checked: true,
    });
  });
});
