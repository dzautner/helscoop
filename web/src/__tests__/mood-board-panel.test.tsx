import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import MoodBoardPanel from "@/components/MoodBoardPanel";
import type { Material, MoodBoardState } from "@/types";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({ locale: "en", t: (key: string) => key }),
}));

const materials = [
  {
    id: "mat-1",
    name: "Warm timber",
    name_fi: null,
    name_en: "Warm timber",
    category_name: "Wood",
    category_name_fi: null,
    image_url: null,
    pricing: [{ unit_price: 12, unit: "m2", supplier_name: "Supplier", is_primary: true }],
    visual_albedo: [0.6, 0.42, 0.24],
  },
] as Material[];

describe("MoodBoardPanel", () => {
  it("adds material, color, and note cards", () => {
    let board: MoodBoardState = { items: [] };
    const handleChange = vi.fn((next: MoodBoardState) => {
      board = next;
      rerenderPanel();
    });
    const addToBom = vi.fn();

    const { rerender } = render(
      <MoodBoardPanel
        board={board}
        materials={materials}
        bomMaterialIds={new Set()}
        onChange={handleChange}
        onAddMaterialToBom={addToBom}
      />,
    );

    function rerenderPanel() {
      rerender(
        <MoodBoardPanel
          board={board}
          materials={materials}
          bomMaterialIds={new Set()}
          onChange={handleChange}
          onAddMaterialToBom={addToBom}
        />,
      );
    }

    fireEvent.click(screen.getByRole("button", { name: "+ Material" }));
    expect(screen.getAllByText("Warm timber").length).toBeGreaterThan(1);
    expect(screen.getAllByText("12 EUR").length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole("button", { name: "+ Color" }));
    expect(board.items.some((item) => item.type === "color")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "+ Note" }));
    expect(screen.getByPlaceholderText("Write style, concern, or decision...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add to BOM" }));
    expect(addToBom).toHaveBeenCalledWith("mat-1");
  });
});
