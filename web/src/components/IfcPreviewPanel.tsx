"use client";

import { useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { api } from "@/lib/api";
import { analyzeIfcStep, rememberIfcReadiness, type IfcPreviewAnalysis, type IfcValidationStatus } from "@/lib/ifc-preview";

const COPY = {
  en: {
    title: "IFC 4.3 permit preview",
    subtitle: "Generate the Lupapiste export, inspect the object tree, and catch blocking IFC issues before you download.",
    generate: "Generate preview",
    refresh: "Refresh preview",
    generating: "Generating...",
    download: "Download IFC",
    downloading: "Downloading...",
    empty: "No IFC preview yet. Generate one from the current saved project.",
    ready: "Ready for Lupapiste",
    blocked: "Needs fixes",
    warning: "Warnings",
    schema: "Schema",
    largestSpan: "Largest span",
    boxes: "Bounding boxes",
    objects: "Object tree",
    checklist: "Validation checklist",
    failed: "Could not generate IFC preview.",
    noObjects: "No previewable building objects found.",
    meters: "m",
  },
  fi: {
    title: "IFC 4.3 -lupamallin esikatselu",
    subtitle: "Luo Lupapiste-vienti, tarkista objektipuu ja poimi estävät IFC-virheet ennen latausta.",
    generate: "Luo esikatselu",
    refresh: "Päivitä esikatselu",
    generating: "Luodaan...",
    download: "Lataa IFC",
    downloading: "Ladataan...",
    empty: "IFC-esikatselua ei ole vielä. Luo se nykyisestä tallennetusta projektista.",
    ready: "Valmis Lupapisteeseen",
    blocked: "Korjattavaa",
    warning: "Varoituksia",
    schema: "Skeema",
    largestSpan: "Suurin mitta",
    boxes: "Rajauslaatikot",
    objects: "Objektipuu",
    checklist: "Tarkistuslista",
    failed: "IFC-esikatselua ei voitu luoda.",
    noObjects: "Esikatseltavia rakennusobjekteja ei löytynyt.",
    meters: "m",
  },
  sv: {
    title: "IFC 4.3 tillståndsmodell förhandsgranskning",
    subtitle: "Generera Lupapiste-exporten, inspektera objektträdet och fånga blockerande IFC-problem innan nedladdning.",
    generate: "Generera förhandsgranskning",
    refresh: "Uppdatera förhandsgranskning",
    generating: "Genererar...",
    download: "Ladda ner IFC",
    downloading: "Laddar ner...",
    empty: "Ingen IFC-förhandsgranskning ännu. Generera en från det aktuella sparade projektet.",
    ready: "Redo för Lupapiste",
    blocked: "Behöver åtgärdas",
    warning: "Varningar",
    schema: "Schema",
    largestSpan: "Största spann",
    boxes: "Begränsningsrutor",
    objects: "Objektträd",
    checklist: "Valideringschecklista",
    failed: "Kunde inte generera IFC-förhandsgranskning.",
    noObjects: "Inga förhandsgranskningsbara byggobjekt hittades.",
    meters: "m",
  },
} as const;

function statusTone(status: IfcValidationStatus): { color: string; background: string; border: string; mark: string } {
  if (status === "pass") {
    return { color: "var(--forest)", background: "var(--forest-dim)", border: "rgba(74,124,89,0.24)", mark: "OK" };
  }
  if (status === "warning") {
    return { color: "var(--amber)", background: "var(--amber-glow)", border: "var(--amber-border)", mark: "WARN" };
  }
  return { color: "var(--danger)", background: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.25)", mark: "FIX" };
}

export default function IfcPreviewPanel({
  projectId,
  projectName,
}: {
  projectId?: string;
  projectName?: string;
}) {
  const { locale } = useTranslation();
  const copy = locale === "fi" ? COPY.fi : locale === "sv" ? COPY.sv : COPY.en;
  const [analysis, setAnalysis] = useState<IfcPreviewAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!projectId) return null;

  const generatePreview = async () => {
    setLoading(true);
    setError(null);
    try {
      const ifcText = await api.getIFC(projectId);
      const nextAnalysis = analyzeIfcStep(ifcText);
      rememberIfcReadiness(projectId, nextAnalysis);
      setAnalysis(nextAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.failed);
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadIfc = async () => {
    setDownloading(true);
    try {
      await api.exportIFC(projectId, projectName || "project");
    } finally {
      setDownloading(false);
    }
  };

  const ready = analysis?.readyForLupapiste ?? false;

  return (
    <section
      aria-labelledby="ifc-preview-heading"
      style={{
        marginTop: 12,
        padding: "14px 16px",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "linear-gradient(135deg, color-mix(in srgb, var(--bg-tertiary) 92%, var(--forest) 8%), var(--bg-tertiary))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div id="ifc-preview-heading" className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {copy.title}
          </div>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--text-secondary)", lineHeight: 1.45 }}>
            {copy.subtitle}
          </p>
        </div>
        {analysis && (
          <span
            style={{
              padding: "3px 7px",
              borderRadius: 999,
              border: ready ? "1px solid rgba(74,124,89,0.24)" : "1px solid var(--amber-border)",
              color: ready ? "var(--forest)" : "var(--amber)",
              background: ready ? "var(--forest-dim)" : "var(--amber-glow)",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              whiteSpace: "nowrap",
            }}
          >
            {ready ? copy.ready : copy.blocked}
          </span>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { void generatePreview(); }}
          disabled={loading}
          style={{ minHeight: 36, fontSize: 12 }}
        >
          {loading ? copy.generating : analysis ? copy.refresh : copy.generate}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => { void downloadIfc(); }}
          disabled={downloading}
          style={{ minHeight: 36, fontSize: 12 }}
        >
          {downloading ? copy.downloading : copy.download}
        </button>
      </div>

      {error && (
        <div role="alert" style={{ marginTop: 10, color: "var(--danger)", fontSize: 12 }}>
          {error || copy.failed}
        </div>
      )}

      {!analysis && !error && (
        <div style={{ marginTop: 12, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.45 }}>
          {copy.empty}
        </div>
      )}

      {analysis && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
            <Metric label={copy.schema} value={analysis.schema ?? "Unknown"} />
            <Metric
              label={copy.largestSpan}
              value={analysis.largestSpanMeters === null ? "-" : `${analysis.largestSpanMeters.toFixed(1)} ${copy.meters}`}
            />
            <Metric label={copy.boxes} value={String(analysis.boundingBoxes.length)} />
          </div>

          <div
            style={{
              marginTop: 12,
              padding: 10,
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.04)",
            }}
          >
            <div className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
              {copy.objects}
            </div>
            {analysis.previewElements.length === 0 ? (
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{copy.noObjects}</div>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {analysis.previewElements.map((element, index) => (
                  <div
                    key={element.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "72px 1fr auto",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: "var(--text-secondary)" }}>{element.label}</span>
                    <span
                      aria-hidden="true"
                      style={{
                        height: 12,
                        borderRadius: 999,
                        background: `linear-gradient(90deg, ${element.color}, color-mix(in srgb, ${element.color} 42%, transparent))`,
                        transform: `translateX(${index * 3}px)`,
                        width: `${Math.max(18, Math.min(100, element.count * 18))}%`,
                        boxShadow: "0 8px 18px rgba(0,0,0,0.14)",
                      }}
                    />
                    <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                      {element.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ marginTop: 12 }}>
            <div className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>
              {copy.checklist}
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              {analysis.checks.map((check) => {
                const tone = statusTone(check.status);
                return (
                  <div
                    key={check.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "46px 1fr",
                      gap: 8,
                      padding: "8px 9px",
                      borderRadius: "var(--radius-sm)",
                      border: `1px solid ${tone.border}`,
                      background: tone.background,
                    }}
                  >
                    <span style={{ color: tone.color, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700 }}>
                      {tone.mark}
                    </span>
                    <span>
                      <span style={{ display: "block", color: "var(--text-primary)", fontSize: 12, fontWeight: 600 }}>
                        {check.label}
                      </span>
                      <span style={{ display: "block", color: "var(--text-secondary)", fontSize: 11, lineHeight: 1.35, marginTop: 2 }}>
                        {check.message}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {analysis.warningCount > 0 && (
            <div style={{ marginTop: 10, color: "var(--amber)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
              {copy.warning}: {analysis.warningCount}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        padding: "8px 9px",
        borderRadius: "var(--radius-sm)",
        background: "rgba(0,0,0,0.05)",
        border: "1px solid var(--border)",
        minWidth: 0,
      }}
    >
      <div className="label-mono" style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ color: "var(--text-primary)", fontSize: 12, fontWeight: 650, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}
