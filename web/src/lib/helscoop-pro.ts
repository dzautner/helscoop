import type { ProLead, ProLeadStatus, ProTier } from "@/types";

export const HELSCOOP_PRO_TIERS: ProTier[] = [
  { id: "free", name: "Free profile", monthly_price_eur: 0, lead_limit: 0 },
  { id: "pro", name: "Helscoop Pro", monthly_price_eur: 69, lead_limit: 20 },
  { id: "growth", name: "Helscoop Growth", monthly_price_eur: 149, lead_limit: 60 },
];

const WORK_CATEGORIES = [
  { id: "roof", label: "Roof", pattern: /roof|katto|vesikatto|tiili|peltikatto/i },
  { id: "facade", label: "Facade", pattern: /facade|julkisivu|ulkoverhous|siding|maalaus/i },
  { id: "windows", label: "Windows", pattern: /window|ikkuna|ovi|door/i },
  { id: "heating", label: "Heating", pattern: /heat|heating|lampopumppu|maalampo|lammitys|boiler/i },
  { id: "insulation", label: "Insulation", pattern: /insulation|eristys|villa|u-?value|energy/i },
  { id: "wet_room", label: "Wet room", pattern: /bath|sauna|kylpy|pesuhuone|wet room|waterproof/i },
  { id: "kitchen", label: "Kitchen", pattern: /kitchen|keittio|cabinet|kaappi/i },
] as const;

export interface ProLeadScore {
  score: number;
  temperature: "cold" | "warm" | "hot";
  categories: string[];
  recommended_tier: ProTier["id"];
  reasons: string[];
}

export interface ProLeadFunnelSummary {
  lead_count: number;
  open_count: number;
  active_pipeline_count: number;
  closed_count: number;
  total_estimated_cost: number;
  average_estimated_cost: number;
  hot_count: number;
  projected_monthly_revenue: number;
}

function daysSince(dateString: string, now = Date.now()): number {
  const timestamp = Date.parse(dateString);
  if (!Number.isFinite(timestamp)) return 999;
  return Math.max(0, Math.floor((now - timestamp) / 86_400_000));
}

export function classifyWorkScope(workScope: string): string[] {
  return WORK_CATEGORIES
    .filter((category) => category.pattern.test(workScope))
    .map((category) => category.label);
}

export function scoreProLead(lead: ProLead, now = Date.now()): ProLeadScore {
  const reasons: string[] = [];
  const categories = classifyWorkScope(`${lead.work_scope} ${lead.project_description ?? ""}`);
  const estimatedCost = Number(lead.estimated_cost || 0);
  let score = 10;

  if (estimatedCost >= 25_000) {
    score += 32;
    reasons.push("Large renovation value");
  } else if (estimatedCost >= 10_000) {
    score += 24;
    reasons.push("Meaningful project value");
  } else if (estimatedCost >= 3_000) {
    score += 14;
    reasons.push("Small but quoteable job");
  }

  if (lead.bom_line_count >= 20) {
    score += 14;
    reasons.push("Detailed BOM");
  } else if (lead.bom_line_count >= 8) {
    score += 9;
    reasons.push("Usable material plan");
  } else if (lead.bom_line_count > 0) {
    score += 4;
    reasons.push("Material plan started");
  }

  if (lead.contact_phone) {
    score += 8;
    reasons.push("Phone available");
  }

  if (categories.length > 0) {
    score += Math.min(18, categories.length * 6);
    reasons.push(`${categories.slice(0, 2).join(" + ")} scope`);
  }

  const ageDays = daysSince(lead.created_at, now);
  if (ageDays <= 2) {
    score += 10;
    reasons.push("Fresh lead");
  } else if (ageDays <= 7) {
    score += 6;
    reasons.push("Recent lead");
  } else if (ageDays > 30) {
    score -= 8;
    reasons.push("Aging lead");
  }

  if (lead.status === "forwarded") score += 5;
  if (lead.status === "closed") score -= 25;

  const normalizedScore = Math.max(0, Math.min(100, Math.round(score)));
  const temperature = normalizedScore >= 70 ? "hot" : normalizedScore >= 45 ? "warm" : "cold";
  const recommendedTier: ProTier["id"] =
    normalizedScore >= 78 || estimatedCost >= 30_000 ? "growth" :
    normalizedScore >= 45 ? "pro" :
    "free";

  return {
    score: normalizedScore,
    temperature,
    categories,
    recommended_tier: recommendedTier,
    reasons: reasons.length > 0 ? reasons : ["Needs more scope detail"],
  };
}

export function summarizeProLeadFunnel(leads: ProLead[], now = Date.now()): ProLeadFunnelSummary {
  const totalEstimatedCost = leads.reduce((sum, lead) => sum + Number(lead.estimated_cost || 0), 0);
  const scored = leads.map((lead) => scoreProLead(lead, now));
  const activePipelineCount = leads.filter((lead) => lead.status === "submitted" || lead.status === "forwarded").length;

  return {
    lead_count: leads.length,
    open_count: leads.filter((lead) => lead.status === "submitted").length,
    active_pipeline_count: activePipelineCount,
    closed_count: leads.filter((lead) => lead.status === "closed").length,
    total_estimated_cost: Math.round(totalEstimatedCost),
    average_estimated_cost: leads.length > 0 ? Math.round(totalEstimatedCost / leads.length) : 0,
    hot_count: scored.filter((score) => score.temperature === "hot").length,
    projected_monthly_revenue: Math.round(activePipelineCount * HELSCOOP_PRO_TIERS[1].monthly_price_eur),
  };
}

export function nextLeadStatus(status: ProLeadStatus): ProLeadStatus {
  if (status === "submitted") return "forwarded";
  if (status === "forwarded") return "closed";
  return "submitted";
}
