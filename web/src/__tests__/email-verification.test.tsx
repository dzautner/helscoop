import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockResendVerification = vi.fn();
const mockToast = vi.fn();

vi.mock("@/lib/api", () => ({
  api: {
    resendVerification: (...args: unknown[]) => mockResendVerification(...args),
  },
}));

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

import EmailVerificationBanner from "@/components/EmailVerificationBanner";

beforeEach(() => {
  vi.clearAllMocks();
  mockResendVerification.mockResolvedValue({});
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

  it("shows resend button", () => {
    render(<EmailVerificationBanner emailVerified={false} />);
    expect(screen.getByText("emailVerification.resend")).toBeInTheDocument();
  });

  it("calls resendVerification on button click", async () => {
    render(<EmailVerificationBanner emailVerified={false} />);
    fireEvent.click(screen.getByText("emailVerification.resend"));
    await waitFor(() => {
      expect(mockResendVerification).toHaveBeenCalledOnce();
    });
  });

  it("shows resent confirmation after successful resend", async () => {
    render(<EmailVerificationBanner emailVerified={false} />);
    fireEvent.click(screen.getByText("emailVerification.resend"));
    await waitFor(() => {
      expect(screen.getByText("emailVerification.resent")).toBeInTheDocument();
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

  it("dismisses on close button click", () => {
    render(<EmailVerificationBanner emailVerified={false} />);
    fireEvent.click(screen.getByLabelText("emailVerification.dismiss"));
    expect(screen.queryByText("emailVerification.banner")).not.toBeInTheDocument();
  });

  it("has dismiss button with aria-label", () => {
    render(<EmailVerificationBanner emailVerified={false} />);
    expect(screen.getByLabelText("emailVerification.dismiss")).toBeInTheDocument();
  });
});
