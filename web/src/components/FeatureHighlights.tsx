"use client";

import { useTranslation } from "@/components/LocaleProvider";
import ScrollReveal from "@/components/ScrollReveal";

export default function FeatureHighlights() {
  const { t } = useTranslation();

  const features = [
    { icon: "M3 21h18M9 8h1M9 12h1M5 21V5l7-3 7 3v16", title: t("landing.feature1Title"), desc: t("landing.feature1Desc"), hero: true },
    { icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", title: t("landing.feature2Title"), desc: t("landing.feature2Desc"), hero: false },
    { icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6", title: t("landing.feature3Title"), desc: t("landing.feature3Desc"), hero: false },
  ];

  return (
    <section className="feature-section">
      <h2 className="sr-only">{t("landing.featuresHeading")}</h2>
      <ScrollReveal>
        <div className="feature-section-header">
          <span className="label-mono" style={{ color: "var(--amber)", marginBottom: 8, display: "block" }}>
            {t("landing.featuresLabel")}
          </span>
          <h2 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            {t("landing.featuresTitle")}
          </h2>
        </div>
      </ScrollReveal>
      <div className="feature-grid feature-grid--stack">
        {features.map((f, i) => (
          <ScrollReveal key={i} delay={0.08 + i * 0.06}>
            <div className={`feature-card${f.hero ? ' feature-card--hero' : ''}`}>
              <div className="feature-card-step">{String(i + 1).padStart(2, '0')}</div>
              <div className="feature-card-icon">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={f.title}>
                  <path d={f.icon} />
                </svg>
              </div>
              <h3 className="feature-card-title">{f.title}</h3>
              <p className="feature-card-desc">{f.desc}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
