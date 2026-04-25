import type { BomItem, BuildingInfo, Material } from "@/types";
import {
  assessPermitNeed,
  type LocalizedText,
  type PermitAnswers,
  type PermitAssessment,
  type PermitCategoryId,
} from "@/lib/permit-checker";

export type RoadmapProjectType =
  | "interior"
  | "extension"
  | "roof"
  | "energy"
  | "sauna"
  | "garage"
  | "facade"
  | "yard";

export type RoadmapPhaseId =
  | "planning"
  | "foundation"
  | "structure"
  | "weatherproofing"
  | "mep"
  | "interior"
  | "handover";

export interface RoadmapBomItem {
  materialId: string;
  name: string;
  quantity: number;
  unit: string;
  estimatedCost: number;
}

export interface RoadmapPhase {
  id: RoadmapPhaseId;
  title: LocalizedText;
  summary: LocalizedText;
  startWeek: number;
  durationWeeks: number;
  durationRange: LocalizedText;
  contractorType: LocalizedText;
  crew: LocalizedText;
  criticalPath: boolean;
  canOverlapWith: RoadmapPhaseId[];
  risk: LocalizedText;
  items: RoadmapBomItem[];
  estimatedCost: number;
}

export interface RoadmapChecklistItem {
  id: string;
  label: LocalizedText;
  required: boolean;
  owner: LocalizedText;
  timing: LocalizedText;
  cost: LocalizedText;
}

export interface RenovationRoadmap {
  projectType: RoadmapProjectType;
  permitAssessment: PermitAssessment;
  totalWeeks: number;
  totalCost: number;
  phases: RoadmapPhase[];
  checklist: RoadmapChecklistItem[];
  assumptions: LocalizedText[];
}

export interface BuildRenovationRoadmapInput {
  bom: BomItem[];
  materials: Material[];
  buildingInfo?: BuildingInfo | null;
  projectName?: string;
  projectDescription?: string;
  projectType?: RoadmapProjectType;
  addedAreaM2?: number;
}

const PHASE_ORDER: RoadmapPhaseId[] = [
  "planning",
  "foundation",
  "structure",
  "weatherproofing",
  "mep",
  "interior",
  "handover",
];

