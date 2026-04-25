import { describe, it, expect } from "vitest";
import { buildAffiliateRetailerUrl } from "@/lib/material-affiliate";

describe("buildAffiliateRetailerUrl", () => {
  it("returns null for null link", () => {
    expect(buildAffiliateRetailerUrl(null, { materialId: "m1" })).toBeNull();
  });

  it("returns null for undefined link", () => {
    expect(buildAffiliateRetailerUrl(undefined, { materialId: "m1" })).toBeNull();
  });

  it("returns null for empty string link", () => {
    expect(buildAffiliateRetailerUrl("", { materialId: "m1" })).toBeNull();
  });

  it("adds UTM params to absolute URL", () => {
    const result = buildAffiliateRetailerUrl("https://shop.example.com/product", {
      materialId: "pine-board",
    });
    expect(result).toContain("utm_source=helscoop");
    expect(result).toContain("utm_medium=material_configurator");
    expect(result).toContain("utm_campaign=bom_to_retailer");
    expect(result).toContain("hsc_material=pine-board");
  });

  it("adds supplier param when provided", () => {
    const result = buildAffiliateRetailerUrl("https://shop.example.com/product", {
      materialId: "m1",
      supplier: "K-Rauta",
    });
    expect(result).toContain("hsc_supplier=K-Rauta");
  });

  it("does not add supplier param when null", () => {
    const result = buildAffiliateRetailerUrl("https://shop.example.com/product", {
      materialId: "m1",
      supplier: null,
    });
    expect(result).not.toContain("hsc_supplier");
  });

  it("uses custom source when provided", () => {
    const result = buildAffiliateRetailerUrl("https://shop.example.com", {
      materialId: "m1",
      source: "bom_panel",
    });
    expect(result).toContain("hsc_source=bom_panel");
  });

  it("defaults source to material_configurator", () => {
    const result = buildAffiliateRetailerUrl("https://shop.example.com", {
      materialId: "m1",
    });
    expect(result).toContain("hsc_source=material_configurator");
  });

  it("handles relative URL with query params", () => {
    const result = buildAffiliateRetailerUrl("/products/123?color=red", {
      materialId: "m1",
    });
    expect(result).toContain("&utm_source=helscoop");
    expect(result).toContain("color=red");
  });

  it("handles relative URL without query params", () => {
    const result = buildAffiliateRetailerUrl("/products/123", {
      materialId: "m1",
    });
    expect(result).toContain("?utm_source=helscoop");
  });

  it("preserves hash fragment in relative URL", () => {
    const result = buildAffiliateRetailerUrl("/products/123#details", {
      materialId: "m1",
    });
    expect(result).toContain("#details");
    expect(result).toContain("utm_source=helscoop");
  });

  it("preserves existing query params on absolute URL", () => {
    const result = buildAffiliateRetailerUrl("https://shop.example.com/product?sku=ABC", {
      materialId: "m1",
    });
    expect(result).toContain("sku=ABC");
    expect(result).toContain("utm_source=helscoop");
  });
});
