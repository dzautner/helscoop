import { describe, it, expect } from "vitest";
import {
  IFC_SCHEMA,
  IFC_VIEW_DEFINITION,
  IFC_PERMIT_EXPORT_PURPOSE,
  classifyElement,
  parseSceneObjects,
  generateIFC,
} from "../ifc-generator";

describe("IFC constants", () => {
  it("uses IFC4X3_ADD2 schema", () => {
    expect(IFC_SCHEMA).toBe("IFC4X3_ADD2");
  });

  it("uses ReferenceView_V1.2", () => {
    expect(IFC_VIEW_DEFINITION).toBe("ReferenceView_V1.2");
  });

  it("has Finnish permit export purpose", () => {
    expect(IFC_PERMIT_EXPORT_PURPOSE).toContain("Rakentamislaki");
  });
});

describe("classifyElement", () => {
  it("classifies 'wall' as wall", () => {
    expect(classifyElement("wall_01")).toBe("wall");
  });

  it("classifies 'seinä' as wall (Finnish)", () => {
    expect(classifyElement("ulko_seina")).toBe("wall");
  });

  it("classifies 'roof' as roof", () => {
    expect(classifyElement("main_roof")).toBe("roof");
  });

  it("classifies 'katto' as roof (Finnish)", () => {
    expect(classifyElement("katto_panel")).toBe("roof");
  });

  it("classifies 'door' as door", () => {
    expect(classifyElement("front_door")).toBe("door");
  });

  it("classifies 'ovi' as door (Finnish)", () => {
    expect(classifyElement("ulko_ovi")).toBe("door");
  });

  it("classifies 'window' as window", () => {
    expect(classifyElement("side_window")).toBe("window");
  });

  it("classifies 'ikkuna' as window (Finnish)", () => {
    expect(classifyElement("ikkuna_1")).toBe("window");
  });

  it("classifies 'floor' as slab", () => {
    expect(classifyElement("floor_slab")).toBe("slab");
  });

  it("classifies 'lattia' as slab (Finnish)", () => {
    expect(classifyElement("lattia_plate")).toBe("slab");
  });

  it("classifies 'foundation' as slab", () => {
    expect(classifyElement("foundation_base")).toBe("slab");
  });

  it("classifies 'gate' as door", () => {
    expect(classifyElement("main_gate")).toBe("door");
  });

  it("classifies 'portti' as door (Finnish)", () => {
    expect(classifyElement("portti_1")).toBe("door");
  });

  it("falls back to material-based classification", () => {
    expect(classifyElement("element_1", "roofing_metal")).toBe("roof");
  });

  it("concrete material classifies as slab", () => {
    expect(classifyElement("base_1", "betoni")).toBe("slab");
  });

  it("defaults to generic for unclassified elements", () => {
    expect(classifyElement("structural_beam")).toBe("generic");
  });
});

