"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import {
  RENOVATION_FINANCING_CONFIG,
  buildRenovationFinancingPlan,
  type FinancingNotice,
  type FinancingOffer,
} from "@/lib/renovation-financing";
import type { BomItem, BuildingInfo, Material } from "@/types";

interface RenovationFinancingPanelProps {
  bom: BomItem[];
  materials: Material[];
  buildingInfo?: BuildingInfo | null;
}

const COPY = {
  fi: {
    eyebrow: "Rahoitus",
    title: "Rahoita remontti",
    subtitle: "Muunna materiaalilista remonttilaina- ja osamaksuarvioksi ennen kumppanihakemusta.",
    amount: "Lainasumma",
    term: "Laina-aika",
    years: "vuotta",
    compare: "Vertaa remonttilainoja",
    external: "Avaa kumppanin palvelun uudessa ikkunassa.",
    terms: "Nopeat laina-aikavertailut",
    details: "Arviot ennen luottopaatosta",
    assumptions: "Oletukset",
    notCreditOffer: "Ei luottotarjous",
    products: {
      unsecured_remonttilaina: "Vakuudeton remonttilaina",
      secured_bank_loan: "Vakuudellinen pankkilaina",
      materials_bnpl: "Materiaalien osamaksu",
    },
    productBodies: {
      unsecured_remonttilaina: "Nopea vertailu, mutta korkohaitari on levea ja henkilokohtainen.",
      secured_bank_loan: "Usein halvempi isoille remonteille, vaatii pankin ja vakuuden.",
      materials_bnpl: "Sopii materiaaliosuuden jakamiseen, ei kata urakoitsijatyota.",
    },
    notices: {
      household_deduction: (amount: string, max: string) =>
        `Kotitalousvahennys voi pienentaa kassatarvetta noin ${amount}. Mallin katto on ${max}; tarkista Vero ja urakoitsijan ennakkoperintarekisteri.`,
      energy_grant: (amount: string) =>
        `Energiaremontin tukisignaali havaittu. Varaa rahoitukseen puskuri: alustava tukilippu enintaan ${amount}, mutta viranomainen ratkaisee.`,
      unsecured_limit: (_amount: string, max: string) =>
        `Summa ylittaa tyypillisen vakuudettoman remonttilainan ylarajan (${max}). Ohjaa kayttaja pankkiin tai jaa rahoitus osiin.`,
      credit_disclaimer:
        "Helscoop ei ole luotonantaja. Namat ovat suunnitteluarvioita; lopullinen korko, kulut ja hyvaksynta tulevat kumppanilta.",
    },
  },
  en: {
    eyebrow: "Financing",
    title: "Finance this renovation",
    subtitle: "Turn the BOM into renovation-loan and material split estimates before partner handoff.",
    amount: "Loan amount",
    term: "Loan term",
    years: "years",
    compare: "Compare renovation loans",
    external: "Opens the partner service in a new window.",
    terms: "Fast term comparison",
    details: "Pre-credit-decision estimates",
    assumptions: "Assumptions",
    notCreditOffer: "Not a credit offer",
    products: {
      unsecured_remonttilaina: "Unsecured remonttilaina",
      secured_bank_loan: "Secured bank loan",
      materials_bnpl: "Material payment split",
    },
    productBodies: {
      unsecured_remonttilaina: "Fast comparison, but the rate range is wide and personal.",
      secured_bank_loan: "Often cheaper for larger renovations, but requires bank review and collateral.",
      materials_bnpl: "Useful for material checkout only; it does not finance contractor labour.",
    },
    notices: {
      household_deduction: (amount: string, max: string) =>
        `Household expense tax credit may reduce cash need by about ${amount}. Model cap is ${max}; verify Vero rules and contractor registration.`,
      energy_grant: (amount: string) =>
        `Energy-upgrade grant signal detected. Keep financing buffer: planning flag up to ${amount}, but authority review decides eligibility.`,
      unsecured_limit: (_amount: string, max: string) =>
        `Amount exceeds the typical unsecured renovation-loan ceiling (${max}). Route to a bank review or split financing.`,
      credit_disclaimer:
        "Helscoop is not a lender. These are planning estimates; final APR, fees, and approval come from the partner.",
    },
  },
} as const;

