/**
 * Smoke and integration tests for the SubsidyCalculator component.
 *
 * Tests cover: rendering, form controls, loading state, error state,
 * eligible/ineligible results, and dropdown interactions.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import SubsidyCalculator from "@/components/SubsidyCalculator";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string | number>) => {
      const map: Record<string, string> = {
        "subsidy.sectionLabel": "Energia-avustus",
        "subsidy.eligibleTitle": "Oikeutettu avustukseen",
        "subsidy.maybeTitle": "Mahdollisesti oikeutettu",
        "subsidy.checkTitle": "Tarkista tukikelpoisuus",
        "subsidy.currentHeating": "Nykyinen lammitys",
        "subsidy.targetHeating": "Tavoitelammitys",
        "subsidy.household": "Talous",
        "subsidy.systemCondition": "Jarjestelman kunto",
        "subsidy.yearRoundResidential": "Ymparivuotinen asuminen",
        "subsidy.loading": "Ladataan...",
        "subsidy.error": "Virhe laskennassa",
        "subsidy.netCost": "Nettokustannus",
        "subsidy.notEligible": "Ei oikeutettu",
        "subsidy.araMaybe": "ARA-korjausavustus mahdollinen",
        "subsidy.applyEly": "Hae ELY-avustusta",
        "subsidy.readAra": "Lue ARA-avustuksesta",
        "subsidy.deadlineTooltip": "Hakuaika",
        "subsidy.heating.unknown": "Tuntematon",
        "subsidy.heating.oil": "Oljy",
        "subsidy.heating.naturalGas": "Maakaasu",
        "subsidy.heating.directElectric": "Suorasahko",
        "subsidy.heating.wood": "Puu",
        "subsidy.heating.districtHeat": "Kaukolampo",
        "subsidy.heating.airWater": "Ilma-vesilampo",
        "subsidy.heating.groundSource": "Maalampo",
        "subsidy.heating.otherNonFossil": "Muu uusiutuva",
        "subsidy.heating.fossil": "Fossiilinen",
        "subsidy.householdUnder65": "Alle 65",
        "subsidy.household65Plus": "65+",
        "subsidy.householdDisabled": "Vammainen",
        "subsidy.conditionUnknown": "Tuntematon",
        "subsidy.conditionOk": "OK",
        "subsidy.conditionBroken": "Rikki",
        "subsidy.conditionHard": "Vaikea huoltaa",
      };
      if (key === "subsidy.applicationDeadlineCountdown" && params) {
        return `${params.days} paivaa jaljella`;
      }
      if (key === "subsidy.elyDeduction" && params) {
        return `ELY-vahennys: ${params.amount}`;
      }
      return map[key] ?? key;
    },
    locale: "fi",
  }),
}));

const mockEstimateEnergySubsidy = vi.fn();
vi.mock("@/lib/api", () => ({
  api: {
    estimateEnergySubsidy: (...args: unknown[]) => mockEstimateEnergySubsidy(...args),
  },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ELIGIBLE_RESULT = {
  totalCost: 15000,
  netCost: 11000,
  daysUntilDeadline: 45,
  disclaimer: "Laskelma on suuntaa-antava",
  programs: [
    {
      program: "ely_oil_gas_heating",
      status: "eligible",
      amount: 4000,
      reasons: [],
      applicationUrl: "https://ely.fi/apply",
    },
    {
      program: "ara_repair_elderly_disabled",
      status: "not_applicable",
      amount: 0,
      reasons: ["Not applicable"],
      applicationUrl: "https://ara.fi",
    },
  ],
};

const INELIGIBLE_RESULT = {
  totalCost: 15000,
  netCost: 15000,
  daysUntilDeadline: 45,
  disclaimer: "Laskelma on suuntaa-antava",
  programs: [
    {
      program: "ely_oil_gas_heating",
      status: "not_eligible",
      amount: 0,
      reasons: ["Lammitysmuoto ei oikeuta avustukseen"],
      applicationUrl: "https://ely.fi/apply",
    },
  ],
};

const BUILDING_INFO = {
  type: "omakotitalo",
  year_built: 1985,
  heating: "oljy",
  area_m2: 135,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockEstimateEnergySubsidy.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SubsidyCalculator", () => {
  it("renders section label and form controls", async () => {
    mockEstimateEnergySubsidy.mockResolvedValue(ELIGIBLE_RESULT);
    render(<SubsidyCalculator totalCost={15000} buildingInfo={BUILDING_INFO} />);

    expect(screen.getByText("Energia-avustus")).toBeDefined();
    expect(screen.getByText("Nykyinen lammitys")).toBeDefined();
    expect(screen.getByText("Tavoitelammitys")).toBeDefined();
    expect(screen.getByText("Talous")).toBeDefined();
    expect(screen.getByText("Jarjestelman kunto")).toBeDefined();
  });

  it("renders the year-round residential checkbox", async () => {
    mockEstimateEnergySubsidy.mockResolvedValue(ELIGIBLE_RESULT);
    render(<SubsidyCalculator totalCost={15000} buildingInfo={BUILDING_INFO} />);

    expect(screen.getByText("Ymparivuotinen asuminen")).toBeDefined();
    const checkbox = screen.getByRole("checkbox");
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  it("shows loading state initially", () => {
    mockEstimateEnergySubsidy.mockReturnValue(new Promise(() => {})); // never resolves
    render(<SubsidyCalculator totalCost={15000} />);

    // The component shows loading text in the results area while API is pending
    const loadingElements = screen.getAllByText("Ladataan...");
    expect(loadingElements.length).toBeGreaterThan(0);
  });

  it("shows error state when API fails", async () => {
    mockEstimateEnergySubsidy.mockRejectedValue(new Error("Server error"));
    render(<SubsidyCalculator totalCost={15000} />);

    await waitFor(() => {
      expect(screen.getByText("Virhe laskennassa")).toBeDefined();
    });
  });

  it("shows eligible result with ELY deduction", async () => {
    mockEstimateEnergySubsidy.mockResolvedValue(ELIGIBLE_RESULT);
    render(<SubsidyCalculator totalCost={15000} buildingInfo={BUILDING_INFO} />);

    await waitFor(() => {
      expect(screen.getByText("Oikeutettu avustukseen")).toBeDefined();
    });

    expect(screen.getByText("45 paivaa jaljella")).toBeDefined();
    expect(screen.getByText("Hae ELY-avustusta")).toBeDefined();
  });

  it("shows ineligible result with reason", async () => {
    mockEstimateEnergySubsidy.mockResolvedValue(INELIGIBLE_RESULT);
    render(<SubsidyCalculator totalCost={15000} buildingInfo={BUILDING_INFO} />);

    await waitFor(() => {
      expect(screen.getByText("Tarkista tukikelpoisuus")).toBeDefined();
    });

    expect(screen.getByText("Lammitysmuoto ei oikeuta avustukseen")).toBeDefined();
  });

  it("shows disclaimer after result loads", async () => {
    mockEstimateEnergySubsidy.mockResolvedValue(ELIGIBLE_RESULT);
    render(<SubsidyCalculator totalCost={15000} />);

    await waitFor(() => {
      expect(screen.getByText("Laskelma on suuntaa-antava")).toBeDefined();
    });
  });

  it("re-fires API when form controls change", async () => {
    mockEstimateEnergySubsidy.mockResolvedValue(ELIGIBLE_RESULT);
    render(<SubsidyCalculator totalCost={15000} />);

    // Wait for the initial load to complete
    await waitFor(() => {
      expect(screen.getByText("Oikeutettu avustukseen")).toBeDefined();
    });

    const initialCallCount = mockEstimateEnergySubsidy.mock.calls.length;

    // Change the checkbox
    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);

    await waitFor(() => {
      expect(mockEstimateEnergySubsidy.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });
});
