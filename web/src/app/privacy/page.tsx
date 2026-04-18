"use client";

import Link from "next/link";
import { useTranslation } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";

function PrivacyContentFi() {
  return (
    <>
      <h2>1. Rekisterinpitaja</h2>
      <p>
        Helscoop<br />
        Sahkoposti: privacy@helscoop.fi
      </p>

      <h2>2. Keratyt tiedot</h2>
      <p>Keramme seuraavia henkilotietoja:</p>
      <ul>
        <li><strong>Tilin tiedot:</strong> nimi, sahkopostiosoite, salattu salasana</li>
        <li><strong>Projektin tiedot:</strong> 3D-kohtauskoodit, materiaalilistat, projektin nimet ja kuvaukset</li>
        <li><strong>Rakennushaut:</strong> hakemasi osoitteet (rakennustietojen hakua varten)</li>
        <li><strong>Tekniset tiedot:</strong> IP-osoite (nopeusrajoitusta varten), istuntotunnus</li>
      </ul>

      <h2>3. Tietojen tallentaminen</h2>
      <p>
        Henkilotietosi tallennetaan PostgreSQL-tietokantaan. Salasanat tallennetaan bcrypt-algoritmilla salattuina.
        Palvelua isannoidaan EU:n alueella.
      </p>

      <h2>4. Tietojen sailytysaika</h2>
      <p>
        Henkilotietojasi sailytetaan niin kauan kuin tilisi on aktiivinen. Voit milloin tahansa poistaa
        tilisi Asetukset-sivulta, jolloin kaikki tietosi poistetaan pysyvasti.
      </p>

      <h2>5. Rekisteroidyn oikeudet</h2>
      <p>Sinulla on oikeus:</p>
      <ul>
        <li>Paasta kaikkiin henkilotietoihisi (Asetukset-sivu)</li>
        <li>Oikaista tietojasi (nimi, sahkoposti Asetukset-sivulta)</li>
        <li>Poistaa kaikki tietosi (tilin poisto Asetukset-sivulta)</li>
        <li>Vastustaa tietojenkasittelya</li>
        <li>Siirtaa tietosi toiseen palveluun</li>
        <li>Tehda valitus tietosuojaviranomaiselle</li>
      </ul>

      <h2>6. Kolmannet osapuolet</h2>
      <p>Kaytamme seuraavia kolmannen osapuolen palveluita:</p>
      <ul>
        <li><strong>Claude AI (Anthropic):</strong> AI-avustaja kohtausten muokkaamiseen. Chat-viestit lahetetaan Anthropicin API:lle.</li>
        <li><strong>DVV / Maanmittauslaitos:</strong> Rakennustietojen haku julkisista rekistereista.</li>
        <li><strong>K-Rauta, Sarokas, Ruukki:</strong> Materiaalien hintatiedot haetaan naiden toimittajien verkkosivuilta.</li>
      </ul>

      <h2>7. Evasteet</h2>
      <p>
        Helscoop ei kayta analytiikka- tai mainosevasteita. Kaytamme ainoastaan
        valttamatonta istuntotunnistetta (JWT localStorage-muistissa), joka on
        tarpeen kirjautumisen yllapitamiseksi.
      </p>

      <h2>8. Yhteydenotto</h2>
      <p>
        Tietosuojaa koskevissa kysymyksissa voit ottaa yhteytta: privacy@helscoop.fi
      </p>
    </>
  );
}

function PrivacyContentEn() {
  return (
    <>
      <h2>1. Data controller</h2>
      <p>
        Helscoop<br />
        Email: privacy@helscoop.fi
      </p>

      <h2>2. Data we collect</h2>
      <p>We collect the following personal data:</p>
      <ul>
        <li><strong>Account information:</strong> name, email address, encrypted password</li>
        <li><strong>Project data:</strong> 3D scene code, bill-of-materials lists, project names and descriptions</li>
        <li><strong>Building lookups:</strong> addresses you search (for building data retrieval)</li>
        <li><strong>Technical data:</strong> IP address (for rate limiting), session identifier</li>
      </ul>

      <h2>3. Data storage</h2>
      <p>
        Your personal data is stored in a PostgreSQL database. Passwords are encrypted using the bcrypt algorithm.
        The service is hosted within the EU.
      </p>

      <h2>4. Data retention</h2>
      <p>
        Your personal data is retained as long as your account is active. You can delete your account
        at any time from the Settings page, which permanently removes all your data.
      </p>

      <h2>5. Your rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access all your personal data (Settings page)</li>
        <li>Rectify your data (name, email from Settings)</li>
        <li>Delete all your data (account deletion from Settings)</li>
        <li>Object to data processing</li>
        <li>Data portability</li>
        <li>Lodge a complaint with a supervisory authority</li>
      </ul>

      <h2>6. Third parties</h2>
      <p>We use the following third-party services:</p>
      <ul>
        <li><strong>Claude AI (Anthropic):</strong> AI assistant for scene editing. Chat messages are sent to Anthropic&apos;s API.</li>
        <li><strong>DVV / National Land Survey:</strong> Building data from Finnish public registries.</li>
        <li><strong>K-Rauta, Sarokas, Ruukki:</strong> Material pricing scraped from supplier websites.</li>
      </ul>

      <h2>7. Cookies</h2>
      <p>
        Helscoop does not use analytics or advertising cookies. We only use an essential session
        token (JWT in localStorage) required to maintain your login session.
      </p>

      <h2>8. Contact</h2>
      <p>
        For privacy-related questions, contact us at: privacy@helscoop.fi
      </p>
    </>
  );
}

export default function PrivacyPage() {
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
            <span className="label-mono">{t("legal.privacyTitle")}</span>
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
            {t("legal.privacyTitle")}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
            {t("legal.lastUpdated", { date: "2026-04-19" })}
          </p>
        </div>

        <div className="card anim-up legal-content" style={{ padding: "32px 28px" }}>
          {locale === "fi" ? <PrivacyContentFi /> : <PrivacyContentEn />}
        </div>
      </div>
    </div>
  );
}