const PHASE_COPY: Record<RoadmapPhaseId, Omit<RoadmapPhase, "startWeek" | "durationWeeks" | "items" | "estimatedCost">> = {
  planning: {
    id: "planning",
    title: { fi: "Suunnittelu ja luvat", en: "Planning and permits" },
    summary: { fi: "Lukitse laajuus, vastuut, lupa-arvio ja hankintajärjestys ennen ostoksia.", en: "Lock scope, responsibilities, permit risk, and procurement order before buying." },
    durationRange: { fi: "2-6 viikkoa", en: "2-6 weeks" },
    contractorType: { fi: "Pääsuunnittelija / omistaja", en: "Principal designer / owner" },
    crew: { fi: "1 omistaja + suunnittelija tarvittaessa", en: "1 owner plus designer when needed" },
    criticalPath: true,
    canOverlapWith: [],
    risk: { fi: "Lupa- tai suunnittelupuutteet pysäyttävät myöhemmät vaiheet.", en: "Permit or design gaps block later phases." },
  },
  foundation: {
    id: "foundation",
    title: { fi: "Maa- ja perustustyöt", en: "Groundwork and foundation" },
    summary: { fi: "Työmaa, kaivuu, kantavuus, routasuojaus ja valutyöt.", en: "Site setup, excavation, bearing capacity, frost protection, and concrete work." },
    durationRange: { fi: "1-2 viikkoa", en: "1-2 weeks" },
    contractorType: { fi: "Maanrakentaja / perustustekijä", en: "Groundworks / foundation crew" },
    crew: { fi: "2-4 hengen työryhmä", en: "2-4 person crew" },
    criticalPath: true,
    canOverlapWith: [],
    risk: { fi: "Maaperä, sää ja toimitukset voivat siirtää koko aikataulua.", en: "Soil, weather, and deliveries can shift the whole schedule." },
  },
  structure: {
    id: "structure",
    title: { fi: "Runko ja kantavat rakenteet", en: "Structure and framing" },
    summary: { fi: "Runko, aukotukset, levytys ja kantavat muutokset.", en: "Framing, openings, sheathing, and structural changes." },
    durationRange: { fi: "2-6 viikkoa", en: "2-6 weeks" },
    contractorType: { fi: "Kirvesmies / rakennesuunnittelija", en: "Carpentry crew / structural engineer" },
    crew: { fi: "2-3 kirvesmiestä", en: "2-3 carpenters" },
    criticalPath: true,
    canOverlapWith: ["mep"],
    risk: { fi: "Rakennemuutokset vaativat tarkat piirustukset ja tarkastukset.", en: "Structural changes need exact drawings and inspections." },
  },
  weatherproofing: {
    id: "weatherproofing",
    title: { fi: "Vesikatto ja sääsuojaus", en: "Roofing and weatherproofing" },
    summary: { fi: "Katto, kalvot, eristeet ja ulkovaipan tiiveys ennen sisätöitä.", en: "Roof, membranes, insulation, and envelope tightness before interior work." },
    durationRange: { fi: "1-3 viikkoa", en: "1-3 weeks" },
    contractorType: { fi: "Katto- / eristeurakoitsija", en: "Roofing / insulation contractor" },
    crew: { fi: "2-4 hengen sääriippuvainen työryhmä", en: "2-4 person weather-dependent crew" },
    criticalPath: true,
    canOverlapWith: ["structure"],
    risk: { fi: "Sisätyöt kannattaa aloittaa vasta kun vaippa on säältä suojattu.", en: "Interior work should wait until the envelope is weatherproof." },
  },
  mep: {
    id: "mep",
    title: { fi: "LVI, sähkö ja ilmanvaihto", en: "MEP rough-in" },
    summary: { fi: "Sähkö, putket, ilmanvaihto, lämmitys ja piiloon jäävät tarkistukset.", en: "Electrical, plumbing, ventilation, heating, and hidden inspections." },
    durationRange: { fi: "2-4 viikkoa", en: "2-4 weeks" },
    contractorType: { fi: "Sähkö-, LVI- ja IV-urakoitsijat", en: "Electrical, plumbing, and HVAC contractors" },
    crew: { fi: "1-3 erikoisurakoitsijaa vaiheittain", en: "1-3 specialist trades in sequence" },
    criticalPath: false,
    canOverlapWith: ["structure"],
    risk: { fi: "Piiloon jäävät asennukset pitää tarkistaa ennen levytystä.", en: "Hidden installations must be checked before closing walls." },
  },
  interior: {
    id: "interior",
    title: { fi: "Sisätyöt ja viimeistely", en: "Interior finishes" },
    summary: { fi: "Levyt, lattiat, pinnat, kalusteet, listat ja loppusiivous.", en: "Boards, floors, surfaces, fixtures, trims, and final clean." },
    durationRange: { fi: "3-6 viikkoa", en: "3-6 weeks" },
    contractorType: { fi: "Sisätyöurakoitsija / omatoiminen tekijä", en: "Interior contractor / DIY owner" },
    crew: { fi: "1-3 tekijää työmäärän mukaan", en: "1-3 workers depending on scope" },
    criticalPath: true,
    canOverlapWith: [],
    risk: { fi: "Pintojen kuivuminen, toimitukset ja virheet venyttävät helposti viimeistelyä.", en: "Drying time, deliveries, and defects often stretch finishing." },
  },
  handover: {
    id: "handover",
    title: { fi: "Tarkastukset ja luovutus", en: "Inspections and handover" },
    summary: { fi: "Tarkastukset, puutelistat, dokumentit, käyttöönottovalmius ja takuuasiat.", en: "Inspections, punch list, documents, occupancy readiness, and warranty notes." },
    durationRange: { fi: "1-2 viikkoa", en: "1-2 weeks" },
    contractorType: { fi: "Omistaja, valvoja, urakoitsija", en: "Owner, supervisor, contractor" },
    crew: { fi: "Omistaja + vastuulliset urakoitsijat", en: "Owner plus responsible contractors" },
    criticalPath: true,
    canOverlapWith: [],
    risk: { fi: "Puuttuvat dokumentit tai tarkastukset voivat estää käyttöönoton.", en: "Missing documents or inspections can block handover." },
  },
};

const PHASE_KEYWORDS: Record<Exclude<RoadmapPhaseId, "planning" | "handover">, string[]> = {
  foundation: ["foundation", "concrete", "betoni", "perustus", "sokkeli", "gravel", "sepeli", "routa"],
  structure: ["lumber", "timber", "wood", "c24", "frame", "framing", "runko", "sahatavara", "beam", "palkki", "osb"],
  weatherproofing: ["roof", "katto", "membrane", "kalvo", "insulation", "eriste", "facade", "julkisivu", "window", "ikkuna"],
  mep: ["electric", "sahko", "sähkö", "cable", "kaapeli", "plumbing", "putki", "lvi", "hvac", "ventilation", "heating", "lampopumppu", "lämpö"],
  interior: ["drywall", "gypsum", "kipsi", "floor", "lattia", "tile", "laatta", "paint", "maali", "fixture", "kaluste", "interior", "sisä"],
};