function formatEur(value: number, locale: string): string {
  return `${Math.round(value).toLocaleString(locale === "fi" ? "fi-FI" : "en-GB")} EUR`;
}

function formatMonthlyRange(offer: Pick<FinancingOffer, "monthlyMin" | "monthlyMax">, locale: string): string {
  if (offer.monthlyMin === offer.monthlyMax) return `${formatEur(offer.monthlyMin, locale)}/mo`;
  return `${formatEur(offer.monthlyMin, locale)}-${formatEur(offer.monthlyMax, locale)}/mo`;
}

function noticeText(notice: FinancingNotice, locale: "fi" | "en"): string {
  const copy = COPY[locale].notices;
  const amount = formatEur(notice.amount ?? 0, locale);
  const maxAmount = formatEur(notice.maxAmount ?? 0, locale);

  if (notice.id === "household_deduction") return copy.household_deduction(amount, maxAmount);
  if (notice.id === "energy_grant") return copy.energy_grant(amount);
  if (notice.id === "unsecured_limit") return copy.unsecured_limit(amount, maxAmount);
  return copy.credit_disclaimer;
}

function noticeTone(tone: FinancingNotice["tone"]): { border: string; background: string; color: string } {
  if (tone === "positive") {
    return { border: "rgba(74,124,89,0.36)", background: "rgba(74,124,89,0.12)", color: "var(--forest)" };
  }
  if (tone === "warning") {
    return { border: "rgba(229,160,75,0.42)", background: "rgba(229,160,75,0.13)", color: "var(--amber)" };
  }
  return { border: "var(--border)", background: "rgba(255,255,255,0.025)", color: "var(--text-muted)" };
}

