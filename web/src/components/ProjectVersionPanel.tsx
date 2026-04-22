"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { api } from "@/lib/api";
import type {
  ProjectBranch,
  ProjectVersion,
  ProjectVersionCompareResponse,
  ProjectVersionSnapshot,
  ProjectVersionsResponse,
} from "@/types";

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "fi" ? "fi-FI" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCurrency(amount: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fi" ? "fi-FI" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function summarizeDelta(version: ProjectVersion, t: (key: string, params?: Record<string, string | number>) => string): string {
  const fields = version.delta?.changedFields ?? [];
  const bom = version.delta?.bom;
  const parts: string[] = [];
  if (fields.includes("name")) parts.push(t("versions.fieldName"));
  if (fields.includes("description")) parts.push(t("versions.fieldDescription"));
  if (fields.includes("scene_js")) parts.push(t("versions.fieldScene"));
  if (fields.includes("initial")) parts.push(t("versions.initialSnapshot"));
  const bomCount = (bom?.added ?? 0) + (bom?.removed ?? 0) + (bom?.quantityChanged ?? 0) + (bom?.unitChanged ?? 0);
  if (bomCount > 0) parts.push(t("versions.bomChanges", { count: bomCount }));
  return parts.length > 0 ? parts.join(", ") : t("versions.noMaterialChanges");
}

function badgeTone(eventType: ProjectVersion["event_type"]): { background: string; color: string } {
  if (eventType === "named") return { background: "rgba(74,124,89,0.12)", color: "var(--success)" };
  if (eventType === "restore") return { background: "rgba(229,160,75,0.13)", color: "var(--amber)" };
  if (eventType === "branch") return { background: "rgba(59,130,246,0.12)", color: "#2563eb" };
  return { background: "rgba(0,0,0,0.06)", color: "var(--text-muted)" };
}

