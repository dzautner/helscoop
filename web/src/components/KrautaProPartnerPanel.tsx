"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { api } from "@/lib/api";
import { copyTextToClipboard } from "@/lib/clipboard";
import {
  buildKrautaProPackage,
  formatKrautaProPackage,
  KRAUTA_PRO_CONFIG,
  type KrautaProLine,
  type KrautaProPackage,
} from "@/lib/krauta-pro";
import type { BomItem, Material } from "@/types";

interface KrautaProPartnerPanelProps {
  bom: BomItem[];
  materials: Material[];
  projectName?: string;
  projectDescription?: string;
}

type PanelLocale = "fi" | "en" | "sv";

const COPY = {
  fi: {
    eyebrow: "Kumppanikanava",
    title: "K-Rauta PRO urakoitsijapaketti",
    subtitle: "Valmistele asiakkaalle jaettava tarjous, urakoitsijan ostolista ja Helscoopin affiliate-signaali.",
    badge: "PRO API pending",
    coverage: "K-Rauta-kattavuus",
    orderValue: "PRO ostokoriarvio",
    tradeSavings: "Urakoitsijan hintaetu",
    referral: "Referral-potentiaali",
    clientQuote: "Asiakkaan tarjous",
    contractorMargin: "Urakoitsijamarginaali",
    lines: "Ostolista",
    assumptions: "Rehelliset oletukset",
    uncovered: "Hankittava muualta",
    shareHint: "Jaa projekti -linkki antaa asiakkaalle katselu- ja kommentointinäkymän; tämä paketti pysyy urakoitsijan sisäisenä.",
    copy: "Kopioi PRO-paketti",
    copied: "Kopioitu",
    openPro: "Avaa K-Rauta PRO",
    noLines: "BOMissa ei ole vielä K-Rauta-rivejä.",
    tracked: "Klikki kirjattu affiliate-ledgeriin.",
    untracked: "Klikkiä ei voitu kirjata, mutta linkki avataan silti.",
  },
  en: {
    eyebrow: "Partner channel",
    title: "K-Rauta PRO contractor package",
    subtitle: "Prepare a client quote, contractor order list, and Helscoop referral signal from the BOM.",
    badge: "PRO API pending",
    coverage: "K-Rauta coverage",
    orderValue: "PRO order estimate",
    tradeSavings: "Contractor trade savings",
    referral: "Referral potential",
    clientQuote: "Client quote",
    contractorMargin: "Contractor margin",
    lines: "Order list",
    assumptions: "Honest assumptions",
    uncovered: "Source separately",
    shareHint: "Use Share project for the client read-only/commenting view; this package stays contractor-internal.",
    copy: "Copy PRO package",
    copied: "Copied",
    openPro: "Open K-Rauta PRO",
    noLines: "No K-Rauta BOM lines yet.",
    tracked: "Click recorded in affiliate ledger.",
    untracked: "Click could not be recorded, but the link still opens.",
  },
  sv: {
    eyebrow: "Partnerkanal",
    title: "K-Rauta PRO entreprenorpaket",
    subtitle: "Forbered kundoffert, entreprenorens inkopslista och Helscoops referral-signal fran materiallistan.",
    badge: "PRO API pending",
    coverage: "K-Rauta-tackning",
    orderValue: "PRO orderestimat",
    tradeSavings: "Entreprenorens prisfordel",
    referral: "Referral-potential",
    clientQuote: "Kundoffert",
    contractorMargin: "Entreprenormarginal",
    lines: "Inkopslista",
    assumptions: "Arliga antaganden",
    uncovered: "Kop separat",
    shareHint: "Anvand Share project for kundens las- och kommentarsvy; detta paket stannar internt hos entreprenoren.",
    copy: "Kopiera PRO-paket",
    copied: "Kopierat",
    openPro: "Oppna K-Rauta PRO",
    noLines: "Inga K-Rauta-rader i materiallistan annu.",
    tracked: "Klick registrerat i affiliate-ledgern.",
    untracked: "Klicket kunde inte registreras, men lanken oppnas anda.",
  },
} as const;

function panelLocale(locale: string): PanelLocale {
  if (locale === "fi" || locale === "sv") return locale;
  return "en";
}

function formatEur(value: number, locale: string): string {
  const numberLocale = locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB";
  return `${Math.round(value).toLocaleString(numberLocale)} EUR`;
}

function formatPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export default function KrautaProPartnerPanel({
  bom,
  materials,
  projectName,
}: KrautaProPartnerPanelProps) {
  const { locale } = useTranslation();
  const activeLocale = panelLocale(locale);
  const copy = COPY[activeLocale];
  const [copied, setCopied] = useState(false);
  const [clickStatus, setClickStatus] = useState<"idle" | "tracked" | "untracked">("idle");

  const plan = useMemo(
    () => buildKrautaProPackage({ bom, materials, projectName }),
    [bom, materials, projectName],
  );

  if (bom.length === 0) return null;

  const copyPackage = async () => {
    const text = formatKrautaProPackage(plan, projectName, activeLocale === "fi" ? "fi" : "en");
    const copiedToClipboard = await copyTextToClipboard(text);
    if (!copiedToClipboard) return;
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const recordProClick = async () => {
    const firstLine = plan.lines[0];
    if (!firstLine) return;
    try {
      await api.recordAffiliateClick({
        material_id: firstLine.materialId,
        supplier_id: KRAUTA_PRO_CONFIG.supplierId,
        click_url: plan.orderUrl,
      });
      setClickStatus("tracked");
    } catch {
      setClickStatus("untracked");
    }
  };

  return (
    <section
      data-testid="krauta-pro-partner-panel"
      aria-labelledby="krauta-pro-partner-title"
      style={{
        marginTop: 12,
        padding: 14,
        borderRadius: "var(--radius-md)",
        border: "1px solid rgba(229,160,75,0.32)",
        background: "linear-gradient(150deg, rgba(229,160,75,0.15), rgba(74,124,89,0.11) 54%, rgba(22,27,31,0.5))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div className="label-mono" style={{ color: "var(--amber)", fontSize: 10, marginBottom: 4 }}>
            {copy.eyebrow}
          </div>
          <h4 id="krauta-pro-partner-title" style={{ margin: 0, color: "var(--text-primary)", fontSize: 15 }}>
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
            border: "1px solid rgba(229,160,75,0.42)",
            background: "rgba(229,160,75,0.12)",
            color: "var(--amber)",
            fontSize: 9,
            fontWeight: 900,
            whiteSpace: "nowrap",
            textTransform: "uppercase",
          }}
        >
          {copy.badge}
        </span>
      </div>

      {plan.eligible ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
            <Metric label={copy.coverage} value={`${plan.lineCount}/${plan.totalBomLines} (${formatPercent(plan.coveragePercent)})`} />
            <Metric label={copy.orderValue} value={formatEur(plan.proMaterialEstimate, locale)} strong />
            <Metric label={copy.tradeSavings} value={formatEur(plan.estimatedTradeSavings, locale)} strong={plan.estimatedTradeSavings > 0} />
            <Metric label={copy.referral} value={formatEur(plan.estimatedReferralRevenue, locale)} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
            <Metric label={copy.clientQuote} value={formatEur(plan.clientQuoteTotal, locale)} />
            <Metric label={copy.contractorMargin} value={formatEur(plan.contractorMargin, locale)} />
          </div>

          <p style={{ margin: "10px 0 0", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
            {copy.shareHint}
          </p>

          <div style={{ marginTop: 12 }}>
            <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 10, marginBottom: 6 }}>
              {copy.lines}
            </div>
            <div style={{ display: "grid", gap: 6 }}>
              {plan.lines.slice(0, 5).map((line) => (
                <OrderLine key={line.materialId} line={line} locale={locale} />
              ))}
            </div>
          </div>

          {plan.uncoveredLines.length > 0 && (
            <details style={{ marginTop: 10 }}>
              <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 10, fontWeight: 800 }}>
                {copy.uncovered}: {plan.uncoveredLines.length}
              </summary>
              <ul style={{ margin: "6px 0 0", paddingLeft: 16, color: "var(--text-muted)", fontSize: 10, lineHeight: 1.35 }}>
                {plan.uncoveredLines.slice(0, 8).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          )}

          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: "pointer", color: "var(--text-muted)", fontSize: 10, fontWeight: 800 }}>
              {copy.assumptions}
            </summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 16, color: "var(--text-muted)", fontSize: 10, lineHeight: 1.35 }}>
              {plan.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </details>

          {clickStatus !== "idle" && (
            <p style={{ margin: "10px 0 0", color: clickStatus === "tracked" ? "var(--forest)" : "var(--amber)", fontSize: 10 }}>
              {clickStatus === "tracked" ? copy.tracked : copy.untracked}
            </p>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="material-btn" onClick={copyPackage} style={{ flex: 1, justifyContent: "center" }}>
              {copied ? copy.copied : copy.copy}
            </button>
            <a
              href={plan.orderUrl}
              target="_blank"
              rel="noreferrer"
              className="material-btn"
              onClick={() => void recordProClick()}
              style={{ flex: 1, justifyContent: "center", textDecoration: "none" }}
            >
              {copy.openPro}
            </a>
          </div>
        </>
      ) : (
        <p style={{ margin: "12px 0 0", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
          {copy.noLines}
        </p>
      )}
    </section>
  );
}

function OrderLine({ line, locale }: { line: KrautaProLine; locale: string }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 8,
        alignItems: "center",
        padding: "7px 8px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.025)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "var(--text-primary)", fontSize: 11, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis" }}>
          {line.name}
        </div>
        <div style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 2 }}>
          {line.quantity.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB")} {line.unit} · retail {formatEur(line.retailTotal, locale)}
        </div>
      </div>
      <strong style={{ color: "var(--forest)", fontSize: 11 }}>
        {formatEur(line.proEstimate, locale)}
      </strong>
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