describe("parseSceneObjects", () => {
  it("returns empty array for empty scene", () => {
    expect(parseSceneObjects("")).toHaveLength(0);
  });

  it("parses box with translate", () => {
    const scene = `
const wall = translate(box(4, 2.5, 0.2), 0, 0, 0)
scene.add(wall)
`;
    const objs = parseSceneObjects(scene);
    expect(objs).toHaveLength(1);
    expect(objs[0].name).toBe("wall");
    expect(objs[0].type).toBe("wall");
    expect(objs[0].dimensions).toEqual({ x: 4, y: 2.5, z: 0.2 });
    expect(objs[0].position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("parses standalone box", () => {
    const scene = `
const slab = box(10, 0.3, 8)
scene.add(slab)
`;
    const objs = parseSceneObjects(scene);
    expect(objs).toHaveLength(1);
    expect(objs[0].dimensions).toEqual({ x: 10, y: 0.3, z: 8 });
    expect(objs[0].position).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("extracts material from scene.add options", () => {
    const scene = `
const roof = translate(box(10, 0.1, 8), 0, 3, 0)
scene.add(roof, { material: "pelti_katto" })
`;
    const objs = parseSceneObjects(scene);
    expect(objs).toHaveLength(1);
    expect(objs[0].material).toBe("pelti_katto");
  });

  it("parses multiple scene objects", () => {
    const scene = `
const wall_left = translate(box(0.2, 2.5, 8), 0, 0, 0)
const wall_right = translate(box(0.2, 2.5, 8), 10, 0, 0)
const roof = translate(box(10.4, 0.1, 8.4), -0.2, 2.5, -0.2)
scene.add(wall_left)
scene.add(wall_right)
scene.add(roof)
`;
    const objs = parseSceneObjects(scene);
    expect(objs).toHaveLength(3);
    expect(objs.map((o) => o.name)).toEqual(["wall_left", "wall_right", "roof"]);
  });

  it("classifies elements by name", () => {
    const scene = `
const front_door = translate(box(0.9, 2.1, 0.05), 3, 0, 0)
const side_window = translate(box(1.2, 1.0, 0.05), 6, 1.2, 0)
scene.add(front_door)
scene.add(side_window)
`;
    const objs = parseSceneObjects(scene);
    expect(objs[0].type).toBe("door");
    expect(objs[1].type).toBe("window");
  });

  it("ignores variables not added to scene", () => {
    const scene = `
const wall = translate(box(4, 2.5, 0.2), 0, 0, 0)
const unused = box(1, 1, 1)
scene.add(wall)
`;
    const objs = parseSceneObjects(scene);
    expect(objs).toHaveLength(1);
    expect(objs[0].name).toBe("wall");
  });
});

describe("generateIFC", () => {
  const minimalInput = {
    project: { id: "p1", name: "Test Sauna" },
    bom: [],
  };

  it("produces valid STEP file structure", () => {
    const ifc = generateIFC(minimalInput);
    expect(ifc).toContain("ISO-10303-21;");
    expect(ifc).toContain("HEADER;");
    expect(ifc).toContain("DATA;");
    expect(ifc).toContain("ENDSEC;");
    expect(ifc).toContain("END-ISO-10303-21;");
  });

  it("contains IFC4X3 schema reference", () => {
    const ifc = generateIFC(minimalInput);
    expect(ifc).toContain("IFC4X3_ADD2");
  });

  it("contains project name", () => {
    const ifc = generateIFC(minimalInput);
    expect(ifc).toContain("Test Sauna");
  });

  it("contains IFCPROJECT entity", () => {
    const ifc = generateIFC(minimalInput);
    expect(ifc).toContain("IFCPROJECT(");
  });

  it("contains spatial hierarchy", () => {
    const ifc = generateIFC(minimalInput);
    expect(ifc).toContain("IFCSITE(");
    expect(ifc).toContain("IFCBUILDING(");
    expect(ifc).toContain("IFCBUILDINGSTOREY(");
  });

  it("contains aggregation relationships", () => {
    const ifc = generateIFC(minimalInput);
    expect(ifc).toContain("IFCRELAGGREGATES(");
  });

  it("contains unit definitions", () => {
    const ifc = generateIFC(minimalInput);
    expect(ifc).toContain("IFCSIUNIT");
    expect(ifc).toContain(".METRE.");
    expect(ifc).toContain(".SQUARE_METRE.");
  });

  it("includes building info in metadata", () => {
    const ifc = generateIFC({
      ...minimalInput,
      buildingInfo: {
        address: "Mannerheimintie 1",
        buildingType: "omakotitalo",
        yearBuilt: 1985,
      },
    });
    expect(ifc).toContain("Mannerheimintie 1");
    expect(ifc).toContain("omakotitalo");
  });

  it("includes scene objects as IFC elements", () => {
    const ifc = generateIFC({
      project: {
        id: "p2",
        name: "Mökki",
        scene_js: `
const wall = translate(box(4, 2.5, 0.2), 0, 0, 0)
scene.add(wall)
`,
      },
      bom: [],
    });
    expect(ifc).toContain("IFCWALL(");
    expect(ifc).toContain("IFCRELCONTAINEDINSPATIALSTRUCTURE(");
  });

  it("includes material assignments", () => {
    const ifc = generateIFC({
      project: {
        id: "p3",
        name: "Talo",
        scene_js: `
const roof = translate(box(10, 0.1, 8), 0, 3, 0)
scene.add(roof, { material: "pelti" })
`,
      },
      bom: [{ material_id: "pelti", material_name: "Peltikatteen", quantity: 80, unit: "m2" }],
    });
    expect(ifc).toContain("IFCMATERIAL(");
    expect(ifc).toContain("IFCRELASSOCIATESMATERIAL(");
    expect(ifc).toContain("Peltikatteen");
  });

  it("includes permit metadata property set", () => {
    const ifc = generateIFC({
      ...minimalInput,
      permitMetadata: {
        permanentBuildingIdentifier: "103456789A",
        propertyIdentifier: "091-001-0001-0001",
        municipalityNumber: "091",
        energyClass: "C",
      },
    });
    expect(ifc).toContain("Pset_HelscoopPermitMetadata");
    expect(ifc).toContain("103456789A");
    expect(ifc).toContain("091-001-0001-0001");
  });

  it("maps window type to IFCWINDOW", () => {
    const ifc = generateIFC({
      project: {
        id: "p4",
        name: "Talo",
        scene_js: `
const window_1 = translate(box(1.2, 1.0, 0.05), 3, 1, 0)
scene.add(window_1)
`,
      },
      bom: [],
    });
    expect(ifc).toContain("IFCWINDOW(");
  });

  it("maps door type to IFCDOOR", () => {
    const ifc = generateIFC({
      project: {
        id: "p5",
        name: "Talo",
        scene_js: `
const front_door = translate(box(0.9, 2.1, 0.05), 2, 0, 0)
scene.add(front_door)
`,
      },
      bom: [],
    });
    expect(ifc).toContain("IFCDOOR(");
  });

  it("escapes single quotes in project name", () => {
    const ifc = generateIFC({
      project: { id: "p6", name: "Matti's Talo" },
      bom: [],
    });
    expect(ifc).toContain("Matti''s Talo");
  });

  it("contains Helscoop organization", () => {
    const ifc = generateIFC(minimalInput);
    expect(ifc).toContain("IFCORGANIZATION");
    expect(ifc).toContain("Helscoop");
  });
});
