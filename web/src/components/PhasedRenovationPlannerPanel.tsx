"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import {
  buildPhasedRenovationPlan,
  formatPhasedRenovationPlan,
  type PhaseSchedule,
  type PhasedRenovationPhase,
  type PhasedRenovationYear,
} from "@/lib/phased-renovation";
import type { BomItem, BuildingInfo, Material } from "@/types";

interface PhasedRenovationPlannerPanelProps {
  bom: BomItem[];
  materials: Material[];
  buildingInfo?: BuildingInfo | null;
  projectName?: string;
  projectDescription?: string;
  coupleMode?: boolean;
  onCoupleModeChange?: (enabled: boolean) => void;
}

type PlannerLocale = "fi" | "en" | "sv";

const COPY = {
  fi: {
    eyebrow: "Verovuosioptimointi",
    title: "Vaiheistettu remonttisuunnitelma",
    subtitle: "Ajoita työvaiheet usealle vuodelle, jotta kotitalousvähennyksen katto ei pala yhdessä vuodessa.",
    startYear: "Aloitusvuosi",
    claimants: "Hakijat",
    oneClaimant: "1 hakija",
    twoClaimants: "2 hakijaa",
    totalDeduction: "Vähennys yhteensä",
    extraBenefit: "Lisähyöty vaiheistuksesta",
    netCost: "Nettokustannus",
    years: "Verovuodet",
    timeline: "Aikajana",
    year: "Vuosi",
    quarter: "Kvartaali",
    yearlyPlan: "Vuosikohtainen vähennys",
    labour: "Työ",
    materials: "Materiaalit",
    gross: "Brutto",
    credit: "Vähennys",
    utilization: "Katon käyttö",
    seasonalHints: "Kausivinkit",
    copy: "Kopioi urakoitsijalle",
    copied: "Kopioitu",
    singleYear: "Jos kaikki tehtäisiin yhdessä vuodessa",
    noRows: "Ei ajoitettavia vaiheita",
  },
  en: {
    eyebrow: "Tax-year optimization",
    title: "Phased renovation planner",
    subtitle: "Schedule work across years so the household deduction cap is not burned in one tax year.",
    startYear: "Start year",
    claimants: "Claimants",
    oneClaimant: "1 claimant",
    twoClaimants: "2 claimants",
    totalDeduction: "Total deduction",
    extraBenefit: "Extra phasing benefit",
    netCost: "Net cost",
    years: "Tax years",
    timeline: "Timeline",
    year: "Year",
    quarter: "Quarter",
    yearlyPlan: "Year-by-year deduction",
    labour: "Labour",
    materials: "Materials",
    gross: "Gross",
    credit: "Deduction",
    utilization: "Cap used",
    seasonalHints: "Seasonal hints",
    copy: "Copy for contractor",
    copied: "Copied",
    singleYear: "If done in one year",
    noRows: "No schedulable phases",
  },
  sv: {
    eyebrow: "Skatteårsoptimering",
    title: "Fasindelad renoveringsplan",
    subtitle: "Planera arbetet över flera år så att hushållsavdragets tak inte förbrukas under ett skatteår.",
    startYear: "Startår",
    claimants: "Sökande",
    oneClaimant: "1 sökande",
    twoClaimants: "2 sökande",
    totalDeduction: "Totalt avdrag",
    extraBenefit: "Extra nytta av fasning",
    netCost: "Nettokostnad",
    years: "Skatteår",
    timeline: "Tidslinje",
    year: "År",
    quarter: "Kvartal",
    yearlyPlan: "Avdrag per år",
    labour: "Arbete",
    materials: "Material",
    gross: "Brutto",
    credit: "Avdrag",
    utilization: "Tak använt",
    seasonalHints: "Säsongstips",
    copy: "Kopiera för entreprenör",
    copied: "Kopierat",
    singleYear: "Om allt görs under ett år",
    noRows: "Inga planerbara faser",
  },
} as const;

const QUARTERS = [1, 2, 3, 4] as const;

function plannerLocale(locale: string): PlannerLocale {
  if (locale === "fi" || locale === "sv") return locale;
  return "en";
}

