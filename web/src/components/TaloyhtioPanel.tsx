"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import {
  calculateTaloyhtioCostModel,
  formatShareholderShareRows,
  normalizeTaloyhtioUnitCount,
  parseShareholderShareRows,
} from "@/lib/taloyhtio";
import type { BomItem, Project, ProjectType, ShareholderShare } from "@/types";

function formatEuro(value: number, locale: string): string {
  return value.toLocaleString(locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

function inputStyle(): CSSProperties {
  return {
    minWidth: 0,
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 12,
  };
}

export default function TaloyhtioPanel({
  project,
  bom,
  onSave,
}: {
  project: Project;
  bom: BomItem[];
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const { t, locale } = useTranslation();
  const [projectType, setProjectType] = useState<ProjectType>(project.project_type ?? "omakotitalo");
  const [unitCount, setUnitCount] = useState(String(project.unit_count ?? project.building_info?.units ?? 1));
  const [businessId, setBusinessId] = useState(project.business_id ?? "");
  const [address, setAddress] = useState(project.building_info?.address ?? "");
  const [buildingYear, setBuildingYear] = useState(project.building_info?.year_built ? String(project.building_info.year_built) : "");
  const [managerName, setManagerName] = useState(project.property_manager_name ?? "");
  const [managerEmail, setManagerEmail] = useState(project.property_manager_email ?? "");
  const [managerPhone, setManagerPhone] = useState(project.property_manager_phone ?? "");
  const [sharesText, setSharesText] = useState(formatShareholderShareRows(project.shareholder_shares ?? []));
  const [shareError, setShareError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setProjectType(project.project_type ?? "omakotitalo");
    setUnitCount(String(project.unit_count ?? project.building_info?.units ?? 1));
    setBusinessId(project.business_id ?? "");
    setAddress(project.building_info?.address ?? "");
    setBuildingYear(project.building_info?.year_built ? String(project.building_info.year_built) : "");
    setManagerName(project.property_manager_name ?? "");
    setManagerEmail(project.property_manager_email ?? "");
    setManagerPhone(project.property_manager_phone ?? "");
    setSharesText(formatShareholderShareRows(project.shareholder_shares ?? []));
    setShareError(null);
  }, [
    project.id,
    project.project_type,
    project.unit_count,
    project.business_id,
    project.property_manager_name,
    project.property_manager_email,
    project.property_manager_phone,
    project.shareholder_shares,
    project.building_info,
  ]);

  const shareParse = useMemo<{ shares: ShareholderShare[]; error: string | null }>(() => {
    try {
      return { shares: parseShareholderShareRows(sharesText), error: null };
    } catch (err) {
      return { shares: [], error: err instanceof Error ? err.message : t("taloyhtio.shareParseError") };
    }
  }, [sharesText, t]);
  const displayedShareError = shareError ?? shareParse.error;
  const costModel = useMemo(
    () => calculateTaloyhtioCostModel(bom, unitCount, shareParse.shares),
    [bom, shareParse.shares, unitCount],
  );
  const isTaloyhtio = projectType === "taloyhtio";
  const blockingShareError = isTaloyhtio ? displayedShareError : null;

  async function handleSave() {
    let shareholderShares: ShareholderShare[] = [];
    if (isTaloyhtio) {
      try {
        shareholderShares = parseShareholderShareRows(sharesText);
        setShareError(null);
      } catch (err) {
        setShareError(err instanceof Error ? err.message : t("taloyhtio.shareParseError"));
        return;
      }
    }
    setSaving(true);
    try {
      const normalizedUnitCount = normalizeTaloyhtioUnitCount(unitCount);
      const parsedBuildingYear = Number(buildingYear);
      const nextBuildingInfo = {
        ...(project.building_info ?? {}),
        address: address.trim() || undefined,
        year_built: buildingYear.trim() && Number.isFinite(parsedBuildingYear) ? Math.floor(parsedBuildingYear) : undefined,
        units: isTaloyhtio ? normalizedUnitCount : undefined,
        type: isTaloyhtio ? "taloyhtio" : project.building_info?.type,
      };
      await onSave({
        project_type: projectType,
        unit_count: isTaloyhtio ? normalizedUnitCount : null,
        business_id: isTaloyhtio ? businessId.trim() || null : null,
        property_manager_name: isTaloyhtio ? managerName.trim() || null : null,
        property_manager_email: isTaloyhtio ? managerEmail.trim() || null : null,
        property_manager_phone: isTaloyhtio ? managerPhone.trim() || null : null,
        shareholder_shares: isTaloyhtio ? shareholderShares : [],
        building_info: nextBuildingInfo,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      style={{
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        background: "linear-gradient(135deg, color-mix(in srgb, var(--bg-secondary) 94%, var(--amber) 6%), var(--bg-secondary))",
        display: "grid",
        gap: 10,
        flexShrink: 0,
      }}
      aria-label={t("taloyhtio.title")}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 170 }}>
          <div className="label-mono" style={{ fontSize: 10 }}>{t("taloyhtio.title")}</div>
          <div style={{ color: "var(--text-muted)", fontSize: 11 }}>{t("taloyhtio.subtitle")}</div>
        </div>
        <div style={{ display: "inline-flex", padding: 3, border: "1px solid var(--border)", borderRadius: 999, background: "var(--bg-elevated)" }}>
          {(["omakotitalo", "taloyhtio"] as ProjectType[]).map((type) => (
            <button
              key={type}
              type="button"
              className={projectType === type ? "btn btn-primary" : "btn btn-ghost"}
              onClick={() => setProjectType(type)}
              style={{ padding: "6px 10px", fontSize: 11, borderRadius: 999 }}
            >
              {t(`taloyhtio.projectType.${type}`)}
            </button>
          ))}
        </div>
        {isTaloyhtio && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginLeft: "auto" }}>
            <span className="badge badge-muted">{t("taloyhtio.perUnit")}: {formatEuro(costModel.perUnitTotal, locale)}</span>
            <span className="badge badge-amber">{t("taloyhtio.buildingTotal")}: {formatEuro(costModel.buildingTotal, locale)}</span>
          </div>
        )}
      </div>

      {isTaloyhtio && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
              {t("taloyhtio.unitCount")}
              <input style={inputStyle()} type="number" min={1} value={unitCount} onChange={(event) => setUnitCount(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
              {t("taloyhtio.businessId")}
              <input style={inputStyle()} value={businessId} onChange={(event) => setBusinessId(event.target.value)} placeholder="1234567-8" />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
              {t("taloyhtio.address")}
              <input style={inputStyle()} value={address} onChange={(event) => setAddress(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
              {t("taloyhtio.buildingYear")}
              <input style={inputStyle()} type="number" min={1800} max={2100} value={buildingYear} onChange={(event) => setBuildingYear(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
              {t("taloyhtio.managerName")}
              <input style={inputStyle()} value={managerName} onChange={(event) => setManagerName(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
              {t("taloyhtio.managerEmail")}
              <input style={inputStyle()} type="email" value={managerEmail} onChange={(event) => setManagerEmail(event.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
              {t("taloyhtio.managerPhone")}
              <input style={inputStyle()} value={managerPhone} onChange={(event) => setManagerPhone(event.target.value)} />
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            <label style={{ display: "grid", gap: 5, fontSize: 11, color: "var(--text-secondary)" }}>
              {t("taloyhtio.shareTable")}
              <textarea
                style={{ ...inputStyle(), minHeight: 88, resize: "vertical", fontFamily: "var(--font-mono)", lineHeight: 1.5 }}
                value={sharesText}
                onChange={(event) => { setSharesText(event.target.value); setShareError(null); }}
                placeholder={t("taloyhtio.sharePlaceholder")}
              />
              {blockingShareError && <span style={{ color: "var(--danger)", fontSize: 11 }}>{blockingShareError}</span>}
            </label>
            <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "var(--bg-elevated)", fontSize: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                <strong>{t("taloyhtio.shareSummary")}</strong>
                <span style={{ color: Math.abs(costModel.shareDeltaPct) < 0.01 ? "var(--forest)" : "var(--amber)", fontFamily: "var(--font-mono)" }}>
                  {costModel.shareTotalPct.toFixed(2)}%
                </span>
              </div>
              {costModel.shares.length === 0 ? (
                <p style={{ margin: 0, color: "var(--text-muted)" }}>{t("taloyhtio.noShares")}</p>
              ) : (
                <div style={{ display: "grid", gap: 5, maxHeight: 120, overflow: "auto" }}>
                  {costModel.shares.slice(0, 8).map((share) => (
                    <div key={`${share.apartment}-${share.share_pct}`} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                      <span>{share.apartment} <span style={{ color: "var(--text-muted)" }}>{share.share_pct}%</span></span>
                      <strong>{formatEuro(share.cost, locale)}</strong>
                    </div>
                  ))}
                  {costModel.shares.length > 8 && (
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{t("taloyhtio.moreShares", { count: costModel.shares.length - 8 })}</span>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving || Boolean(blockingShareError)}>
          {saving ? <span className="btn-spinner" /> : t("taloyhtio.save")}
        </button>
      </div>
    </section>
  );
}
