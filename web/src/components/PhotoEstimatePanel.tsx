"use client";

import { useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/components/LocaleProvider";
import { useToast } from "@/components/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import type {
  BuildingInfo,
  BomItem,
  PhotoEstimateResponse,
  PhotoEstimateUpload,
} from "@/types";
import type { BomImportMode } from "@/lib/bom-import";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function formatEuro(value: number, locale: string): string {
  return `${Math.round(value).toLocaleString(locale === "fi" ? "fi-FI" : "en-US")} €`;
}

function mergeSuggestions(result: PhotoEstimateResponse): BomItem[] {
  const merged = new Map<string, BomItem>();
  for (const suggestion of result.scopes.flatMap((scope) => scope.bom_suggestions)) {
    const key = `${suggestion.material_id}:${suggestion.unit}`;
    const existing = merged.get(key);
    if (existing) {
      const quantity = Number(existing.quantity || 0) + Number(suggestion.quantity || 0);
      const unitPrice = Number(existing.unit_price || suggestion.unit_price || 0);
      merged.set(key, {
        ...existing,
        quantity,
        unit_price: unitPrice,
        total: unitPrice * quantity,
        note: existing.note || suggestion.note,
      });
      continue;
    }
    merged.set(key, {
      material_id: suggestion.material_id,
      material_name: suggestion.material_name,
      category_name: suggestion.category_name || undefined,
      quantity: suggestion.quantity,
      unit: suggestion.unit,
      unit_price: suggestion.unit_price,
      total: suggestion.total,
      supplier: suggestion.supplier || undefined,
      link: suggestion.link,
      stock_level: "unknown",
      note: suggestion.note,
    });
  }
  return Array.from(merged.values());
}

