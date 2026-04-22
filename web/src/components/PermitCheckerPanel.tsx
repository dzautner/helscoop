"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import {
  PERMIT_CATEGORIES,
  PERMIT_QUESTIONS,
  assessPermitNeed,
  localizedPermitText,
  type PermitAnswers,
  type PermitCategoryId,
  type PermitLocale,
  type PermitOutcome,
  type PermitSeverity,
} from "@/lib/permit-checker";
import type { BuildingInfo } from "@/types";

interface PermitCheckerPanelProps {
  buildingInfo?: BuildingInfo | null;
}

const TEXT = {
  fi: {
    title: "Tarvitaanko lupa?",
    subtitle: "Nopea remontin lupatarkistus ennen kuin ostat materiaalit.",
    category: "1. Valitse työn tyyppi",
    details: "2. Vastaa tarkentaviin kysymyksiin",
    result: "3. Alustava tulos",
    municipality: "Kunta",
    municipalityFallback: "Ei tunnistettu osoitteesta",
    confidence: "Luottamus",
    processing: "Käsittelyaika",
    fee: "Maksuarvio",
    why: "Miksi",
    next: "Seuraavat askeleet",
    documents: "Tyypilliset liitteet",
    sources: "Lähteet",
    openLupapiste: "Avaa Lupapiste",
    disclaimer: "Ei juridinen päätös. Kunnan rakennusvalvonta ratkaisee luvan tarpeen, ja kaava tai suojelu voi muuttaa tulosta.",
    noQuestions: "Tälle valinnalle ei tarvita lisäkysymyksiä.",
    prepareDocs: "Jos lupa näyttää tarpeelliselta, jatka IFC/Ryhti-valmiuteen alempana.",
  },
  en: {
    title: "Permit needed?",
    subtitle: "Quick renovation permit check before buying materials.",
    category: "1. Select work type",
    details: "2. Answer clarifying questions",
    result: "3. Preliminary result",
    municipality: "Municipality",
    municipalityFallback: "Not detected from address",
    confidence: "Confidence",
    processing: "Processing time",
    fee: "Fee estimate",
    why: "Why",
    next: "Next steps",
    documents: "Typical attachments",
    sources: "Sources",
    openLupapiste: "Open Lupapiste",
    disclaimer: "Not a legal decision. Municipal building control decides permit need, and zoning or protection can change the result.",
    noQuestions: "No extra questions are needed for this selection.",
    prepareDocs: "If a permit looks likely, continue to IFC/Ryhti readiness below.",
  },
} as const;

const CONFIDENCE_TEXT = {
  fi: { high: "korkea", medium: "keskitaso", low: "matala" },
  en: { high: "high", medium: "medium", low: "low" },
} as const;

const OUTCOME_TONE: Record<PermitSeverity, { border: string; background: string; color: string }> = {
  danger: {
    border: "rgba(239, 68, 68, 0.35)",
    background: "rgba(239, 68, 68, 0.08)",
    color: "var(--danger)",
  },
  warning: {
    border: "rgba(229, 160, 75, 0.42)",
    background: "rgba(229, 160, 75, 0.08)",
    color: "var(--amber)",
  },
  success: {
    border: "rgba(74, 124, 89, 0.36)",
    background: "rgba(74, 124, 89, 0.08)",
    color: "var(--success)",
  },
  neutral: {
    border: "var(--border)",
    background: "var(--bg-tertiary)",
    color: "var(--text-secondary)",
  },
};

function outcomeIcon(outcome: PermitOutcome): string {
  switch (outcome) {
    case "building_permit":
      return "!";
    case "action_or_review":
      return "?";
    case "no_permit_likely":
      return "✓";
    default:
      return "i";
  }
}

function questionVisible(categoryId: PermitCategoryId, question: (typeof PERMIT_QUESTIONS)[number]): boolean {
  return !question.categories || question.categories.includes(categoryId);
}

