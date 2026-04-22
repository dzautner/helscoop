import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const mockSetLocale = vi.fn();
let mockLocale = "en";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: mockLocale,
    setLocale: mockSetLocale,
    t: (key: string) => key,
  }),
}));

import { LanguageSwitcher } from "@/components/LanguageSwitcher";

describe("LanguageSwitcher", () => {
  it("renders FI and EN labels", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText("FI")).toBeInTheDocument();
    expect(screen.getByText("EN")).toBeInTheDocument();
  });

  it("has aria-label", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByLabelText("aria.switchLanguage")).toBeInTheDocument();
  });

  it("switches from en to fi on click", () => {
    mockLocale = "en";
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockSetLocale).toHaveBeenCalledWith("fi");
  });

  it("switches from fi to en on click", () => {
    mockLocale = "fi";
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockSetLocale).toHaveBeenCalledWith("en");
  });

  it("renders separator", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText("|")).toBeInTheDocument();
  });
});
