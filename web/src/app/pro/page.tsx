"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, getToken, setToken } from "@/lib/api";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  HELSCOOP_PRO_TIERS,
  nextLeadStatus,
  scoreProLead,
  summarizeProLeadFunnel,
} from "@/lib/helscoop-pro";
import type { ProLead, ProLeadResponse, ProLeadStatus } from "@/types";

interface UserProfile {
  id: string;
  name?: string | null;
  email: string;
  role: string;
}

function formatEur(value: number): string {
  return `${Math.round(value).toLocaleString("fi-FI")} EUR`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fi-FI", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(status: ProLeadStatus): string {
  if (status === "submitted") return "New";
  if (status === "forwarded") return "In contact";
  return "Closed";
}

function statusAction(status: ProLeadStatus): string {
  if (status === "submitted") return "Mark contacted";
  if (status === "forwarded") return "Mark closed";
  return "Reopen";
}

function canReceiveLeads(role: string): boolean {
  return role === "contractor" || role === "admin";
}

export default function ProPage() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [response, setResponse] = useState<ProLeadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ProLeadStatus | "all">("all");
  const [updatingLeadId, setUpdatingLeadId] = useState<string | null>(null);

  const leads = response?.leads ?? [];
  const funnel = useMemo(() => summarizeProLeadFunnel(leads), [leads]);
  const sortedLeads = useMemo(
    () => [...leads].sort((a, b) => scoreProLead(b).score - scoreProLead(a).score),
    [leads],
  );

  async function loadLeads(filter: ProLeadStatus | "all" = statusFilter) {
    const data = await api.getProLeads({
      status: filter === "all" ? undefined : filter,
      limit: 80,
    });
    setResponse(data);
  }

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/";
      return;
    }

    let cancelled = false;
    const bootstrap = async () => {
      try {
        const profile = await api.me() as UserProfile;
        if (cancelled) return;
        setUser(profile);
        if (canReceiveLeads(profile.role)) {
          try {
            await loadLeads("all");
          } catch (err) {
            if (!cancelled) {
              setError(err instanceof Error ? err.message : "Could not load leads");
            }
          }
        }
      } catch {
        setToken(null);
        window.location.href = "/";
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
    // Initial page bootstrap only; filter changes are handled explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFilter(nextStatus: ProLeadStatus | "all") {
    setStatusFilter(nextStatus);
    setError(null);
    setLoading(true);
    try {
      await loadLeads(nextStatus);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load leads");
    } finally {
      setLoading(false);
    }
  }

  async function updateLeadStatus(lead: ProLead) {
    const nextStatus = nextLeadStatus(lead.status);
    setUpdatingLeadId(lead.id);
    setError(null);
    try {
      const updated = await api.updateProLeadStatus(lead.id, nextStatus) as { lead: ProLead };
      setResponse((prev) => {
        if (!prev) return prev;
        const nextLeads = prev.leads.map((item) => item.id === lead.id ? updated.lead : item);
        return {
          ...prev,
          leads: statusFilter === "all" || updated.lead.status === statusFilter
            ? nextLeads
            : nextLeads.filter((item) => item.id !== lead.id),
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update lead");
    } finally {
      setUpdatingLeadId(null);
    }
  }

  if (loading && !user) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
        Loading Helscoop Pro...
      </main>
    );
  }

  const authorized = user && canReceiveLeads(user.role);

  return (
    <main
      className="anim-up"
      style={{
        minHeight: "100vh",
        padding: "32px 24px 56px",
        background:
          "radial-gradient(circle at 15% 8%, rgba(229,160,75,0.16), transparent 30%), radial-gradient(circle at 82% 0%, rgba(74,124,89,0.15), transparent 28%), var(--bg-primary)",
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 28 }}>
          <div>
            <div className="label-mono" style={{ color: "var(--amber)", marginBottom: 6 }}>
              Contractor marketplace
            </div>
            <h1 className="heading-display" style={{ margin: 0, fontSize: 34 }}>
              Helscoop Pro
            </h1>
            <p style={{ margin: "8px 0 0", color: "var(--text-muted)", maxWidth: 690, lineHeight: 1.55 }}>
              Turn homeowner BOMs and renovation plans into qualified contractor leads, proposal workflows, and partner order value.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <ThemeToggle />
            <LanguageSwitcher />
            <Link href="/" className="btn btn-ghost" style={{ textDecoration: "none" }}>
              Back
            </Link>
          </div>
        </header>

        {!authorized && (
          <section className="card" style={{ padding: 26, marginBottom: 22 }}>
            <div className="label-mono" style={{ color: "var(--forest)", marginBottom: 8 }}>
              Homeowner account detected
            </div>
            <h2 style={{ margin: "0 0 8px", fontSize: 22 }}>This is the contractor side of the marketplace.</h2>
            <p style={{ margin: 0, color: "var(--text-muted)", lineHeight: 1.55 }}>
              Homeowners stay on the free planning funnel. Contractors need the contractor role to receive leads, manage quotes, and pay for Pro placement.
            </p>
          </section>
        )}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 22 }}>
          {HELSCOOP_PRO_TIERS.map((tier) => (
            <article
              key={tier.id}
              className="card"
              style={{
                padding: 18,
                borderColor: tier.id === "pro" ? "var(--amber-border)" : "var(--border)",
                background: tier.id === "pro" ? "linear-gradient(145deg, rgba(229,160,75,0.13), rgba(255,255,255,0.02))" : undefined,
              }}
            >
              <div className="label-mono" style={{ color: tier.id === "pro" ? "var(--amber)" : "var(--text-muted)" }}>
                {tier.id === "free" ? "Acquisition" : tier.id === "pro" ? "First paid wedge" : "Featured growth"}
              </div>
              <h3 style={{ margin: "8px 0 4px", fontSize: 17 }}>{tier.name}</h3>
              <div style={{ fontSize: 26, fontWeight: 900, color: "var(--text-primary)" }}>
                {tier.monthly_price_eur === 0 ? "Free" : `${tier.monthly_price_eur} EUR/mo`}
              </div>
              <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.45 }}>
                {tier.lead_limit === 0
                  ? "Public profile and project handoff previews."
                  : `${tier.lead_limit} qualified leads/month, lead inbox, proposal follow-up, and contractor-ready BOM context.`}
              </p>
            </article>
          ))}
        </section>

        {authorized && (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
              <Metric label="Open leads" value={String(funnel.open_count)} />
              <Metric label="Hot leads" value={String(funnel.hot_count)} />
              <Metric label="Pipeline" value={formatEur(funnel.total_estimated_cost)} />
              <Metric label="Avg. job" value={formatEur(funnel.average_estimated_cost)} />
              <Metric label="Pro MRR model" value={formatEur(funnel.projected_monthly_revenue)} />
            </section>

            <section className="card" style={{ padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 16 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 19 }}>Lead inbox</h2>
                  <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 12 }}>
                    Leads are ranked by value, BOM detail, scope category, contactability, and freshness.
                  </p>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {(["all", "submitted", "forwarded", "closed"] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      className="btn"
                      onClick={() => void handleFilter(status)}
                      style={{
                        padding: "7px 10px",
                        fontSize: 11,
                        borderColor: statusFilter === status ? "var(--amber-border)" : "var(--border)",
                        color: statusFilter === status ? "var(--amber)" : "var(--text-muted)",
                        background: statusFilter === status ? "var(--amber-glow)" : "transparent",
                      }}
                    >
                      {status === "all" ? "All" : statusLabel(status)}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div role="alert" style={{ marginBottom: 12, color: "var(--danger)", fontSize: 12 }}>
                  {error}
                </div>
              )}

              {loading ? (
                <div style={{ padding: 24, color: "var(--text-muted)" }}>Loading leads...</div>
              ) : sortedLeads.length === 0 ? (
                <div style={{ padding: 24, color: "var(--text-muted)", border: "1px dashed var(--border)", borderRadius: "var(--radius-md)" }}>
                  No leads for this filter yet. The homeowner quote request flow will populate this inbox.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 10 }}>
                  {sortedLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      disabled={updatingLeadId === lead.id}
                      onUpdate={() => void updateLeadStatus(lead)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: 13, minWidth: 0 }}>
      <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 900, overflowWrap: "anywhere" }}>
        {value}
      </div>
    </div>
  );
}

