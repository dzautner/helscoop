"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { useTranslation } from "@/components/LocaleProvider";
import type { BuildingResult } from "@/types";

const Viewport3D = dynamic(() => import("@/components/Viewport3D"), {
  ssr: false,
  loading: () => (
    <div style={{ width: "100%", height: "100%", background: "#1a1816", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
      Ladataan 3D...
    </div>
  ),
});

const BUILDING_TYPE_LABELS: Record<string, Record<string, string>> = {
  fi: { omakotitalo: "Omakotitalo", rivitalo: "Rivitalo", kerrostalo: "Kerrostalo", paritalo: "Paritalo" },
  en: { omakotitalo: "Detached house", rivitalo: "Terraced house", kerrostalo: "Apartment block", paritalo: "Semi-detached" },
};

const MATERIAL_LABELS: Record<string, Record<string, string>> = {
  fi: { puu: "Puu", tiili: "Tiili", betoni: "Betoni", hirsi: "Hirsi" },
  en: { puu: "Wood", tiili: "Brick", betoni: "Concrete", hirsi: "Log" },
};

const HEATING_LABELS: Record<string, Record<string, string>> = {
  fi: { kaukolampo: "Kaukolampo", sahko: "Sahko", maalampopumppu: "Maalampopumppu", oljy: "Oljy" },
  en: { kaukolampo: "District heating", sahko: "Electric", maalampopumppu: "Ground source heat pump", oljy: "Oil" },
};

export default function AddressSearch({ onCreateProject }: { onCreateProject: (building: BuildingResult) => void }) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BuildingResult | null>(null);
  const [searched, setSearched] = useState(false);
  const { t, locale } = useTranslation();

  const search = useCallback(async () => {
    if (!query.trim() || query.trim().length < 3) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.getBuilding(query.trim());
      setResult(data);
    } catch {
      setResult(null);
    }
    setLoading(false);
  }, [query]);

  const buildingTypeLabels = BUILDING_TYPE_LABELS[locale] || BUILDING_TYPE_LABELS.fi;
  const materialLabels = MATERIAL_LABELS[locale] || MATERIAL_LABELS.fi;
  const heatingLabels = HEATING_LABELS[locale] || HEATING_LABELS.fi;

  return (
    <div style={{
      width: "100%",
      padding: result ? "48px 24px 24px" : "80px 24px 64px",
      background: "linear-gradient(180deg, rgba(196,145,92,0.08) 0%, rgba(196,145,92,0.02) 50%, transparent 100%)",
      borderBottom: "1px solid var(--border)",
      transition: "padding 0.3s ease",
    }}>
      <div style={{ maxWidth: result ? 960 : 640, margin: "0 auto", textAlign: "center", transition: "max-width 0.3s ease" }}>
        {!result && (
          <>
            <div className="label-mono" style={{ color: "var(--amber)", marginBottom: 16, letterSpacing: "0.15em", fontSize: 11 }}>
              {t('search.demoLabel')}
            </div>
            <h2 className="heading-display" style={{ fontSize: 36, marginBottom: 10, lineHeight: 1.1 }}>
              {t('search.title')}
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 16, marginBottom: 32, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
              {t('search.subtitle')}
            </p>
          </>
        )}

        <div style={{ display: "flex", gap: 8, maxWidth: 520, margin: "0 auto" }}>
          <input
            className="input"
            placeholder={t('search.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (searched) { setResult(null); setSearched(false); }
            }}
            onKeyDown={(e) => e.key === "Enter" && search()}
            style={{ flex: 1, padding: "14px 16px", fontSize: 15 }}
          />
          <button
            className={`btn ${query.trim().length >= 3 ? "btn-primary" : "btn-ghost"}`}
            onClick={search}
            disabled={loading || query.trim().length < 3}
            style={{ padding: "14px 28px", fontSize: 14 }}
          >
            {loading ? t('search.searching') : t('search.searchButton')}
          </button>
        </div>

        {result && (
          <div className="anim-up" style={{
            marginTop: 28,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 24,
            textAlign: "left",
          }}>
            {/* 3D Preview */}
            <div style={{
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
              border: "1px solid var(--border)",
              background: "#1a1816",
              minHeight: 320,
            }}>
              <Viewport3D
                sceneJs={result.scene_js}
                wireframe={false}
                onObjectCount={() => {}}
                onError={() => {}}
              />
            </div>

            {/* Building info + CTA */}
            <div className="card" style={{ padding: "24px 28px", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <h3 className="heading-display" style={{ fontSize: 20, marginBottom: 6 }}>
                    {result.address}
                  </h3>
                  <span className="badge badge-amber">
                    {buildingTypeLabels[result.building_info.type] || result.building_info.type}
                  </span>
                </div>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  textAlign: "right",
                }}>
                  {result.coordinates.lat.toFixed(4)}<br/>{result.coordinates.lon.toFixed(4)}
                </div>
              </div>

              <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
                marginBottom: 16,
                flex: 1,
              }}>
                {[
                  { label: t('search.yearBuilt'), value: String(result.building_info.year_built) },
                  { label: t('search.area'), value: `${result.building_info.area_m2} m\u00B2` },
                  { label: t('search.floors'), value: String(result.building_info.floors) },
                  { label: t('search.material'), value: materialLabels[result.building_info.material] || result.building_info.material },
                  { label: t('search.heating'), value: heatingLabels[result.building_info.heating] || result.building_info.heating },
                  { label: t('search.bomRows'), value: `${result.bom_suggestion.length} ${locale === 'fi' ? 'kpl' : 'pcs'}` },
                ].map((item, i) => (
                  <div key={i} style={{
                    padding: "10px 12px",
                    background: "var(--bg-tertiary)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                  }}>
                    <div className="label-mono" style={{ marginBottom: 4, fontSize: 10 }}>{item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <button
                className="btn btn-primary"
                onClick={() => onCreateProject(result)}
                style={{ width: "100%", padding: "14px 16px", fontSize: 15, fontWeight: 600 }}
              >
                {t('search.createFromBuilding')}
              </button>
            </div>
          </div>
        )}

        {searched && !loading && !result && (
          <div className="anim-fade" style={{
            marginTop: 20,
            padding: "16px",
            color: "var(--text-muted)",
            fontSize: 13,
          }}>
            {t('search.notFound')}
          </div>
        )}
      </div>
    </div>
  );
}
