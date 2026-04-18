"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

function TermsContentFi() {
  return (
    <>
      <h2>1. Palvelun kuvaus</h2>
      <p>
        Helscoop on parametrinen suunnittelutyokalu, joka auttaa kayttajia visualisoimaan
        ja suunnittelemaan rakennusremontteja 3D-mallinnuksen avulla. Palvelu tarjoaa
        reaaliaikaiset materiaalihinnat suomalaisilta toimittajilta.
      </p>

      <h2>2. Hyvaksyttava kaytto</h2>
      <p>Sitoudut olemaan:</p>
      <ul>
        <li>Kayttamatta palvelua laittomiin tarkoituksiin</li>
        <li>Yrittamatta haitata palvelun toimintaa tai muiden kayttajien kokemusta</li>
        <li>Kayttamatta automaattisia tyokaluja palvelun tietojen keraamiseen (scraping)</li>
        <li>Jakamasta tilisi tunnuksia kolmansille osapuolille</li>
      </ul>

      <h2>3. Immateriaalioikeudet</h2>
      <p>
        <strong>Sinun sisaltosi:</strong> Omistat kaikki luomasi projektit, 3D-kohtaukset ja
        materiaalilistat. Helscoop ei vaadi oikeuksia sisaltoosi.
      </p>
      <p>
        <strong>Palvelun sisalto:</strong> Helscoopin ohjelmisto, kayttoliittyma ja tavaramerkki
        kuuluvat Helscoopille.
      </p>

      <h2>4. AI-generoitu sisalto</h2>
      <p>
        Helscoopin AI-avustaja tuottaa 3D-kohtauskoodia koneoppimismallien avulla.
        AI-generoitu koodi tarjotaan sellaisenaan, eika sen toiminnallisuutta tai
        turvallisuutta taata. Kayttaja on vastuussa AI-generoidun koodin tarkistamisesta
        ja kayttamisesta.
      </p>

      <h2>5. Hintatietojen tarkkuus</h2>
      <p>
        Materiaalien hinnat haetaan automaattisesti toimittajien verkkosivuilta.
        Helscoop ei takaa hintojen tarkkuutta, ajantasaisuutta tai saatavuutta.
        Hinnat ovat suuntaa antavia, ja lopulliset hinnat tulee vahvistaa
        suoraan toimittajalta.
      </p>

      <h2>6. Vastuunrajoitus</h2>
      <p>
        Helscoop tarjotaan sellaisenaan. Emme vastaa:
      </p>
      <ul>
        <li>Rakennustietojen oikeellisuudesta (tiedot haetaan julkisista rekistereista)</li>
        <li>AI-avustajan tuottaman koodin toiminnallisuudesta tai virheettomyydesta</li>
        <li>Hintatietojen tarkkuudesta tai ajantasaisuudesta</li>
        <li>Palvelun kayttoon perustuvista suunnittelupaatosten seurauksista</li>
        <li>Palvelun keskeytyksista tai tietojen menetyksesta</li>
      </ul>

      <h2>7. Tilin irtisanominen</h2>
      <p>
        Voit poistaa tilisi milloin tahansa Asetukset-sivulta. Pidatamme oikeuden
        sulkea tilin, joka rikkoo naita kayttoehtoja.
      </p>

      <h2>8. Ehtojen muutokset</h2>
      <p>
        Pidatamme oikeuden muuttaa naita ehtoja. Olennaisista muutoksista
        ilmoitetaan sahkopostitse. Palvelun kayton jatkaminen muutosten jalkeen
        merkitsee uusien ehtojen hyvaksymista.
      </p>

      <h2>9. Sovellettava laki</h2>
      <p>
        Naihin ehtoihin sovelletaan Suomen lakia. Riidat ratkaistaan
        Helsingin karajaoikeudessa.
      </p>
    </>
  );
}

function TermsContentEn() {
  return (
    <>
      <h2>1. Service description</h2>
      <p>
        Helscoop is a parametric design tool that helps users visualize and plan building
        renovations using 3D modeling. The service provides real-time material pricing
        from Finnish suppliers.
      </p>

      <h2>2. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the service for any unlawful purpose</li>
        <li>Attempt to disrupt the service or other users&apos; experience</li>
        <li>Use automated tools to scrape data from the service</li>
        <li>Share your account credentials with third parties</li>
      </ul>

      <h2>3. Intellectual property</h2>
      <p>
        <strong>Your content:</strong> You own all projects, 3D scenes, and material lists you create.
        Helscoop does not claim any rights to your content.
      </p>
      <p>
        <strong>Service content:</strong> Helscoop&apos;s software, user interface, and trademarks
        belong to Helscoop.
      </p>

      <h2>4. AI-generated content</h2>
      <p>
        Helscoop&apos;s AI assistant generates 3D scene code using machine learning models.
        AI-generated code is provided as-is, and its functionality or safety is not
        guaranteed. Users are responsible for reviewing and using AI-generated code.
      </p>

      <h2>5. Price data accuracy</h2>
      <p>
        Material prices are automatically scraped from supplier websites.
        Helscoop does not guarantee the accuracy, currency, or availability of prices.
        Prices are indicative, and final prices should be confirmed directly
        with the supplier.
      </p>

      <h2>6. Limitation of liability</h2>
      <p>
        Helscoop is provided as-is. We are not liable for:
      </p>
      <ul>
        <li>Accuracy of building data (sourced from public registries)</li>
        <li>Functionality or correctness of AI-generated code</li>
        <li>Accuracy or currency of pricing data</li>
        <li>Consequences of design decisions based on the service</li>
        <li>Service interruptions or data loss</li>
      </ul>

      <h2>7. Account termination</h2>
      <p>
        You can delete your account at any time from the Settings page. We reserve the right
        to terminate accounts that violate these terms.
      </p>

      <h2>8. Changes to terms</h2>
      <p>
        We reserve the right to modify these terms. Material changes will be communicated
        via email. Continued use of the service after changes constitutes acceptance
        of the new terms.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These terms are governed by Finnish law. Disputes shall be resolved
        in the District Court of Helsinki.
      </p>
    </>
  );
}

export default function TermsPage() {
  const { locale, t } = useTranslation();

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Top bar */}
      <div className="nav-bar">
        <div className="nav-inner" style={{ maxWidth: 720 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/" style={{ textDecoration: "none" }}>
              <span className="heading-display" style={{ fontSize: 20 }}>
                <span style={{ color: "var(--text-primary)" }}>Hel</span>
                <span style={{ color: "var(--amber)" }}>scoop</span>
              </span>
            </Link>
            <div
              style={{
                width: 1,
                height: 20,
                background: "var(--border-strong)",
                margin: "0 4px",
              }}
            />
            <span className="label-mono">{t("legal.termsTitle")}</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <ThemeToggle />
            <LanguageSwitcher />
            <Link
              href="/"
              className="btn btn-ghost"
              style={{
                fontSize: 12,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              {t("legal.backToHome")}
            </Link>
          </div>
        </div>
      </div>

      <div
        style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 80px" }}
      >
        <div className="anim-up" style={{ marginBottom: 40 }}>
          <h1
            className="heading-display"
            style={{ fontSize: 36, marginBottom: 6 }}
          >
            {t("legal.termsTitle")}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            {t("legal.lastUpdated", { date: "2026-04-19" })}
          </p>
        </div>

        <div className="card anim-up legal-content" style={{ padding: "32px 28px" }}>
          {locale === "fi" ? <TermsContentFi /> : <TermsContentEn />}
        </div>
      </div>
    </div>
  );
}
