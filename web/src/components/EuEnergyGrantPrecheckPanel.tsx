"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import {
  buildEuEnergyGrantPrecheck,
  type EuEnergyGrantAnswers,
  type EuGrantApplicantType,
  type EuGrantProjectStage,
  type EuGrantScope,
  type EuGrantStatus,
} from "@/lib/eu-energy-grants";
import type { BomItem, BuildingInfo, Material } from "@/types";

interface EuEnergyGrantPrecheckPanelProps {
  bom: BomItem[];
  materials: Material[];
  buildingInfo?: BuildingInfo | null;
  totalCost?: number;
}

const SCOPES: EuGrantScope[] = ["heating", "insulation", "windows", "solar", "smart_controls", "storage", "ev_charging"];

const COPY = {
  fi: {
    eyebrow: "Rahoituspolku",
    title: "EU- ja energiatukien esitarkistus",
    subtitle: "Tarkista Business Finland, EU Energy Communities Facility ja Motivan neuvonta ennen kuin tyot tilataan.",
    applicant: "Hakija",
    building: "Rakennus",
    year: "Rakennusvuosi",
    location: "Sijainti",
    stage: "Vaihe",
    scopes: "Remontin sisalto",
    badge: "Mahdollinen tuki",
    noCash: "Ei automaattista rahasignaalia",
    source: "Virallinen lahde",
    next: "Seuraavat askeleet",
    blockers: "Esteet",
    disclaimerPrefix: "Huomio",
    applicantTypes: {
      private_owner: "Yksityinen omistaja",
      housing_company: "Taloyhtio",
      energy_community: "Energiayhteiso",
      company_or_municipality: "Yritys / kunta",
    },
    buildingTypes: {
      omakotitalo: "Omakotitalo",
      rivitalo: "Rivi- tai paritalo",
      kerrostalo: "Kerrostalo",
      non_residential: "Ei-asuinrakennus",
      unknown: "Ei tiedossa",
    },
    stages: {
      planning: "Suunnittelu, ei tilattu",
      ordered_or_started: "Tilattu tai aloitettu",
    },
    scopeLabels: {
      heating: "Lammitys",
      insulation: "Eristys",
      windows: "Ikkunat",
      solar: "Aurinkoenergia",
      smart_controls: "Alyohjaus",
      storage: "Varastointi",
      ev_charging: "Lataus",
    },
    status: {
      eligible: "Sopiva",
      maybe: "Mahdollinen",
      not_eligible: "Ei sovi",
      info: "Neuvonta",
    },
  },
  en: {
    eyebrow: "Funding path",
    title: "EU and energy grant pre-check",
    subtitle: "Screen Business Finland, EU Energy Communities Facility, and Motiva advice before work is ordered.",
    applicant: "Applicant",
    building: "Building",
    year: "Building year",
    location: "Location",
    stage: "Stage",
    scopes: "Renovation scope",
    badge: "Potential funding",
    noCash: "No automatic cash signal",
    source: "Official source",
    next: "Next steps",
    blockers: "Blockers",
    disclaimerPrefix: "Note",
    applicantTypes: {
      private_owner: "Private owner",
      housing_company: "Housing company",
      energy_community: "Energy community",
      company_or_municipality: "Company / municipality",
    },
    buildingTypes: {
      omakotitalo: "Detached house",
      rivitalo: "Row or semi-detached",
      kerrostalo: "Apartment building",
      non_residential: "Non-residential",
      unknown: "Unknown",
    },
    stages: {
      planning: "Planning, not ordered",
      ordered_or_started: "Ordered or started",
    },
    scopeLabels: {
      heating: "Heating",
      insulation: "Insulation",
      windows: "Windows",
      solar: "Solar",
      smart_controls: "Smart controls",
      storage: "Storage",
      ev_charging: "EV charging",
    },
    status: {
      eligible: "Eligible",
      maybe: "Potential",
      not_eligible: "Blocked",
      info: "Advice",
    },
  },
} as const;

function formatEur(value: number, locale: string): string {
  return `${Math.round(value).toLocaleString(locale === "fi" ? "fi-FI" : "en-GB")} EUR`;
}

function statusTone(status: EuGrantStatus): { border: string; background: string; color: string } {
  if (status === "eligible" || status === "maybe") {
    return { border: "rgba(74,124,89,0.36)", background: "rgba(74,124,89,0.12)", color: "var(--forest)" };
  }
  if (status === "not_eligible") {
    return { border: "rgba(229,160,75,0.38)", background: "rgba(229,160,75,0.10)", color: "var(--amber)" };
  }
  return { border: "var(--border)", background: "rgba(255,255,255,0.025)", color: "var(--text-muted)" };
}

