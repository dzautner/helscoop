import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import KrautaProPartnerPanel from "@/components/KrautaProPartnerPanel";
import { api } from "@/lib/api";
import type { BomItem, Material } from "@/types";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    recordAffiliateClick: vi.fn().mockResolvedValue({ id: "click-1" }),
  },
}));

const materials: Material[] = [
  {
    id: "osb_18mm",
    name: "OSB 18mm",
    name_fi: "OSB 18mm",
    name_en: "OSB 18mm",
    category_name: "interior",
    category_name_fi: "sisatyot",
    image_url: null,
    pricing: [{ unit_price: 32, unit: "sheet", supplier_name: "K-Rauta", link: "https://www.k-rauta.fi/tuote/osb", is_primary: true }],
  },
];

const bom: BomItem[] = [
  { material_id: "osb_18mm", material_name: "OSB 18mm", quantity: 10, unit: "sheet" },
];

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("KrautaProPartnerPanel", () => {
  it("renders PRO package metrics and order lines", () => {
    render(<KrautaProPartnerPanel bom={bom} materials={materials} projectName="Sauna" />);

    expect(screen.getByRole("heading", { name: "K-Rauta PRO contractor package" })).toBeInTheDocument();
    expect(screen.getByText("PRO order estimate")).toBeInTheDocument();
    expect(screen.getByText("Referral potential")).toBeInTheDocument();
    expect(screen.getAllByText("OSB 18mm").length).toBeGreaterThan(0);
  });

  it("copies the contractor package", async () => {
    render(<KrautaProPartnerPanel bom={bom} materials={materials} projectName="Sauna" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy PRO package" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("Helscoop K-Rauta PRO order package"));
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });

  it("records an affiliate click when opening K-Rauta PRO", async () => {
    render(<KrautaProPartnerPanel bom={bom} materials={materials} projectName="Sauna" />);

    fireEvent.click(screen.getByRole("link", { name: "Open K-Rauta PRO" }));

    await waitFor(() => {
      expect(api.recordAffiliateClick).toHaveBeenCalledWith(expect.objectContaining({
        material_id: "osb_18mm",
        supplier_id: "k-rauta",
      }));
    });
    expect(screen.getByText("Click recorded in affiliate ledger.")).toBeInTheDocument();
  });

  it("renders an empty state when no K-Rauta lines are present", () => {
    render(
      <KrautaProPartnerPanel
        bom={[{ material_id: "other", material_name: "Other", quantity: 1, unit: "pcs" }]}
        materials={[]}
      />,
    );

    expect(screen.getByText("No K-Rauta BOM lines yet.")).toBeInTheDocument();
  });
});