export default function PhotoEstimatePanel({
  projectId,
  projectName,
  buildingInfo,
  onImportBom,
}: {
  projectId: string;
  projectName?: string;
  buildingInfo?: BuildingInfo | null;
  onImportBom?: (items: BomItem[], mode: BomImportMode) => void;
}) {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const { track } = useAnalytics();
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PhotoEstimateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);

  const importableItems = useMemo(() => result ? mergeSuggestions(result) : [], [result]);
  const inputId = `photo-estimate-${projectId}`;

  async function analyze() {
    if (files.length === 0 || loading) return;
    setLoading(true);
    setError(null);
    setImported(false);
    try {
      const photos: PhotoEstimateUpload[] = await Promise.all(files.map(async (file) => ({
        name: file.name,
        mime_type: file.type || "image/jpeg",
        size: file.size,
        data_url: await readFileAsDataUrl(file),
      })));
      const response = await api.estimatePhotoRenovation(projectId, {
        photos,
        building_info: buildingInfo ?? null,
      });
      setResult(response);
      track("photo_estimate_generated", {
        project_id: projectId,
        photo_count: files.length,
        scope_count: response.scopes.length,
        estimate_mid: response.estimate.mid,
      });
    } catch (err) {
      const message = err instanceof ApiError && err.status === 402
        ? t("photoEstimate.insufficientCredits")
        : err instanceof Error
          ? err.message
          : t("photoEstimate.error");
      setError(message);
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  function importEstimate() {
    if (!result || importableItems.length === 0 || !onImportBom) return;
    onImportBom(importableItems, "merge");
    setImported(true);
    toast(t("photoEstimate.imported", { count: importableItems.length }), "success");
    track("photo_estimate_imported", {
      project_id: projectId,
      item_count: importableItems.length,
      estimate_mid: result.estimate.mid,
    });
  }

  return (
    <section
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
        background: "linear-gradient(135deg, rgba(229,160,75,0.08), rgba(74,124,89,0.05))",
      }}
      aria-labelledby={`${inputId}-title`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div className="label-mono" style={{ color: "var(--amber)", marginBottom: 4 }}>
            {t("photoEstimate.eyebrow")}
          </div>
          <h4 id={`${inputId}-title`} style={{ margin: 0, fontSize: 13, color: "var(--text-primary)" }}>
            {t("photoEstimate.title")}
          </h4>
          <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
            {t("photoEstimate.subtitle")}
          </p>
        </div>
        <span className="badge badge-muted" title={t("photoEstimate.creditTooltip")}>
          {t("photoEstimate.creditCost")}
        </span>
      </div>

      <label
        htmlFor={inputId}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginTop: 10,
          minHeight: 58,
          border: "1px dashed var(--border-strong)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-secondary)",
          color: "var(--text-secondary)",
          fontSize: 12,
          cursor: "pointer",
          textAlign: "center",
          padding: "8px 10px",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        {files.length > 0
          ? t("photoEstimate.selected", { count: files.length })
          : t("photoEstimate.dropHint")}
      </label>
      <input
        id={inputId}
        aria-label={t("photoEstimate.fileInput")}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: "none" }}
        onChange={(event) => {
          const selected = Array.from(event.target.files || [])
            .filter((file) => file.type.startsWith("image/"))
            .slice(0, 5);
          setFiles(selected);
          setResult(null);
          setError(null);
          setImported(false);
        }}
      />

      {files.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {files.map((file) => (
            <span key={`${file.name}-${file.size}`} className="badge badge-muted" title={file.name}>
              {file.name.length > 20 ? `${file.name.slice(0, 17)}...` : file.name}
            </span>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary"
        disabled={files.length === 0 || loading}
        onClick={() => { void analyze(); }}
        style={{ width: "100%", marginTop: 10, fontSize: 12, opacity: files.length === 0 || loading ? 0.55 : 1 }}
      >
        {loading ? t("photoEstimate.analyzing") : t("photoEstimate.analyze")}
      </button>

      {error && (
        <div role="alert" style={{ marginTop: 8, color: "var(--danger)", fontSize: 11, lineHeight: 1.4 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ padding: 10, borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <div className="label-mono" style={{ marginBottom: 4, color: "var(--text-muted)" }}>
              {t("photoEstimate.rangeLabel")}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 16, color: "var(--text-primary)" }}>
                {formatEuro(result.estimate.mid, locale)}
              </strong>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                {formatEuro(result.estimate.low, locale)}-{formatEuro(result.estimate.high, locale)}
              </span>
            </div>
            <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 10, lineHeight: 1.4 }}>
              {t("photoEstimate.context", {
                photos: result.photos_analyzed,
                project: projectName || result.project_name,
              })}
            </p>
          </div>

          {result.scopes.map((scope) => (
            <div key={scope.scope} style={{ paddingBottom: 9, borderBottom: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <strong style={{ fontSize: 12 }}>
                  {t(`photoEstimate.scope.${scope.scope}`)}
                </strong>
                <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
                  {formatEuro(scope.mid_cost, locale)}
                </span>
              </div>
              <p style={{ margin: "4px 0 6px", color: "var(--text-muted)", fontSize: 10, lineHeight: 1.4 }}>
                {scope.quantity.toLocaleString(locale === "fi" ? "fi-FI" : "en-US")} {scope.unit} · {t("photoEstimate.confidence", { pct: Math.round(scope.confidence * 100) })}
              </p>
              {scope.bom_suggestions.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {scope.bom_suggestions.slice(0, 3).map((item) => (
                    <span key={`${scope.scope}-${item.material_id}`} className="badge badge-amber">
                      {item.material_name} · {item.quantity.toLocaleString(locale === "fi" ? "fi-FI" : "en-US", { maximumFractionDigits: 1 })} {item.unit}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {result.subsidy_flags.length > 0 && (
            <div style={{ padding: 8, borderRadius: "var(--radius-sm)", background: "rgba(74,124,89,0.08)", color: "var(--forest)", fontSize: 11 }}>
              {t("photoEstimate.subsidyFlag")}
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            disabled={importableItems.length === 0 || !onImportBom || imported}
            onClick={importEstimate}
            style={{ width: "100%", fontSize: 12 }}
          >
            {imported
              ? t("photoEstimate.importedShort")
              : t("photoEstimate.addToBom", { count: importableItems.length })}
          </button>
        </div>
      )}
    </section>
  );
}
