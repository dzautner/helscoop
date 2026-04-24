import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DaylightPanel from "@/components/DaylightPanel";

const labels: Record<string, string> = {
  "editor.daylightTitle": "Daylight",
  "editor.close": "Close",
  "editor.daylightDate": "Date",
  "editor.daylightTime": "Time",
  "editor.daylightAzimuth": "Azimuth",
  "editor.daylightAltitude": "Altitude",
  "editor.daylightHoursUnit": " h daylight",
  "editor.daylightPlay": "Play day cycle",
  "editor.daylightPause": "Pause",
  "editor.daylightShadowStudy": "Show shadow study",
  "editor.daylightStudyStart": "Start",
  "editor.daylightStudyEnd": "End",
  "editor.daylightSamples": "samples",
  "editor.daylightExportSvg": "Export shadow study SVG",
  "editor.summerSolstice": "Summer solstice",
  "editor.winterSolstice": "Winter solstice",
  "editor.springEquinox": "Spring equinox",
  "editor.autumnEquinox": "Autumn equinox",
};

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => labels[key] ?? key,
  }),
}));

describe("DaylightPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates viewport light direction from the selected sun position", async () => {
    const onLightDirection = vi.fn();

    render(
      <DaylightPanel
        latitude={60.17}
        longitude={24.94}
        onLightDirection={onLightDirection}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(onLightDirection).toHaveBeenCalled();
    });
    expect(screen.getByText("Daylight")).toBeInTheDocument();
    expect(screen.getByText("Summer solstice")).toBeInTheDocument();
  });

  it("emits shadow study samples when the study overlay is enabled", async () => {
    const onShadowStudyChange = vi.fn();

    render(
      <DaylightPanel
        latitude={60.17}
        longitude={24.94}
        projectName="Test project"
        onLightDirection={vi.fn()}
        onShadowStudyChange={onShadowStudyChange}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText("Show shadow study"));

    await waitFor(() => {
      expect(onShadowStudyChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          samples: expect.arrayContaining([
            expect.objectContaining({ label: expect.stringMatching(/^\d\d:\d\d$/) }),
          ]),
        }),
      );
    });
    expect(screen.getByRole("button", { name: "Export shadow study SVG" })).toBeInTheDocument();
  });
});
