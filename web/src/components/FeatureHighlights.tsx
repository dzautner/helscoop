"use client";

import { useTranslation } from "@/components/LocaleProvider";

export default function FeatureHighlights() {
  const { locale } = useTranslation();
  const features = locale === 'fi' ? [
    { icon: "M3 21h18M9 8h1M9 12h1M5 21V5l7-3 7 3v16", title: "3D-malli osoitteesta", desc: "Syota kotiosoitteesi ja nae talosi kolmiulotteisena mallina hetkessa" },
    { icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", title: "Muuta puhumalla", desc: "Kuvaile muutos suomeksi — \"lisaa terassi taakse\" — AI toteuttaa" },
    { icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6", title: "Automaattinen materiaaliluettelo", desc: "Reaaliaikaiset hinnat K-Raudasta ja Sarokkaasta, suoraan projektiisi" },
  ] : [
    { icon: "M3 21h18M9 8h1M9 12h1M5 21V5l7-3 7 3v16", title: "3D model from address", desc: "Enter your home address and see your house as a 3D model instantly" },
    { icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z", title: "Modify by chatting", desc: "Describe changes in plain language — \"add a terrace in the back\" — AI executes" },
    { icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6", title: "Automatic bill of materials", desc: "Real-time prices from K-Rauta and Stark, directly in your project" },
  ];

  return (
    <section className="feature-section">
      <h2 className="sr-only">{locale === 'fi' ? 'Ominaisuudet' : 'Features'}</h2>
      <div className="feature-section-header anim-up">
        <span className="label-mono" style={{ color: "var(--amber)", marginBottom: 8, display: "block" }}>
          {locale === 'fi' ? 'MITEN SE TOIMII' : 'HOW IT WORKS'}
        </span>
        <h3 style={{ fontSize: 22, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
          {locale === 'fi' ? 'Kolme askelta remonttiin' : 'Three steps to your renovation'}
        </h3>
      </div>
      <div className="feature-grid">
        {features.map((f, i) => (
          <div key={i} className="feature-card anim-up" style={{ animationDelay: `${0.1 + i * 0.1}s` }}>
            <div className="feature-card-step">{String(i + 1).padStart(2, '0')}</div>
            <div className="feature-card-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={f.title}>
                <path d={f.icon} />
              </svg>
            </div>
            <h3 className="feature-card-title">{f.title}</h3>
            <p className="feature-card-desc">{f.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
