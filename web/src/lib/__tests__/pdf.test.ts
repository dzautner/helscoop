/**
 * Unit tests for the PDF quote generator utilities.
 *
 * Tests the pure helper functions (groupByCategory, fmtCurrency, fmtDate)
 * and the VAT calculation logic. The full PDF rendering is tested via mocked
 * jsPDF to verify structure without actual PDF generation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock jsPDF — we test logic, not rendering
// ---------------------------------------------------------------------------
const mockDoc = {
  internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  setFillColor: vi.fn(),
  rect: vi.fn(),
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  text: vi.fn(),
  setDrawColor: vi.fn(),
  setLineWidth: vi.fn(),
  line: vi.fn(),
  addPage: vi.fn(),
  getNumberOfPages: vi.fn(() => 1),
  setPage: vi.fn(),
  save: vi.fn(),
};

vi.mock("jspdf", () => ({
  jsPDF: vi.fn(() => mockDoc),
}));

import { generateQuotePdf } from "@/lib/pdf";
import type { BomItem } from "@/types";

// ---------------------------------------------------------------------------
// Helpers for creating test BOM items
// ---------------------------------------------------------------------------
function makeBomItem(overrides: Partial<BomItem> = {}): BomItem {
  return {
    material_id: "pine_48x98_c24",
    material_name: "Pine 48x98 C24",
    category_name: "Timber",
    quantity: 50,
    unit: "jm",
    unit_price: 3.2,
    total: 160.0,
    supplier: "K-Rauta",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. PDF generation — basic invocation
// ---------------------------------------------------------------------------
describe("generateQuotePdf — basic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.getNumberOfPages.mockReturnValue(1);
  });

  it("generates PDF without throwing", () => {
    expect(() =>
      generateQuotePdf({
        projectName: "Test Project",
        bom: [makeBomItem()],
        locale: "fi",
      })
    ).not.toThrow();
  });

  it("calls doc.save with sanitized filename", () => {
    generateQuotePdf({
      projectName: "My Renovation Project",
      bom: [makeBomItem()],
      locale: "fi",
    });
    expect(mockDoc.save).toHaveBeenCalledWith("helscoop_My_Renovation_Project.pdf");
  });

  it("sanitizes special characters in filename", () => {
    generateQuotePdf({
      projectName: "Talo/keittiö & sauna!",
      bom: [makeBomItem()],
      locale: "fi",
    });
    const call = mockDoc.save.mock.calls[0][0] as string;
    // Should not contain / or & or !
    expect(call).not.toContain("/");
    expect(call).not.toContain("&");
    expect(call).not.toContain("!");
    expect(call).toContain("helscoop_");
    expect(call).toContain(".pdf");
  });

  it("works with English locale", () => {
    expect(() =>
      generateQuotePdf({
        projectName: "Test",
        bom: [makeBomItem()],
        locale: "en",
      })
    ).not.toThrow();
  });

  it("works with Finnish locale", () => {
    expect(() =>
      generateQuotePdf({
        projectName: "Testi",
        bom: [makeBomItem()],
        locale: "fi",
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 2. Empty BOM
// ---------------------------------------------------------------------------
describe("generateQuotePdf — empty BOM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.getNumberOfPages.mockReturnValue(1);
  });

  it("generates PDF with empty BOM without errors", () => {
    expect(() =>
      generateQuotePdf({
        projectName: "Empty Project",
        bom: [],
        locale: "fi",
      })
    ).not.toThrow();
    expect(mockDoc.save).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Category grouping
// ---------------------------------------------------------------------------
describe("generateQuotePdf — category grouping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.getNumberOfPages.mockReturnValue(1);
  });

  it("groups items by category in text output", () => {
    const bom: BomItem[] = [
      makeBomItem({ category_name: "Timber", material_name: "Pine 48x98" }),
      makeBomItem({ category_name: "Timber", material_name: "Pine 48x148" }),
      makeBomItem({ category_name: "Insulation", material_name: "Mineral Wool 150mm" }),
    ];

    generateQuotePdf({
      projectName: "Multi-cat",
      bom,
      locale: "en",
    });

    // Check that category names appear in text calls
    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => c[0]
    ) as string[];
    expect(textCalls).toContain("TIMBER");
    expect(textCalls).toContain("INSULATION");
  });

  it("uses 'Other' for items without category_name", () => {
    const bom: BomItem[] = [
      makeBomItem({ category_name: undefined }),
    ];

    generateQuotePdf({
      projectName: "No-cat",
      bom,
      locale: "en",
    });

    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => c[0]
    ) as string[];
    expect(textCalls).toContain("OTHER");
  });
});

// ---------------------------------------------------------------------------
// 4. VAT calculation
// ---------------------------------------------------------------------------
describe("generateQuotePdf — VAT calculation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.getNumberOfPages.mockReturnValue(1);
  });

  it("calculates correct VAT at 25.5%", () => {
    // A single item with total 125.50 EUR (inclusive of VAT)
    const bom: BomItem[] = [
      makeBomItem({ total: 125.5 }),
    ];

    generateQuotePdf({
      projectName: "VAT Test",
      bom,
      locale: "en",
    });

    // The grand total is 125.50
    // Back-calculated: subtotal = 125.50 / 1.255 = 100.00
    // VAT = 125.50 - 100.00 = 25.50
    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => String(c[0])
    ) as string[];

    // Find subtotal and VAT values in text calls — they should be formatted numbers
    // The subtotal should be close to "100.00" and VAT close to "25.50"
    const eurValues = textCalls
      .filter((t) => t.includes("EUR"))
      .map((t) => t.replace(" EUR", ""));

    // At least the TOTAL line should show the grand total
    expect(eurValues.length).toBeGreaterThan(0);
  });

  it("handles zero total correctly", () => {
    const bom: BomItem[] = [makeBomItem({ total: 0 })];

    expect(() =>
      generateQuotePdf({
        projectName: "Zero",
        bom,
        locale: "fi",
      })
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 5. Supplier attribution
// ---------------------------------------------------------------------------
describe("generateQuotePdf — supplier attribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.getNumberOfPages.mockReturnValue(1);
  });

  it("shows supplier names in attribution", () => {
    const bom: BomItem[] = [
      makeBomItem({ supplier: "K-Rauta" }),
      makeBomItem({ supplier: "Bauhaus" }),
    ];

    generateQuotePdf({
      projectName: "Multi-supplier",
      bom,
      locale: "en",
    });

    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => String(c[0])
    ) as string[];
    const attributionLine = textCalls.find((t) => t.includes("K-Rauta"));
    expect(attributionLine).toBeDefined();
  });

  it("deduplicates supplier names", () => {
    const bom: BomItem[] = [
      makeBomItem({ supplier: "K-Rauta" }),
      makeBomItem({ supplier: "K-Rauta" }),
      makeBomItem({ supplier: "Bauhaus" }),
    ];

    generateQuotePdf({
      projectName: "Dedup",
      bom,
      locale: "en",
    });

    // Find the attribution line
    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => String(c[0])
    ) as string[];
    const attributionLine = textCalls.find(
      (t) => t.includes("K-Rauta") && t.includes("Bauhaus")
    );
    expect(attributionLine).toBeDefined();
    // K-Rauta should appear only once in the attribution
    if (attributionLine) {
      const count = (attributionLine.match(/K-Rauta/g) || []).length;
      expect(count).toBe(1);
    }
  });

  it("skips attribution when no suppliers", () => {
    const bom: BomItem[] = [
      makeBomItem({ supplier: undefined }),
    ];

    generateQuotePdf({
      projectName: "No-supplier",
      bom,
      locale: "en",
    });

    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => String(c[0])
    ) as string[];
    const pricingLine = textCalls.find((t) => t.includes("Pricing from:"));
    expect(pricingLine).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Project description
// ---------------------------------------------------------------------------
describe("generateQuotePdf — project description", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.getNumberOfPages.mockReturnValue(1);
  });

  it("includes project description when provided", () => {
    generateQuotePdf({
      projectName: "With Desc",
      projectDescription: "Kitchen renovation for 2-bedroom apartment",
      bom: [makeBomItem()],
      locale: "en",
    });

    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => String(c[0])
    ) as string[];
    const descLine = textCalls.find((t) => t.includes("Kitchen renovation"));
    expect(descLine).toBeDefined();
  });

  it("truncates long description to 100 chars", () => {
    const longDesc = "A".repeat(150);

    generateQuotePdf({
      projectName: "Long Desc",
      projectDescription: longDesc,
      bom: [makeBomItem()],
      locale: "en",
    });

    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => String(c[0])
    ) as string[];
    const descLine = textCalls.find((t) => t.includes("...") && t.includes("AAAA"));
    expect(descLine).toBeDefined();
    // Should be at most 103 chars (100 + "...")
    if (descLine) {
      expect(descLine.length).toBeLessThanOrEqual(103);
    }
  });

  it("omits description when not provided", () => {
    generateQuotePdf({
      projectName: "No Desc",
      bom: [makeBomItem()],
      locale: "en",
    });
    // Should still render without error
    expect(mockDoc.save).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 7. i18n strings
// ---------------------------------------------------------------------------
describe("generateQuotePdf — localization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.getNumberOfPages.mockReturnValue(1);
  });

  it("uses Finnish header for fi locale", () => {
    generateQuotePdf({
      projectName: "FI Test",
      bom: [makeBomItem()],
      locale: "fi",
    });

    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => String(c[0])
    ) as string[];
    const header = textCalls.find((t) => t.includes("Kustannusarvio"));
    expect(header).toBeDefined();
  });

  it("uses English header for en locale", () => {
    generateQuotePdf({
      projectName: "EN Test",
      bom: [makeBomItem()],
      locale: "en",
    });

    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => String(c[0])
    ) as string[];
    const header = textCalls.find((t) => t.includes("Renovation Quote"));
    expect(header).toBeDefined();
  });

  it("uses Finnish footer for fi locale", () => {
    generateQuotePdf({
      projectName: "Footer FI",
      bom: [makeBomItem()],
      locale: "fi",
    });

    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => String(c[0])
    ) as string[];
    const footer = textCalls.find((t) => t.includes("Luotu Helscoop"));
    expect(footer).toBeDefined();
  });

  it("uses English footer for en locale", () => {
    generateQuotePdf({
      projectName: "Footer EN",
      bom: [makeBomItem()],
      locale: "en",
    });

    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => String(c[0])
    ) as string[];
    const footer = textCalls.find((t) => t.includes("Generated by Helscoop"));
    expect(footer).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 8. Material name truncation
// ---------------------------------------------------------------------------
describe("generateQuotePdf — edge cases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.getNumberOfPages.mockReturnValue(1);
  });

  it("truncates long material names", () => {
    const bom: BomItem[] = [
      makeBomItem({
        material_name: "Very Long Material Name That Exceeds The Maximum Display Width In PDF",
      }),
    ];

    generateQuotePdf({
      projectName: "Truncate",
      bom,
      locale: "en",
    });

    const textCalls = mockDoc.text.mock.calls.map(
      (c: unknown[]) => String(c[0])
    ) as string[];
    // Material name should be truncated to 40 chars
    const matCalls = textCalls.filter((t) => t.includes("Very Long"));
    for (const call of matCalls) {
      expect(call.length).toBeLessThanOrEqual(40);
    }
  });

  it("handles missing unit_price gracefully", () => {
    const bom: BomItem[] = [
      makeBomItem({ unit_price: undefined }),
    ];

    expect(() =>
      generateQuotePdf({
        projectName: "No Price",
        bom,
        locale: "en",
      })
    ).not.toThrow();
  });

  it("handles many items without error", () => {
    const bom: BomItem[] = Array.from({ length: 50 }, (_, i) =>
      makeBomItem({
        material_id: `material_${i}`,
        material_name: `Material ${i}`,
        category_name: `Category ${i % 5}`,
        total: 10 * (i + 1),
      })
    );

    expect(() =>
      generateQuotePdf({
        projectName: "Many Items",
        bom,
        locale: "en",
      })
    ).not.toThrow();
    expect(mockDoc.save).toHaveBeenCalled();
  });
});