export default function EuEnergyGrantPrecheckPanel({
  bom,
  materials,
  buildingInfo,
  totalCost = 0,
}: EuEnergyGrantPrecheckPanelProps) {
  const { locale } = useTranslation();
  const grantLocale: "fi" | "en" = locale === "fi" ? "fi" : "en";
  const copy = COPY[grantLocale];
  const inferred = useMemo(
    () => buildEuEnergyGrantPrecheck({ bom, materials, buildingInfo, totalCost }),
    [bom, buildingInfo, materials, totalCost],
  );
  const [answers, setAnswers] = useState<EuEnergyGrantAnswers>(inferred.answers);

  const result = useMemo(
    () => buildEuEnergyGrantPrecheck({ bom, materials, buildingInfo, totalCost, answers }),
    [answers, bom, buildingInfo, materials, totalCost],
  );

  const updateScope = (scope: EuGrantScope, checked: boolean) => {
    setAnswers((prev) => ({
      ...prev,
      scopes: checked
        ? Array.from(new Set([...prev.scopes, scope]))
        : prev.scopes.filter((item) => item !== scope),
    }));
  };

  return (
    <section
      data-testid="eu-energy-grant-precheck"
      aria-labelledby="eu-energy-grant-title"
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(74,124,89,0.28)",
        background: "linear-gradient(150deg, rgba(74,124,89,0.12), rgba(91,127,145,0.08))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div className="label-mono" style={{ color: "var(--forest)", fontSize: 10, marginBottom: 4 }}>
            {copy.eyebrow}
          </div>
          <h4 id="eu-energy-grant-title" style={{ margin: 0, color: "var(--text-primary)", fontSize: 15 }}>
            {copy.title}
          </h4>
          <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
            {copy.subtitle}
          </p>
        </div>
        <span
          style={{
            borderRadius: 999,
            padding: "4px 7px",
            border: "1px solid rgba(74,124,89,0.36)",
            background: "rgba(74,124,89,0.12)",
            color: "var(--forest)",
            fontSize: 10,
            fontWeight: 800,
            whiteSpace: "nowrap",
          }}
        >
          {result.fundingBadge.show
            ? `${copy.badge}: ${formatEur(result.fundingBadge.amount, locale)}`
            : copy.noCash}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 8, marginTop: 12 }}>
        <label style={{ display: "grid", gap: 4, color: "var(--text-muted)", fontSize: 10 }}>
          <span className="label-mono">{copy.applicant}</span>
          <select
            aria-label={copy.applicant}
            value={answers.applicantType}
            onChange={(event) => setAnswers((prev) => ({ ...prev, applicantType: event.target.value as EuGrantApplicantType }))}
            className="input"
            style={{ minHeight: 34 }}
          >
            {Object.entries(copy.applicantTypes).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, color: "var(--text-muted)", fontSize: 10 }}>
          <span className="label-mono">{copy.building}</span>
          <select
            aria-label={copy.building}
            value={answers.buildingType}
            onChange={(event) => setAnswers((prev) => ({ ...prev, buildingType: event.target.value as EuEnergyGrantAnswers["buildingType"] }))}
            className="input"
            style={{ minHeight: 34 }}
          >
            {Object.entries(copy.buildingTypes).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, color: "var(--text-muted)", fontSize: 10 }}>
          <span className="label-mono">{copy.year}</span>
          <input
            aria-label={copy.year}
            type="number"
            className="input"
            value={answers.buildingYear ?? ""}
            onChange={(event) => setAnswers((prev) => ({ ...prev, buildingYear: event.target.value ? Number(event.target.value) : null }))}
            style={{ minHeight: 34 }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, color: "var(--text-muted)", fontSize: 10 }}>
          <span className="label-mono">{copy.stage}</span>
          <select
            aria-label={copy.stage}
            value={answers.stage}
            onChange={(event) => setAnswers((prev) => ({ ...prev, stage: event.target.value as EuGrantProjectStage }))}
            className="input"
            style={{ minHeight: 34 }}
          >
            {Object.entries(copy.stages).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      </div>

      <label style={{ display: "grid", gap: 4, marginTop: 8, color: "var(--text-muted)", fontSize: 10 }}>
        <span className="label-mono">{copy.location}</span>
        <input
          aria-label={copy.location}
          className="input"
          value={answers.location}
          onChange={(event) => setAnswers((prev) => ({ ...prev, location: event.target.value }))}
          style={{ minHeight: 34 }}
        />
      </label>

      <div style={{ marginTop: 10 }}>
        <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 6 }}>
          {copy.scopes}
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {SCOPES.map((scope) => (
            <label key={scope} className="category-chip" data-active={answers.scopes.includes(scope)}>
              <input
                type="checkbox"
                checked={answers.scopes.includes(scope)}
                onChange={(event) => updateScope(scope, event.currentTarget.checked)}
                style={{ marginRight: 4 }}
              />
              {copy.scopeLabels[scope]}
            </label>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {result.programs.map((program) => {
          const tone = statusTone(program.status);
          return (
            <article
              key={program.id}
              style={{
                padding: "10px 11px",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${tone.border}`,
                background: tone.background,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                <strong style={{ color: "var(--text-primary)", fontSize: 12 }}>{program.name}</strong>
                <span style={{ color: tone.color, fontSize: 10, fontWeight: 800, textTransform: "uppercase" }}>
                  {copy.status[program.status]}
                </span>
              </div>
              <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
                {program.amountDescription} {program.applicationWindow}
              </p>
              {program.blockers.length > 0 && (
                <div style={{ marginTop: 7, color: "var(--amber)", fontSize: 11, lineHeight: 1.45 }}>
                  <strong>{copy.blockers}: </strong>{program.blockers[0]}
                </div>
              )}
              {program.reasons.length > 0 && (
                <div style={{ marginTop: 7, color: "var(--text-secondary)", fontSize: 11, lineHeight: 1.45 }}>
                  {program.reasons[0]}
                </div>
              )}
              <details style={{ marginTop: 7 }}>
                <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 11, fontWeight: 700 }}>
                  {copy.next}
                </summary>
                <ul style={{ margin: "6px 0 0", paddingLeft: 16, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
                  {program.nextSteps.map((step) => <li key={step}>{step}</li>)}
                </ul>
              </details>
              <a
                href={program.applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-block", marginTop: 8, color: "var(--forest)", fontSize: 11, fontWeight: 700, textDecoration: "none" }}
              >
                {copy.source}
              </a>
            </article>
          );
        })}
      </div>

      <p style={{ margin: "9px 0 0", color: "var(--text-muted)", fontSize: 10, lineHeight: 1.45 }}>
        <strong>{copy.disclaimerPrefix}:</strong> {result.disclaimer} Sources checked {result.sourceCheckedAt}.
      </p>
    </section>
  );
}
