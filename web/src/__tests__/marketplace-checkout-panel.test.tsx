import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import MarketplaceCheckoutPanel from "@/components/MarketplaceCheckoutPanel";
import { api } from "@/lib/api";
import type { BomItem, MarketplaceOrder, Material } from "@/types";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getMarketplaceOrders: vi.fn().mockResolvedValue([]),
    createMarketplaceCheckout: vi.fn().mockResolvedValue({ orders: [] }),
    openMarketplaceOrder: vi.fn().mockResolvedValue({ checkout_url: null, click_count: 0, order: null }),
    updateMarketplaceOrder: vi.fn(),
  },
}));

const materials: Material[] = [
  {
    id: "osb_18mm",
    name: "OSB 18mm",
    name_fi: "OSB 18mm",
    name_en: "OSB 18mm",
    category_name: "Interior",
    category_name_fi: "Sisä",
    image_url: null,
    pricing: [
      {
        supplier_id: "k-rauta",
        supplier_name: "K-Rauta",
        unit_price: 32,
        unit: "sheet",
        link: "https://www.k-rauta.fi/tuote/osb",
        is_primary: true,
      },
    ],
  },
  {
    id: "insulation_100mm",
    name: "Insulation 100mm",
    name_fi: "Eristys 100mm",
    name_en: "Insulation 100mm",
    category_name: "Insulation",
    category_name_fi: "Eristys",
    image_url: null,
    pricing: [
      {
        supplier_id: "stark",
        supplier_name: "STARK",
        unit_price: 8,
        unit: "m2",
        link: "https://www.stark-suomi.fi/eriste",
        is_primary: true,
      },
    ],
  },
];

const bom: BomItem[] = [
  {
    material_id: "osb_18mm",
    material_name: "OSB 18mm",
    quantity: 6,
    unit: "sheet",
    unit_price: 32,
    total: 192,
    supplier: "K-Rauta",
    link: "https://www.k-rauta.fi/tuote/osb",
  },
  {
    material_id: "insulation_100mm",
    material_name: "Insulation 100mm",
    quantity: 20,
    unit: "m2",
    unit_price: 8,
    total: 160,
    supplier: "STARK",
    link: "https://www.stark-suomi.fi/eriste",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("open", vi.fn());
});

describe("MarketplaceCheckoutPanel", () => {
  it("groups BOM lines into retailer baskets and creates marketplace orders", async () => {
    vi.mocked(api.createMarketplaceCheckout).mockResolvedValueOnce({
      orders: [
        {
          id: "order-1",
          project_id: "proj-1",
          user_id: "user-1",
          supplier_id: "k-rauta",
          supplier_name: "K-Rauta",
          partner_id: null,
          partner_name: null,
          status: "draft",
          currency: "EUR",
          subtotal: 192,
          estimated_commission_rate: 0.15,
          estimated_commission_amount: 28.8,
          checkout_url: "https://www.k-rauta.fi/tuote/osb",
          external_order_ref: null,
          created_at: "2026-04-24T10:00:00.000Z",
          updated_at: "2026-04-24T10:00:00.000Z",
          lines: [],
        },
      ],
    });

    render(<MarketplaceCheckoutPanel projectId="proj-1" bom={bom} materials={materials} />);

    await waitFor(() => {
      expect(api.getMarketplaceOrders).toHaveBeenCalledWith("proj-1");
    });

    expect(screen.getByRole("heading", { name: "Retailer baskets from the BOM" })).toBeInTheDocument();
    expect(screen.getByText("K-Rauta")).toBeInTheDocument();
    expect(screen.getByText("STARK")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Create checkout baskets" }));

    await waitFor(() => {
      expect(api.createMarketplaceCheckout).toHaveBeenCalledWith(
        "proj-1",
        expect.objectContaining({
          supplier_carts: expect.arrayContaining([
            expect.objectContaining({ supplier_name: "K-Rauta" }),
            expect.objectContaining({ supplier_name: "STARK" }),
          ]),
        }),
      );
    });

    expect(screen.getAllByText("K-Rauta").length).toBeGreaterThan(0);
  });

  it("opens a retailer basket and updates order status", async () => {
    const existingOrder: MarketplaceOrder = {
      id: "order-2",
      project_id: "proj-1",
      user_id: "user-1",
      supplier_id: "k-rauta",
      supplier_name: "K-Rauta",
      partner_id: null,
      partner_name: null,
      status: "draft",
      currency: "EUR",
      subtotal: 192,
      estimated_commission_rate: 0.15,
      estimated_commission_amount: 28.8,
      checkout_url: "https://www.k-rauta.fi/tuote/osb",
      external_order_ref: null,
      created_at: "2026-04-24T10:00:00.000Z",
      updated_at: "2026-04-24T10:00:00.000Z",
      lines: [],
    };
    vi.mocked(api.getMarketplaceOrders).mockResolvedValueOnce([existingOrder]);
    vi.mocked(api.openMarketplaceOrder).mockResolvedValueOnce({
      checkout_url: "https://www.k-rauta.fi/tuote/osb",
      click_count: 1,
      order: { ...existingOrder, status: "opened", updated_at: "2026-04-24T10:02:00.000Z" },
    });
    vi.mocked(api.updateMarketplaceOrder).mockResolvedValueOnce({
      ...existingOrder,
      status: "ordered",
      updated_at: "2026-04-24T10:03:00.000Z",
    });

    render(<MarketplaceCheckoutPanel projectId="proj-1" bom={bom} materials={materials} />);

    await waitFor(() => {
      expect(screen.getByText("Saved checkout baskets")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open retailer" }));

    await waitFor(() => {
      expect(api.openMarketplaceOrder).toHaveBeenCalledWith("order-2");
      expect(window.open).toHaveBeenCalledWith("https://www.k-rauta.fi/tuote/osb", "_blank", "noopener,noreferrer");
    });

    fireEvent.click(screen.getByRole("button", { name: "Mark ordered" }));

    await waitFor(() => {
      expect(api.updateMarketplaceOrder).toHaveBeenCalledWith("order-2", { status: "ordered" });
    });
    expect(screen.getByText(/Ordered/)).toBeInTheDocument();
  });
});
