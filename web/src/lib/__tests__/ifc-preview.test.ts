import { beforeEach, describe, expect, it } from "vitest";
import {
  IFC_READINESS_STORAGE_KEY,
  analyzeIfcStep,
  readIfcReadinessBadge,
  rememberIfcReadiness,
} from "@/lib/ifc-preview";

const VALID_IFC = `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Helscoop permit export'),'2;1');
FILE_NAME('test.ifc','2026-04-23T00:00:00',('Helscoop'),('Helscoop'),'Helscoop','Helscoop','');
FILE_SCHEMA(('IFC4X3_ADD2'));
ENDSEC;
DATA;
#1=IFCPROJECT('p',$,'Project',$,$,$,$,$);
#2=IFCLOCALPLACEMENT($,$);
#3=IFCSITE('s',$,'Testikatu 1',$,$,#2,$,$,.ELEMENT.,$,$,$,$,$);
#4=IFCBUILDING('b',$,'Building',$,$,#2,$,$,.ELEMENT.,$,$,$);
#5=IFCBUILDINGSTOREY('st',$,'Ground floor',$,$,#2,$,$,.ELEMENT.,0.);
#6=IFCWALL('w',$,'Wall',$,$,#2,#20,$,$);
#7=IFCBOUNDINGBOX(#2,5.000,2.800,0.200);
#8=IFCSLAB('sl',$,'Floor',$,$,#2,#21,$,$);
#9=IFCBOUNDINGBOX(#2,5.000,0.200,4.000);
#10=IFCROOF('r',$,'Roof',$,$,#2,#22,$,$);
#11=IFCBOUNDINGBOX(#2,5.000,0.300,4.000);
#12=IFCDOOR('d',$,'Door',$,$,#2,#23,$,$);
#13=IFCWINDOW('win',$,'Window',$,$,#2,#24,$,$);
ENDSEC;
END-ISO-10303-21;`;

describe("analyzeIfcStep", () => {
  it("marks a complete IFC4x3 permit export as ready", () => {
    const analysis = analyzeIfcStep(VALID_IFC);

    expect(analysis.schema).toBe("IFC4X3_ADD2");
    expect(analysis.readyForLupapiste).toBe(true);
    expect(analysis.blockingIssueCount).toBe(0);
    expect(analysis.elementCounts.walls).toBe(1);
    expect(analysis.elementCounts.slabs).toBe(1);
    expect(analysis.elementCounts.roofs).toBe(1);
    expect(analysis.boundingBoxes).toHaveLength(3);
    expect(analysis.largestSpanMeters).toBe(5);
  });

  it("fails older IFC schemas", () => {
    const analysis = analyzeIfcStep(VALID_IFC.replace("IFC4X3_ADD2", "IFC2X3"));

    expect(analysis.readyForLupapiste).toBe(false);
    expect(analysis.checks.find((check) => check.id === "ifc-schema")?.status).toBe("fail");
  });

  it("fails models without required spatial containers", () => {
    const analysis = analyzeIfcStep(VALID_IFC.replace("#3=IFCSITE", "#3=IFCBUILDINGELEMENTPROXY"));

    expect(analysis.readyForLupapiste).toBe(false);
    expect(analysis.checks.find((check) => check.id === "spatial-structure")?.message).toContain("site");
  });

  it("blocks impossible bounding dimensions", () => {
    const analysis = analyzeIfcStep(VALID_IFC.replace("IFCBOUNDINGBOX(#2,5.000,2.800,0.200)", "IFCBOUNDINGBOX(#2,0,2.800,999)"));

    expect(analysis.readyForLupapiste).toBe(false);
    expect(analysis.checks.find((check) => check.id === "dimensions")?.status).toBe("fail");
  });
});

describe("IFC readiness storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the Lupapiste badge only after a validator pass is stored", () => {
    const analysis = analyzeIfcStep(VALID_IFC);

    rememberIfcReadiness("project-1", analysis);

    const ready = readIfcReadinessBadge("project-1");
    const missing = readIfcReadinessBadge("project-2");

    expect(ready.show).toBe(true);
    expect(ready.reasons).toEqual(expect.arrayContaining(["IFC4X3_ADD2", "no blocking issues"]));
    expect(missing.show).toBe(false);
    expect(localStorage.getItem(IFC_READINESS_STORAGE_KEY)).toContain("project-1");
  });

  it("hides the badge when the latest stored validation has blockers", () => {
    const failed = analyzeIfcStep(VALID_IFC.replace("IFC4X3_ADD2", "IFC2X3"));

    rememberIfcReadiness("project-1", failed);

    expect(readIfcReadinessBadge("project-1").show).toBe(false);
  });

  it("hides stale readiness after the project has been edited", () => {
    const analysis = analyzeIfcStep(VALID_IFC);

    rememberIfcReadiness("project-1", analysis);

    expect(readIfcReadinessBadge("project-1", "2099-01-01T00:00:00.000Z").show).toBe(false);
  });
});