function localizedLower(value: unknown): string {
  return typeof value === "string" ? value.toLocaleLowerCase("fi-FI") : "";
}

function materialFor(item: BomItem, materials: Material[]): Material | undefined {
  return materials.find((material) => material.id === item.material_id);
}

function searchableText(item: BomItem, material?: Material): string {
  return [
    item.material_id,
    item.material_name,
    item.category_name,
    item.note,
    material?.name,
    material?.name_fi,
    material?.name_en,
    material?.category_name,
    material?.category_name_fi,
    ...(material?.tags ?? []),
  ].map(localizedLower).join(" ");
}

export function estimateBomLineCost(item: BomItem, material?: Material): number {
  if (typeof item.total === "number" && Number.isFinite(item.total)) return item.total;
  const materialPrice = material?.pricing?.find((price) => price.is_primary)?.unit_price ?? material?.pricing?.[0]?.unit_price;
  const unitPrice = typeof item.unit_price === "number" ? item.unit_price : materialPrice ?? 0;
  return Math.max(0, unitPrice * Number(item.quantity || 0));
}

export function classifyBomItemPhase(item: BomItem, materials: Material[]): Exclude<RoadmapPhaseId, "planning" | "handover"> {
  const material = materialFor(item, materials);
  const text = searchableText(item, material);
  for (const phase of ["foundation", "weatherproofing", "mep", "structure", "interior"] as const) {
    if (PHASE_KEYWORDS[phase].some((keyword) => text.includes(keyword))) return phase;
  }
  return "interior";
}

export function inferRoadmapProjectType(input: BuildRenovationRoadmapInput): RoadmapProjectType {
  if (input.projectType) return input.projectType;
  const haystack = [
    input.projectName,
    input.projectDescription,
    input.buildingInfo?.type,
    ...input.bom.map((item) => searchableText(item, materialFor(item, input.materials))),
  ].map(localizedLower).join(" ");

  if (input.addedAreaM2 && input.addedAreaM2 > 0) return "extension";
  if (haystack.includes("sauna")) return "sauna";
  if (haystack.includes("garage") || haystack.includes("autotalli")) return "garage";
  if (haystack.includes("foundation") || haystack.includes("perustus")) return "extension";
  if (haystack.includes("roof") || haystack.includes("katto")) return "roof";
  if (haystack.includes("facade") || haystack.includes("julkisivu")) return "facade";
  if (haystack.includes("insulation") || haystack.includes("eriste") || haystack.includes("heating") || haystack.includes("lämpö")) return "energy";
  if (haystack.includes("deck") || haystack.includes("terrace") || haystack.includes("terassi")) return "yard";
  return "interior";
}

function permitCategoryFor(projectType: RoadmapProjectType): PermitCategoryId {
  switch (projectType) {
    case "extension":
    case "garage":
    case "sauna":
      return "extension";
    case "roof":
      return "roof";
    case "energy":
      return "energy_system";
    case "facade":
      return "facade";
    case "yard":
      return "yard_structure";
    default:
      return "interior_surface";
  }
}

function permitAnswersFor(projectType: RoadmapProjectType, addedAreaM2?: number): PermitAnswers {
  if (projectType === "extension" || projectType === "garage" || projectType === "sauna") {
    return {
      addsFloorArea: projectType === "extension" || projectType === "garage" || (addedAreaM2 ?? 0) > 20,
      changesExterior: true,
      detachedHouse: true,
    };
  }
  if (projectType === "roof") return { roofShapeOrMaterial: true, changesExterior: true, detachedHouse: true };
  if (projectType === "facade") return { facadeMaterialOrInsulation: true, changesExterior: true, detachedHouse: true };
  if (projectType === "energy") return { changesExterior: true };
  if (projectType === "yard") return { largeStructure: (addedAreaM2 ?? 0) > 20, changesExterior: true };
  return { detachedHouse: true };
}

