import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import PermitCheckerPanel from "@/components/PermitCheckerPanel";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    t: (key: string) => key,
  }),
}));

describe("PermitCheckerPanel", () => {
  it("renders an address-aware permit result", () => {
    render(<PermitCheckerPanel buildingInfo={{ address: "Mannerheimintie 1, Helsinki" }} />);

    expect(screen.getByTestId("permit-checker-panel")).toBeInTheDocument();
    expect(screen.getByText("Permit needed?")).toBeInTheDocument();
    expect(screen.getByText("Helsinki")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Lupapiste" })).toHaveAttribute("href");
  });

  it("updates the result when selecting a structural permit category", () => {
    render(<PermitCheckerPanel buildingInfo={{ address: "Hämeenkatu 1, Tampere" }} />);

    fireEvent.click(screen.getByRole("button", { name: /Load-bearing walls/i }));

    expect(screen.getByText("Likely construction/building permit")).toBeInTheDocument();
    expect(screen.getByText("Tampere")).toBeInTheDocument();
  });

  it("surfaces authority-check disclaimer for protected buildings", () => {
    render(<PermitCheckerPanel buildingInfo={{ address: "Aurakatu 1, Turku" }} />);

    fireEvent.click(screen.getByRole("button", { name: "Roof" }));
    fireEvent.click(screen.getByLabelText(/protected or the detailed plan/i));

    expect(screen.getByText("Edge case: ask building control")).toBeInTheDocument();
    expect(screen.getByText(/Not a legal decision/i)).toBeInTheDocument();
  });
});
