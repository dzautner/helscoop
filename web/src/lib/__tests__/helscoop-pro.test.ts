import { describe, expect, it } from "vitest";
import {
  classifyWorkScope,
  nextLeadStatus,
  scoreProLead,
  summarizeProLeadFunnel,
} from "@/lib/helscoop-pro";
import type { ProLead } from "@/types";

const now = Date.parse("2026-04-24T12:00:00Z");

const hotLead: ProLead = {
  id: "lead-1",
  project_id: "project-1",
  project_name: "Roof and insulation",
  project_description: "Old detached house",
  project_type: "omakotitalo",
  unit_count: null,
  building_info: { address: "Testikatu 1" },
  homeowner_name: "Matti",
  contact_name: "Matti",
  contact_email: "matti@example.com",
  contact_phone: "+358401234567",
  postcode: "00100",
  work_scope: "Roof replacement, insulation, and new windows",
  bom_line_count: 24,
  estimated_cost: 42000,
  partner_channel: "manual_luotettava_kumppani",
  matched_contractor_count: 0,
  status: "submitted",
  created_at: "2026-04-24T08:00:00Z",
};

describe("Helscoop Pro lead scoring", () => {
  it("classifies renovation categories from multilingual scope text", () => {
    expect(classifyWorkScope("Katto ja ikkuna remontti")).toEqual(["Roof", "Windows"]);
  });

  it("scores high-value fresh leads as hot and recommends growth tier", () => {
    const score = scoreProLead(hotLead, now);

    expect(score.temperature).toBe("hot");
    expect(score.recommended_tier).toBe("growth");
    expect(score.score).toBeGreaterThanOrEqual(80);
    expect(score.reasons).toContain("Large renovation value");
    expect(score.categories).toEqual(["Roof", "Windows", "Insulation"]);
  });

  it("penalizes closed stale leads", () => {
    const score = scoreProLead({
      ...hotLead,
      status: "closed",
      created_at: "2026-01-10T08:00:00Z",
      estimated_cost: 1200,
      bom_line_count: 1,
      contact_phone: null,
      work_scope: "Small trim repair",
    }, now);

    expect(score.temperature).toBe("cold");
    expect(score.recommended_tier).toBe("free");
  });

  it("summarizes the contractor funnel", () => {
    const summary = summarizeProLeadFunnel([
      hotLead,
      { ...hotLead, id: "lead-2", status: "forwarded", estimated_cost: 8000 },
      { ...hotLead, id: "lead-3", status: "closed", estimated_cost: 3000 },
    ], now);

    expect(summary.lead_count).toBe(3);
    expect(summary.open_count).toBe(1);
    expect(summary.active_pipeline_count).toBe(2);
    expect(summary.closed_count).toBe(1);
    expect(summary.total_estimated_cost).toBe(53000);
    expect(summary.projected_monthly_revenue).toBe(138);
  });

  it("cycles lead workflow statuses", () => {
    expect(nextLeadStatus("submitted")).toBe("forwarded");
    expect(nextLeadStatus("forwarded")).toBe("closed");
    expect(nextLeadStatus("closed")).toBe("submitted");
  });
});
