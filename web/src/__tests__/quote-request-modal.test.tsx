import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockSubmitQuoteRequest = vi.fn();
const mockMe = vi.fn();
const mockToast = vi.fn();
const mockTrack = vi.fn();

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

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track: mockTrack }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    submitQuoteRequest: (...args: unknown[]) => mockSubmitQuoteRequest(...args),
    me: (...args: unknown[]) => mockMe(...args),
  },
}));

import QuoteRequestModal from "@/components/QuoteRequestModal";
import type { BomItem } from "@/types";

const mockBom: BomItem[] = [
  { material_id: "m1", quantity: 10, unit: "kpl" },
];

const baseProps = {
  open: true,
  projectId: "p1",
  projectName: "Sauna Build",
  bom: mockBom,
  totalCost: 5000,
  onClose: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMe.mockResolvedValue({ name: "", email: "" });
  mockSubmitQuoteRequest.mockResolvedValue({
    id: "qr-1",
    status: "submitted",
    created_at: "2026-04-22T10:00:00Z",
    email_sent: true,
    bom_line_count: 1,
    estimated_cost: 5000,
    matched_contractor_count: 3,
  });
});

describe("QuoteRequestModal", () => {
  it("returns null when not open", () => {
    const { container } = render(<QuoteRequestModal {...baseProps} open={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog when open", () => {
    render(<QuoteRequestModal {...baseProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("has aria-modal true", () => {
    render(<QuoteRequestModal {...baseProps} />);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
  });

  it("renders eyebrow text", () => {
    render(<QuoteRequestModal {...baseProps} />);
    expect(screen.getByText("quoteRequest.eyebrow")).toBeInTheDocument();
  });

  it("renders title", () => {
    render(<QuoteRequestModal {...baseProps} />);
    expect(screen.getByText("quoteRequest.title")).toBeInTheDocument();
  });

  it("renders subtitle", () => {
    render(<QuoteRequestModal {...baseProps} />);
    expect(screen.getByText("quoteRequest.subtitle")).toBeInTheDocument();
  });

  it("renders project summary", () => {
    render(<QuoteRequestModal {...baseProps} />);
    expect(screen.getByText("quoteRequest.summaryProject")).toBeInTheDocument();
    expect(screen.getByText("Sauna Build")).toBeInTheDocument();
  });

  it("renders form fields", () => {
    render(<QuoteRequestModal {...baseProps} />);
    expect(screen.getByText("quoteRequest.contactName")).toBeInTheDocument();
    expect(screen.getByText("quoteRequest.contactEmail")).toBeInTheDocument();
    expect(screen.getByText("quoteRequest.contactPhone")).toBeInTheDocument();
    expect(screen.getByText("quoteRequest.postcode")).toBeInTheDocument();
    expect(screen.getByText("quoteRequest.workScope")).toBeInTheDocument();
  });

  it("renders partner note", () => {
    render(<QuoteRequestModal {...baseProps} />);
    expect(screen.getByText("quoteRequest.partnerNote")).toBeInTheDocument();
  });

  it("renders cancel and submit buttons", () => {
    render(<QuoteRequestModal {...baseProps} />);
    expect(screen.getByText("dialog.cancel")).toBeInTheDocument();
    expect(screen.getByText("quoteRequest.submit")).toBeInTheDocument();
  });

  it("submit button is disabled initially", () => {
    render(<QuoteRequestModal {...baseProps} />);
    const submitBtn = screen.getByText("quoteRequest.submit").closest("button")!;
    expect(submitBtn).toBeDisabled();
  });

  it("closes on Escape key", () => {
    const onClose = vi.fn();
    render(<QuoteRequestModal {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("closes on close button click", () => {
    const onClose = vi.fn();
    render(<QuoteRequestModal {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText("dialog.cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("prefills user data from API", async () => {
    mockMe.mockResolvedValue({ name: "Jane", email: "jane@example.com" });
    render(<QuoteRequestModal {...baseProps} />);
    await waitFor(() => {
      expect(mockMe).toHaveBeenCalled();
    });
  });

  it("renders total cost in summary", () => {
    render(<QuoteRequestModal {...baseProps} />);
    expect(screen.getByText(/5,000/)).toBeInTheDocument();
  });
});
