"use client";

import { useTranslation } from "@/components/LocaleProvider";
import ScrollReveal from "@/components/ScrollReveal";

export default function LandingFooter() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  const dataSources = [
    { name: "DVV", desc: t("landing.dataSourceDvv") },
    { name: "MML", desc: t("landing.dataSourceMml") },
    { name: "K-Rauta", desc: t("landing.dataSourceBuildingMaterials") },
    { name: "Stark", desc: t("landing.dataSourceBuildingMaterials") },
    { name: "Sarokas", desc: t("landing.dataSourceTimber") },
    { name: "Ruukki", desc: t("landing.dataSourceRoofing") },
  ];

  return (
    <footer className="landing-footer">
      <ScrollReveal>
      <div className="landing-footer-inner">
        <div className="landing-footer-brand">
          <div className="heading-display" style={{ fontSize: 20, marginBottom: 8 }}>
            <span>Hel</span><span style={{ color: "var(--amber)" }}>scoop</span>
          </div>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6, maxWidth: 280 }}>
            {t("landing.footerDescription")}
          </p>
        </div>

        <div className="landing-footer-sources">
          <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 4, fontSize: 9 }}>
            {t("landing.dataSources")}
          </div>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, lineHeight: 1.5, maxWidth: 260 }}>
            {t("landing.dataSourcesDisclaimer")}
          </p>
          <div className="landing-footer-source-grid">
            {dataSources.map((s) => (
              <div key={s.name} className="landing-footer-source">
                <span style={{ fontWeight: 600, fontSize: 12, color: "var(--text-secondary)" }}>{s.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{s.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="landing-footer-links">
          <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 12, fontSize: 9 }}>
            {t("landing.links")}
          </div>
          <a href="/privacy" className="link-muted" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
            {t("landing.privacyPolicy")}
          </a>
          <a href="/terms" className="link-muted" style={{ fontSize: 12, display: "block", marginBottom: 8 }}>
            {t("landing.termsOfService")}
          </a>
        </div>
      </div>
      </ScrollReveal>

      <ScrollReveal delay={0.15}>
      <div className="landing-footer-bottom">
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          &copy; {year} Helscoop.{" "}
          {t("landing.dataInEu")}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
          Helsinki, Finland
        </span>
      </div>
      </ScrollReveal>
    </footer>
  );
}
