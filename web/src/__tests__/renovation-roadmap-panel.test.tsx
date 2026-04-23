import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import RenovationRoadmapPanel from "@/components/RenovationRoadmapPanel";
import type { BomItem, Material } from "@/types";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    t: (key: string) => key,
  }),
}));

const materials: Material[] = [
  {
    id: "concrete",
    name: "Ready-mix concrete",
    name_fi: "Valmisbetoni",
    name_en: "Ready-mix concrete",
    category_name: "foundation",
    category_name_fi: "Perustus",
    image_url: null,
    pricing: [{ unit_price: 100, unit: "m3", supplier_name: "Stark", is_primary: true }],
    tags: ["foundation"],
  },
  {
    id: "roof",
    name: "Roof membrane",
    name_fi: "Kattokalvo",
    name_en: "Roof membrane",
    category_name: "roofing",
    category_name_fi: "Katto",
    image_url: null,
    pricing: [{ unit_price: 10, unit: "m2", supplier_name: "K-Rauta", is_primary: true }],
    tags: ["roof"],
  },
];

const bom: BomItem[] = [
  { material_id: "concrete", quantity: 2, unit: "m3" },
  { material_id: "roof", quantity: 25, unit: "m2" },
];

describe("RenovationRoadmapPanel", () => {
  it("renders a roadmap timeline and checklist", () => {
    render(<RenovationRoadmapPanel bom={bom} materials={materials} projectName="Roof extension" />);

    expect(screen.getByTestId("renovation-roadmap-panel")).toBeInTheDocument();
    expect(screen.getByText("Renovation roadmap")).toBeInTheDocument();
    expect(screen.getAllByText("Groundwork and foundation").length).toBeGreaterThan(0);
    expect(screen.getByText("Permit and inspection checklist")).toBeInTheDocument();
  });

  it("copies contractor handoff text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<RenovationRoadmapPanel bom={bom} materials={materials} projectName="Roof extension" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy for contractor" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0]).toContain("renovation execution roadmap");
  });
});