export default function PermitCheckerPanel({ buildingInfo }: PermitCheckerPanelProps) {
  const { locale } = useTranslation();
  const permitLocale: PermitLocale = locale === "fi" ? "fi" : "en";
  const copy = TEXT[permitLocale];
  const [categoryId, setCategoryId] = useState<PermitCategoryId>("interior_surface");
  const [answers, setAnswers] = useState<PermitAnswers>(() => PERMIT_CATEGORIES[0].defaultAnswers ?? {});

  const visibleQuestions = PERMIT_QUESTIONS.filter((question) => questionVisible(categoryId, question));
  const assessment = useMemo(
    () => assessPermitNeed({ categoryId, answers, buildingInfo }),
    [answers, buildingInfo, categoryId],
  );
  const tone = OUTCOME_TONE[assessment.severity];

  const selectCategory = (nextCategoryId: PermitCategoryId) => {
    const nextCategory = PERMIT_CATEGORIES.find((item) => item.id === nextCategoryId) ?? PERMIT_CATEGORIES[0];
    setCategoryId(nextCategoryId);
    setAnswers(nextCategory.defaultAnswers ?? {});
  };

  const toggleAnswer = (id: keyof PermitAnswers) => {
    setAnswers((current) => ({ ...current, [id]: !current[id] }));
  };

  return (
    <section
      data-testid="permit-checker-panel"
      aria-labelledby="permit-checker-title"
      style={{
        marginTop: 12,
        padding: 12,
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border)",
        background: "linear-gradient(180deg, rgba(229,160,75,0.06) 0%, var(--bg-tertiary) 100%)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div>
          <h4 id="permit-checker-title" style={{ margin: 0, fontSize: 13, fontWeight: 800, color: "var(--text-primary)" }}>
            {copy.title}
          </h4>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.35 }}>
            {copy.subtitle}
          </p>
        </div>
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            border: `1px solid ${tone.border}`,
            background: tone.background,
            color: tone.color,
            fontWeight: 900,
          }}
        >
          {outcomeIcon(assessment.outcome)}
        </span>
      </div>

      <div className="label-mono" style={{ marginBottom: 6, fontSize: 10, color: "var(--text-muted)" }}>
        {copy.category}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
        {PERMIT_CATEGORIES.map((item) => {
          const active = item.id === categoryId;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectCategory(item.id)}
              aria-pressed={active}
              aria-label={localizedPermitText(item.label, permitLocale)}
              style={{
                padding: "8px 9px",
                textAlign: "left",
                borderRadius: "var(--radius-sm)",
                border: active ? "1px solid var(--amber-border)" : "1px solid var(--border)",
                background: active ? "rgba(229,160,75,0.12)" : "var(--bg-secondary)",
                color: active ? "var(--amber)" : "var(--text-secondary)",
                cursor: "pointer",
                minHeight: 48,
              }}
            >
              <span style={{ display: "block", fontSize: 11, fontWeight: 800 }}>
                {localizedPermitText(item.label, permitLocale)}
              </span>
              <span aria-hidden="true" style={{ display: "block", marginTop: 2, fontSize: 10, lineHeight: 1.25, color: "var(--text-muted)" }}>
                {localizedPermitText(item.description, permitLocale)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="label-mono" style={{ marginTop: 12, marginBottom: 6, fontSize: 10, color: "var(--text-muted)" }}>
        {copy.details}
      </div>
      {visibleQuestions.length > 0 ? (
        <div style={{ display: "grid", gap: 7 }}>
          {visibleQuestions.map((question) => (
            <label
              key={question.id}
              style={{
                display: "grid",
                gridTemplateColumns: "18px 1fr",
                gap: 7,
                alignItems: "start",
                padding: "7px 8px",
                borderRadius: "var(--radius-sm)",
                background: answers[question.id] ? "rgba(229,160,75,0.08)" : "rgba(255,255,255,0.02)",
                border: answers[question.id] ? "1px solid var(--amber-border)" : "1px solid transparent",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={!!answers[question.id]}
                onChange={() => toggleAnswer(question.id)}
                style={{ marginTop: 2, accentColor: "var(--amber)" }}
              />
              <span>
                <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.25 }}>
                  {localizedPermitText(question.label, permitLocale)}
                </span>
                <span style={{ display: "block", marginTop: 2, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.3 }}>
                  {localizedPermitText(question.help, permitLocale)}
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)" }}>{copy.noQuestions}</p>
      )}

      <div
        style={{
          marginTop: 12,
          padding: 10,
          borderRadius: "var(--radius-md)",
          border: `1px solid ${tone.border}`,
          background: tone.background,
        }}
      >
        <div className="label-mono" style={{ marginBottom: 5, fontSize: 10, color: "var(--text-muted)" }}>
          {copy.result}
        </div>
        <strong style={{ display: "block", color: tone.color, fontSize: 13, lineHeight: 1.25 }}>
          {localizedPermitText(assessment.permitType, permitLocale)}
        </strong>
        <p style={{ margin: "5px 0 0", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.35 }}>
          {localizedPermitText(assessment.summary, permitLocale)}
        </p>

        <div style={{ display: "grid", gap: 6, marginTop: 9 }}>
          <Metric label={copy.municipality} value={assessment.municipality.id === "national" ? copy.municipalityFallback : assessment.municipality.name} />
          <Metric label={copy.confidence} value={CONFIDENCE_TEXT[permitLocale][assessment.confidence]} />
          <Metric label={copy.processing} value={localizedPermitText(assessment.processingEstimate, permitLocale)} />
          <Metric label={copy.fee} value={localizedPermitText(assessment.costEstimate, permitLocale)} />
        </div>

        <DetailList title={copy.why} items={assessment.reasons.map((item) => localizedPermitText(item, permitLocale))} />
        <DetailList title={copy.next} items={assessment.nextSteps.map((item) => localizedPermitText(item, permitLocale))} />
        <DetailList title={copy.documents} items={assessment.documents.map((item) => localizedPermitText(item, permitLocale))} />

        {assessment.outcome !== "no_permit_likely" && (
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.35 }}>
            {copy.prepareDocs}
          </p>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 10 }}>
          <a
            href={assessment.municipality.permitUrl}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "7px 10px",
              borderRadius: "var(--radius-sm)",
              background: "var(--amber)",
              color: "var(--bg-primary)",
              fontSize: 11,
              fontWeight: 800,
              textDecoration: "none",
            }}
          >
            {copy.openLupapiste}
          </a>
        </div>
        <details style={{ marginTop: 9 }}>
          <summary style={{ cursor: "pointer", fontSize: 10, color: "var(--text-muted)", fontWeight: 700 }}>
            {copy.sources}
          </summary>
          <ul style={{ margin: "6px 0 0", paddingLeft: 16, display: "grid", gap: 3 }}>
            {assessment.sources.map((source) => (
              <li key={source.url} style={{ fontSize: 10, lineHeight: 1.35 }}>
                <a href={source.url} target="_blank" rel="noreferrer" style={{ color: "var(--amber)" }}>
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <p style={{ margin: "9px 0 0", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.35 }}>
        {copy.disclaimer}
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 8, alignItems: "start", fontSize: 10 }}>
      <span className="label-mono" style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text-primary)", lineHeight: 1.3 }}>{value}</span>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div style={{ marginTop: 9 }}>
      <div className="label-mono" style={{ marginBottom: 4, fontSize: 10, color: "var(--text-muted)" }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 3 }}>
        {items.map((item) => (
          <li key={item} style={{ fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.35 }}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
