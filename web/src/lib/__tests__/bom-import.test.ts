import { describe, expect, it, vi } from "vitest";
import {
  buildImportedBomItem,
  matchImportedBomRows,
  parseBomImportFile,
  parseBomImportText,
  parseDelimitedRows,
} from "@/lib/bom-import";
import type { Material } from "@/types";

vi.mock("read-excel-file/browser", () => ({
  default: vi.fn(async () => [{
    sheet: "Sheet1",
    data: [
      ["Material", "Qty", "Unit"],
      ["pine_48x98_c24", 2, "jm"],
    ],
  }]),
}));

const materials: Material[] = [
  {
    id: "pine_48x98_c24",
    name: "Pine 48x98 C24",
    name_fi: "Mänty 48x98 C24",
    name_en: "Pine 48x98 C24",
    category_name: "Lumber",
    category_name_fi: "Sahatavara",
    image_url: null,
    pricing: [{
      supplier_name: "K-Rauta",
      unit_price: 3.5,
      unit: "jm",
      is_primary: true,
    }],
  },
  {
    id: "rockwool_66",
    name: "Rockwool 66mm",
    name_fi: "Kivivilla 66mm",
    name_en: "Rockwool 66mm",
    category_name: "Insulation",
    category_name_fi: "Eristys",
    image_url: null,
    pricing: null,
  },
];

describe("bom import parsing", () => {
  it("parses Finnish semicolon CSV with comma decimals", () => {
    const rows = parseBomImportText("Materiaali;Määrä;Yksikkö\nMänty 48x98 C24;12,5;jm\n");
    expect(rows).toEqual([
      expect.objectContaining({
        materialKey: "Mänty 48x98 C24",
        quantity: 12.5,
        unit: "jm",
      }),
    ]);
  });

  it("parses tabular clipboard data", () => {
    const rows = parseBomImportText("Material\tQty\tUnit\nrockwool_66\t4\tpack\n");
    expect(rows[0]).toMatchObject({ materialKey: "rockwool_66", quantity: 4, unit: "pack" });
  });

  it("handles quoted CSV fields", () => {
    const rows = parseDelimitedRows('Material,Qty,Unit\n"Pine, 48x98 C24",2,jm\n');
    expect(rows[1][0]).toBe("Pine, 48x98 C24");
  });

  it("parses JSON export rows", () => {
    const rows = parseBomImportText(JSON.stringify([{ material_id: "pine_48x98_c24", quantity: 3, unit: "jm" }]));
    expect(rows[0]).toMatchObject({ materialKey: "pine_48x98_c24", quantity: 3 });
  });

  it("parses xlsx files through the browser parser", async () => {
    const rows = await parseBomImportFile(new File(["stub"], "materials.xlsx"));
    expect(rows[0]).toMatchObject({ materialKey: "pine_48x98_c24", quantity: 2, unit: "jm" });
  });
});

describe("bom import matching", () => {
  it("matches by localized material name", () => {
    const [preview] = matchImportedBomRows(
      [{ rowNumber: 2, materialKey: "Mänty 48x98 C24", quantity: 2, unit: "jm", raw: {} }],
      materials,
    );
    expect(preview.matchedMaterialId).toBe("pine_48x98_c24");
    expect(preview.confidence).toBeGreaterThanOrEqual(90);
  });

  it("builds BOM items with primary pricing", () => {
    const item = buildImportedBomItem(
      { rowNumber: 2, materialKey: "pine", quantity: 10, unit: "jm", raw: {} },
      materials[0],
    );
    expect(item.total).toBe(35);
    expect(item.supplier).toBe("K-Rauta");
  });
});
