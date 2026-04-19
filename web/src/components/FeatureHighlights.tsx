"use client";

import { useTranslation } from "@/components/LocaleProvider";

interface BentoCard {
  icon: string;
  title: string;
  desc: string;
  /** Grid area name */
  area: string;
  /** Accent color for icon background */
  accent?: string;
}

export default function FeatureHighlights() {
  const { locale } = useTranslation();

  const cards: BentoCard[] = locale === "fi"
    ? [
        {
          area: "model",
          icon: "M3 21h18M9 8h1M9 12h1M5 21V5l7-3 7 3v16",
          title: "3D-malli osoitteesta",
          desc: "Syota kotiosoitteesi ja nae talosi kolmiulotteisena mallina hetkessa. DVV:n ja MML:n virallinen rakennusdata.",
          accent: "var(--amber)",
        },
        {
          area: "ai",
          icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
          title: "Muuta puhumalla",
          desc: "Kuvaile muutos suomeksi — \"lisaa terassi taakse\" — AI toteuttaa sen kohtauskoodiksi.",
          accent: "var(--forest)",
        },
        {
          area: "bom",
          icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6",
          title: "Automaattinen materiaaliluettelo",
          desc: "Reaaliaikaiset hinnat K-Raudasta ja Sarokkaasta, suoraan projektiisi. Vertaile hintoja ja vie PDF.",
          accent: "var(--amber-dim)",
        },
        {
          area: "export",
          icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
          title: "PDF-kustannusarvio",
          desc: "Ammattimainen kustannusarvio PDF:na yhdella napautuksella.",
        },
        {
          area: "share",
          icon: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
          title: "Jaa projekti",
          desc: "Luo jakolinkki ja laheta suunnittelijalle tai puolisolle.",
        },
      ]
    : [
        {
          area: "model",
          icon: "M3 21h18M9 8h1M9 12h1M5 21V5l7-3 7 3v16",
          title: "3D model from address",
          desc: "Enter your home address and see your house as a 3D model instantly. Official building data from DVV and MML.",
          accent: "var(--amber)",
        },
        {
          area: "ai",
          icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
          title: "Modify by chatting",
          desc: "Describe changes in plain language — \"add a terrace in the back\" — AI writes the scene code.",
          accent: "var(--forest)",
        },
        {
          area: "bom",
          icon: "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2M9 5h6",
          title: "Automatic bill of materials",
          desc: "Real-time prices from K-Rauta and Stark, directly in your project. Compare prices and export to PDF.",
          accent: "var(--amber-dim)",
        },
        {
          area: "export",
          icon: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
          title: "PDF cost estimate",
          desc: "Professional cost estimate as PDF with one click.",
        },
        {
          area: "share",
          icon: "M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13",
          title: "Share project",
          desc: "Create a share link and send it to your designer or partner.",
        },
      ];

  return (
    <section
      style={{
        padding: "48px 24px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <h2 className="sr-only">
        {locale === "fi" ? "Ominaisuudet" : "Features"}
      </h2>
      <div
        className="bento-grid"
        style={{
          maxWidth: 960,
          margin: "0 auto",
        }}
      >
        {cards.map((card, i) => (
          <div
            key={card.area}
            className={`bento-card anim-up bento-${card.area}`}
            style={{
              animationDelay: `${i * 0.08}s`,
            }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: card.accent
                  ? `${card.accent}15`
                  : "var(--bg-tertiary)",
                border: `1px solid ${
                  card.accent
                    ? `${card.accent}25`
                    : "var(--border)"
                }`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 14,
                flexShrink: 0,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={card.accent || "var(--text-secondary)"}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                role="img"
                aria-label={card.title}
              >
                <path d={card.icon} />
              </svg>
            </div>
            <h3
              style={{
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 6,
                color: "var(--text-primary)",
              }}
            >
              {card.title}
            </h3>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              {card.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
