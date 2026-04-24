process.env.NODE_ENV = "test";

import { describe, expect, it } from "vitest";
import {
  mapKeskoCategory,
  normalizeKeskoProduct,
  toKeskoMaterialId,
} from "../kesko-client";

describe("Kesko client normalization", () => {
  it("normalizes Kesko-style product rows with string money and stock quantity", () => {
    const product = normalizeKeskoProduct(
      {
        productId: "6438313557401",
        productName: "Runko Prof kestopuu vihrea 48x148",
        price: "4,90",
        unit: "jm",
        currency: "EUR",
        images: [{ url: "https://images.k-rauta.fi/product.jpg" }],
        productUrl: "https://www.k-rauta.fi/tuote/runko-prof/6438313557401",
        availableQuantity: "24",
        branchName: "K-Rauta Lielahti",
        categoryName: "Sahatavara",
      },
      "PK035-K-rauta-Lielahti",
      "2026-04-21T09:00:00.000Z",
    );

    expect(product).not.toBeNull();
    expect(product?.id).toBe("6438313557401");
    expect(product?.materialId).toBe("kesko_6438313557401");
    expect(product?.unitPrice).toBe(4.9);
    expect(product?.stockLevel).toBe("in_stock");
    expect(product?.storeLocation).toBe("K-Rauta Lielahti");
  });

  it("derives low stock and rejects nameless rows", () => {
    const product = normalizeKeskoProduct(
      {
        id: "sku-1",
        name: "OSB levy 9mm",
        unitPrice: 15,
        stockQuantity: 3,
      },
      "branch",
      "2026-04-21T09:00:00.000Z",
    );

    expect(product?.stockLevel).toBe("low_stock");
    expect(normalizeKeskoProduct({ id: "sku-2" }, "branch", "now")).toBeNull();
  });

  it("detects campaign prices with regular price and expiry", () => {
    const product = normalizeKeskoProduct(
      {
        id: "sku-campaign",
        name: "Terassilauta kampanja",
        campaignPrice: "7,90",
        regularPrice: "9,90",
        campaignName: "Terassikampanja -20%",
        campaignEndDate: "2026-05-15",
      },
      "branch",
      "2026-04-24T09:00:00.000Z",
    );

    expect(product?.unitPrice).toBe(7.9);
    expect(product?.regularUnitPrice).toBe(9.9);
    expect(product?.campaignLabel).toBe("Terassikampanja -20%");
    expect(product?.campaignEndsAt).toContain("2026-05-15");
  });

  it("maps common K-Rauta product categories to Helscoop categories", () => {
    expect(mapKeskoCategory("Sahatavara", "Runkopuu C24")).toBe("lumber");
    expect(mapKeskoCategory("Rakennuslevyt", "OSB levy")).toBe("sheathing");
    expect(mapKeskoCategory("Eristeet", "Mineraalivilla")).toBe("insulation");
    expect(mapKeskoCategory("Tuntematon", "Puuruuvi 5x80")).toBe("fasteners");
  });

  it("generates deterministic Kesko material ids", () => {
    expect(toKeskoMaterialId({ id: "ABC 123", ean: null, sku: null })).toBe("kesko_abc_123");
    expect(toKeskoMaterialId({ id: "fallback", ean: "6438313557401", sku: null })).toBe("kesko_6438313557401");
  });
});
