import { calculateHouseholdDeduction, HOUSEHOLD_DEDUCTION_2026, type HouseholdDeductionRow } from "@/lib/household-deduction";
import { buildRenovationRoadmap, type RoadmapPhase, type RoadmapPhaseId } from "@/lib/renovation-roadmap";
import type { BomItem, BuildingInfo, Material } from "@/types";

export interface PhaseSchedule {
  year: number;
  quarter: 1 | 2 | 3 | 4;
  durationQuarters: number;
}

export interface PhasedRenovationPhase {
  id: RoadmapPhaseId;
  title: string;
  materialCost: number;
  labourCost: number;
  grossCost: number;
  schedule: PhaseSchedule;
  seasonalHint: string | null;
  itemCount: number;
}

export interface PhasedRenovationYear {
  year: number;
  phases: PhasedRenovationPhase[];
  materialCost: number;
  labourCost: number;
  grossCost: number;
  credit: number;
  netCost: number;
  utilization: number;
}

export interface PhasedRenovationPlan {
  startYear: number;
  claimantCount: 1 | 2;
  targetLabourPerYear: number;
  allInOneYearCredit: number;
  optimizedSavings: number;
  totalMaterialCost: number;
  totalLabourCost: number;
  totalGrossCost: number;
  totalCredit: number;
  totalNetCost: number;
  phases: PhasedRenovationPhase[];
  years: PhasedRenovationYear[];
  recommendation: string;
}

export interface BuildPhasedRenovationPlanInput {
  bom: BomItem[];
  materials: Material[];
  buildingInfo?: BuildingInfo | null;
  projectName?: string;
  projectDescription?: string;
  startYear?: number;
  coupleMode?: boolean;
  scheduleOverrides?: Record<string, Partial<PhaseSchedule>>;
  locale?: "fi" | "en" | "sv";
}

const LABOUR_MULTIPLIER_BY_PHASE: Record<RoadmapPhaseId, number> = {
  planning: 0.15,
  foundation: 0.75,
  structure: 0.7,
  weatherproofing: 0.55,
  mep: 0.9,
  interior: 0.8,
  handover: 0.1,
};

function roundEuro(value: number): number {
  return Math.round(value);
}

function localeTitle(phase: RoadmapPhase, locale: "fi" | "en" | "sv"): string {
  if (locale === "fi") return phase.title.fi ?? phase.title.en;
  if (locale === "sv") return phase.title.en;
  return phase.title.en;
}

function targetLabourPerYear(coupleMode: boolean): number {
  const claimantCount = coupleMode ? 2 : 1;
  const maxCredit = HOUSEHOLD_DEDUCTION_2026.maxCreditPerClaimant * claimantCount;
  const threshold = HOUSEHOLD_DEDUCTION_2026.annualThresholdPerClaimant * claimantCount;
  return (maxCredit + threshold) / HOUSEHOLD_DEDUCTION_2026.companyWorkRate;
}

function clampQuarter(value: unknown): 1 | 2 | 3 | 4 {
  const quarter = Number(value);
  if (quarter === 1 || quarter === 2 || quarter === 3 || quarter === 4) return quarter;
  return 1;
}

function durationQuarters(phase: RoadmapPhase): number {
  return Math.max(1, Math.min(4, Math.ceil(phase.durationWeeks / 13)));
}

function seasonalHint(phaseId: RoadmapPhaseId, quarter: number, locale: "fi" | "en" | "sv"): string | null {
  if (quarter === 1 || quarter === 4) {
    if (phaseId === "interior" || phaseId === "mep") {
      return locale === "fi"
        ? "Talvikausi voi helpottaa urakoitsijan saatavuutta."
        : "Winter timing may improve contractor availability.";
    }
  }
  if (phaseId === "weatherproofing" && (quarter === 1 || quarter === 4)) {
    return locale === "fi"
      ? "Sääriippuvainen vaihe: pyri kevät-kesäkauteen, jos mahdollista."
      : "Weather-sensitive phase: prefer spring-summer if possible.";
  }
  return null;
}

function deductionFor(materialCost: number, labourCost: number, coupleMode: boolean) {
  const rows: HouseholdDeductionRow[] = [
    { type: "material", label: "Materials", amount: materialCost },
    { type: "labour", label: "Labour", amount: labourCost },
  ];
  return calculateHouseholdDeduction(rows, { coupleMode });
}

