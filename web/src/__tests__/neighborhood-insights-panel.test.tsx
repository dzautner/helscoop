import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import NeighborhoodInsightsPanel, { extractPostalCode } from "@/components/NeighborhoodInsightsPanel";
import { api } from "@/lib/api";
import type { ReactNode } from "react";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    t: (key: string) => key,
  }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/api", () => ({
  api: {
    getNeighborhoodInsights: vi.fn(),
  },
}));

const mockGetNeighborhoodInsights = vi.mocked(api.getNeighborhoodInsights);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NeighborhoodInsightsPanel", () => {
  it("extracts postal code from address or explicit building fields", () => {
    expect(extractPostalCode({ address: "Ribbingintie 109, 00330 Helsinki" })).toBe("00330");
    expect(extractPostalCode({ postalCode: "02100" })).toBe("02100");
    expect(extractPostalCode({ address: "No postal here" })).toBeNull();
  });

  it("loads neighborhood insight cards for the project postal code", async () => {
    mockGetNeighborhoodInsights.mockResolvedValueOnce({
      postal_code_area: "00330",
      project_type: "omakotitalo",
      project_count: 4,
      projects_this_year: 2,
      average_cost: 8400,
      renovation_types: [{ type: "roof", count: 3 }],
      popular_materials: [{ name: "Peltikatto", project_count: 3, share_pct: 75 }],
      similar_projects: [{
        id: "gallery-1",
        name: "Similar roof plan",
        is_public: true,
        created_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-04-01T00:00:00Z",
        estimated_cost: 8400,
        material_highlights: [],
        view_count: 4,
        heart_count: 1,
        clone_count: 0,
        postal_code_area: "00330",
      }],
    });

    render(
      <NeighborhoodInsightsPanel
        projectId="proj-1"
        buildingInfo={{ address: "Ribbingintie 109, 00330 Helsinki" }}
        projectType="omakotitalo"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => expect(mockGetNeighborhoodInsights).toHaveBeenCalledWith({
      postal_code: "00330",
      project_type: "omakotitalo",
      exclude_project_id: "proj-1",
      limit: 3,
    }));
    expect(screen.getByText("00330")).toBeInTheDocument();
    expect(screen.getByText("Peltikatto")).toBeInTheDocument();
    expect(screen.getByText("Similar roof plan")).toBeInTheDocument();
  });
});