function formatEur(value: number, locale: string): string {
  const numberLocale = locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB";
  return `${Math.round(value).toLocaleString(numberLocale)} €`;
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function phaseTone(index: number): { background: string; border: string; color: string } {
  const tones = [
    { background: "rgba(74,124,89,0.2)", border: "rgba(74,124,89,0.5)", color: "var(--forest)" },
    { background: "rgba(229,160,75,0.2)", border: "rgba(229,160,75,0.5)", color: "var(--amber)" },
    { background: "rgba(59,130,246,0.16)", border: "rgba(59,130,246,0.42)", color: "#7ea8d8" },
    { background: "rgba(148,163,184,0.14)", border: "rgba(148,163,184,0.38)", color: "var(--text-secondary)" },
  ];
  return tones[index % tones.length];
}

function buildYearOptions(startYear: number, phases: PhasedRenovationPhase[]): number[] {
  const latestPhaseYear = phases.reduce((latest, phase) => Math.max(latest, phase.schedule.year), startYear);
  const latest = Math.max(startYear + 4, latestPhaseYear);
  return Array.from({ length: latest - startYear + 1 }, (_, index) => startYear + index);
}

function buildTimelineSlots(startYear: number, phases: PhasedRenovationPhase[]): Array<{ year: number; quarter: 1 | 2 | 3 | 4 }> {
  const latestPhaseYear = phases.reduce((latest, phase) => Math.max(latest, phase.schedule.year), startYear);
  const latest = Math.max(startYear + 2, latestPhaseYear);
  return Array.from({ length: latest - startYear + 1 }, (_, index) => startYear + index).flatMap((year) =>
    QUARTERS.map((quarter) => ({ year, quarter })),
  );
}

export default function PhasedRenovationPlannerPanel({
  bom,
  materials,
  buildingInfo,
  projectName,
  projectDescription,
  coupleMode,
  onCoupleModeChange,
}: PhasedRenovationPlannerPanelProps) {
  const { locale } = useTranslation();
  const activeLocale = plannerLocale(locale);
  const copy = COPY[activeLocale];
  const [startYear, setStartYear] = useState(() => new Date().getFullYear());
  const [localCoupleMode, setLocalCoupleMode] = useState(Boolean(coupleMode));
  const [scheduleOverrides, setScheduleOverrides] = useState<Record<string, Partial<PhaseSchedule>>>({});
  const [copied, setCopied] = useState(false);
  const effectiveCoupleMode = coupleMode ?? localCoupleMode;

  const plan = useMemo(
    () =>
      buildPhasedRenovationPlan({
        bom,
        materials,
        buildingInfo,
        projectName,
        projectDescription,
        startYear,
        coupleMode: effectiveCoupleMode,
        scheduleOverrides,
        locale: activeLocale,
      }),
    [activeLocale, bom, buildingInfo, effectiveCoupleMode, materials, projectDescription, projectName, scheduleOverrides, startYear],
  );

  if (bom.length === 0) return null;

  const currentYear = new Date().getFullYear();
  const startYearOptions = Array.from({ length: 5 }, (_, index) => currentYear + index);
  const yearOptions = buildYearOptions(startYear, plan.phases);
  const timelineSlots = buildTimelineSlots(startYear, plan.phases);
  const hintedPhases = plan.phases.filter((phase) => phase.seasonalHint);

  const setCoupleMode = (enabled: boolean) => {
    setLocalCoupleMode(enabled);
    onCoupleModeChange?.(enabled);
  };

  const updatePhaseSchedule = (phaseId: string, patch: Partial<PhaseSchedule>) => {
    setScheduleOverrides((current) => ({
      ...current,
      [phaseId]: {
        ...current[phaseId],
        ...patch,
      },
    }));
  };

  const copyHandoff = async () => {
    const text = formatPhasedRenovationPlan(plan, activeLocale === "sv" ? "en" : activeLocale);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section
      aria-labelledby="phased-renovation-planner-title"
      data-testid="phased-renovation-planner"
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(74,124,89,0.28)",
        background: "linear-gradient(145deg, rgba(74,124,89,0.16), rgba(229,160,75,0.1) 48%, rgba(22,27,31,0.52))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div className="label-mono" style={{ color: "var(--forest)", fontSize: 10, marginBottom: 4 }}>
            {copy.eyebrow}
          </div>
          <h4 id="phased-renovation-planner-title" style={{ margin: 0, color: "var(--text-primary)", fontSize: 15 }}>
            {copy.title}
          </h4>
          <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.4 }}>
            {copy.subtitle}
          </p>
        </div>
        <label style={{ display: "grid", gap: 4, minWidth: 92 }}>
          <span className="label-mono" style={{ color: "var(--text-muted)", fontSize: 9 }}>
            {copy.startYear}
          </span>
          <select
            aria-label={copy.startYear}
            value={startYear}
            onChange={(event) => setStartYear(Number(event.target.value))}
            style={{
              width: "100%",
              padding: "6px 7px",
              color: "var(--text-primary)",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-sm)",
              fontSize: 11,
            }}
          >
            {startYearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
        <span className="label-mono" style={{ color: "var(--text-muted)", fontSize: 10, alignSelf: "center" }}>
          {copy.claimants}
        </span>
        <button
          type="button"
          className="category-chip"
          data-active={!effectiveCoupleMode}
          aria-pressed={!effectiveCoupleMode}
          onClick={() => setCoupleMode(false)}
        >
          {copy.oneClaimant}
        </button>
        <button
          type="button"
          className="category-chip"
          data-active={effectiveCoupleMode}
          aria-pressed={effectiveCoupleMode}
          onClick={() => setCoupleMode(true)}
        >
          {copy.twoClaimants}
        </button>
      </div>

      <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
        <Metric label={copy.totalDeduction} value={`-${formatEur(plan.totalCredit, locale)}`} strong />
        <Metric label={copy.extraBenefit} value={`+${formatEur(plan.optimizedSavings, locale)}`} strong={plan.optimizedSavings > 0} />
        <Metric label={copy.netCost} value={formatEur(plan.totalNetCost, locale)} />
        <Metric label={copy.years} value={`${plan.years.length}`} />
      </div>

      <p style={{ margin: "10px 0 0", color: plan.optimizedSavings > 0 ? "var(--forest)" : "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
        {plan.recommendation} {copy.singleYear}: -{formatEur(plan.allInOneYearCredit, locale)}.
      </p>

      <div
        role="region"
        tabIndex={0}
        aria-label={copy.timeline}
        style={{
          marginTop: 13,
          padding: 10,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
          background: "var(--bg-tertiary)",
          overflowX: "auto",
        }}
      >
        {plan.phases.length > 0 ? (
          <div
            style={{
              minWidth: Math.max(520, 112 + timelineSlots.length * 38),
              display: "grid",
              gridTemplateColumns: `112px repeat(${timelineSlots.length}, minmax(30px, 1fr))`,
              gap: 5,
              alignItems: "center",
            }}
          >
            <div />
            {timelineSlots.map((slot) => (
              <div
                key={`${slot.year}-${slot.quarter}`}
                className="label-mono"
                style={{ color: slot.quarter === 1 ? "var(--text-secondary)" : "var(--text-muted)", fontSize: 8, textAlign: "center" }}
              >
                {slot.quarter === 1 ? slot.year : ""} Q{slot.quarter}
              </div>
            ))}
            {plan.phases.map((phase, index) => (
              <TimelinePhase key={phase.id} phase={phase} index={index} row={index + 2} slots={timelineSlots} />
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 11 }}>{copy.noRows}</p>
        )}
      </div>

      <div style={{ display: "grid", gap: 7, marginTop: 12 }}>
        {plan.phases.map((phase) => (
          <div
            key={phase.id}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 92px 82px",
              gap: 7,
              alignItems: "center",
              padding: "8px 9px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.025)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ color: "var(--text-primary)", fontSize: 11, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>
                {phase.title}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 2 }}>
                {copy.labour}: {formatEur(phase.labourCost, locale)} · {copy.materials}: {formatEur(phase.materialCost, locale)}
              </div>
            </div>
            <label style={{ display: "grid", gap: 3 }}>
              <span className="label-mono" style={{ color: "var(--text-muted)", fontSize: 8 }}>
                {copy.year}
              </span>
              <select
                aria-label={`${phase.title} ${copy.year}`}
                value={phase.schedule.year}
                onChange={(event) => updatePhaseSchedule(phase.id, { year: Number(event.target.value) })}
                style={selectStyle}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 3 }}>
              <span className="label-mono" style={{ color: "var(--text-muted)", fontSize: 8 }}>
                {copy.quarter}
              </span>
              <select
                aria-label={`${phase.title} ${copy.quarter}`}
                value={phase.schedule.quarter}
                onChange={(event) => updatePhaseSchedule(phase.id, { quarter: Number(event.target.value) as 1 | 2 | 3 | 4 })}
                style={selectStyle}
              >
                {QUARTERS.map((quarter) => (
                  <option key={quarter} value={quarter}>
                    Q{quarter}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 13 }}>
        <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 7 }}>
          {copy.yearlyPlan}
        </div>
        <div style={{ display: "grid", gap: 7 }}>
          {plan.years.map((year) => (
            <YearCard key={year.year} year={year} copy={copy} locale={locale} />
          ))}
        </div>
      </div>

      {hintedPhases.length > 0 && (
        <div style={{ marginTop: 12, padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid rgba(229,160,75,0.24)", background: "rgba(229,160,75,0.08)" }}>
          <div className="label-mono" style={{ color: "var(--amber)", fontSize: 10, marginBottom: 5 }}>
            {copy.seasonalHints}
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, display: "grid", gap: 4 }}>
            {hintedPhases.map((phase) => (
              <li key={phase.id} style={{ color: "var(--text-secondary)", fontSize: 10, lineHeight: 1.35 }}>
                {phase.title}: {phase.seasonalHint}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button type="button" className="material-btn" onClick={copyHandoff} style={{ width: "100%", justifyContent: "center", marginTop: 12 }}>
        {copied ? copy.copied : copy.copy}
      </button>
    </section>
  );
}

const selectStyle = {
  width: "100%",
  padding: "5px 6px",
  color: "var(--text-primary)",
  background: "var(--bg-tertiary)",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  fontSize: 10,
} as const;

function TimelinePhase({
  phase,
  index,
  row,
  slots,
}: {
  phase: PhasedRenovationPhase;
  index: number;
  row: number;
  slots: Array<{ year: number; quarter: 1 | 2 | 3 | 4 }>;
}) {
  const tone = phaseTone(index);
  const slotIndex = slots.findIndex((slot) => slot.year === phase.schedule.year && slot.quarter === phase.schedule.quarter);
  const gridColumn = slotIndex >= 0
    ? `${slotIndex + 2} / span ${Math.max(1, Math.min(phase.schedule.durationQuarters, slots.length - slotIndex))}`
    : "2 / span 1";

  return (
    <>
      <div style={{ gridColumn: "1 / 2", gridRow: row, color: "var(--text-secondary)", fontSize: 10, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis" }}>
        {phase.title}
      </div>
      <div
        title={`${phase.title}: ${phase.schedule.year} Q${phase.schedule.quarter}`}
        style={{
          gridColumn,
          gridRow: row,
          minHeight: 23,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 999,
          border: `1px solid ${tone.border}`,
          background: tone.background,
          color: tone.color,
          fontSize: 9,
          fontWeight: 900,
          padding: "0 6px",
          whiteSpace: "nowrap",
        }}
      >
        Q{phase.schedule.quarter}
      </div>
    </>
  );
}

function YearCard({
  year,
  copy,
  locale,
}: {
  year: PhasedRenovationYear;
  copy: typeof COPY[PlannerLocale];
  locale: string;
}) {
  return (
    <div style={{ padding: 10, borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-secondary)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <strong style={{ color: "var(--text-primary)", fontSize: 12 }}>{year.year}</strong>
        <strong style={{ color: year.credit > 0 ? "var(--forest)" : "var(--text-muted)", fontSize: 12 }}>
          -{formatEur(year.credit, locale)}
        </strong>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6, marginTop: 7 }}>
        <MiniStat label={copy.gross} value={formatEur(year.grossCost, locale)} />
        <MiniStat label={copy.labour} value={formatEur(year.labourCost, locale)} />
        <MiniStat label={copy.netCost} value={formatEur(year.netCost, locale)} />
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, color: "var(--text-muted)", fontSize: 10 }}>
          <span>{copy.utilization}</span>
          <span>{formatPercent(year.utilization)}</span>
        </div>
        <div style={{ height: 7, marginTop: 4, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <div
            style={{
              width: formatPercent(year.utilization),
              height: "100%",
              borderRadius: 999,
              background: year.utilization >= 0.95 ? "var(--amber)" : "var(--forest)",
            }}
          />
        </div>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
        {year.phases.map((phase) => (
          <span key={phase.id} style={{ color: "var(--text-secondary)", background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)", borderRadius: 999, padding: "3px 6px", fontSize: 9 }}>
            Q{phase.schedule.quarter} {phase.title}
          </span>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ padding: "8px 9px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--bg-tertiary)", minWidth: 0 }}>
      <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 9, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ color: strong ? "var(--forest)" : "var(--text-primary)", fontSize: 12, fontWeight: 900, lineHeight: 1.2, overflowWrap: "anywhere" }}>
        {value}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 8, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: 10, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
