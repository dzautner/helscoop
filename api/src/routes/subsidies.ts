import { Router } from "express";
import { requireAuth } from "../auth";

const router = Router();

type HeatingType =
  | "oil"
  | "natural_gas"
  | "direct_electric"
  | "district_heat"
  | "ground_source_heat_pump"
  | "air_water_heat_pump"
  | "wood"
  | "other_non_fossil"
  | "fossil"
  | "unknown";

type BuildingType = "omakotitalo" | "paritalo" | "rivitalo" | "kerrostalo" | "other" | "unknown";
type ApplicantAgeGroup = "under_65" | "65_plus" | "unknown";
type HeatingSystemCondition = "ok" | "broken_or_end_of_life" | "hard_to_maintain" | "unknown";
type SubsidyStatus = "eligible" | "maybe" | "not_eligible";

interface EnergySubsidyRequest {
  totalCost?: number;
  currentHeating?: HeatingType;
  targetHeating?: HeatingType;
  buildingType?: BuildingType;
  buildingYear?: number | null;
  yearRoundResidential?: boolean;
  applicantAgeGroup?: ApplicantAgeGroup;
  applicantDisabled?: boolean;
  heatingSystemCondition?: HeatingSystemCondition;
}

interface SubsidyProgramEstimate {
  program: "ely_oil_gas_heating" | "ara_repair_elderly_disabled";
  name: string;
  status: SubsidyStatus;
  amount: number;
  netCost: number;
  reasons: string[];
  warnings: string[];
  applicationDeadline?: string;
  applicationDeadlineAt?: string;
  completionDeadline?: string;
  deadline?: string;
  paymentDeadline?: string;
  applicationUrl: string;
  sourceUrl: string;
}

interface EnergySubsidyResponse {
  totalCost: number;
  bestAmount: number;
  netCost: number;
  applicationDeadline: string;
  applicationDeadlineAt: string;
  daysUntilApplicationDeadline: number;
  completionDeadline: string;
  daysUntilCompletionDeadline: number;
  deadline: string;
  daysUntilDeadline: number;
  generatedAt: string;
  programs: SubsidyProgramEstimate[];
  disclaimer: string;
}

export const OIL_GAS_HEATING_GRANT_CONFIG = {
  cycle: "2026",
  sourceCheckedAt: "2026-04-21",
  oilSourceUrl: "https://elinvoimakeskus.fi/avustus-asuinrakennuksen-oljylammityksesta-luopumiseksi",
  gasSourceUrl: "https://elinvoimakeskus.fi/kaasulammityksen-vaihtajalle",
  applicationUrl: "https://sahkoinenasiointi.ahtp.fi/fi/palvelut",
  araSourceUrl: "https://avustusohjeet.ara.fi/fi/korjausavustus/v6/korjausavustus-iakkaiden-ja-vammaisten-henkiloiden",
  applicationDeadline: "2026-05-25",
  applicationDeadlineAt: "2026-05-25T16:15:00+03:00",
  completionDeadline: "2026-08-31",
  paymentDeadline: "2026-09-30",
  highSupportAmount: 4000,
  otherSupportAmount: 2500,
} as const;

const HIGH_SUPPORT_TARGETS = new Set<HeatingType>([
  "district_heat",
  "ground_source_heat_pump",
  "air_water_heat_pump",
]);

const FOSSIL_SOURCE_HEATING = new Set<HeatingType>(["oil", "natural_gas"]);
const SMALL_HOUSE_TYPES = new Set<BuildingType>(["omakotitalo", "paritalo"]);
const NON_FOSSIL_TARGETS = new Set<HeatingType>([
  "district_heat",
  "ground_source_heat_pump",
  "air_water_heat_pump",
  "direct_electric",
  "wood",
  "other_non_fossil",
]);

function normalizeEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

function daysUntilDate(date: string, now = new Date()): number {
  const target = new Date(`${date}T23:59:59+03:00`);
  const ms = target.getTime() - now.getTime();
  const days = ms / (24 * 60 * 60 * 1000);
  return ms < 0 ? Math.floor(days) : Math.ceil(days);
}

