import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import BlueprintToScenePanel from "@/components/BlueprintToScenePanel";

const toast = vi.fn();
const track = vi.fn();

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/ToastProvider", () => ({
  useToast: () => ({ toast }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useAnalytics: () => ({ track }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("BlueprintToScenePanel", () => {
  it("generates and applies an editable blueprint scene", () => {
    const onApplyScene = vi.fn();
    render(
      <BlueprintToScenePanel
        projectName="Owner house"
        buildingInfo={{ area_m2: 118, floors: 1 }}
        onApplyScene={onApplyScene}
      />,
    );

    const file = new File(["floor plan"], "sauna-khh-plan.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Blueprint file"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("Known width (m)"), { target: { value: "10.5" } });
    fireEvent.change(screen.getByLabelText("Room notes"), { target: { value: "sauna, utility, kitchen" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate editable draft" }));

    expect(screen.getByText("Footprint")).toBeInTheDocument();
    expect(screen.getByText("Scale")).toBeInTheDocument();
    expect(screen.getByText(/Draft only/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Apply to 3D scene" }));

    expect(onApplyScene).toHaveBeenCalledWith(expect.stringContaining("blueprint_wall_north"));
    expect(onApplyScene).toHaveBeenCalledWith(expect.stringContaining("scene.add"));
    expect(track).toHaveBeenCalledWith("blueprint_scene_generated", expect.objectContaining({ room_count: expect.any(Number) }));
    expect(track).toHaveBeenCalledWith("blueprint_scene_applied", expect.objectContaining({ confidence: expect.any(Number) }));
  });

  it("copies generated scene code", async () => {
    render(<BlueprintToScenePanel projectName="Owner house" />);

    const file = new File(["floor plan"], "floor-plan.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Blueprint file"), { target: { files: [file] } });
    fireEvent.click(screen.getByRole("button", { name: "Generate editable draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy scene JS" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("Helscoop blueprint-to-3D draft"));
    });
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
