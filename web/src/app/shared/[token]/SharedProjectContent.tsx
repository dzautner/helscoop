"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useTranslation } from "@/components/LocaleProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getPresentationPreset } from "@/lib/presentation-export";
import type { BomItem, Project } from "@/types";

function escapeCsvField(value: string, sep: string): string {
  if (value.includes(sep) || value.includes('"') || value.includes('\n')) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function exportBomCsv(
  bom: BomItem[],
  projectName: string,
  locale: string,
  t: (key: string) => string,
): void {
  const isFi = locale === 'fi';
  const sep = isFi ? ';' : ',';
  const fmt = (n: number) => { const s = n.toFixed(2); return isFi ? s.replace('.', ',') : s; };

  const headers = [
    t('share.csvMaterial'), t('share.csvQuantity'), t('share.csvUnit'),
    t('share.csvUnitPrice'), t('share.csvTotal'), t('share.csvSupplier'),
  ];

  const rows = bom.map((item) => [
    escapeCsvField(item.material_name || item.material_id, sep),
    fmt(item.quantity),
    escapeCsvField(item.unit || '', sep),
    fmt(item.unit_price ?? 0),
    fmt(item.total ?? 0),
    escapeCsvField(item.supplier || '', sep),
  ].join(sep));

  const csv = '\uFEFF' + headers.map((h) => escapeCsvField(h, sep)).join(sep) + '\n' + rows.join('\n') + '\n';
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safe = projectName.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);
  a.download = `helscoop-bom-${safe}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Viewport3DLoading() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-live="polite" aria-busy="true" style={{ width: "100%", height: "100%", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, overflow: "hidden", position: "relative" }}>
      <div className="skeleton" style={{ position: "absolute", inset: 0, opacity: 0.3 }} />
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
      <span style={{ color: "var(--text-muted)", fontSize: 12, position: "relative" }}>{t('editor.loading3D')}</span>
    </div>
  );
}

const Viewport3D = dynamic(() => import("@/components/Viewport3D"), {
  ssr: false,
  loading: () => <Viewport3DLoading />,
});

export default function SharedProjectContent({ token }: { token: string }) {
  const { t, locale } = useTranslation();
  const searchParams = useSearchParams();

  const [project, setProject] = useState<Project | null>(null);
  const [bom, setBom] = useState<BomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.getSharedProject(token)
      .then((proj) => {
        setProject(proj);
        if (proj.bom) {
          setBom(proj.bom.map((b: BomItem & { line_cost?: number }) => ({
            ...b,
            total: b.total ?? b.line_cost ?? ((b.unit_price || 0) * b.quantity),
          })));
        }
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
        color: "var(--text-muted)",
        fontSize: 14,
      }} role="status" aria-live="polite" aria-busy="true">
        <h1 style={{ fontSize: 14, fontWeight: 400, margin: 0 }}>{t('editor.loadingProject')}</h1>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-primary)",
        gap: 12,
        padding: 40,
        textAlign: "center",
      }} role="alert">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        <h2 className="heading-display" style={{ fontSize: 20, margin: 0, color: "var(--text-primary)" }}>
          {t('share.notFound')}
        </h2>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, maxWidth: 360 }}>
          {t('share.notFoundDesc')}
        </p>
        <a href="https://helscoop.fi" className="btn btn-primary" style={{ marginTop: 8, padding: "10px 24px", textDecoration: "none", fontSize: 13 }}>
          {t('share.signUpCta')}
        </a>
      </div>
    );
  }

  const grandTotal = bom.reduce((sum, b) => sum + (b.total || 0), 0);
  const presentationMode = searchParams.get("presentation") === "1";
  const presentationPreset = getPresentationPreset(searchParams.get("camera")).id;

  return (
    <div style={{
      height: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--bg-primary)",
      overflow: "hidden",
    }}>
      {/* Minimal header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        gap: 12,
        flexShrink: 0,
      }}>
        <h1 style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--text-primary)",
          margin: 0,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {project.name}
        </h1>
        <span style={{
          fontSize: 11,
          color: "var(--text-muted)",
          padding: "3px 8px",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-sm)",
          flexShrink: 0,
        }}>
          {t('share.readOnly')}
        </span>
        {presentationMode && (
          <span className="shared-presentation-badge">
            {t("presentation.viewerBadge")}
          </span>
        )}
      </div>

      {/* Main content */}
      <div className="shared-project-layout" style={{
        flex: 1,
        display: "flex",
        minHeight: 0,
        overflow: "hidden",
      }}>
        {/* Viewport */}
        <div style={{ flex: 1, minWidth: 0, padding: 8, position: "relative" }}>
          {presentationMode && (
            <div className="shared-presentation-card">
              <div className="label-mono">{t("presentation.pitchMode")}</div>
              <strong>{project.name}</strong>
              <span>{t("presentation.pitchModeDesc")}</span>
            </div>
          )}
          <ErrorBoundary
            fallback={({ error: err }) => (
              <div style={{
                width: "100%",
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-secondary)",
                borderRadius: "var(--radius-md)",
                color: "var(--text-muted)",
                fontSize: 13,
              }}>
                {t('editor.viewportCrashTitle')}: {err.message}
              </div>
            )}
          >
            <Viewport3D
              sceneJs={project.scene_js || ""}
              wireframe={false}
              initialPresentationPreset={presentationMode ? presentationPreset : undefined}
            />
          </ErrorBoundary>
        </div>

        {/* BOM sidebar */}
        {bom.length > 0 && (
          <div className="shared-project-sidebar" style={{
            width: 320,
            flexShrink: 0,
            borderLeft: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}>
            <div style={{
              padding: "14px 16px 10px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <h2 style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-muted)",
                margin: 0,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}>
                {t('share.materials')}
              </h2>
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  type="button"
                  className="shared-export-btn"
                  onClick={() => exportBomCsv(bom, project.name, locale, t)}
                  title={t('share.exportCsv')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  CSV
                </button>
                <button
                  type="button"
                  className="shared-export-btn"
                  onClick={() => window.print()}
                  title={t('share.print')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 6 2 18 2 18 9" />
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                    <rect x="6" y="14" width="12" height="8" />
                  </svg>
                </button>
              </div>
            </div>
            <div style={{
              flex: 1,
              overflowY: "auto",
              padding: "8px 0",
            }}>
              {bom.map((item, i) => (
                <div
                  key={`${item.material_id}-${i}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 16px",
                    fontSize: 13,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.material_name}
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>
                      {item.quantity} {item.unit}
                      {item.supplier && ` \u00b7 ${item.supplier}`}
                    </div>
                  </div>
                  <div style={{ color: "var(--text-secondary)", fontWeight: 500, flexShrink: 0, marginLeft: 12, fontVariantNumeric: "tabular-nums" }}>
                    {(item.total || 0).toFixed(2)} EUR
                  </div>
                </div>
              ))}
            </div>
            {/* Total */}
            <div style={{
              padding: "12px 16px",
              borderTop: "1px solid var(--border-strong)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
                {t('share.total')}
              </span>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>
                {grandTotal.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EUR
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: "8px 16px",
        borderTop: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {t('share.poweredBy')}
        </span>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>&middot;</span>
        <a
          href="https://helscoop.fi"
          style={{
            fontSize: 12,
            color: "var(--accent)",
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          {t('share.signUpCta')}
        </a>
      </div>
    </div>
  );
}
