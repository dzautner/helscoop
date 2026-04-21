"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { useToast } from "@/components/ToastProvider";
import { api } from "@/lib/api";
import type { BuildingInfo, RyhtiPackageResponse, RyhtiPermitMetadata, RyhtiValidationIssue } from "@/types";

function statusColor(status?: string | null): string {
  switch (status) {
    case "submitted":
    case "accepted":
    case "ready_for_authority":
      return "var(--forest)";
    case "rejected":
    case "failed":
      return "var(--danger)";
    case "draft":
      return "var(--amber)";
    default:
      return "var(--text-muted)";
  }
}

function issueColor(level: RyhtiValidationIssue["level"]): string {
  if (level === "error") return "var(--danger)";
  if (level === "warning") return "var(--amber)";
  return "var(--text-muted)";
}

export default function RyhtiSubmissionPanel({
  projectId,
  bomCount,
  buildingInfo,
}: {
  projectId?: string;
  bomCount: number;
  buildingInfo?: BuildingInfo | null;
}) {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const [data, setData] = useState<RyhtiPackageResponse | null>(null);
  const [metadata, setMetadata] = useState<RyhtiPermitMetadata>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.getRyhtiPackage(projectId)
      .then((response: RyhtiPackageResponse) => {
        if (cancelled) return;
        setData(response);
        setMetadata(response.permitMetadata ?? {});
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, bomCount]);

  if (!projectId) return null;

  const validation = data?.validation;
  const latest = data?.latestSubmission;
  const issues = validation?.issues ?? [];
  const blockingIssues = issues.filter((issue) => issue.level === "error");
  const visibleIssues = [
    ...blockingIssues,
    ...issues.filter((issue) => issue.level !== "error"),
  ].slice(0, 4);
  const ready = validation?.ready ?? false;
  const address = metadata.address || buildingInfo?.address;

  const setField = <K extends keyof RyhtiPermitMetadata>(key: K, value: RyhtiPermitMetadata[K]) => {
    setMetadata((prev) => ({ ...prev, [key]: value }));
  };

  const saveMetadata = async () => {
    setSaving(true);
    try {
      const response: RyhtiPackageResponse = await api.updateRyhtiMetadata(projectId, metadata);
      setData(response);
      setMetadata(response.permitMetadata ?? metadata);
      toast(t("ryhti.metadataSaved"), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("ryhti.metadataSaveFailed"), "error");
    } finally {
      setSaving(false);
    }
  };

  const submitPackage = async () => {
    setSubmitting(true);
    try {
      const response = await api.submitRyhti(projectId);
      const latestSubmission = response.submission;
      setData((prev) => prev ? { ...prev, latestSubmission } : prev);
      toast(t("ryhti.packageCreated"), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("ryhti.packageFailed"), "error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: "14px 16px",
        background: "var(--bg-tertiary)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {t("ryhti.title")}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 2, lineHeight: 1.45 }}>
            {t("ryhti.subtitle")}
          </div>
        </div>
        <span
          style={{
            padding: "3px 7px",
            borderRadius: 999,
            background: ready ? "var(--forest-dim)" : "var(--amber-glow)",
            border: ready ? "1px solid rgba(74,124,89,0.2)" : "1px solid var(--amber-border)",
            color: ready ? "var(--forest)" : "var(--amber)",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            whiteSpace: "nowrap",
          }}
        >
          {loading ? t("ryhti.loading") : ready ? t("ryhti.ready") : t("ryhti.blocked", { count: blockingIssues.length })}
        </span>
      </div>

      {error && (
        <div style={{ marginTop: 10, color: "var(--danger)", fontSize: 12 }}>
          {t("ryhti.loadFailed")}
        </div>
      )}

      {address && (
        <div style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.4 }}>
          {t("ryhti.site")}: <span style={{ color: "var(--text-secondary)" }}>{address}</span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
          {t("ryhti.municipalityNumber")}
          <input
            className="input"
            value={metadata.municipalityNumber ?? ""}
            onChange={(e) => setField("municipalityNumber", e.target.value)}
            placeholder="091"
            style={{ padding: "7px 8px", fontSize: 12 }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, color: "var(--text-muted)" }}>
          {t("ryhti.propertyIdentifier")}
          <input
            className="input"
            value={metadata.propertyIdentifier ?? ""}
            onChange={(e) => setField("propertyIdentifier", e.target.value)}
            placeholder="91-1-2-3"
            style={{ padding: "7px 8px", fontSize: 12 }}
          />
        </label>
      </div>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
        {t("ryhti.buildingIdentifier")}
        <input
          className="input"
          value={metadata.permanentBuildingIdentifier ?? ""}
          onChange={(e) => setField("permanentBuildingIdentifier", e.target.value)}
          placeholder="103456789A"
          style={{ padding: "7px 8px", fontSize: 12 }}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
        {t("ryhti.description")}
        <textarea
          className="input"
          value={metadata.descriptionOfAction ?? ""}
          onChange={(e) => setField("descriptionOfAction", e.target.value)}
          placeholder={t("ryhti.descriptionPlaceholder")}
          rows={3}
          style={{ padding: "7px 8px", fontSize: 12, resize: "vertical" }}
        />
      </label>

      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 10, fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.4 }}>
        <input
          type="checkbox"
          checked={metadata.suomiFiAuthenticated === true}
          onChange={(e) => setField("suomiFiAuthenticated", e.target.checked)}
          style={{ marginTop: 2 }}
        />
        <span>{t("ryhti.suomiFiConfirmed")}</span>
      </label>

      {visibleIssues.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 12 }}>
          {visibleIssues.map((issue) => (
            <div
              key={`${issue.level}:${issue.code}:${issue.field ?? ""}`}
              style={{
                padding: "7px 8px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-sm)",
                fontSize: 11,
                lineHeight: 1.4,
              }}
            >
              <div style={{ color: issueColor(issue.level), fontWeight: 600 }}>
                {issue.message}
              </div>
              <div style={{ color: "var(--text-muted)", marginTop: 2 }}>
                {issue.action}
              </div>
            </div>
          ))}
        </div>
      )}

      {latest && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 10px",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius-sm)",
            fontSize: 11,
            lineHeight: 1.45,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <span style={{ color: "var(--text-muted)" }}>{t("ryhti.latestStatus")}</span>
            <span style={{ color: statusColor(latest.status), fontWeight: 600 }}>{latest.status}</span>
          </div>
          {latest.ryhti_tracking_id && (
            <div style={{ marginTop: 4, color: "var(--text-muted)", wordBreak: "break-word" }}>
              {t("ryhti.trackingId")}: {latest.ryhti_tracking_id}
            </div>
          )}
          <div style={{ marginTop: 4, color: "var(--text-muted)" }}>
            {new Date(latest.created_at).toLocaleString(locale === "fi" ? "fi-FI" : "en-GB")}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          className="btn btn-ghost"
          onClick={saveMetadata}
          disabled={saving || loading}
          style={{ flex: 1, padding: "8px 10px", fontSize: 12 }}
        >
          {saving ? t("ryhti.saving") : t("ryhti.check")}
        </button>
        <button
          className="btn btn-primary"
          onClick={submitPackage}
          disabled={!ready || submitting || loading}
          style={{ flex: 1, padding: "8px 10px", fontSize: 12, fontWeight: 600 }}
        >
          {submitting ? t("ryhti.submitting") : t("ryhti.createPackage")}
        </button>
      </div>

      <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 10, lineHeight: 1.4 }}>
        {validation?.remoteConfigured ? t("ryhti.liveMode") : t("ryhti.dryRunNote")}
      </div>
    </div>
  );
}
