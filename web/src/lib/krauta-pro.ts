import { buildAffiliateRetailerUrl } from "@/lib/material-affiliate";
import { calculateQuote, defaultQuoteConfig } from "@/lib/quote-engine";
import type { BomItem, Material } from "@/types";

export const KRAUTA_PRO_CONFIG = {
  supplierId: "k-rauta",
  supplierName: "K-Rauta",
  proPortalUrl: "https://www.k-rauta.fi/pro",
  planningTradeDiscountPercent: 0.08,
  referralRatePercent: 0.04,
  contractorMarginPercent: 0.15,
} as const;

export interface KrautaProLine {
  materialId: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  retailTotal: number;
  proEstimate: number;
  estimatedSavings: number;
  link: string | null;
}

export interface KrautaProPackage {
  eligible: boolean;
  orderUrl: string;
  supplierId: string;
  supplierName: string;
  lineCount: number;
  totalBomLines: number;
  coveragePercent: number;
  retailMaterialTotal: number;
  proMaterialEstimate: number;
  estimatedTradeSavings: number;
  estimatedReferralRevenue: number;
  clientQuoteTotal: number;
  contractorMargin: number;
  lines: KrautaProLine[];
  uncoveredLines: string[];
  assumptions: string[];
}

interface BuildKrautaProPackageInput {
  bom: BomItem[];
  materials: Material[];
  projectName?: string;
  tradeDiscountPercent?: number;
  referralRatePercent?: number;
  contractorMarginPercent?: number;
}

function roundEuro(value: number): number {
  return Math.round(value);
}

function isKrautaSupplier(value?: string | null): boolean {
  return /k-?rauta|kesko/i.test(value ?? "");
}

function getMaterialName(material: Material | null, item: BomItem): string {
  return material?.name_en || material?.name_fi || material?.name || item.material_name || item.material_id;
}

function findKrautaPricing(material: Material | null, item: BomItem) {
  const pricing = material?.pricing ?? [];
  const explicitKrauta = isKrautaSupplier(item.supplier) || isKrautaSupplier(item.supplier_name);
  const krautaPrice = pricing.find((price) => isKrautaSupplier(price.supplier_name) || isKrautaSupplier(price.link));
  const primaryPrice = pricing.find((price) => price.is_primary) ?? pricing[0];

  if (explicitKrauta && item.unit_price != null) {
    return {
      unitPrice: Number(item.unit_price),
      link: item.link ?? krautaPrice?.link ?? null,
      unit: item.unit || krautaPrice?.unit || primaryPrice?.unit || "unit",
    };
  }

  if (krautaPrice) {
    return {
      unitPrice: Number(krautaPrice.unit_price),
      link: item.link ?? krautaPrice.link ?? null,
      unit: item.unit || krautaPrice.unit,
    };
  }

  return null;
}

function buildOrderUrl(firstLine: KrautaProLine | null): string {
  return buildAffiliateRetailerUrl(KRAUTA_PRO_CONFIG.proPortalUrl, {
    materialId: firstLine?.materialId ?? "bom",
    supplier: KRAUTA_PRO_CONFIG.supplierName,
    source: "k_rauta_pro_package",
  }) ?? KRAUTA_PRO_CONFIG.proPortalUrl;
}

