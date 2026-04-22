import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock jsPDF before importing pdf module
const mockDoc = {
  internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  setFont: vi.fn(),
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  setFillColor: vi.fn(),
  setDrawColor: vi.fn(),
  setLineWidth: vi.fn(),
  rect: vi.fn(),
  text: vi.fn(),
  line: vi.fn(),
  addPage: vi.fn(),
  getNumberOfPages: vi.fn(() => 1),
  setPage: vi.fn(),
  save: vi.fn(),
  addImage: vi.fn(),
};

vi.mock("jspdf", () => ({
  jsPDF: vi.fn(() => mockDoc),
}));

import { generateQuotePdf } from "@/lib/pdf";
import type { BomItem } from "@/types";

const sampleBom: BomItem[] = [
  {
    material_id: "mat-1",
    material_name: "Mineraalivilla 100mm",
    category_name: "Insulation",
    quantity: 20,
    unit: "m2",
    unit_price: 12.50,
    total: 250.0,
    supplier: "K-Rauta",
  },
  {
    material_id: "mat-2",
    material_name: "Kattopelti",
    category_name: "Roofing",
    quantity: 40,
    unit: "m2",
    unit_price: 25.0,
    total: 1000.0,
    supplier: "Stark",
  },
  {
    material_id: "mat-3",
    material_name: "Runko 48x148",
    category_name: "Insulation",
    quantity: 30,
    unit: "jm",
    unit_price: 3.50,
    total: 105.0,
    supplier: "Puuilo",
  },
];

describe("PDF Quote Generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.getNumberOfPages.mockReturnValue(1);
  });

  it("generates PDF without throwing for Finnish locale", () => {
    expect(() =>
      generateQuotePdf({
        projectName: "Saunaremontti",
        projectDescription: "Sauna renovation project",
        bom: sampleBom,
        locale: "fi",
      })
    ).not.toThrow();
  });

  it("generates PDF without throwing for English locale", () => {
    expect(() =>
      generateQuotePdf({
        projectName: "Sauna Renovation",
        bom: sampleBom,
        locale: "en",
      })
    ).not.toThrow();
  });

  it("generates PDF with empty BOM", () => {
    expect(() =>
      generateQuotePdf({
        projectName: "Empty Project",
        bom: [],
        locale: "fi",
      })
    ).not.toThrow();
  });

  it("renders project name in header", () => {
    generateQuotePdf({
      projectName: "Kattoremontti",
      bom: sampleBom,
      locale: "fi",
    });
    const textCalls = mockDoc.text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("Kattoremontti");
  });

  it("renders project description when provided", () => {
    generateQuotePdf({
      projectName: "Test",
      projectDescription: "A detailed description",
      bom: sampleBom,
      locale: "en",
    });
    const textCalls = mockDoc.text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("A detailed description");
  });

  it("truncates long descriptions to 100 chars", () => {
    const longDesc = "A".repeat(150);
    generateQuotePdf({
      projectName: "Test",
      projectDescription: longDesc,
      bom: sampleBom,
      locale: "en",
    });
    const textCalls = mockDoc.text.mock.calls.map((c: unknown[]) => c[0]);
    const truncated = textCalls.find((t: string) => typeof t === "string" && t.endsWith("...") && t.length === 103);
    expect(truncated).toBeTruthy();
  });

  it("groups BOM items by category", () => {
    generateQuotePdf({
      projectName: "Test",
      bom: sampleBom,
      locale: "fi",
    });
    const textCalls = mockDoc.text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("INSULATION");
    expect(textCalls).toContain("ROOFING");
  });

  it("renders VAT breakdown with 25.5% rate", () => {
    generateQuotePdf({
      projectName: "Test",
      bom: sampleBom,
      locale: "fi",
    });
    const textCalls = mockDoc.text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("ALV 25,5 %");
  });

  it("renders English VAT label in en locale", () => {
    generateQuotePdf({
      projectName: "Test",
      bom: sampleBom,
      locale: "en",
    });
    const textCalls = mockDoc.text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("VAT 25.5%");
  });

  it("calculates correct grand total from BOM items", () => {
    const grandTotal = sampleBom.reduce((sum, item) => sum + (item.total || 0), 0);
    expect(grandTotal).toBe(1355.0);

    generateQuotePdf({
      projectName: "Test",
      bom: sampleBom,
      locale: "en",
    });
    const textCalls = mockDoc.text.mock.calls.map((c: unknown[]) => c[0]);
    const totalText = textCalls.find((t: string) => typeof t === "string" && t.includes("1,355") || t.includes("1 355"));
    expect(totalText).toBeTruthy();
  });

  it("renders material names in item rows", () => {
    generateQuotePdf({
      projectName: "Test",
      bom: sampleBom,
      locale: "fi",
    });
    const textCalls = mockDoc.text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("Mineraalivilla 100mm");
    expect(textCalls).toContain("Kattopelti");
    expect(textCalls).toContain("Runko 48x148");
  });

  it("renders supplier names", () => {
    generateQuotePdf({
      projectName: "Test",
      bom: sampleBom,
      locale: "fi",
    });
    const textCalls = mockDoc.text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("K-Rauta");
    expect(textCalls).toContain("Stark");
    expect(textCalls).toContain("Puuilo");
  });

  it("handles BOM items without optional fields", () => {
    const minimalBom: BomItem[] = [
      { material_id: "x", quantity: 1, unit: "kpl" },
    ];
    expect(() =>
      generateQuotePdf({
        projectName: "Minimal",
        bom: minimalBom,
        locale: "fi",
      })
    ).not.toThrow();
  });

  it("calls doc.save with sanitized filename", () => {
    generateQuotePdf({
      projectName: "Katto / Remontti",
      bom: sampleBom,
      locale: "fi",
    });
    expect(mockDoc.save).toHaveBeenCalled();
    const filename = mockDoc.save.mock.calls[0][0] as string;
    expect(filename).toMatch(/\.pdf$/);
    expect(filename).not.toContain("/");
  });

  it("adds page break for large BOM", () => {
    const largeBom: BomItem[] = Array.from({ length: 50 }, (_, i) => ({
      material_id: `mat-${i}`,
      material_name: `Material ${i}`,
      category_name: `Cat ${i % 5}`,
      quantity: 10,
      unit: "kpl",
      unit_price: 5,
      total: 50,
    }));
    generateQuotePdf({
      projectName: "Large project",
      bom: largeBom,
      locale: "fi",
    });
    expect(mockDoc.addPage).toHaveBeenCalled();
  });

  it("renders Finnish header text in fi locale", () => {
    generateQuotePdf({
      projectName: "Test",
      bom: sampleBom,
      locale: "fi",
    });
    const textCalls = mockDoc.text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("Helscoop \u2014 Kustannusarvio");
  });

  it("renders English header text in en locale", () => {
    generateQuotePdf({
      projectName: "Test",
      bom: sampleBom,
      locale: "en",
    });
    const textCalls = mockDoc.text.mock.calls.map((c: unknown[]) => c[0]);
    expect(textCalls).toContain("Helscoop \u2014 Renovation Quote");
  });
});
