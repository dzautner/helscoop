import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import RenovationCostIndexPanel from "@/components/RenovationCostIndexPanel";
import type { RenovationCostIndexResponse } from "@/types";

const mocks = vi.hoisted(() => ({
  getRenovationCostIndex: vi.fn(),
}));

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "fi",
    setLocale: vi.fn(),
    t: (key: string, params?: Record<string, string | number>) => {
      if (key === "renovationCostIndex.summary") return `summary ${params?.multiplier} ${params?.vat}`;
      if (key === "renovationCostIndex.updated") return `updated ${params?.period}`;
      return key;
    },
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getRenovationCostIndex: mocks.getRenovationCostIndex,
  },
}));

const response: RenovationCostIndexResponse = {
  generatedAt: "2026-04-23T08:00:00.000Z",
  source: {
    name: "Tilastokeskus",
    statistic: "Rakennuskustannusindeksi",
    attribution: "Lähde: Tilastokeskus, Rakennuskustannusindeksi",
    tableId: "statfin_rki_pxt_118p",
    apiUrl: "https://pxdata.stat.fi/PxWeb/api/v1/en/StatFin/rki/statfin_rki_pxt_118p.px",
    url: "https://pxdata.stat.fi/PxWeb/pxweb/en/StatFin/StatFin__rki/statfin_rki_pxt_118p.px/",
    status: "live",
    latestPeriod: "2026M03",
    updatedAt: "2026-04-15T05:00:00Z",
  },
  cache: {
    hit: false,
    ttlHours: 24,
    expiresAt: "2026-04-24T08:00:00.000Z",
  },
  vatRate: 0.255,
  baseYear: "2021=100",
  index: {
    period: "2026M03",
    updatedAt: "2026-04-15T05:00:00Z",
    baseYear: "2021=100",
    values: {
      total: 112.7,
      labour: 113.5,
      materials: 113.8,
      services: 103,
    },
    multipliers: {
      total: 1.127,
      labour: 1.135,
      materials: 1.138,
      services: 1.03,
    },
  },
  categories: [
    {
      id: "facade_cladding",
      labelFi: "Julkisivulaudoituksen uusinta",
      labelEn: "Facade cladding renewal",
      unit: "m2",
      baseCostExVat: 155,
      materialShare: 0.48,
      labourShare: 0.45,
      serviceShare: 0.07,
      notes: "Planning baseline",
      statfinMultiplier: 1.13,
      currentCostExVat: 175.15,
      currentCostInclVat: 219.81,
    },
  ],
};

describe("RenovationCostIndexPanel", () => {
  beforeEach(() => {
    mocks.getRenovationCostIndex.mockReset();
  });

  it("shows Statistics Finland attribution and indexed category costs", async () => {
    mocks.getRenovationCostIndex.mockResolvedValue(response);

    render(<RenovationCostIndexPanel />);

    expect(screen.getByText("renovationCostIndex.loading")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Julkisivulaudoituksen uusinta")).toBeInTheDocument();
    });

    expect(screen.getByText(/Lähde: Tilastokeskus, Rakennuskustannusindeksi/)).toBeInTheDocument();
    expect(screen.getByText("summary 1.127 25.5")).toBeInTheDocument();
    expect(screen.getByText(/220 €/)).toBeInTheDocument();
  });
});
