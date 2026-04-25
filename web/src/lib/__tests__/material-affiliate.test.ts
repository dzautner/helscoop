import { describe, expect, it } from "vitest";
import { buildAffiliateRetailerUrl } from "@/lib/material-affiliate";

describe("buildAffiliateRetailerUrl", () => {
  it("adds Helscoop tracking parameters to retailer URLs", () => {
    const url = buildAffiliateRetailerUrl("https://example.com/product?sku=1", {
      materialId: "roofing_sheet",
      supplier: "K-Rauta",
    });

    expect(url).toContain("utm_source=helscoop");
    expect(url).toContain("utm_medium=material_configurator");
    expect(url).toContain("utm_campaign=bom_to_retailer");
    expect(url).toContain("hsc_material=roofing_sheet");
    expect(url).toContain("hsc_supplier=K-Rauta");
    expect(url).toContain("sku=1");
  });

  it("preserves hash fragments for relative catalog links", () => {
    const url = buildAffiliateRetailerUrl("/materials/pine#buy", {
      materialId: "pine_48x98_c24",
    });

    expect(url).toBe("/materials/pine?utm_source=helscoop&utm_medium=material_configurator&utm_campaign=bom_to_retailer&hsc_material=pine_48x98_c24&hsc_source=material_configurator#buy");
  });

  it("returns null when no retailer link exists", () => {
    expect(buildAffiliateRetailerUrl(null, { materialId: "m1" })).toBeNull();
  });
});