function phaseDuration(phaseId: RoadmapPhaseId, itemCount: number, totalCost: number, permitAssessment: PermitAssessment): number {
  const costScale = totalCost > 50000 ? 2 : totalCost > 20000 ? 1 : 0;
  const itemScale = itemCount > 10 ? 1 : 0;
  switch (phaseId) {
    case "planning":
      return permitAssessment.outcome === "building_permit" ? 4 : permitAssessment.outcome === "no_permit_likely" ? 2 : 3;
    case "foundation":
      return Math.max(1, Math.min(3, itemCount > 0 ? 1 + costScale : 1));
    case "structure":
      return Math.max(2, Math.min(7, 2 + itemScale + costScale));
    case "weatherproofing":
      return Math.max(1, Math.min(4, 1 + itemScale + costScale));
    case "mep":
      return Math.max(1, Math.min(4, itemCount > 0 ? 2 + itemScale : 1));
    case "interior":
      return Math.max(2, Math.min(7, 3 + itemScale + costScale));
    case "handover":
      return permitAssessment.outcome === "building_permit" ? 2 : 1;
  }
}

function checklistFor(permitAssessment: PermitAssessment, projectType: RoadmapProjectType): RoadmapChecklistItem[] {
  const permitLikely = permitAssessment.outcome === "building_permit";
  const authorityReview = permitAssessment.outcome === "action_or_review" || permitAssessment.outcome === "authority_check";
  const energyScope = projectType === "energy" || projectType === "facade" || projectType === "roof" || projectType === "extension";
  return [
    {
      id: "permit",
      label: { fi: "Rakentamislupa / rakennuslupa", en: "Construction / building permit" },
      required: permitLikely,
      owner: { fi: "Omistaja ja pääsuunnittelija", en: "Owner and principal designer" },
      timing: { fi: "Varmista ennen hankintoja; jätä hakemus ennen töiden aloitusta.", en: "Confirm before procurement; submit before work starts." },
      cost: permitAssessment.costEstimate,
    },
    {
      id: "municipal-check",
      label: { fi: "Kunnan rakennusvalvonnan tarkistus", en: "Municipal building-control check" },
      required: authorityReview,
      owner: { fi: "Omistaja", en: "Owner" },
      timing: { fi: "Soita tai tee Lupapiste-kysely suunnitteluvaiheessa.", en: "Call or ask via Lupapiste during planning." },
      cost: { fi: "Usein maksuton kysely, mahdollinen lupamaksu jos hanke laajenee.", en: "Often free as an inquiry; permit fee may apply if scope expands." },
    },
    {
      id: "start-notice",
      label: { fi: "Aloitusilmoitus ja vastuuhenkilöt", en: "Start notice and responsible persons" },
      required: permitLikely,
      owner: { fi: "Omistaja / vastaava työnjohtaja", en: "Owner / responsible site manager" },
      timing: { fi: "Kun lupa on lainvoimainen ja urakoitsijat valittu.", en: "After permit is valid and contractors are selected." },
      cost: { fi: "Sisältyy yleensä lupa- ja valvontaprosessiin.", en: "Usually part of permit and inspection process." },
    },
    {
      id: "energy-docs",
      label: { fi: "Energia- ja vaippatiedot", en: "Energy and envelope documentation" },
      required: energyScope,
      owner: { fi: "Suunnittelija / energia-asiantuntija", en: "Designer / energy specialist" },
      timing: { fi: "Ennen ulkovaipan tai lämmityksen muutoksia.", en: "Before envelope or heating-system changes." },
      cost: { fi: "Riippuu laskelmista ja asiantuntijatarpeesta.", en: "Depends on calculations and specialist need." },
    },
    {
      id: "inspections",
      label: { fi: "Perustus-, rakenne- ja lopputarkastukset", en: "Foundation, structural, and final inspections" },
      required: permitLikely || authorityReview,
      owner: { fi: "Vastaava työnjohtaja / kunta", en: "Responsible site manager / municipality" },
      timing: { fi: "Sovi ennen kuin työvaihe peittyy.", en: "Book before the work stage is covered." },
      cost: { fi: "Kunnan hinnaston ja valvontatarpeen mukaan.", en: "According to municipal fee list and inspection scope." },
    },
  ];
}

