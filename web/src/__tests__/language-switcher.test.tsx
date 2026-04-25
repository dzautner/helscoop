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
  it("renders FI, EN, and SV labels", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByText("FI")).toBeInTheDocument();
    expect(screen.getByText("EN")).toBeInTheDocument();
    expect(screen.getByText("SV")).toBeInTheDocument();
  });

  it("has aria-label", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByLabelText("aria.switchLanguage")).toBeInTheDocument();
  });

  it("cycles fi → en on click", () => {
    mockLocale = "fi";
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockSetLocale).toHaveBeenCalledWith("en");
  });

  it("cycles en → sv on click", () => {
    mockLocale = "en";
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockSetLocale).toHaveBeenCalledWith("sv");
  });

  it("cycles sv → fi on click", () => {
    mockLocale = "sv";
    render(<LanguageSwitcher />);
    fireEvent.click(screen.getByRole("button"));
    expect(mockSetLocale).toHaveBeenCalledWith("fi");
  });

  it("renders separators", () => {
    render(<LanguageSwitcher />);
    const separators = screen.getAllByText("|");
    expect(separators).toHaveLength(2);
  });
});