export default function ProjectVersionPanel({
  projectId,
  open,
  snapshot,
  activeBranchId,
  getThumbnail,
  saveNow,
  onClose,
  onActiveBranchChange,
  onRestored,
}: {
  projectId: string;
  open: boolean;
  snapshot: ProjectVersionSnapshot;
  activeBranchId: string | null;
  getThumbnail?: () => string | null;
  saveNow: () => Promise<void>;
  onClose: () => void;
  onActiveBranchChange: (branchId: string | null) => void;
  onRestored: (result: { snapshot: ProjectVersionSnapshot; project?: unknown }) => void;
}) {
  const { t, locale } = useTranslation();
  const [data, setData] = useState<ProjectVersionsResponse>({ branches: [], versions: [] });
  const [loading, setLoading] = useState(false);
  const [checkpointName, setCheckpointName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compare, setCompare] = useState<ProjectVersionCompareResponse | null>(null);

  const loadVersions = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    try {
      const result = await api.getProjectVersions(projectId);
      setData(result);
      const defaultBranch = result.branches.find((branch) => branch.is_default) ?? result.branches[0] ?? null;
      if (!activeBranchId && defaultBranch) onActiveBranchChange(defaultBranch.id);
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, onActiveBranchChange, open, projectId]);

  useEffect(() => {
    void loadVersions();
  }, [loadVersions]);

  const activeBranch = data.branches.find((branch) => branch.id === activeBranchId)
    ?? data.branches.find((branch) => branch.is_default)
    ?? data.branches[0]
    ?? null;

  const branchVersions = useMemo(() => {
    if (!activeBranch) return data.versions;
    return data.versions.filter((version) => version.branch_id === activeBranch.id);
  }, [activeBranch, data.versions]);

  const createCheckpoint = useCallback(async () => {
    const name = checkpointName.trim();
    if (!name) return;
    setBusy("checkpoint");
    try {
      await saveNow();
      await api.createProjectVersion(projectId, {
        snapshot,
        branch_id: activeBranch?.id ?? activeBranchId,
        name,
        event_type: "named",
        thumbnail_url: getThumbnail?.() ?? null,
      });
      setCheckpointName("");
      await loadVersions();
    } finally {
      setBusy(null);
    }
  }, [activeBranch?.id, activeBranchId, checkpointName, getThumbnail, loadVersions, projectId, saveNow, snapshot]);

  const createBranch = useCallback(async () => {
    const name = branchName.trim() || t("versions.defaultBranchName", { count: data.branches.length + 1 });
    setBusy("branch");
    try {
      await saveNow();
      const result = await api.createProjectBranch(projectId, {
        name,
        snapshot,
        thumbnail_url: getThumbnail?.() ?? null,
      });
      setBranchName("");
      onActiveBranchChange(result.branch.id);
      await loadVersions();
    } finally {
      setBusy(null);
    }
  }, [branchName, data.branches.length, getThumbnail, loadVersions, onActiveBranchChange, projectId, saveNow, snapshot, t]);

  const restoreVersion = useCallback(async (version: ProjectVersion) => {
    if (!window.confirm(t("versions.restoreConfirm"))) return;
    setBusy(version.id);
    try {
      const result = await api.restoreProjectVersion(projectId, version.id);
      onActiveBranchChange(version.branch_id);
      onRestored({ snapshot: result.snapshot, project: result.project });
      await loadVersions();
    } finally {
      setBusy(null);
    }
  }, [loadVersions, onActiveBranchChange, onRestored, projectId, t]);

  const toggleCompare = useCallback((versionId: string) => {
    setCompare(null);
    setCompareIds((prev) => {
      if (prev.includes(versionId)) return prev.filter((id) => id !== versionId);
      return [...prev.slice(-1), versionId];
    });
  }, []);

  useEffect(() => {
    if (compareIds.length !== 2) {
      setCompare(null);
      return;
    }
    let cancelled = false;
    api.compareProjectVersions(projectId, compareIds[0], compareIds[1])
      .then((result) => {
        if (!cancelled) setCompare(result);
      })
      .catch(() => {
        if (!cancelled) setCompare(null);
      });
    return () => {
      cancelled = true;
    };
  }, [compareIds, projectId]);

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-label={t("versions.title")}
      style={{
        position: "fixed",
        top: 58,
        right: 16,
        bottom: 16,
        width: "min(420px, calc(100vw - 32px))",
        zIndex: 80,
        display: "flex",
        flexDirection: "column",
        border: "1px solid var(--border-strong)",
        borderRadius: "var(--radius-lg)",
        background: "var(--bg-elevated)",
        boxShadow: "var(--shadow-xl)",
        overflow: "hidden",
      }}
    >
      <div style={{ padding: 16, borderBottom: "1px solid var(--border)", background: "linear-gradient(135deg, rgba(74,124,89,0.08), rgba(229,160,75,0.08))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div className="label-mono" style={{ color: "var(--forest)", fontSize: 10, marginBottom: 4 }}>
              {t("versions.eyebrow")}
            </div>
            <h2 style={{ margin: 0, fontSize: 16, color: "var(--text-primary)" }}>
              {t("versions.title")}
            </h2>
            <p style={{ margin: "5px 0 0", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>
              {t("versions.subtitle")}
            </p>
          </div>
          <button className="btn btn-ghost" type="button" onClick={onClose} aria-label={t("dialog.close")} style={{ padding: 6 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
        <div className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 7 }}>
          {t("versions.branches")}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {data.branches.map((branch: ProjectBranch) => (
            <button
              key={branch.id}
              type="button"
              className="btn btn-ghost"
              onClick={() => onActiveBranchChange(branch.id)}
              style={{
                padding: "5px 8px",
                fontSize: 11,
                borderColor: branch.id === activeBranch?.id ? "var(--forest)" : "var(--border)",
                color: branch.id === activeBranch?.id ? "var(--forest)" : "var(--text-secondary)",
              }}
            >
              {branch.name}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={branchName}
            onChange={(event) => setBranchName(event.target.value)}
            placeholder={t("versions.branchPlaceholder")}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="btn btn-secondary" type="button" onClick={createBranch} disabled={busy !== null}>
            {t("versions.createBranch")}
          </button>
        </div>
      </div>

      <div style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={checkpointName}
            onChange={(event) => setCheckpointName(event.target.value)}
            placeholder={t("versions.checkpointPlaceholder")}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button className="btn btn-primary" type="button" onClick={createCheckpoint} disabled={!checkpointName.trim() || busy !== null}>
            {busy === "checkpoint" ? t("versions.saving") : t("versions.saveCheckpoint")}
          </button>
        </div>
      </div>

      {compare && (
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", background: "rgba(74,124,89,0.06)" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 }}>
            {t("versions.compareTitle")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
            <span>{formatCurrency(compare.base.estimated_cost, locale)}</span>
            <span style={{ textAlign: "right" }}>{formatCurrency(compare.target.estimated_cost, locale)}</span>
          </div>
          <div style={{ marginTop: 5, fontSize: 12, color: compare.cost_delta > 0 ? "var(--danger)" : "var(--success)", fontWeight: 700 }}>
            {t("versions.costDelta", { amount: formatCurrency(compare.cost_delta, locale) })}
          </div>
        </div>
      )}

      <div style={{ overflow: "auto", padding: 14 }}>
        {loading ? (
          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{t("versions.loading")}</div>
        ) : branchVersions.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: 12 }}>{t("versions.empty")}</div>
        ) : (
          <div style={{ display: "grid", gap: 9 }}>
            {branchVersions.map((version) => {
              const tone = badgeTone(version.event_type);
              const selected = compareIds.includes(version.id);
              return (
                <article
                  key={version.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: version.thumbnail_url ? "72px 1fr" : "1fr",
                    gap: 10,
                    padding: 10,
                    border: selected ? "1px solid var(--forest)" : "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    background: selected ? "rgba(74,124,89,0.06)" : "var(--bg-secondary)",
                  }}
                >
                  {version.thumbnail_url && (
                    <img
                      src={version.thumbnail_url}
                      alt=""
                      style={{ width: 72, height: 54, objectFit: "cover", borderRadius: "var(--radius-sm)", background: "var(--bg-tertiary)" }}
                    />
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {version.name || t(`versions.event.${version.event_type}`)}
                      </strong>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: tone.background, color: tone.color }}>
                        {t(`versions.event.${version.event_type}`)}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                      {formatDate(version.created_at, locale)}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6, lineHeight: 1.35 }}>
                      {summarizeDelta(version, t)}
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      <button className="btn btn-ghost" type="button" onClick={() => toggleCompare(version.id)} style={{ padding: "4px 7px", fontSize: 11 }}>
                        {selected ? t("versions.uncompare") : t("versions.compare")}
                      </button>
                      <button className="btn btn-secondary" type="button" onClick={() => restoreVersion(version)} disabled={busy === version.id} style={{ padding: "4px 7px", fontSize: 11 }}>
                        {busy === version.id ? t("versions.restoring") : t("versions.restore")}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
