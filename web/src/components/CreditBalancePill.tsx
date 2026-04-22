"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type CreditPack, type CreditState } from "@/lib/api";
import { useTranslation } from "@/components/LocaleProvider";
import { useToast } from "@/components/ToastProvider";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface EntitlementsResponse {
  credits?: CreditState;
}

interface CheckoutResponse {
  checkoutUrl?: string | null;
  simulated?: boolean;
  transaction?: { balanceAfter?: number };
}

let lowCreditToastShown = false;

export default function CreditBalancePill({ compact = false }: { compact?: boolean }) {
  const [credits, setCredits] = useState<CreditState | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [buyingPackId, setBuyingPackId] = useState<string | null>(null);
  const notifiedLowRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();
  const { toast } = useToast();

  useFocusTrap(dialogRef, open, () => setOpen(false));

  const loadCredits = useCallback(async () => {
    try {
      const response = (await api.getEntitlements()) as EntitlementsResponse;
      if (response.credits) {
        setCredits(response.credits);
        if (response.credits.lowCredit && !notifiedLowRef.current && !lowCreditToastShown) {
          notifiedLowRef.current = true;
          lowCreditToastShown = true;
          toast(t("credits.lowToast", { count: response.credits.balance }), "warning", { group: "low-credits" });
        }
      }
    } catch {
      // The badge should not block the app if entitlements are temporarily unavailable.
    } finally {
      setLoading(false);
    }
  }, [t, toast]);

  useEffect(() => {
    void loadCredits();

    const refresh = () => void loadCredits();
    const refreshOnVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("helscoop:credits-updated", refresh);
    document.addEventListener("visibilitychange", refreshOnVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("helscoop:credits-updated", refresh);
      document.removeEventListener("visibilitychange", refreshOnVisible);
    };
  }, [loadCredits]);

  async function buyPack(pack: CreditPack) {
    setBuyingPackId(pack.id);
    try {
      const response = (await api.createCreditCheckout(
        pack.id,
        process.env.NODE_ENV !== "production",
      )) as CheckoutResponse;

      if (response.checkoutUrl) {
        window.location.href = response.checkoutUrl;
        return;
      }

      if (response.simulated && typeof response.transaction?.balanceAfter === "number") {
        setCredits((current) =>
          current
            ? {
                ...current,
                balance: response.transaction!.balanceAfter!,
                lowCredit: response.transaction!.balanceAfter! <= current.lowCreditThreshold,
              }
            : current,
        );
        window.dispatchEvent(new CustomEvent("helscoop:credits-updated"));
        toast(t("credits.purchaseSimulated"), "success");
        setOpen(false);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : t("credits.checkoutFailed"), "error");
    } finally {
      setBuyingPackId(null);
    }
  }

  const balanceLabel = loading || !credits ? "..." : String(credits.balance);
  const low = !!credits?.lowCredit;

  return (
    <>
      <button
        type="button"
        className={`btn ${low ? "btn-primary" : "btn-ghost"}`}
        onClick={() => setOpen(true)}
        aria-label={t("credits.balanceAria", { count: balanceLabel })}
        style={{
          padding: compact ? "5px 8px" : "6px 10px",
          fontSize: 12,
          gap: 6,
          borderColor: low ? "var(--warning-border)" : undefined,
          background: low ? "var(--warning-dim)" : undefined,
          color: low ? "var(--warning)" : undefined,
          whiteSpace: "nowrap",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12h8" />
          <path d="M12 8v8" />
        </svg>
        <span>{balanceLabel}</span>
        {!compact && <span style={{ color: low ? "currentColor" : "var(--text-muted)" }}>{t("credits.shortLabel")}</span>}
      </button>

      {open && credits && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
            background: "var(--backdrop)",
            backdropFilter: "blur(6px)",
            animation: "fadeIn 0.15s ease both",
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="credits-dialog-title"
            tabIndex={-1}
            style={{
              width: "min(100%, 560px)",
              background: "var(--surface-overlay, var(--bg-overlay))",
              border: "1px solid var(--surface-border-overlay)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-lg)",
              padding: 24,
              animation: "dialogSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 18 }}>
              <div>
                <div className="label-mono" style={{ marginBottom: 8 }}>{t("credits.eyebrow")}</div>
                <h2 id="credits-dialog-title" className="heading-display" style={{ margin: 0, fontSize: 22 }}>
                  {t("credits.title")}
                </h2>
                <p style={{ margin: "8px 0 0", color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5 }}>
                  {t("credits.subtitle", { count: credits.monthlyGrant })}
                </p>
              </div>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)} aria-label={t("dialog.close")} style={{ padding: "6px 8px" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "14px 16px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md)",
                background: "var(--bg-secondary)",
                marginBottom: 16,
              }}
            >
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>{t("credits.currentBalance")}</div>
                <div className="heading-display" style={{ fontSize: 28 }}>{credits.balance}</div>
              </div>
              {low && <span className="badge badge-amber">{t("credits.lowBadge")}</span>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
              {credits.packs.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  className="card card-interactive"
                  onClick={() => void buyPack(pack)}
                  disabled={buyingPackId !== null}
                  style={{
                    textAlign: "left",
                    padding: 16,
                    cursor: buyingPackId ? "wait" : "pointer",
                    borderColor: pack.savingsPercent ? "var(--amber-border)" : undefined,
                  }}
                >
                  <div className="heading-display" style={{ fontSize: 22, marginBottom: 4 }}>
                    {pack.credits}
                  </div>
                  <div style={{ color: "var(--text-muted)", fontSize: 12, marginBottom: 12 }}>{t("credits.credits")}</div>
                  <div style={{ fontWeight: 700, marginBottom: 4 }}>{pack.priceEur.toFixed(2)} EUR</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 11 }}>
                    {t("credits.unitPrice", { price: pack.unitPriceEur.toFixed(3) })}
                  </div>
                  {pack.savingsPercent && (
                    <span className="badge badge-amber" style={{ marginTop: 10 }}>
                      {t("credits.savings", { percent: pack.savingsPercent })}
                    </span>
                  )}
                  {buyingPackId === pack.id && <div style={{ marginTop: 10 }} className="btn-spinner" />}
                </button>
              ))}
            </div>

            <p style={{ margin: "16px 0 0", color: "var(--text-muted)", fontSize: 12, lineHeight: 1.5 }}>
              {t("credits.neverExpire")}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
