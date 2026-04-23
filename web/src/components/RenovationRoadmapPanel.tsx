"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import {
  buildRenovationRoadmap,
  formatRoadmapHandoff,
  type RoadmapPhase,
} from "@/lib/renovation-roadmap";
import type { BomItem, BuildingInfo, Material } from "@/types";
import type { LocalizedText } from "@/lib/permit-checker";

interface RenovationRoadmapPanelProps {
  bom: BomItem[];
  materials: Material[];
  buildingInfo?: BuildingInfo | null;
  projectName?: string;
  projectDescription?: string;
}

const COPY = {
  fi: {
    eyebrow: "Toteutuspolku",
    title: "Remontin tiekartta",
    subtitle: "Järjestä materiaalilista työvaiheiksi, lupa-askeliksi ja urakoitsijavastuiksi.",
    duration: "Arvioitu kesto",
    permit: "Lupa-arvio",
    cost: "Materiaalit",
    weeks: "viikkoa",
    copy: "Kopioi urakoitsijalle",
    copied: "Kopioitu",
    print: "Tulosta / PDF",
    contractorMode: "Urakoitsijat",
    diyMode: "Teen itse",
    critical: "Kriittinen polku",
    overlap: "Voi limittyä",
    bomRows: "BOM-rivit",
    noRows: "Ei suoria materiaalirivejä",
    checklist: "Lupa- ja tarkistuslista",
    required: "Pakollinen / todennäköinen",
    optional: "Tarkista tarvittaessa",
    owner: "Vastuu",
    timing: "Milloin",
    fee: "Kulu",
    assumptions: "Oletukset",
    diyHint: "Omatoimisesti: varaa työkalut, nostot, jätehuolto ja tarkastukset ennen vaiheen alkua.",
  },
  en: {
    eyebrow: "Execution path",
    title: "Renovation roadmap",
    subtitle: "Turn the material list into work phases, permit steps, and contractor responsibilities.",
    duration: "Estimated duration",
    permit: "Permit estimate",
    cost: "Materials",
    weeks: "weeks",
    copy: "Copy for contractor",
    copied: "Copied",
    print: "Print / PDF",
    contractorMode: "Contractors",
    diyMode: "DIY",
    critical: "Critical path",
    overlap: "Can overlap",
    bomRows: "BOM rows",
    noRows: "No direct material rows",
    checklist: "Permit and inspection checklist",
    required: "Required / likely",
    optional: "Check if needed",
    owner: "Owner",
    timing: "Timing",
    fee: "Fee",
    assumptions: "Assumptions",
    diyHint: "DIY mode: reserve tools, lifting, waste handling, and inspections before this phase starts.",
  },
} as const;

function text(value: LocalizedText, locale: "fi" | "en"): string {
  return value[locale] ?? value.en;
}

function formatEur(value: number, locale: string): string {
  return `${Math.round(value).toLocaleString(locale === "fi" ? "fi-FI" : "en-GB")} €`;
}

function phaseTone(index: number): { background: string; border: string; color: string } {
  const tones = [
    { background: "rgba(229,160,75,0.16)", border: "rgba(229,160,75,0.42)", color: "var(--amber)" },
    { background: "rgba(74,124,89,0.14)", border: "rgba(74,124,89,0.38)", color: "var(--forest)" },
    { background: "rgba(96,125,139,0.15)", border: "rgba(96,125,139,0.35)", color: "var(--text-secondary)" },
    { background: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.32)", color: "#6a9fb5" },
  ];
  return tones[index % tones.length];
}

