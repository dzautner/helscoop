import type { BomItem, BuildingInfo, Material } from "@/types";

export type EuGrantApplicantType =
  | "private_owner"
  | "housing_company"
  | "energy_community"
  | "company_or_municipality";

export type EuGrantBuildingType = "omakotitalo" | "rivitalo" | "kerrostalo" | "non_residential" | "unknown";
export type EuGrantProjectStage = "planning" | "ordered_or_started";
export type EuGrantScope = "heating" | "insulation" | "windows" | "solar" | "smart_controls" | "storage" | "ev_charging";
export type EuGrantStatus = "eligible" | "maybe" | "not_eligible" | "info";

export interface EuEnergyGrantAnswers {
  applicantType: EuGrantApplicantType;
  buildingType: EuGrantBuildingType;
  buildingYear: number | null;
  scopes: EuGrantScope[];
  location: string;
  stage: EuGrantProjectStage;
}

export interface EuEnergyGrantProgramResult {
  id: "business_finland_energy_aid" | "eu_energy_communities_facility" | "motiva_energy_advice";
  name: string;
  status: EuGrantStatus;
  amountMax: number | null;
  amountDescription: string;
  applicationWindow: string;
  deadline: string | null;
  sourceUrl: string;
  applicationUrl: string;
  reasons: string[];
  blockers: string[];
  nextSteps: string[];
}

export interface EuEnergyGrantPrecheck {
  answers: EuEnergyGrantAnswers;
  programs: EuEnergyGrantProgramResult[];
  totalPotentialAmount: number;
  bestProgram: EuEnergyGrantProgramResult | null;
  fundingBadge: {
    show: boolean;
    label: string;
    amount: number;
  };
  sourceCheckedAt: string;
  disclaimer: string;
}

export interface BuildEuEnergyGrantPrecheckInput {
  bom?: BomItem[];
  materials?: Material[];
  buildingInfo?: BuildingInfo | null;
  totalCost?: number;
  answers?: Partial<EuEnergyGrantAnswers>;
}

export const EU_ENERGY_GRANT_SOURCES = {
  sourceCheckedAt: "2026-04-23",
  businessFinlandEnergyAid: "https://www.businessfinland.fi/en/for-finnish-customers/services/funding/energy-aid",
  energyCommunitiesFacility: "https://energycommunitiesfacility.eu/apply/applicationprocess",
  energyCommunitiesInfoSession: "https://citizen-led-renovation.ec.europa.eu/events/info-session-apply-eu45000-grant-your-energy-community-2026-05-06_en",
  motivaEnergyAdvice: "https://www.motiva.fi/energianeuvonta/",
} as const;

const SCOPE_PATTERNS: Array<{ scope: EuGrantScope; patterns: RegExp[] }> = [
  { scope: "heating", patterns: [/heat[\s_-]?pump/i, /l(?:a|ä)mp(?:o|ö)/i, /heating/i, /kaukol/i, /maal/i] },
  { scope: "insulation", patterns: [/insulation/i, /eristys/i, /villa/i] },
  { scope: "windows", patterns: [/window/i, /ikkuna/i, /glazing/i] },
  { scope: "solar", patterns: [/solar/i, /aurinko/i, /pv\b/i, /photovoltaic/i] },
  { scope: "smart_controls", patterns: [/smart/i, /control/i, /automation/i, /ohjaus/i, /sensor/i] },
  { scope: "storage", patterns: [/battery/i, /storage/i, /akku/i, /varasto/i] },
  { scope: "ev_charging", patterns: [/ev[\s_-]?charg/i, /charging/i, /lataus/i] },
];

const COMMUNITY_SCOPES = new Set<EuGrantScope>(["solar", "smart_controls", "storage", "ev_charging"]);
const BUSINESS_FINLAND_SCOPES = new Set<EuGrantScope>(["heating", "smart_controls", "storage"]);
const RESIDENTIAL_BUILDINGS = new Set<EuGrantBuildingType>(["omakotitalo", "rivitalo", "kerrostalo"]);

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function textFromBom(bom: BomItem[] = [], materials: Material[] = []): string {
  const materialById = new Map(materials.map((material) => [material.id, material]));
  return bom.flatMap((item) => {
    const material = materialById.get(item.material_id);
    return [
      item.material_id,
      item.material_name,
      item.category_name,
      material?.name,
      material?.name_fi,
      material?.name_en,
      material?.category_name,
      material?.category_name_fi,
      ...(material?.tags ?? []),
    ];
  }).filter(Boolean).join(" ");
}

