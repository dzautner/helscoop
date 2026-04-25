import type { BomItem, BuildingInfo, EnergyHeatingType, Material } from "@/types";
import { calculateQuote, defaultQuoteConfig } from "@/lib/quote-engine";
import { buildHouseholdDeductionRows, calculateHouseholdDeduction } from "@/lib/household-deduction";
import { detectHeatingGrantOpportunity } from "@/lib/heating-grant-context";

export type FinancingProductType = "unsecured_remonttilaina" | "secured_bank_loan" | "materials_bnpl";
export type FinancingNoticeId = "household_deduction" | "energy_grant" | "unsecured_limit" | "credit_disclaimer";

export interface FinancingPartner {
  id: string;
  name: string;
  productType: "loan_comparison" | "materials_bnpl";
  baseUrl: string;
  estimatedLeadValueEur: number | null;
  affiliateReady: boolean;
}

export interface FinancingOffer {
  id: string;
  productType: FinancingProductType;
  amount: number;
  termMonths: number;
  aprMinPercent: number;
  aprMaxPercent: number;
  monthlyMin: number;
  monthlyMax: number;
  totalRepayableMin: number;
  totalRepayableMax: number;
  maxAmount: number;
  partnerId: string | null;
}

export interface FinancingTermComparison {
  years: number;
  unsecuredMonthlyMin: number;
  unsecuredMonthlyMax: number;
  securedMonthlyMin: number;
  securedMonthlyMax: number;
}

export interface FinancingNotice {
  id: FinancingNoticeId;
  tone: "positive" | "warning" | "neutral";
  amount?: number;
  maxAmount?: number;
  targetHeating?: EnergyHeatingType | null;
}

export interface RenovationFinancingPlan {
  eligible: boolean;
  threshold: number;
  requestedAmount: number;
  termYears: number;
  quote: {
    grandTotal: number;
    materialTotal: number;
    labourTotal: number;
  };
  offers: FinancingOffer[];
  termComparisons: FinancingTermComparison[];
  notices: FinancingNotice[];
  primaryPartner: FinancingPartner;
  partnerUrl: string;
  assumptions: string[];
}

export interface BuildRenovationFinancingInput {
  bom: BomItem[];
  materials: Material[];
  buildingInfo?: BuildingInfo | null;
  loanAmount?: number;
  termYears?: number;
  locale?: "fi" | "en" | "sv";
}

const UNSECURED_RATE = { min: 4, max: 15, maxAmount: 70000 };
const SECURED_RATE = { min: 4, max: 8, maxAmount: 150000 };
const BNPL_RATE = { min: 0, max: 18, maxAmount: 15000, termMonths: 12 };

export const RENOVATION_FINANCING_CONFIG = {
  minBomTotal: 2000,
  defaultTermYears: 7,
  comparisonTermsYears: [3, 7, 12],
  minTermYears: 1,
  maxTermYears: 15,
  checkedAt: "2026-04-23",
} as const;

export const FINANCING_PARTNERS: FinancingPartner[] = [
  {
    id: "sortter-remonttilaina",
    name: "Sortter",
    productType: "loan_comparison",
    baseUrl: "https://www.sortter.fi/lainaa/remonttilaina/",
    estimatedLeadValueEur: 50,
    affiliateReady: true,
  },
  {
    id: "materials-bnpl-slot",
    name: "Klarna/Walley material split",
    productType: "materials_bnpl",
    baseUrl: "https://www.helscoop.fi/partners/material-financing",
    estimatedLeadValueEur: null,
    affiliateReady: false,
  },
];