export default function RenovationRoadmapPanel({
  bom,
  materials,
  buildingInfo,
  projectName,
  projectDescription,
}: RenovationRoadmapPanelProps) {
  const { locale } = useTranslation();
  const roadmapLocale: "fi" | "en" = locale === "fi" ? "fi" : "en";
  const copy = COPY[roadmapLocale];
  const [deliveryMode, setDeliveryMode] = useState<"contractor" | "diy">("contractor");
  const [copied, setCopied] = useState(false);

  const roadmap = useMemo(
    () => buildRenovationRoadmap({ bom, materials, buildingInfo, projectName, projectDescription }),
    [bom, buildingInfo, materials, projectDescription, projectName],
  );

  if (bom.length === 0) return null;

  const copyHandoff = async () => {
    await navigator.clipboard.writeText(formatRoadmapHandoff(roadmap, roadmapLocale));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section
      data-testid="renovation-roadmap-panel"
      aria-labelledby="renovation-roadmap-title"
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(229,160,75,0.24)",
        background: "linear-gradient(160deg, rgba(229,160,75,0.12), rgba(22,27,31,0.42))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div className="label-mono" style={{ color: "var(--amber)", fontSize: 10, marginBottom: 4 }}>
            {copy.eyebrow}
          </div>
          <h4 id="renovation-roadmap-title" style={{ margin: 0, color: "var(--text-primary)", fontSize: 15 }}>
            {copy.title}
          </h4>
          <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.4 }}>
            {copy.subtitle}
          </p>
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setDeliveryMode("contractor")}
            aria-pressed={deliveryMode === "contractor"}
            className="category-chip"
            data-active={deliveryMode === "contractor"}
          >
            {copy.contractorMode}
          </button>
          <button
            type="button"
            onClick={() => setDeliveryMode("diy")}
            aria-pressed={deliveryMode === "diy"}
            className="category-chip"
            data-active={deliveryMode === "diy"}
          >
            {copy.diyMode}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
        <Metric label={copy.duration} value={`${roadmap.totalWeeks} ${copy.weeks}`} />
        <Metric label={copy.permit} value={text(roadmap.permitAssessment.permitType, roadmapLocale)} />
        <Metric label={copy.cost} value={formatEur(roadmap.totalCost, locale)} />
      </div>

      <div
        aria-label="Roadmap timeline"
        style={{
          position: "relative",
          marginTop: 14,
          padding: "12px 10px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "var(--bg-tertiary)",
        }}
      >
        <div style={{ display: "grid", gap: 7 }}>
          {roadmap.phases.map((phase, index) => (
            <TimelineRow key={phase.id} phase={phase} index={index} totalWeeks={roadmap.totalWeeks} locale={roadmapLocale} />
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
        {roadmap.phases.map((phase, index) => {
          const tone = phaseTone(index);
          return (
            <details
              key={phase.id}
              open={phase.criticalPath || phase.items.length > 0}
              style={{
                border: `1px solid ${tone.border}`,
                borderRadius: "var(--radius-sm)",
                background: "rgba(255,255,255,0.025)",
                overflow: "hidden",
              }}
            >
              <summary
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "9px 10px",
                  cursor: "pointer",
                  color: "var(--text-primary)",
                  fontSize: 12,
                  fontWeight: 800,
                }}
              >
                <span>{text(phase.title, roadmapLocale)}</span>
                <span style={{ color: tone.color, fontSize: 10, fontWeight: 800 }}>
                  W{phase.startWeek + 1}-{phase.startWeek + phase.durationWeeks}
                </span>
              </summary>
              <div style={{ padding: "0 10px 10px" }}>
                <p style={{ margin: "0 0 8px", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.4 }}>
                  {text(phase.summary, roadmapLocale)}
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  <Metric label={deliveryMode === "diy" ? copy.diyMode : copy.contractorMode} value={deliveryMode === "diy" ? text(phase.crew, roadmapLocale) : text(phase.contractorType, roadmapLocale)} />
                  <Metric label={copy.cost} value={formatEur(phase.estimatedCost, locale)} muted={phase.estimatedCost === 0} />
                  <Metric label={copy.critical} value={phase.criticalPath ? "Yes" : "No"} muted={!phase.criticalPath} />
                  <Metric
                    label={copy.overlap}
                    value={phase.canOverlapWith.length > 0 ? phase.canOverlapWith.join(", ") : "-"}
                    muted={phase.canOverlapWith.length === 0}
                  />
                </div>
                {deliveryMode === "diy" && (
                  <p style={{ margin: "8px 0 0", color: "var(--amber)", fontSize: 10, lineHeight: 1.4 }}>
                    {copy.diyHint}
                  </p>
                )}
                <div className="label-mono" style={{ marginTop: 9, marginBottom: 5, color: "var(--text-muted)", fontSize: 10 }}>
                  {copy.bomRows}
                </div>
                {phase.items.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 3 }}>
                    {phase.items.slice(0, 6).map((item) => (
                      <li key={`${phase.id}-${item.materialId}-${item.name}`} style={{ color: "var(--text-secondary)", fontSize: 10, lineHeight: 1.35 }}>
                        {item.name}: {item.quantity.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB")} {item.unit} · {formatEur(item.estimatedCost, locale)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 10 }}>{copy.noRows}</p>
                )}
              </div>
            </details>
          );
        })}
      </div>

      <div style={{ marginTop: 12, padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
        <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 6 }}>
          {copy.checklist}
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {roadmap.checklist.map((item) => (
            <div key={item.id} style={{ display: "grid", gridTemplateColumns: "18px 1fr", gap: 7, alignItems: "start" }}>
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 4,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                  border: item.required ? "1px solid var(--amber-border)" : "1px solid var(--border)",
                  color: item.required ? "var(--amber)" : "var(--text-muted)",
                  fontSize: 10,
                  fontWeight: 900,
                }}
              >
                {item.required ? "!" : "-"}
              </span>
              <div>
                <div style={{ color: "var(--text-primary)", fontSize: 11, fontWeight: 800 }}>
                  {text(item.label, roadmapLocale)}
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1.35 }}>
                  {item.required ? copy.required : copy.optional} · {copy.owner}: {text(item.owner, roadmapLocale)}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: 10, lineHeight: 1.35 }}>
                  {copy.timing}: {text(item.timing, roadmapLocale)}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: 10, lineHeight: 1.35 }}>
                  {copy.fee}: {text(item.cost, roadmapLocale)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 10, fontWeight: 800 }}>
          {copy.assumptions}
        </summary>
        <ul style={{ margin: "6px 0 0", paddingLeft: 16, display: "grid", gap: 3 }}>
          {roadmap.assumptions.map((assumption) => (
            <li key={assumption.en} style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1.35 }}>
              {text(assumption, roadmapLocale)}
            </li>
          ))}
        </ul>
      </details>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" className="material-btn" onClick={copyHandoff} style={{ flex: 1, justifyContent: "center" }}>
          {copied ? copy.copied : copy.copy}
        </button>
        <button type="button" className="material-btn" onClick={() => window.print()} style={{ flex: 1, justifyContent: "center" }}>
          {copy.print}
        </button>
      </div>
    </section>
  );
}

