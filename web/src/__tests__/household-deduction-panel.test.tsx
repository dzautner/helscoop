import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockCalculateHouseholdDeduction = vi.fn();
const mockBuildRows = vi.fn();
const mockCalculateQuote = vi.fn();

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

vi.mock("@/lib/quote-engine", () => ({
  calculateQuote: (...args: unknown[]) => mockCalculateQuote(...args),
  defaultQuoteConfig: () => ({ type: "homeowner" }),
}));

vi.mock("@/lib/household-deduction", () => ({
  HOUSEHOLD_DEDUCTION_2026: {
    companyWorkRate: 0.35,
    annualThresholdPerClaimant: 150,
    maxCreditPerClaimant: 1600,
    sourceUrl: "https://www.vero.fi/en/individuals/deductions/Tax-credit-for-household-expenses/calculator-for-tax-credit-for-household-expenses/",
  },
  buildHouseholdDeductionRows: (...args: unknown[]) => mockBuildRows(...args),
  calculateHouseholdDeduction: (...args: unknown[]) => mockCalculateHouseholdDeduction(...args),
}));

import HouseholdDeductionPanel from "@/components/HouseholdDeductionPanel";
import type { BomItem, Material } from "@/types";

const mockBom: BomItem[] = [
  { material_id: "m1", quantity: 10, unit: "kpl" },
];

const mockMaterials: Material[] = [
  {
    id: "m1",
    name: "Board",
    name_fi: "Lauta",
    name_en: "Board",
    category_name: "wood",
    category_name_fi: "puu",
    image_url: null,
    pricing: [{ unit_price: 5, unit: "kpl", supplier_name: "K-Rauta", is_primary: true }],
  },
];

const mockDeduction = {
  grossCost: 5000,
  labourCost: 1750,
  rawCredit: 612.5,
  threshold: 150,
  maxCredit: 1600,
  credit: 462.5,
  netCost: 4537.5,
  claimantCount: 1 as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCalculateQuote.mockReturnValue({ totalLabour: 1750 });
  mockBuildRows.mockReturnValue([]);
  mockCalculateHouseholdDeduction.mockReturnValue(mockDeduction);
});

describe("HouseholdDeductionPanel", () => {
  it("returns null for empty bom", () => {
    const { container } = render(
      <HouseholdDeductionPanel bom={[]} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders section with aria-label", () => {
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("householdDeduction.title")).toBeInTheDocument();
  });

  it("renders eyebrow text", () => {
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    expect(screen.getByText("householdDeduction.eyebrow")).toBeInTheDocument();
  });

  it("renders title", () => {
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    expect(screen.getByText("householdDeduction.title")).toBeInTheDocument();
  });

  it("renders couple mode checkbox", () => {
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    expect(screen.getByRole("checkbox")).toBeInTheDocument();
    expect(screen.getByText("householdDeduction.coupleMode")).toBeInTheDocument();
  });

  it("fires onCoupleModeChange when toggled", () => {
    const onChange = vi.fn();
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders labour basis amount", () => {
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    expect(screen.getByText("householdDeduction.labourBasis")).toBeInTheDocument();
    expect(screen.getByText(/1,750/)).toBeInTheDocument();
  });

  it("renders credit line with rate", () => {
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    expect(screen.getByText(/householdDeduction\.credit/)).toBeInTheDocument();
  });

  it("renders net cost line", () => {
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    expect(screen.getByText("householdDeduction.netCost")).toBeInTheDocument();
  });

  it("renders register warning", () => {
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    expect(screen.getByText("householdDeduction.registerWarning")).toBeInTheDocument();
  });

  it("renders vero link", () => {
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    const link = screen.getByText("householdDeduction.veroLink");
    expect(link.closest("a")).toHaveAttribute("href", expect.stringContaining("vero.fi"));
  });

  it("renders pro CTA button", () => {
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    expect(screen.getByText("householdDeduction.proCta")).toBeInTheDocument();
  });

  it("shows cap note when credit > 0", () => {
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    expect(screen.getByText(/householdDeduction\.capNote/)).toBeInTheDocument();
  });

  it("shows threshold note when credit is 0", () => {
    mockCalculateHouseholdDeduction.mockReturnValue({ ...mockDeduction, credit: 0 });
    render(
      <HouseholdDeductionPanel bom={mockBom} materials={mockMaterials} coupleMode={false} onCoupleModeChange={vi.fn()} />,
    );
    expect(screen.getByText(/householdDeduction\.thresholdNote/)).toBeInTheDocument();
  });
});