export function inferEuGrantScopes(bom: BomItem[] = [], materials: Material[] = []): EuGrantScope[] {
  const haystack = textFromBom(bom, materials);
  const scopes = SCOPE_PATTERNS
    .filter((candidate) => candidate.patterns.some((pattern) => pattern.test(haystack)))
    .map((candidate) => candidate.scope);
  return unique(scopes);
}

export function normalizeEuGrantBuildingType(buildingInfo?: BuildingInfo | null): EuGrantBuildingType {
  const raw = (buildingInfo?.type ?? "").toLowerCase();
  if (raw.includes("omakoti") || raw.includes("detached")) return "omakotitalo";
  if (raw.includes("rivi") || raw.includes("row") || raw.includes("pari") || raw.includes("semi")) return "rivitalo";
  if (raw.includes("kerros") || raw.includes("apartment") || Number(buildingInfo?.units ?? 0) > 2) return "kerrostalo";
  if (raw.includes("office") || raw.includes("industrial") || raw.includes("commercial")) return "non_residential";
  return "unknown";
}

export function inferEuGrantApplicantType(buildingInfo?: BuildingInfo | null): EuGrantApplicantType {
  const type = normalizeEuGrantBuildingType(buildingInfo);
  if (type === "kerrostalo" || Number(buildingInfo?.units ?? 0) > 2) return "housing_company";
  return "private_owner";
}

function defaultAnswers(input: BuildEuEnergyGrantPrecheckInput): EuEnergyGrantAnswers {
  const buildingType = normalizeEuGrantBuildingType(input.buildingInfo);
  const inferredScopes = inferEuGrantScopes(input.bom, input.materials);
  return {
    applicantType: inferEuGrantApplicantType(input.buildingInfo),
    buildingType,
    buildingYear: input.buildingInfo?.year_built ?? null,
    location: input.buildingInfo?.address?.split(",").at(-1)?.trim() || "Finland",
    stage: "planning",
    ...input.answers,
    scopes: input.answers?.scopes ?? inferredScopes,
  };
}

function hasAnyScope(answers: EuEnergyGrantAnswers, wanted: Set<EuGrantScope>): boolean {
  return answers.scopes.some((scope) => wanted.has(scope));
}

function businessFinlandProgram(answers: EuEnergyGrantAnswers, totalCost: number): EuEnergyGrantProgramResult {
  const blockers: string[] = [];
  const reasons: string[] = [];
  const nextSteps = [
    "Use only for non-residential company, municipality, or organization projects.",
    "Do not order work before a funding decision.",
    "Confirm current terms from Business Finland before promising aid.",
  ];

  if (answers.stage === "ordered_or_started") {
    blockers.push("Project has already been ordered or started; Business Finland Energy Aid requires applying before project start.");
  }

  if (answers.applicantType !== "company_or_municipality") {
    blockers.push("Current Business Finland Energy Aid instructions exclude housing associations and residential properties.");
  }

  if (RESIDENTIAL_BUILDINGS.has(answers.buildingType)) {
    blockers.push("Residential property scope is excluded by the current Business Finland Energy Aid page.");
  }

  if (!hasAnyScope(answers, BUSINESS_FINLAND_SCOPES)) {
    blockers.push("Scope does not show new technology, large heat pump, storage, smart controls, or equivalent energy-efficiency technology.");
  } else {
    reasons.push("Scope includes technology that can be relevant for non-residential Energy Aid screening.");
  }

  if (totalCost > 0 && totalCost < 10000) {
    blockers.push("Energy-efficiency investment size is below the 10,000 EUR minimum described by Business Finland.");
  }

  const status: EuGrantStatus = blockers.length === 0 ? "maybe" : "not_eligible";
  const amountMax = status === "maybe" && totalCost > 0 ? Math.round(totalCost * 0.3) : null;

  return {
    id: "business_finland_energy_aid",
    name: "Business Finland Energy Aid",
    status,
    amountMax,
    amountDescription: amountMax
      ? `Planning estimate up to ${amountMax} EUR; official aid intensity is project-specific.`
      : "Residential and housing-company projects are currently blocked by official Energy Aid exclusions.",
    applicationWindow: "Continuous call",
    deadline: null,
    sourceUrl: EU_ENERGY_GRANT_SOURCES.businessFinlandEnergyAid,
    applicationUrl: EU_ENERGY_GRANT_SOURCES.businessFinlandEnergyAid,
    reasons,
    blockers,
    nextSteps,
  };
}

