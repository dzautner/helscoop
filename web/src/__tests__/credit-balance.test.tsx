import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

Element.prototype.scrollIntoView = vi.fn();

const mockGetEntitlements = vi.fn();
const mockCreateCreditCheckout = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    getEntitlements: (...args: unknown[]) => mockGetEntitlements(...args),
    createCreditCheckout: (...args: unknown[]) => mockCreateCreditCheckout(...args),
  },
  ApiError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

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

const mockToast = vi.fn();
vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/hooks/useFocusTrap", () => ({
  useFocusTrap: vi.fn(),
}));

import CreditBalancePill from "@/components/CreditBalancePill";
import type { CreditState } from "@/lib/api";

const baseCreditState: CreditState = {
  balance: 42,
  lowCredit: false,
  monthlyGrant: 50,
  lowCreditThreshold: 10,
  costs: { chat: 1 },
  packs: [
    { id: "pack-10", credits: 10, priceEur: 4.99, unitPriceEur: 0.499 },
    { id: "pack-50", credits: 50, priceEur: 19.99, unitPriceEur: 0.3998, savingsPercent: 20 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetEntitlements.mockResolvedValue({ credits: baseCreditState });
});

async function renderLoadedCreditBalance(ui = <CreditBalancePill />) {
  render(ui);
  await waitFor(() => {
    expect(screen.getByText("42")).toBeInTheDocument();
  });
}

async function openCreditDialog() {
  fireEvent.click(screen.getByLabelText(/credits\.balanceAria/));
  await waitFor(() => {
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
}

describe("CreditBalancePill", () => {
  it("shows loading state initially", () => {
    mockGetEntitlements.mockReturnValue(new Promise(() => {}));
    render(<CreditBalancePill />);
    expect(screen.getByText("...")).toBeInTheDocument();
  });

  it("shows balance after loading", async () => {
    render(<CreditBalancePill />);
    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });
  });

  it("shows short label in non-compact mode", async () => {
    render(<CreditBalancePill />);
    await waitFor(() => {
      expect(screen.getByText("credits.shortLabel")).toBeInTheDocument();
    });
  });

  it("hides short label in compact mode", async () => {
    render(<CreditBalancePill compact />);
    await waitFor(() => {
      expect(screen.getByText("42")).toBeInTheDocument();
    });
    expect(screen.queryByText("credits.shortLabel")).not.toBeInTheDocument();
  });

  it("opens dialog on click", async () => {
    await renderLoadedCreditBalance();
    await openCreditDialog();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("credits.title")).toBeInTheDocument();
  });

  it("shows current balance in dialog", async () => {
    await renderLoadedCreditBalance();
    await openCreditDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("42");
  });

  it("renders credit packs in dialog", async () => {
    await renderLoadedCreditBalance();
    await openCreditDialog();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("4.99 EUR")).toBeInTheDocument();
    expect(screen.getByText("19.99 EUR")).toBeInTheDocument();
  });

  it("shows savings badge on discounted pack", async () => {
    await renderLoadedCreditBalance();
    await openCreditDialog();
    expect(screen.getByText(/credits\.savings/)).toBeInTheDocument();
  });

  it("closes dialog via close button", async () => {
    await renderLoadedCreditBalance();
    await openCreditDialog();
    fireEvent.click(screen.getByLabelText("dialog.close"));
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("closes dialog on backdrop click", async () => {
    await renderLoadedCreditBalance();
    await openCreditDialog();
    const backdrop = screen.getByRole("presentation");
    fireEvent.mouseDown(backdrop);
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("shows low credit warning styling", async () => {
    mockGetEntitlements.mockResolvedValue({
      credits: { ...baseCreditState, balance: 5, lowCredit: true },
    });
    render(<CreditBalancePill />);
    await waitFor(() => screen.getByText("5"));
    const button = screen.getByLabelText(/credits\.balanceAria/);
    expect(button.style.borderColor).toBe("var(--warning-border)");
  });

  it("shows low badge in dialog when low credit", async () => {
    mockGetEntitlements.mockResolvedValue({
      credits: { ...baseCreditState, balance: 5, lowCredit: true },
    });
    render(<CreditBalancePill />);
    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });
    await openCreditDialog();
    expect(screen.getByText("credits.lowBadge")).toBeInTheDocument();
  });

  it("does not show low credit toast when lowCredit is false", async () => {
    render(<CreditBalancePill />);
    await waitFor(() => screen.getByText("42"));
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("handles API error gracefully", async () => {
    mockGetEntitlements.mockRejectedValue(new Error("network"));
    render(<CreditBalancePill />);
    await waitFor(() => {
      expect(screen.getByText("...")).toBeInTheDocument();
    });
  });

  it("has correct aria-label with balance", async () => {
    render(<CreditBalancePill />);
    await waitFor(() => screen.getByText("42"));
    const button = screen.getByLabelText(/credits\.balanceAria/);
    expect(button).toBeInTheDocument();
  });
});