function isPhaseRelevant(
  phaseId: RoadmapPhaseId,
  projectType: RoadmapProjectType,
  grouped: Map<RoadmapPhaseId, RoadmapBomItem[]>,
): boolean {
  if (phaseId === "planning" || phaseId === "handover") return true;
  if ((grouped.get(phaseId)?.length ?? 0) > 0) return true;

  switch (projectType) {
    case "extension":
    case "garage":
    case "sauna":
      return true;
    case "roof":
      return phaseId === "structure" || phaseId === "weatherproofing";
    case "facade":
      return phaseId === "weatherproofing";
    case "energy":
      return phaseId === "weatherproofing" || phaseId === "mep";
    case "yard":
      return phaseId === "foundation" || phaseId === "structure";
    case "interior":
      return phaseId === "interior";
  }
}

export function buildRenovationRoadmap(input: BuildRenovationRoadmapInput): RenovationRoadmap {
  const projectType = inferRoadmapProjectType(input);
  const permitAssessment = assessPermitNeed({
    categoryId: permitCategoryFor(projectType),
    answers: permitAnswersFor(projectType, input.addedAreaM2),
    buildingInfo: input.buildingInfo,
  });

  const grouped = new Map<RoadmapPhaseId, RoadmapBomItem[]>();
  let totalCost = 0;
  for (const item of input.bom) {
    const material = materialFor(item, input.materials);
    const phaseId = classifyBomItemPhase(item, input.materials);
    const estimatedCost = estimateBomLineCost(item, material);
    totalCost += estimatedCost;
    const list = grouped.get(phaseId) ?? [];
    list.push({
      materialId: item.material_id,
      name: item.material_name || material?.name_fi || material?.name || item.material_id,
      quantity: Number(item.quantity || 0),
      unit: item.unit,
      estimatedCost,
    });
    grouped.set(phaseId, list);
  }

  let cursor = 0;
  const phaseIds = PHASE_ORDER.filter((phaseId) => isPhaseRelevant(phaseId, projectType, grouped));
  const phases: RoadmapPhase[] = phaseIds.map((phaseId) => {
    const items = grouped.get(phaseId) ?? [];
    const estimatedCost = items.reduce((sum, item) => sum + item.estimatedCost, 0);
    const startWeek = phaseId === "mep" ? Math.max(0, cursor - 1) : cursor;
    const durationWeeks = phaseDuration(phaseId, items.length, estimatedCost || totalCost, permitAssessment);
    cursor = Math.max(cursor, startWeek + durationWeeks);
    return {
      ...PHASE_COPY[phaseId],
      startWeek,
      durationWeeks,
      items,
      estimatedCost,
    };
  });

  const totalWeeks = Math.max(...phases.map((phase) => phase.startWeek + phase.durationWeeks));
  return {
    projectType,
    permitAssessment,
    totalWeeks,
    totalCost,
    phases,
    checklist: checklistFor(permitAssessment, projectType),
    assumptions: [
      { fi: "Aikataulu on karkea omakotitalon remonttijärjestys, ei urakkasopimus.", en: "Timeline is a rough detached-house renovation sequence, not a contract schedule." },
      { fi: "Lupatulkinta on alustava; kunnan rakennusvalvonta tekee päätöksen.", en: "Permit assessment is preliminary; municipal building control decides." },
      { fi: "BOM-rivit ryhmitellään materiaalin nimen, kategorian ja tagien perusteella.", en: "BOM rows are grouped from material name, category, and tags." },
    ],
  };
}

export function formatRoadmapHandoff(roadmap: RenovationRoadmap, locale: "fi" | "en" = "en"): string {
  const text = (value: LocalizedText) => value[locale] ?? value.en;
  const lines = [
    locale === "fi" ? "Helscoop remontin toteutussuunnitelma" : "Helscoop renovation execution roadmap",
    `${locale === "fi" ? "Kesto" : "Duration"}: ${roadmap.totalWeeks} ${locale === "fi" ? "viikkoa" : "weeks"}`,
    `${locale === "fi" ? "Lupa-arvio" : "Permit estimate"}: ${text(roadmap.permitAssessment.permitType)}`,
    "",
    locale === "fi" ? "Vaiheet" : "Phases",
  ];

  for (const phase of roadmap.phases) {
    lines.push(`- ${text(phase.title)}: ${phase.startWeek}-${phase.startWeek + phase.durationWeeks} wk, ${text(phase.contractorType)}, ${phase.items.length} BOM rows`);
  }

  lines.push("", locale === "fi" ? "Lupa- ja tarkistuslista" : "Permit and inspection checklist");
  for (const item of roadmap.checklist) {
    lines.push(`- [${item.required ? "!" : " "}] ${text(item.label)} - ${text(item.owner)} - ${text(item.timing)}`);
  }

  return lines.join("\n");
}