function roundEuro(value: number): number {
  return Math.round(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizedMoney(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

export function calculateMonthlyPayment(principal: number, annualRatePercent: number, termMonths: number): number {
  const amount = Math.max(0, principal);
  const months = Math.max(1, Math.round(termMonths));
  const monthlyRate = Math.max(0, annualRatePercent) / 100 / 12;

  if (monthlyRate === 0) return amount / months;
  return amount * (monthlyRate / (1 - (1 + monthlyRate) ** -months));
}

function buildOffer(input: {
  id: string;
  productType: FinancingProductType;
  amount: number;
  termMonths: number;
  aprMinPercent: number;
  aprMaxPercent: number;
  maxAmount: number;
  partnerId: string | null;
}): FinancingOffer {
  const monthlyMin = calculateMonthlyPayment(input.amount, input.aprMinPercent, input.termMonths);
  const monthlyMax = calculateMonthlyPayment(input.amount, input.aprMaxPercent, input.termMonths);

  return {
    id: input.id,
    productType: input.productType,
    amount: roundEuro(input.amount),
    termMonths: input.termMonths,
    aprMinPercent: input.aprMinPercent,
    aprMaxPercent: input.aprMaxPercent,
    monthlyMin: roundEuro(monthlyMin),
    monthlyMax: roundEuro(monthlyMax),
    totalRepayableMin: roundEuro(monthlyMin * input.termMonths),
    totalRepayableMax: roundEuro(monthlyMax * input.termMonths),
    maxAmount: input.maxAmount,
    partnerId: input.partnerId,
  };
}

function estimateEnergyGrantAmount(targetHeating: EnergyHeatingType | null, fossilSourceHeating: boolean): number {
  if (!targetHeating && !fossilSourceHeating) return 0;
  if (
    targetHeating === "district_heat" ||
    targetHeating === "ground_source_heat_pump" ||
    targetHeating === "air_water_heat_pump"
  ) {
    return 4000;
  }
  return 2500;
}

function primaryPartner(): FinancingPartner {
  return FINANCING_PARTNERS[0];
}

export function buildFinancingPartnerUrl(
  partner: FinancingPartner,
  plan: Pick<RenovationFinancingPlan, "requestedAmount" | "termYears" | "quote">,
  buildingInfo?: BuildingInfo | null,
  locale: "fi" | "en" | "sv" = "fi",
): string {
  const url = new URL(partner.baseUrl);

  url.searchParams.set("utm_source", "helscoop");
  url.searchParams.set("utm_medium", "embedded_financing");
  url.searchParams.set("utm_campaign", "bom_financing");
  url.searchParams.set("product", partner.productType);
  url.searchParams.set("amount_eur", String(Math.round(plan.requestedAmount)));
  url.searchParams.set("term_years", String(plan.termYears));
  url.searchParams.set("material_cost_eur", String(Math.round(plan.quote.materialTotal)));
  url.searchParams.set("labour_cost_eur", String(Math.round(plan.quote.labourTotal)));
  url.searchParams.set("locale", locale);

  if (buildingInfo?.type) url.searchParams.set("building_type", buildingInfo.type);
  if (buildingInfo?.area_m2) url.searchParams.set("area_m2", String(Math.round(buildingInfo.area_m2)));
  if (buildingInfo?.year_built) url.searchParams.set("year_built", String(buildingInfo.year_built));
  if (buildingInfo?.heating) url.searchParams.set("heating", buildingInfo.heating);

  return url.toString();
}

export function buildRenovationFinancingPlan(input: BuildRenovationFinancingInput): RenovationFinancingPlan {
  const quote = calculateQuote(input.bom, input.materials, defaultQuoteConfig("homeowner"));
  const materialTotal = quote.materialSubtotal * (1 + quote.config.vatRate);
  const labourTotal = quote.labourSubtotal * (1 + quote.config.vatRate);
  const recommendedAmount = roundEuro(quote.grandTotal);
  const requestedAmount = roundEuro(normalizedMoney(input.loanAmount, recommendedAmount));
  const termYears = clamp(
    Math.round(input.termYears ?? RENOVATION_FINANCING_CONFIG.defaultTermYears),
    RENOVATION_FINANCING_CONFIG.minTermYears,
    RENOVATION_FINANCING_CONFIG.maxTermYears,
  );
  const termMonths = termYears * 12;
  const quoteSummary = {
    grandTotal: roundEuro(quote.grandTotal),
    materialTotal: roundEuro(materialTotal),
    labourTotal: roundEuro(labourTotal),
  };

  const partner = primaryPartner();
  const offers = [
    buildOffer({
      id: "unsecured-remonttilaina",
      productType: "unsecured_remonttilaina",
      amount: requestedAmount,
      termMonths,
      aprMinPercent: UNSECURED_RATE.min,
      aprMaxPercent: UNSECURED_RATE.max,
      maxAmount: UNSECURED_RATE.maxAmount,
      partnerId: partner.id,
    }),
    buildOffer({
      id: "secured-bank-loan",
      productType: "secured_bank_loan",
      amount: requestedAmount,
      termMonths,
      aprMinPercent: SECURED_RATE.min,
      aprMaxPercent: SECURED_RATE.max,
      maxAmount: SECURED_RATE.maxAmount,
      partnerId: partner.id,
    }),
    buildOffer({
      id: "materials-bnpl",
      productType: "materials_bnpl",
      amount: Math.min(quoteSummary.materialTotal, BNPL_RATE.maxAmount),
      termMonths: BNPL_RATE.termMonths,
      aprMinPercent: BNPL_RATE.min,
      aprMaxPercent: BNPL_RATE.max,
      maxAmount: BNPL_RATE.maxAmount,
      partnerId: "materials-bnpl-slot",
    }),
  ];

  const termComparisons = RENOVATION_FINANCING_CONFIG.comparisonTermsYears.map((years) => {
    const months = years * 12;
    return {
      years,
      unsecuredMonthlyMin: roundEuro(calculateMonthlyPayment(requestedAmount, UNSECURED_RATE.min, months)),
      unsecuredMonthlyMax: roundEuro(calculateMonthlyPayment(requestedAmount, UNSECURED_RATE.max, months)),
      securedMonthlyMin: roundEuro(calculateMonthlyPayment(requestedAmount, SECURED_RATE.min, months)),
      securedMonthlyMax: roundEuro(calculateMonthlyPayment(requestedAmount, SECURED_RATE.max, months)),
    };
  });

  const deduction = calculateHouseholdDeduction(buildHouseholdDeductionRows(quote));
  const grantOpportunity = detectHeatingGrantOpportunity({
    bom: input.bom,
    materials: input.materials,
    buildingInfo: input.buildingInfo,
  });
  const notices: FinancingNotice[] = [];

  if (deduction.credit > 0) {
    notices.push({
      id: "household_deduction",
      tone: "positive",
      amount: roundEuro(deduction.credit),
      maxAmount: roundEuro(deduction.maxCredit),
    });
  }

  const grantAmount = estimateEnergyGrantAmount(
    grantOpportunity.detectedTargetHeating,
    grantOpportunity.fossilSourceHeating,
  );
  if (grantOpportunity.shouldShow && grantAmount > 0) {
    notices.push({
      id: "energy_grant",
      tone: "positive",
      amount: grantAmount,
      targetHeating: grantOpportunity.detectedTargetHeating,
    });
  }

  if (requestedAmount > UNSECURED_RATE.maxAmount) {
    notices.push({
      id: "unsecured_limit",
      tone: "warning",
      amount: requestedAmount,
      maxAmount: UNSECURED_RATE.maxAmount,
    });
  }

  notices.push({ id: "credit_disclaimer", tone: "neutral" });

  const planShell = {
    requestedAmount,
    termYears,
    quote: quoteSummary,
  };

  return {
    eligible: quote.grandTotal >= RENOVATION_FINANCING_CONFIG.minBomTotal,
    threshold: RENOVATION_FINANCING_CONFIG.minBomTotal,
    requestedAmount,
    termYears,
    quote: quoteSummary,
    offers,
    termComparisons,
    notices,
    primaryPartner: partner,
    partnerUrl: buildFinancingPartnerUrl(partner, planShell, input.buildingInfo, input.locale ?? "fi"),
    assumptions: [
      `Planning APR ranges: unsecured ${UNSECURED_RATE.min}-${UNSECURED_RATE.max}%, secured ${SECURED_RATE.min}-${SECURED_RATE.max}%.`,
      `Material split estimate caps financed materials at ${BNPL_RATE.maxAmount} EUR over ${BNPL_RATE.termMonths} months.`,
      `Config checked ${RENOVATION_FINANCING_CONFIG.checkedAt}; replace with partner API rates before credit decisions.`,
    ],
  };
}