function energyCommunitiesProgram(answers: EuEnergyGrantAnswers): EuEnergyGrantProgramResult {
  const blockers: string[] = [];
  const reasons: string[] = [];
  const communityApplicant = answers.applicantType === "energy_community" || answers.applicantType === "housing_company";

  if (!communityApplicant) {
    blockers.push("The EU Energy Communities Facility is for emerging energy communities, not a single private homeowner acting alone.");
  } else {
    reasons.push("Applicant can plausibly organize as a housing-company or energy-community project.");
  }

  if (!hasAnyScope(answers, COMMUNITY_SCOPES)) {
    blockers.push("Scope should include a community energy project such as shared solar, energy storage, EV charging, or demand-response controls.");
  } else {
    reasons.push("Scope includes a community-energy signal.");
  }

  if (answers.stage === "ordered_or_started") {
    blockers.push("Use the Facility for business-plan development before implementation, not after the project is already committed.");
  }

  const status: EuGrantStatus = blockers.length === 0 ? "maybe" : "not_eligible";

  return {
    id: "eu_energy_communities_facility",
    name: "EU Energy Communities Facility",
    status,
    amountMax: status === "maybe" ? 45000 : null,
    amountDescription: "Lump-sum grant up to 45,000 EUR for developing a community energy business plan.",
    applicationWindow: "Second call opens 5 May 2026 and runs until 5 July 2026.",
    deadline: "2026-07-05",
    sourceUrl: EU_ENERGY_GRANT_SOURCES.energyCommunitiesFacility,
    applicationUrl: EU_ENERGY_GRANT_SOURCES.energyCommunitiesFacility,
    reasons,
    blockers,
    nextSteps: [
      "Run the official eligibility self-check when the call opens.",
      "Prepare energy-community governance, member list, and business-plan scope.",
      "Attend the 6 May 2026 information session or the Finnish national session when published.",
    ],
  };
}

function motivaProgram(): EuEnergyGrantProgramResult {
  return {
    id: "motiva_energy_advice",
    name: "Motiva energy advice",
    status: "info",
    amountMax: null,
    amountDescription: "Free impartial energy advice; not a cash grant.",
    applicationWindow: "Available nationally",
    deadline: null,
    sourceUrl: EU_ENERGY_GRANT_SOURCES.motivaEnergyAdvice,
    applicationUrl: EU_ENERGY_GRANT_SOURCES.motivaEnergyAdvice,
    reasons: ["Motiva energy advice covers consumers, housing companies, municipalities, and SMEs."],
    blockers: [],
    nextSteps: [
      "Use Motiva to validate grant options and local energy adviser contacts before applying.",
      "Ask specifically about energy community, solar, and housing-company renovation support paths.",
    ],
  };
}

export function buildEuEnergyGrantPrecheck(input: BuildEuEnergyGrantPrecheckInput): EuEnergyGrantPrecheck {
  const answers = defaultAnswers(input);
  const totalCost = Math.max(0, Number(input.totalCost ?? 0));
  const programs = [
    businessFinlandProgram(answers, totalCost),
    energyCommunitiesProgram(answers),
    motivaProgram(),
  ];
  const potentialPrograms = programs.filter((program) => program.status === "eligible" || program.status === "maybe");
  const totalPotentialAmount = potentialPrograms.reduce((sum, program) => sum + (program.amountMax ?? 0), 0);
  const bestProgram = potentialPrograms
    .filter((program) => (program.amountMax ?? 0) > 0)
    .sort((a, b) => (b.amountMax ?? 0) - (a.amountMax ?? 0))[0] ?? null;

  return {
    answers,
    programs,
    totalPotentialAmount,
    bestProgram,
    fundingBadge: {
      show: totalPotentialAmount > 0,
      label: bestProgram ? "Funding available" : "Grant advice available",
      amount: totalPotentialAmount,
    },
    sourceCheckedAt: EU_ENERGY_GRANT_SOURCES.sourceCheckedAt,
    disclaimer:
      "Preliminary funding screen only. Verify eligibility, deadlines, de minimis/state-aid limits, and required attachments from official sources before making customer promises.",
  };
}
