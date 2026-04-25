import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockEstimateEnergySubsidy = vi.fn();

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string, vars?: Record<string, unknown>) => {
      if (vars) return `${key}:${JSON.stringify(vars)}`;
      return key;
    },
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    estimateEnergySubsidy: (...args: unknown[]) => mockEstimateEnergySubsidy(...args),
  },
}));

import SubsidyCalculator from "@/components/SubsidyCalculator";
import type { EnergySubsidyResponse } from "@/types";

const mockElyProgram = {
  program: "ely_oil_gas_heating" as const,
  name: "ELY Centre Oil/Gas",
  status: "eligible" as const,
  amount: 4000,
  netCost: 6000,
  reasons: [],
  warnings: [],
  applicationDeadline: "2026-06-30",
  applicationDeadlineAt: "2026-06-30T23:59:59Z",
  completionDeadline: "2027-06-30",
  paymentDeadline: "2027-09-30",
  applicationUrl: "https://ely.fi/apply",
  sourceUrl: "https://ely.fi",
};

const mockResult: EnergySubsidyResponse = {
  totalCost: 10000,
  bestAmount: 4000,
  netCost: 6000,
  applicationDeadline: "2026-06-30",
  applicationDeadlineAt: "2026-06-30T23:59:59Z",
  daysUntilApplicationDeadline: 69,
  completionDeadline: "2027-06-30",
  daysUntilCompletionDeadline: 434,
  deadline: "2026-06-30",
  daysUntilDeadline: 69,
  generatedAt: "2026-04-22T10:00:00Z",
  programs: [mockElyProgram],
  disclaimer: "Estimates only, contact ELY for details.",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEstimateEnergySubsidy.mockResolvedValue(mockResult);
});

describe("SubsidyCalculator", () => {
  it("renders section label", async () => {
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      expect(screen.getByText("subsidy.sectionLabel")).toBeInTheDocument();
    });
  });

  it("renders scene-triggered label when triggered by scene", async () => {
    render(<SubsidyCalculator totalCost={10000} triggeredByScene={true} />);
    await waitFor(() => {
      expect(screen.getByText("subsidy.opportunityLabel")).toBeInTheDocument();
    });
  });

  it("renders eligible title when eligible", async () => {
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      expect(screen.getByText("subsidy.eligibleTitle")).toBeInTheDocument();
    });
  });

  it("renders deadline countdown badge", async () => {
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      expect(screen.getByText(/subsidy\.applicationDeadlineCountdown/)).toBeInTheDocument();
    });
  });

  it("renders form selects", async () => {
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      expect(screen.getByText("subsidy.currentHeating")).toBeInTheDocument();
      expect(screen.getByText("subsidy.targetHeating")).toBeInTheDocument();
      expect(screen.getByText("subsidy.household")).toBeInTheDocument();
      expect(screen.getByText("subsidy.systemCondition")).toBeInTheDocument();
    });
  });

  it("renders year-round residential checkbox", async () => {
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      expect(screen.getByText("subsidy.yearRoundResidential")).toBeInTheDocument();
    });
  });

  it("renders net cost when eligible", async () => {
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      expect(screen.getByText("subsidy.netCost")).toBeInTheDocument();
    });
  });

  it("renders ELY deduction when eligible", async () => {
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      expect(screen.getByText(/subsidy\.elyDeduction/)).toBeInTheDocument();
    });
  });

  it("renders mutual exclusion note", async () => {
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      expect(screen.getByText("subsidy.mutualExclusion")).toBeInTheDocument();
    });
  });

  it("renders apply ELY link", async () => {
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      const link = screen.getByText("subsidy.applyEly");
      expect(link.closest("a")).toHaveAttribute("href", "https://ely.fi/apply");
    });
  });

  it("renders disclaimer", async () => {
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      expect(screen.getByText("Estimates only, contact ELY for details.")).toBeInTheDocument();
    });
  });

  it("shows not eligible message when status is not eligible", async () => {
    mockEstimateEnergySubsidy.mockResolvedValue({
      ...mockResult,
      programs: [{ ...mockElyProgram, status: "not_eligible", reasons: ["Oil heating required"] }],
    });
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      expect(screen.getByText("Oil heating required")).toBeInTheDocument();
    });
  });

  it("shows error on API failure", async () => {
    mockEstimateEnergySubsidy.mockRejectedValue(new Error("fail"));
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      expect(screen.getByText("subsidy.error")).toBeInTheDocument();
    });
  });

  it("calls API with totalCost", async () => {
    render(<SubsidyCalculator totalCost={10000} />);
    await waitFor(() => {
      expect(mockEstimateEnergySubsidy).toHaveBeenCalledWith(
        expect.objectContaining({ totalCost: 10000 }),
      );
    });
  });
});
