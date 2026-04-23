import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import IfcPreviewPanel from "@/components/IfcPreviewPanel";
import { api } from "@/lib/api";
import { IFC_READINESS_STORAGE_KEY } from "@/lib/ifc-preview";

const VALID_IFC = `ISO-10303-21;
HEADER;
FILE_SCHEMA(('IFC4X3_ADD2'));
ENDSEC;
DATA;
#1=IFCPROJECT('p',$,'Project',$,$,$,$,$);
#2=IFCLOCALPLACEMENT($,$);
#3=IFCSITE('s',$,'Site',$,$,#2,$,$,.ELEMENT.,$,$,$,$,$);
#4=IFCBUILDING('b',$,'Building',$,$,#2,$,$,.ELEMENT.,$,$,$);
#5=IFCBUILDINGSTOREY('st',$,'Ground floor',$,$,#2,$,$,.ELEMENT.,0.);
#6=IFCWALL('w',$,'Wall',$,$,#2,#20,$,$);
#7=IFCBOUNDINGBOX(#2,5.000,2.800,0.200);
#8=IFCSLAB('sl',$,'Floor',$,$,#2,#21,$,$);
#9=IFCBOUNDINGBOX(#2,5.000,0.200,4.000);
#10=IFCROOF('r',$,'Roof',$,$,#2,#22,$,$);
#11=IFCBOUNDINGBOX(#2,5.000,0.300,4.000);
#12=IFCDOOR('d',$,'Door',$,$,#2,#23,$,$);
ENDSEC;
END-ISO-10303-21;`;

vi.mock("@/components/LocaleProvider", () => ({
  useTranslation: () => ({
    locale: "en",
    setLocale: vi.fn(),
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib/api", () => ({
  api: {
    getIFC: vi.fn(),
    exportIFC: vi.fn(),
  },
}));

describe("IfcPreviewPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(api.getIFC).mockReset();
    vi.mocked(api.exportIFC).mockReset();
  });

  it("generates an IFC preview with object counts and checklist", async () => {
    vi.mocked(api.getIFC).mockResolvedValue(VALID_IFC);

    render(<IfcPreviewPanel projectId="project-1" projectName="Sauna" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));

    expect(await screen.findByText("Ready for Lupapiste")).toBeInTheDocument();
    expect(screen.getByText("IFC4X3_ADD2")).toBeInTheDocument();
    expect(screen.getByText("Walls")).toBeInTheDocument();
    expect(screen.getByText("Slabs / floors")).toBeInTheDocument();
    expect(screen.getByText("Project / site / building / storey")).toBeInTheDocument();
    expect(api.getIFC).toHaveBeenCalledWith("project-1");
    expect(localStorage.getItem(IFC_READINESS_STORAGE_KEY)).toContain("project-1");
  });

  it("downloads the same IFC export from the panel", async () => {
    vi.mocked(api.exportIFC).mockResolvedValue(undefined);

    render(<IfcPreviewPanel projectId="project-1" projectName="Sauna" />);
    fireEvent.click(screen.getByRole("button", { name: "Download IFC" }));

    await waitFor(() => expect(api.exportIFC).toHaveBeenCalledWith("project-1", "Sauna"));
  });

  it("shows an inline error when the preview cannot be generated", async () => {
    vi.mocked(api.getIFC).mockRejectedValue(new Error("No scene"));

    render(<IfcPreviewPanel projectId="project-1" projectName="Sauna" />);
    fireEvent.click(screen.getByRole("button", { name: "Generate preview" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No scene");
  });
});