function LeadCard({ lead, disabled, onUpdate }: { lead: ProLead; disabled: boolean; onUpdate: () => void }) {
  const scored = scoreProLead(lead);
  const buildingAddress = lead.building_info?.address ? String(lead.building_info.address) : null;

  return (
    <article
      className="pro-lead-card"
      style={{
        display: "grid",
        gridTemplateColumns: "84px minmax(0, 1fr) auto",
        gap: 14,
        padding: 14,
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.025)",
      }}
    >
      <div
        style={{
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: scored.temperature === "hot" ? "rgba(229,160,75,0.16)" : "var(--bg-tertiary)",
          display: "grid",
          placeItems: "center",
          minHeight: 74,
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 25, fontWeight: 900, color: scored.temperature === "hot" ? "var(--amber)" : "var(--text-primary)" }}>
            {scored.score}
          </div>
          <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 9 }}>
            {scored.temperature}
          </div>
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis" }}>
            {lead.project_name}
          </h3>
          <span className="badge badge-amber">{statusLabel(lead.status)}</span>
          <span className="badge badge-forest">{formatEur(lead.estimated_cost)}</span>
        </div>
        <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.45 }}>
          {lead.work_scope}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 9, color: "var(--text-muted)", fontSize: 11 }}>
          <span>{lead.postcode}</span>
          <span>{lead.bom_line_count} BOM lines</span>
          <span>{formatDate(lead.created_at)}</span>
          {buildingAddress && <span>{buildingAddress}</span>}
          {lead.contact_phone && <span>phone ready</span>}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {scored.categories.slice(0, 4).map((category) => (
            <span key={category} className="badge">
              {category}
            </span>
          ))}
          <span className="badge">tier: {scored.recommended_tier}</span>
        </div>
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 11 }}>
            Contact and scoring reasons
          </summary>
          <div style={{ marginTop: 7, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
            <div>{lead.contact_name} - {lead.contact_email}{lead.contact_phone ? ` - ${lead.contact_phone}` : ""}</div>
            <div>{scored.reasons.join(", ")}</div>
          </div>
        </details>
      </div>

      <div className="pro-lead-actions" style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center", minWidth: 132 }}>
        <a className="btn btn-ghost" href={`mailto:${lead.contact_email}`} style={{ textDecoration: "none", justifyContent: "center" }}>
          Email
        </a>
        <button type="button" className="btn btn-primary" onClick={onUpdate} disabled={disabled}>
          {disabled ? "Updating..." : statusAction(lead.status)}
        </button>
      </div>
    </article>
  );
}