export default function RenovationFinancingPanel({
  bom,
  materials,
  buildingInfo,
}: RenovationFinancingPanelProps) {
  const { locale } = useTranslation();
  const financingLocale: "fi" | "en" = locale === "fi" ? "fi" : "en";
  const copy = COPY[financingLocale];
  const { track } = useAnalytics();
  const [loanAmount, setLoanAmount] = useState("");
  const [termYears, setTermYears] = useState<number>(RENOVATION_FINANCING_CONFIG.defaultTermYears);
  const initializedAmountRef = useRef<number | null>(null);
  const trackedViewRef = useRef<string | null>(null);

  const recommendedPlan = useMemo(
    () => buildRenovationFinancingPlan({ bom, materials, buildingInfo, locale: financingLocale }),
    [bom, buildingInfo, financingLocale, materials],
  );

  useEffect(() => {
    if (!recommendedPlan.eligible) return;
    if (initializedAmountRef.current === recommendedPlan.quote.grandTotal) return;
    initializedAmountRef.current = recommendedPlan.quote.grandTotal;
    setLoanAmount(String(recommendedPlan.quote.grandTotal));
  }, [recommendedPlan.eligible, recommendedPlan.quote.grandTotal]);

  const requestedAmount = Number(loanAmount.replace(",", "."));
  const plan = useMemo(
    () => buildRenovationFinancingPlan({
      bom,
      materials,
      buildingInfo,
      loanAmount: Number.isFinite(requestedAmount) && requestedAmount > 0 ? requestedAmount : undefined,
      termYears,
      locale: financingLocale,
    }),
    [bom, buildingInfo, financingLocale, materials, requestedAmount, termYears],
  );

  useEffect(() => {
    if (!plan.eligible) return;
    const viewKey = `${plan.quote.grandTotal}`;
    if (trackedViewRef.current === viewKey) return;
    trackedViewRef.current = viewKey;
    track("financing_widget_viewed", {
      bom_total: plan.quote.grandTotal,
      loan_amount: plan.requestedAmount,
      term_years: plan.termYears,
      offer_count: plan.offers.length,
      energy_grant_signal: plan.notices.some((notice) => notice.id === "energy_grant"),
    });
  }, [plan, track]);

  if (!plan.eligible) return null;

  return (
    <section
      data-testid="renovation-financing-panel"
      aria-labelledby="renovation-financing-title"
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(91,127,145,0.34)",
        background: "linear-gradient(155deg, rgba(91,127,145,0.16), rgba(229,160,75,0.08))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div>
          <div className="label-mono" style={{ color: "#7aa5b6", fontSize: 10, marginBottom: 4 }}>
            {copy.eyebrow}
          </div>
          <h4 id="renovation-financing-title" style={{ margin: 0, color: "var(--text-primary)", fontSize: 15 }}>
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
            border: "1px solid rgba(91,127,145,0.35)",
            background: "rgba(91,127,145,0.13)",
            color: "#7aa5b6",
            fontSize: 10,
            fontWeight: 800,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {copy.notCreditOffer}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <label style={{ display: "grid", gap: 5, fontSize: 11, color: "var(--text-muted)" }}>
          <span className="label-mono">{copy.amount}</span>
          <input
            aria-label={copy.amount}
            type="number"
            min={plan.threshold}
            step={500}
            value={loanAmount}
            onChange={(event) => setLoanAmount(event.target.value)}
            style={{
              width: "100%",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              padding: "8px 9px",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
          />
        </label>
        <label style={{ display: "grid", gap: 5, fontSize: 11, color: "var(--text-muted)" }}>
          <span className="label-mono">{copy.term}</span>
          <select
            aria-label={copy.term}
            value={termYears}
            onChange={(event) => setTermYears(Number(event.target.value))}
            style={{
              width: "100%",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              color: "var(--text-primary)",
              padding: "8px 9px",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}
          >
            {Array.from({ length: RENOVATION_FINANCING_CONFIG.maxTermYears }, (_, index) => index + 1).map((years) => (
              <option key={years} value={years}>
                {years} {copy.years}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {plan.offers.map((offer) => (
          <div
            key={offer.id}
            style={{
              padding: "9px 10px",
              borderRadius: "var(--radius-sm)",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 12, color: "var(--text-primary)" }}>
                {copy.products[offer.productType]}
              </strong>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 800, color: "var(--amber)" }}>
                {formatMonthlyRange(offer, locale)}
              </span>
            </div>
            <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
              {copy.productBodies[offer.productType]} APR {offer.aprMinPercent}-{offer.aprMaxPercent}%,
              {" "}{offer.termMonths} months, total {formatEur(offer.totalRepayableMin, locale)}-
              {formatEur(offer.totalRepayableMax, locale)}.
            </p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 12 }}>
        <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 6 }}>
          {copy.terms}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 }}>
          {plan.termComparisons.map((comparison) => (
            <button
              key={comparison.years}
              type="button"
              onClick={() => setTermYears(comparison.years)}
              aria-pressed={termYears === comparison.years}
              className="category-chip"
              data-active={termYears === comparison.years}
              style={{
                display: "grid",
                justifyItems: "start",
                gap: 3,
                whiteSpace: "normal",
                textAlign: "left",
              }}
            >
              <span>{comparison.years} {copy.years}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
                {formatEur(comparison.unsecuredMonthlyMin, locale)}-{formatEur(comparison.unsecuredMonthlyMax, locale)}/mo
              </span>
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
        {plan.notices.map((notice) => {
          const tone = noticeTone(notice.tone);
          return (
            <p
              key={notice.id}
              style={{
                margin: 0,
                padding: "8px 9px",
                borderRadius: "var(--radius-sm)",
                border: `1px solid ${tone.border}`,
                background: tone.background,
                color: tone.color,
                fontSize: 11,
                lineHeight: 1.45,
              }}
            >
              {noticeText(notice, financingLocale)}
            </p>
          );
        })}
      </div>

      <a
        href={plan.partnerUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={() => track("financing_partner_clicked", {
          partner: plan.primaryPartner.id,
          loan_amount: plan.requestedAmount,
          term_years: plan.termYears,
          target: "loan_comparison",
        })}
        aria-label={copy.compare}
        style={{
          marginTop: 12,
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "9px 12px",
          fontSize: 12,
          fontWeight: 800,
          color: "var(--bg-primary)",
          background: "#7aa5b6",
          border: "1px solid rgba(91,127,145,0.45)",
          borderRadius: "var(--radius-sm)",
          textDecoration: "none",
        }}
      >
        {copy.compare}
      </a>
      <p style={{ margin: "7px 0 0", color: "var(--text-muted)", fontSize: 10, lineHeight: 1.45 }}>
        {copy.external} {copy.assumptions}: {plan.assumptions.join(" ")}
      </p>
    </section>
  );
}
