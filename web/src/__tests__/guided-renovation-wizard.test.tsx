import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import GuidedRenovationWizard from "@/components/GuidedRenovationWizard";
import type { Material } from "@/types";

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    t: (key: string) => key,
  }),
}));

const materials: Material[] = [
  {
    id: "osb_18mm",
    name: "OSB 18mm",
    name_fi: "OSB 18mm",
    name_en: "OSB 18mm",
    category_name: "sheathing",
    category_name_fi: "Levy",
    image_url: null,
    pricing: [{ unit_price: 18, unit: "m2", supplier_name: "K-Rauta", is_primary: true }],
    tags: ["board"],
  },
];

describe("GuidedRenovationWizard", () => {
  it("renders the wizard with a running estimate and limited first-step choices", () => {
    render(
      <GuidedRenovationWizard
        materials={materials}
        source="project_list"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    expect(screen.getByTestId("guided-renovation-wizard")).toBeInTheDocument();
    expect(screen.getByText("Guided renovation wizard")).toBeInTheDocument();
    expect(screen.getByText("Running estimate")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-3d-preview")).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.queryByText("Extension")).not.toBeInTheDocument();
  });

  it("reveals the sixth scope option behind show more", () => {
    render(
      <GuidedRenovationWizard
        materials={materials}
        source="project_list"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Show more option" }));
    expect(screen.getByText("Extension")).toBeInTheDocument();
  });

  it("completes with a generated plan from the review step", async () => {
    const onComplete = vi.fn();
    const onStepViewed = vi.fn();
    render(
      <GuidedRenovationWizard
        materials={materials}
        source="project_list"
        onClose={vi.fn()}
        onComplete={onComplete}
        onStepViewed={onStepViewed}
      />,
    );

    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Next" }));
    }

    expect(screen.getByText("Create plan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create plan" }));

    await waitFor(() => expect(onComplete).toHaveBeenCalledOnce());
    const [plan, state] = onComplete.mock.calls[0];
    expect(plan.sceneJs).toContain("scene.add");
    expect(plan.bom.length).toBeGreaterThan(0);
    expect(state.renovationType).toBe("bathroom");
    expect(onStepViewed).toHaveBeenCalled();
  });
});
