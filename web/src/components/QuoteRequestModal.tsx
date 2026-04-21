"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useToast } from "@/components/ToastProvider";
import { useTranslation } from "@/components/LocaleProvider";
import type { BomItem, BuildingInfo, QuoteRequestResponse } from "@/types";

interface UserProfile {
  name?: string;
  email?: string;
}

interface QuoteRequestModalProps {
  open: boolean;
  projectId: string;
  projectName: string;
  projectDescription?: string;
  buildingInfo?: BuildingInfo | null;
  bom: BomItem[];
  totalCost: number;
  onClose: () => void;
  onSubmitted?: (response: QuoteRequestResponse) => void;
}

function extractPostcode(buildingInfo?: BuildingInfo | null): string {
  const match = buildingInfo?.address?.match(/\b\d{5}\b/);
  return match?.[0] || "";
}

function formatCurrency(amount: number, locale: string): string {
  return `${amount.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", {
    maximumFractionDigits: 0,
  })} EUR`;
}

export default function QuoteRequestModal({
  open,
  projectId,
  projectName,
  projectDescription = "",
  buildingInfo,
  bom,
  totalCost,
  onClose,
  onSubmitted,
}: QuoteRequestModalProps) {
  const { t, locale } = useTranslation();
  const { toast } = useToast();
  const { track } = useAnalytics();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [postcode, setPostcode] = useState("");
  const [workScope, setWorkScope] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<QuoteRequestResponse | null>(null);

  const address = buildingInfo?.address || projectDescription.split("\n")[0] || "";
  const canSubmit = Boolean(contactName.trim() && contactEmail.trim() && /^\d{5}$/.test(postcode.trim()) && workScope.trim() && bom.length > 0 && projectId);

  const summary = useMemo(() => [
    { label: t("quoteRequest.summaryProject"), value: projectName },
    { label: t("quoteRequest.summaryAddress"), value: address || t("quoteRequest.summaryNoAddress") },
    { label: t("quoteRequest.summaryRows"), value: String(bom.length) },
    { label: t("quoteRequest.summaryTotal"), value: formatCurrency(totalCost, locale) },
  ], [address, bom.length, locale, projectName, t, totalCost]);

  useEffect(() => {
    if (!open) return;
    setSubmitted(null);
    setWorkScope((current) => current || projectDescription || "");
    setPostcode((current) => current || extractPostcode(buildingInfo));
    closeButtonRef.current?.focus();
    api.me()
      .then((user: UserProfile) => {
        setContactName((current) => current || user.name || "");
        setContactEmail((current) => current || user.email || "");
      })
      .catch(() => {
        // Prefill is best-effort; submission still requires explicit contact fields.
      });
  }, [buildingInfo, open, projectDescription]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || submitting) return;

    setSubmitting(true);
    try {
      const response = await api.submitQuoteRequest(projectId, {
        contact_name: contactName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim() || undefined,
        postcode: postcode.trim(),
        work_scope: workScope.trim(),
        locale,
      }) as QuoteRequestResponse;
      setSubmitted(response);
      onSubmitted?.(response);
      track("quote_request_submitted", {
        project_id: projectId,
        bom_line_count: response.bom_line_count,
        estimated_cost: Math.round(Number(response.estimated_cost || totalCost)),
      });
      toast(t("quoteRequest.submittedToast"), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("quoteRequest.submitFailed"), "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 140,
        background: "rgba(0,0,0,0.62)",
        backdropFilter: "blur(5px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quote-request-title"
        className="anim-up"
        style={{
          width: "100%",
          maxWidth: 620,
          maxHeight: "90vh",
          overflow: "auto",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div className="label-mono" style={{ color: "var(--amber)", fontSize: 10, marginBottom: 6 }}>
              {t("quoteRequest.eyebrow")}
            </div>
            <h2 id="quote-request-title" className="heading-display" style={{ fontSize: 22, margin: 0 }}>
              {t("quoteRequest.title")}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 13, lineHeight: 1.5, margin: "6px 0 0" }}>
              {t("quoteRequest.subtitle")}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t("dialog.cancel")}
            className="btn btn-ghost"
            style={{ alignSelf: "flex-start", minWidth: 40, padding: "8px 10px" }}
          >
            x
          </button>
        </div>

        <div style={{ padding: 22 }}>
          {submitted ? (
            <div style={{ display: "grid", gap: 16 }}>
              <div
                style={{
                  padding: 16,
                  borderRadius: "var(--radius-md)",
                  background: "rgba(74, 124, 89, 0.1)",
                  border: "1px solid rgba(74, 124, 89, 0.25)",
                }}
              >
                <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>{t("quoteRequest.successTitle")}</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                  {t("quoteRequest.successDesc")}
                </p>
              </div>
              <button type="button" className="btn btn-primary" onClick={onClose}>
                {t("quoteRequest.done")}
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} style={{ display: "grid", gap: 18 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: 10,
                  padding: 14,
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)",
                }}
              >
                {summary.map((item) => (
                  <div key={item.label}>
                    <div className="label-mono" style={{ fontSize: 9, color: "var(--text-muted)", marginBottom: 4 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 13, color: "var(--text-primary)", overflowWrap: "anywhere" }}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <label style={{ display: "grid", gap: 8 }}>
                <span className="label-mono">{t("quoteRequest.workScope")}</span>
                <textarea
                  className="input"
                  value={workScope}
                  onChange={(event) => setWorkScope(event.target.value)}
                  rows={5}
                  maxLength={3000}
                  placeholder={t("quoteRequest.workScopePlaceholder")}
                  required
                  style={{ resize: "vertical", minHeight: 118 }}
                />
              </label>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: 12 }}>
                <label style={{ display: "grid", gap: 8 }}>
                  <span className="label-mono">{t("quoteRequest.contactName")}</span>
                  <input className="input" value={contactName} onChange={(event) => setContactName(event.target.value)} required />
                </label>
                <label style={{ display: "grid", gap: 8 }}>
                  <span className="label-mono">{t("quoteRequest.contactEmail")}</span>
                  <input className="input" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} required />
                </label>
                <label style={{ display: "grid", gap: 8 }}>
                  <span className="label-mono">{t("quoteRequest.contactPhone")}</span>
                  <input className="input" type="tel" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
                </label>
                <label style={{ display: "grid", gap: 8 }}>
                  <span className="label-mono">{t("quoteRequest.postcode")}</span>
                  <input className="input" inputMode="numeric" pattern="\\d{5}" value={postcode} onChange={(event) => setPostcode(event.target.value)} required />
                </label>
              </div>

              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: "var(--radius-sm)",
                  background: "rgba(229,160,75,0.08)",
                  border: "1px solid rgba(229,160,75,0.2)",
                  color: "var(--text-secondary)",
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                {t("quoteRequest.partnerNote")}
              </div>

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>
                  {t("dialog.cancel")}
                </button>
                <button type="submit" className="btn btn-primary" disabled={!canSubmit || submitting}>
                  {submitting ? <span className="btn-spinner" /> : t("quoteRequest.submit")}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