export function buildPhasedRenovationPlan(input: BuildPhasedRenovationPlanInput): PhasedRenovationPlan {
  const locale = input.locale ?? "en";
  const startYear = input.startYear ?? new Date().getFullYear();
  const roadmap = buildRenovationRoadmap({
    bom: input.bom,
    materials: input.materials,
    buildingInfo: input.buildingInfo,
    projectName: input.projectName,
    projectDescription: input.projectDescription,
  });
  const coupleMode = Boolean(input.coupleMode);
  const labourTarget = targetLabourPerYear(coupleMode);
  const claimantCount: 1 | 2 = coupleMode ? 2 : 1;
  let currentYear = startYear;
  let currentQuarter: 1 | 2 | 3 | 4 = 1;
  let labourThisYear = 0;

  const phases: PhasedRenovationPhase[] = roadmap.phases
    .filter((phase) => phase.estimatedCost > 0 || phase.id === "planning" || phase.id === "handover")
    .map((phase) => {
      const materialCost = roundEuro(Math.max(0, phase.estimatedCost));
      const labourCost = roundEuro(materialCost * LABOUR_MULTIPLIER_BY_PHASE[phase.id]);
      if (labourThisYear > 0 && labourCost > 0 && labourThisYear + labourCost > labourTarget * 1.05) {
        currentYear += 1;
        currentQuarter = 1;
        labourThisYear = 0;
      }

      const override = input.scheduleOverrides?.[phase.id];
      const schedule: PhaseSchedule = {
        year: Number.isFinite(Number(override?.year)) ? Number(override?.year) : currentYear,
        quarter: clampQuarter(override?.quarter ?? currentQuarter),
        durationQuarters: Math.max(1, Math.min(4, Number(override?.durationQuarters) || durationQuarters(phase))),
      };

      if (!override) {
        labourThisYear += labourCost;
        const nextQuarter = currentQuarter + schedule.durationQuarters;
        currentQuarter = nextQuarter > 4 ? 1 : (nextQuarter as 1 | 2 | 3 | 4);
        if (nextQuarter > 4) {
          currentYear += 1;
          labourThisYear = 0;
        }
      }

      return {
        id: phase.id,
        title: localeTitle(phase, locale),
        materialCost,
        labourCost,
        grossCost: materialCost + labourCost,
        schedule,
        seasonalHint: seasonalHint(phase.id, schedule.quarter, locale),
        itemCount: phase.items.length,
      };
    });

  const yearMap = new Map<number, PhasedRenovationPhase[]>();
  for (const phase of phases) {
    const list = yearMap.get(phase.schedule.year) ?? [];
    list.push(phase);
    yearMap.set(phase.schedule.year, list);
  }

  const years: PhasedRenovationYear[] = Array.from(yearMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, yearPhases]) => {
      const materialCost = yearPhases.reduce((sum, phase) => sum + phase.materialCost, 0);
      const labourCost = yearPhases.reduce((sum, phase) => sum + phase.labourCost, 0);
      const grossCost = materialCost + labourCost;
      const deduction = deductionFor(materialCost, labourCost, coupleMode);
      return {
        year,
        phases: yearPhases.sort((a, b) => a.schedule.quarter - b.schedule.quarter),
        materialCost,
        labourCost,
        grossCost,
        credit: deduction.credit,
        netCost: deduction.netCost,
        utilization: deduction.maxCredit > 0 ? deduction.credit / deduction.maxCredit : 0,
      };
    });

  const totalMaterialCost = years.reduce((sum, year) => sum + year.materialCost, 0);
  const totalLabourCost = years.reduce((sum, year) => sum + year.labourCost, 0);
  const totalGrossCost = totalMaterialCost + totalLabourCost;
  const totalCredit = years.reduce((sum, year) => sum + year.credit, 0);
  const allInOneYearCredit = deductionFor(totalMaterialCost, totalLabourCost, coupleMode).credit;
  const optimizedSavings = Math.max(0, totalCredit - allInOneYearCredit);
  const recommendation = optimizedSavings > 0
    ? locale === "fi"
      ? `Jakaminen usealle verovuodelle kasvattaa vähennystä arviolta ${roundEuro(optimizedSavings)} EUR.`
      : `Splitting work across tax years adds about ${roundEuro(optimizedSavings)} EUR in deductions.`
    : locale === "fi"
      ? "Yhden vuoden toteutus ei näytä menettävän vähennyksiä tällä kustannustasolla."
      : "A single-year schedule does not appear to leave deduction value unused at this cost level.";

  return {
    startYear,
    claimantCount,
    targetLabourPerYear: labourTarget,
    allInOneYearCredit,
    optimizedSavings,
    totalMaterialCost,
    totalLabourCost,
    totalGrossCost,
    totalCredit,
    totalNetCost: Math.max(0, totalGrossCost - totalCredit),
    phases,
    years,
    recommendation,
  };
}

export function formatPhasedRenovationPlan(plan: PhasedRenovationPlan, locale: "fi" | "en" = "en"): string {
  const eur = (value: number) => `${Math.round(value).toLocaleString(locale === "fi" ? "fi-FI" : "en-GB")} EUR`;
  const lines = [
    locale === "fi" ? "Helscoop vaiheistettu remonttisuunnitelma" : "Helscoop phased renovation plan",
    `${locale === "fi" ? "Hakijoita" : "Claimants"}: ${plan.claimantCount}`,
    `${locale === "fi" ? "Vähennys yhteensä" : "Total deduction"}: ${eur(plan.totalCredit)}`,
    `${locale === "fi" ? "Lisähyöty vaiheistuksesta" : "Extra benefit from phasing"}: ${eur(plan.optimizedSavings)}`,
    "",
  ];

  for (const year of plan.years) {
    lines.push(`${year.year}: ${eur(year.grossCost)} gross, ${eur(year.credit)} deduction`);
    for (const phase of year.phases) {
      lines.push(`- Q${phase.schedule.quarter}: ${phase.title} (${eur(phase.grossCost)}, labour ${eur(phase.labourCost)})`);
    }
  }

  lines.push("", plan.recommendation);
  return lines.join("\n");
}