function daysUntilDateTime(dateTime: string, now = new Date()): number {
  const target = new Date(dateTime);
  const ms = target.getTime() - now.getTime();
  const days = ms / (24 * 60 * 60 * 1000);
  return ms < 0 ? Math.floor(days) : Math.ceil(days);
}

export function estimateEnergySubsidy(input: EnergySubsidyRequest, now = new Date()): EnergySubsidyResponse {
  const grantConfig = OIL_GAS_HEATING_GRANT_CONFIG;
  const totalCost = Math.max(0, Number(input.totalCost ?? 0));
  const currentHeating = normalizeEnum<HeatingType>(
    input.currentHeating,
    ["oil", "natural_gas", "direct_electric", "district_heat", "ground_source_heat_pump", "air_water_heat_pump", "wood", "other_non_fossil", "fossil", "unknown"],
    "unknown",
  );
  const targetHeating = normalizeEnum<HeatingType>(
    input.targetHeating,
    ["oil", "natural_gas", "direct_electric", "district_heat", "ground_source_heat_pump", "air_water_heat_pump", "wood", "other_non_fossil", "fossil", "unknown"],
    "unknown",
  );
  const buildingType = normalizeEnum<BuildingType>(
    input.buildingType,
    ["omakotitalo", "paritalo", "rivitalo", "kerrostalo", "other", "unknown"],
    "unknown",
  );
  const applicantAgeGroup = normalizeEnum<ApplicantAgeGroup>(
    input.applicantAgeGroup,
    ["under_65", "65_plus", "unknown"],
    "unknown",
  );
  const heatingSystemCondition = normalizeEnum<HeatingSystemCondition>(
    input.heatingSystemCondition,
    ["ok", "broken_or_end_of_life", "hard_to_maintain", "unknown"],
    "unknown",
  );
  const yearRoundResidential = input.yearRoundResidential === true;
  const applicantDisabled = input.applicantDisabled === true;
  const daysUntilApplicationDeadline = daysUntilDateTime(grantConfig.applicationDeadlineAt, now);
  const daysUntilCompletionDeadline = daysUntilDate(grantConfig.completionDeadline, now);

  const elyReasons: string[] = [];
  const elyWarnings: string[] = [
    "ELY support, ARA/Varke repair support, and household deduction cannot be claimed for the same heating replacement work.",
  ];
  let elyStatus: SubsidyStatus = "eligible";
  let elyAmount = 0;

  if (daysUntilApplicationDeadline < 0) {
    elyStatus = "not_eligible";
    elyWarnings.push("ELY application deadline has passed.");
  } else if (daysUntilApplicationDeadline <= 45) {
    elyWarnings.push("ELY application window closes soon; submit before 25 May 2026 at 16:15.");
  }

  if (!FOSSIL_SOURCE_HEATING.has(currentHeating)) {
    elyStatus = "not_eligible";
    elyReasons.push("Current heating must be oil or natural gas.");
  } else {
    elyReasons.push("Current heating is fossil oil or natural gas.");
  }

  if (!SMALL_HOUSE_TYPES.has(buildingType)) {
    elyStatus = "not_eligible";
    elyReasons.push("ELY support is for detached or semi-detached small houses.");
  } else {
    elyReasons.push("Building type is within the small-house scope.");
  }

  if (!yearRoundResidential) {
    elyStatus = "not_eligible";
    elyReasons.push("Building must be in year-round residential use.");
  }

  if (HIGH_SUPPORT_TARGETS.has(targetHeating)) {
    elyAmount = grantConfig.highSupportAmount;
    elyReasons.push("Target heating qualifies for the 4,000 EUR fixed grant.");
  } else if (NON_FOSSIL_TARGETS.has(targetHeating)) {
    elyAmount = grantConfig.otherSupportAmount;
    elyReasons.push("Target heating is non-fossil and qualifies for the 2,500 EUR fixed grant.");
  } else {
    elyStatus = "not_eligible";
    elyReasons.push("Target heating must be a non-fossil heating system.");
  }

  if (daysUntilCompletionDeadline < 0) {
    elyStatus = "not_eligible";
    elyWarnings.push("ELY completion deadline has passed.");
  }

  if (input.buildingYear == null) {
    elyWarnings.push("Building year is unknown; this does not block ELY support but should be checked in the application.");
  }

  const effectiveElyAmount = elyStatus === "eligible" ? elyAmount : 0;
  const araReasons: string[] = [];
  const araWarnings = [
    "ARA/Varke repair support cannot be combined with ELY support or household deduction for the same work.",
    "ARA/Varke repair support is discretionary and requires official review; Helscoop does not deduct it from net cost.",
  ];
  let araStatus: SubsidyStatus = "not_eligible";

  if (applicantAgeGroup === "65_plus" || applicantDisabled) {
    araReasons.push("Applicant may fit the elderly or disabled-person repair grant group.");
    if (heatingSystemCondition === "broken_or_end_of_life" || heatingSystemCondition === "hard_to_maintain") {
      araStatus = "maybe";
      araReasons.push("Heating renovation may be considered when the system is broken, end-of-life, or too hard to maintain.");
    } else {
      araReasons.push("Heating system condition must justify why repair is necessary for living at home.");
    }
  } else {
    araReasons.push("ARA/Varke repair grant path generally requires an elderly or disabled applicant.");
  }

  const programs: SubsidyProgramEstimate[] = [
    {
      program: "ely_oil_gas_heating",
      name: "ELY oil/natural gas heating replacement grant",
      status: elyStatus,
      amount: effectiveElyAmount,
      netCost: Math.max(0, totalCost - effectiveElyAmount),
      reasons: elyReasons,
      warnings: elyWarnings,
      applicationDeadline: grantConfig.applicationDeadline,
      applicationDeadlineAt: grantConfig.applicationDeadlineAt,
      completionDeadline: grantConfig.completionDeadline,
      deadline: grantConfig.applicationDeadline,
      paymentDeadline: grantConfig.paymentDeadline,
      applicationUrl: grantConfig.applicationUrl,
      sourceUrl: currentHeating === "natural_gas" ? grantConfig.gasSourceUrl : grantConfig.oilSourceUrl,
    },
    {
      program: "ara_repair_elderly_disabled",
      name: "ARA/Varke repair grant for elderly or disabled homeowners",
      status: araStatus,
      amount: 0,
      netCost: totalCost,
      reasons: araReasons,
      warnings: araWarnings,
      applicationUrl: grantConfig.araSourceUrl,
      sourceUrl: grantConfig.araSourceUrl,
    },
  ];

  const bestAmount = Math.max(...programs.map((program) => program.amount));
  return {
    totalCost,
    bestAmount,
    netCost: Math.max(0, totalCost - bestAmount),
    applicationDeadline: grantConfig.applicationDeadline,
    applicationDeadlineAt: grantConfig.applicationDeadlineAt,
    daysUntilApplicationDeadline,
    completionDeadline: grantConfig.completionDeadline,
    daysUntilCompletionDeadline,
    deadline: grantConfig.applicationDeadline,
    daysUntilDeadline: daysUntilApplicationDeadline,
    generatedAt: now.toISOString(),
    programs,
    disclaimer: `Preliminary estimate only. Grant config ${grantConfig.cycle}, checked ${grantConfig.sourceCheckedAt}. Confirm eligibility, deadlines, funding availability, and required attachments from official Elinvoimakeskus and ARA/Varke instructions before starting work.`,
  };
}

// POST /subsidies/energy/estimate — static Finnish renovation subsidy rules.
router.post("/energy/estimate", requireAuth, (req, res) => {
  const { totalCost } = req.body as EnergySubsidyRequest;
  if (totalCost !== undefined && (!Number.isFinite(Number(totalCost)) || Number(totalCost) < 0)) {
    return res.status(400).json({ error: "totalCost must be a non-negative number" });
  }

  res.json(estimateEnergySubsidy(req.body as EnergySubsidyRequest));
});

export default router;