function TimelineRow({
  phase,
  index,
  totalWeeks,
  locale,
}: {
  phase: RoadmapPhase;
  index: number;
  totalWeeks: number;
  locale: "fi" | "en";
}) {
  const tone = phaseTone(index);
  const left = `${Math.max(0, (phase.startWeek / totalWeeks) * 100)}%`;
  const width = `${Math.max(6, (phase.durationWeeks / totalWeeks) * 100)}%`;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "112px 1fr", gap: 8, alignItems: "center" }}>
      <div style={{ color: "var(--text-secondary)", fontSize: 10, lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis" }}>
        {text(phase.title, locale)}
      </div>
      <div style={{ position: "relative", height: 22, borderRadius: 999, background: "rgba(255,255,255,0.04)", overflow: "hidden" }}>
        <div
          title={`${text(phase.title, locale)}: ${phase.durationWeeks} weeks`}
          style={{
            position: "absolute",
            left,
            width,
            top: 3,
            bottom: 3,
            borderRadius: 999,
            border: `1px solid ${tone.border}`,
            background: tone.background,
            color: tone.color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 800,
            minWidth: 28,
          }}
        >
          {phase.durationWeeks}w
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div style={{ padding: "7px 8px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-tertiary)", minWidth: 0 }}>
      <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 9, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ color: muted ? "var(--text-muted)" : "var(--text-primary)", fontSize: 11, fontWeight: 800, lineHeight: 1.25, overflowWrap: "anywhere" }}>
        {value}
      </div>
    </div>
  );
}
