import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockResendVerification = vi.fn();
const mockToast = vi.fn();

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    resendVerification: (...args: unknown[]) => mockResendVerification(...args),
  },
}));

import EmailVerificationBanner from "@/components/EmailVerificationBanner";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EmailVerificationBanner", () => {
  it("renders banner when email not verified", () => {
    render(<EmailVerificationBanner emailVerified={false} />);
    expect(screen.getByText("emailVerification.banner")).toBeInTheDocument();
  });

  it("returns null when email is verified", () => {
    const { container } = render(<EmailVerificationBanner emailVerified={true} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders resend button", () => {
    render(<EmailVerificationBanner emailVerified={false} />);
    expect(screen.getByText("emailVerification.resend")).toBeInTheDocument();
  });

  it("renders dismiss button", () => {
    render(<EmailVerificationBanner emailVerified={false} />);
    expect(screen.getByLabelText("emailVerification.dismiss")).toBeInTheDocument();
  });

  it("dismisses banner on dismiss click", () => {
    render(<EmailVerificationBanner emailVerified={false} />);
    fireEvent.click(screen.getByLabelText("emailVerification.dismiss"));
    expect(screen.queryByText("emailVerification.banner")).not.toBeInTheDocument();
  });

  it("shows resent message after successful resend", async () => {
    mockResendVerification.mockResolvedValue({});
    render(<EmailVerificationBanner emailVerified={false} />);
    fireEvent.click(screen.getByText("emailVerification.resend"));
    await waitFor(() => {
      expect(screen.getByText("emailVerification.resent")).toBeInTheDocument();
    });
  });

  it("calls api.resendVerification on resend click", async () => {
    mockResendVerification.mockResolvedValue({});
    render(<EmailVerificationBanner emailVerified={false} />);
    fireEvent.click(screen.getByText("emailVerification.resend"));
    await waitFor(() => {
      expect(mockResendVerification).toHaveBeenCalledTimes(1);
    });
  });

  it("shows error toast on resend failure", async () => {
    mockResendVerification.mockRejectedValue(new Error("fail"));
    render(<EmailVerificationBanner emailVerified={false} />);
    fireEvent.click(screen.getByText("emailVerification.resend"));
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith("emailVerification.resendFailed", "error");
    });
  });

  it("renders close icon SVG", () => {
    const { container } = render(<EmailVerificationBanner emailVerified={false} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