export function buildKrautaProPackage({
  bom,
  materials,
  tradeDiscountPercent = KRAUTA_PRO_CONFIG.planningTradeDiscountPercent,
  referralRatePercent = KRAUTA_PRO_CONFIG.referralRatePercent,
  contractorMarginPercent = KRAUTA_PRO_CONFIG.contractorMarginPercent,
}: BuildKrautaProPackageInput): KrautaProPackage {
  const materialMap = new Map(materials.map((material) => [material.id, material]));
  const lines: KrautaProLine[] = [];
  const uncoveredLines: string[] = [];

  for (const item of bom) {
    const material = materialMap.get(item.material_id) ?? null;
    const krautaPricing = findKrautaPricing(material, item);
    const name = getMaterialName(material, item);

    if (!krautaPricing) {
      uncoveredLines.push(name);
      continue;
    }

    const quantity = Number(item.quantity) || 0;
    const retailTotal = roundEuro(Number(item.total) || quantity * krautaPricing.unitPrice);
    const proEstimate = roundEuro(retailTotal * (1 - tradeDiscountPercent));

    lines.push({
      materialId: item.material_id,
      name,
      quantity,
      unit: krautaPricing.unit,
      unitPrice: krautaPricing.unitPrice,
      retailTotal,
      proEstimate,
      estimatedSavings: Math.max(0, retailTotal - proEstimate),
      link: buildAffiliateRetailerUrl(krautaPricing.link, {
        materialId: item.material_id,
        supplier: KRAUTA_PRO_CONFIG.supplierName,
        source: "k_rauta_pro_package_line",
      }),
    });
  }

  const contractorQuote = calculateQuote(bom, materials, {
    ...defaultQuoteConfig("contractor"),
    contractorMarginPercent,
  });
  const retailMaterialTotal = roundEuro(lines.reduce((sum, line) => sum + line.retailTotal, 0));
  const proMaterialEstimate = roundEuro(lines.reduce((sum, line) => sum + line.proEstimate, 0));
  const estimatedTradeSavings = Math.max(0, retailMaterialTotal - proMaterialEstimate);
  const estimatedReferralRevenue = roundEuro(proMaterialEstimate * referralRatePercent);

  return {
    eligible: lines.length > 0,
    orderUrl: buildOrderUrl(lines[0] ?? null),
    supplierId: KRAUTA_PRO_CONFIG.supplierId,
    supplierName: KRAUTA_PRO_CONFIG.supplierName,
    lineCount: lines.length,
    totalBomLines: bom.length,
    coveragePercent: bom.length > 0 ? lines.length / bom.length : 0,
    retailMaterialTotal,
    proMaterialEstimate,
    estimatedTradeSavings,
    estimatedReferralRevenue,
    clientQuoteTotal: roundEuro(contractorQuote.grandTotal),
    contractorMargin: roundEuro(contractorQuote.contractorMargin ?? 0),
    lines,
    uncoveredLines,
    assumptions: [
      "PRO price is a planning estimate until K-Rauta/Kesko provides authenticated trade pricing.",
      "Referral revenue is modelled from PRO material order value and requires a signed partner agreement.",
      "Client-facing quote includes the contractor margin; trade savings are contractor-only by default.",
    ],
  };
}

export function formatKrautaProPackage(plan: KrautaProPackage, projectName = "Helscoop project", locale: "fi" | "en" = "en"): string {
  const numberLocale = locale === "fi" ? "fi-FI" : "en-GB";
  const eur = (value: number) => `${Math.round(value).toLocaleString(numberLocale)} EUR`;
  const lines = [
    "Helscoop K-Rauta PRO order package",
    `Project: ${projectName}`,
    `Supplier: ${plan.supplierName}`,
    `Client quote total: ${eur(plan.clientQuoteTotal)}`,
    `Retail material total: ${eur(plan.retailMaterialTotal)}`,
    `Estimated PRO material total: ${eur(plan.proMaterialEstimate)}`,
    `Estimated contractor trade savings: ${eur(plan.estimatedTradeSavings)}`,
    `Estimated Helscoop referral revenue: ${eur(plan.estimatedReferralRevenue)}`,
    "",
    "Order lines:",
  ];

  for (const line of plan.lines) {
    lines.push(`${line.materialId}; ${line.name}; ${line.quantity}; ${line.unit}; retail ${eur(line.retailTotal)}; pro-estimate ${eur(line.proEstimate)}`);
  }

  if (plan.uncoveredLines.length > 0) {
    lines.push("", "Non K-Rauta lines to source separately:");
    for (const name of plan.uncoveredLines) lines.push(`- ${name}`);
  }

  lines.push("", "Assumptions:");
  for (const assumption of plan.assumptions) lines.push(`- ${assumption}`);

  return lines.join("\n");
}
