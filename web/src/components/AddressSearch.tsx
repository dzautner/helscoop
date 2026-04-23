"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { api } from "@/lib/api";
import { useTranslation } from "@/components/LocaleProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import type { DataProvenance } from "@/lib/confidence";
import type { BuildingResult } from "@/types";
import MapPreview from "@/components/MapPreview";

/** Map a BuildingResult confidence string to a DataProvenance object */
function buildingResultToProvenance(result: BuildingResult): DataProvenance {
  if (result.confidence === "verified") {
    return { confidence: "verified", source: result.data_sources?.[0] ?? "DVV/MML" };
  }
  if (result.confidence === "template") {
    return { confidence: "demo", source: "template" };
  }
  if (result.confidence === "manual") {
    return { confidence: "manual", source: result.data_sources?.[0] ?? "user" };
  }
  return { confidence: "estimated", source: result.data_sources?.[0] ?? "heuristic" };
}

function Viewport3DLoading() {
  const { t } = useTranslation();
  return (
    <div style={{ width: "100%", height: "100%", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 13 }}>
      {t('editor.loading3D')}
    </div>
  );
}

const Viewport3D = dynamic(() => import("@/components/Viewport3D"), {
  ssr: false,
  loading: () => <Viewport3DLoading />,
});

/** Map building type API keys to i18n keys */
const BUILDING_TYPE_I18N: Record<string, string> = {
  omakotitalo: "building.omakotitalo",
  rivitalo: "building.rivitalo",
  kerrostalo: "building.kerrostalo",
  paritalo: "building.paritalo",
};

/** Map material API keys to i18n keys */
const MATERIAL_I18N: Record<string, string> = {
  puu: "building.materialWood",
  tiili: "building.materialBrick",
  betoni: "building.materialConcrete",
  hirsi: "building.materialLog",
};

/** Map heating API keys to i18n keys */
const HEATING_I18N: Record<string, string> = {
  kaukolampo: "building.heatingDistrict",
  sahko: "building.heatingElectric",
  maalampopumppu: "building.heatingGroundSource",
  maalampo: "building.heatingGroundSource",
  oljy: "building.heatingOil",
};

const ROOF_TYPE_I18N: Record<string, string> = {
  harjakatto: "building.roofGable",
  tasakatto: "building.roofFlat",
  mansardikatto: "building.roofMansard",
  pulpettikatto: "building.roofShed",
};

const BUILDING_TYPE_OPTIONS = ["omakotitalo", "rivitalo", "kerrostalo", "paritalo"];
const MATERIAL_OPTIONS = ["puu", "tiili", "betoni", "hirsi"];
const HEATING_OPTIONS = ["kaukolampo", "sahko", "maalampopumppu", "oljy"];
const ROOF_TYPE_OPTIONS = ["harjakatto", "tasakatto", "mansardikatto", "pulpettikatto"];

function DataSourcesSection({ label, sources }: { label: string; sources: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={label}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.05em",
          padding: "4px 0",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        <span style={{
          display: "inline-block",
          transition: "transform 0.15s ease",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
          fontSize: 9,
        }}>&#9654;</span>
        {label}
      </button>
      {open && (
        <div style={{
          paddingLeft: 16,
          paddingTop: 4,
          fontSize: 12,
          color: "var(--text-secondary)",
          lineHeight: 1.6,
        }}>
          {sources.map((src, i) => (
            <div key={i}>{src}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function DataSourceWarning({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <div style={{
      padding: "8px 12px",
      marginBottom: 10,
      background: "var(--warning-dim)",
      border: "1px solid var(--warning-border)",
      borderRadius: "var(--radius-sm)",
      color: "var(--warning)",
      fontSize: 12,
      lineHeight: 1.5,
    }}>
      {message}
    </div>
  );
}

export default function AddressSearch({
  onCreateProject,
  compact = false,
}: {
  onCreateProject: (building: BuildingResult) => Promise<void> | void;
  compact?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [result, setResult] = useState<BuildingResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [updatingBuilding, setUpdatingBuilding] = useState(false);
  const [editError, setEditError] = useState(false);
  const { t, locale } = useTranslation();
  const { track } = useAnalytics();

  const search = useCallback(async () => {
    if (!query.trim() || query.trim().length < 3) return;
    setLoading(true);
    setSearched(true);
    setSearchError(false);
    try {
      const data = await api.getBuilding(query.trim());
      setResult(data);
      setEditError(false);
      track("address_search", { query_length: query.trim().length, had_result: true });
    } catch {
      setResult(null);
      setSearchError(true);
      track("address_search", { query_length: query.trim().length, had_result: false });
    }
    setLoading(false);
  }, [query, track]);

  const resolveBuildingType = (type: string) => BUILDING_TYPE_I18N[type] ? t(BUILDING_TYPE_I18N[type]) : type;
  const resolveMaterial = (mat: string) => MATERIAL_I18N[mat] ? t(MATERIAL_I18N[mat]) : mat;
  const resolveHeating = (heat: string) => HEATING_I18N[heat] ? t(HEATING_I18N[heat]) : heat;
  const resolveRoofType = (roof: string) => ROOF_TYPE_I18N[roof] ? t(ROOF_TYPE_I18N[roof]) : roof;

  const updateBuildingDetails = useCallback(async (patch: Partial<BuildingResult["building_info"]>) => {
    if (!result || result.confidence === "verified") return;
    const nextInfo = { ...result.building_info, ...patch };
    setUpdatingBuilding(true);
    setEditError(false);
    try {
      const updated = await api.generateBuilding({
        address: result.address,
        coordinates: result.coordinates,
        building_info: nextInfo,
      });
      setResult(updated);
    } catch {
      setEditError(true);
    } finally {
      setUpdatingBuilding(false);
    }
  }, [result]);

  const canEditBuilding = Boolean(result && result.confidence !== "verified");
  const editControlStyle = {
    width: "100%",
    padding: "6px 8px",
    fontSize: 13,
    minHeight: 32,
  };
  const renderSelect = (
    value: string,
    options: string[],
    resolveLabel: (value: string) => string,
    onChange: (value: string) => void,
    label: string,
  ) => {
    const selectOptions = options.includes(value) ? options : [value, ...options];
    return (
      <select
        className="input"
        value={value}
        disabled={updatingBuilding}
        aria-label={label}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={editControlStyle}
      >
        {selectOptions.map((option) => (
          <option key={option} value={option}>
            {resolveLabel(option)}
          </option>
        ))}
      </select>
    );
  };

  if (compact) {
    return (
      <div>
        <div className="address-search-bar" data-tour="address-input" style={{ maxWidth: "none" }}>
          <input
            className="input"
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (searched) { setResult(null); setSearched(false); }
            }}
            onKeyDown={(e) => e.key === "Enter" && search()}
            style={{ flex: 1, padding: "12px 14px", fontSize: 14 }}
          />
          <button
            className={`btn ${query.trim().length >= 3 ? "btn-primary" : "btn-ghost"}`}
            onClick={search}
            disabled={loading || query.trim().length < 3}
            aria-label={t('search.searchButton')}
            style={{ padding: "12px 20px", fontSize: 13 }}
          >
            {loading ? t('search.searching') : t('search.searchButton')}
          </button>
        </div>

        {loading && (
          <div
            aria-live="polite"
            aria-label={t('search.loading')}
            style={{
              marginTop: 16,
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            <div
              className="btn-spinner"
              role="status"
              aria-hidden="true"
              style={{ borderTopColor: "#e5a04b", width: 16, height: 16, borderWidth: 2 }}
            />
            {t('search.loading')}
          </div>
        )}

        {result && (
          <div className="anim-up address-result-glow" style={{ marginTop: 16 }}>
            <div className="card" style={{ padding: "16px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div className="heading-display" style={{ fontSize: 15, marginBottom: 4 }}>
                    {result.address}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="badge badge-amber" style={{ fontSize: 11 }}>
                      {resolveBuildingType(result.building_info.type)}
                    </span>
                    <ConfidenceBadge provenance={buildingResultToProvenance(result)} />
                    <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                      {result.building_info.year_built} &middot; {result.building_info.area_m2} m&sup2;
                    </span>
                  </div>
                </div>
              </div>
              {createError && (
                <div className="inline-error-banner" role="alert">
                  {t('search.createError')}
                </div>
              )}
              <DataSourceWarning message={result.data_source_error} />
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setCreating(true);
                  setCreateError(false);
                  try {
                    await onCreateProject(result);
                  } catch {
                    setCreateError(true);
                    setCreating(false);
                  }
                }}
                disabled={creating}
                style={{ width: "100%", padding: "11px 14px", fontSize: 13, fontWeight: 600, opacity: creating ? 0.7 : 1 }}
              >
                {creating ? t('search.creatingProject') : t('search.createFromBuilding')}
              </button>
            </div>
          </div>
        )}

        {searched && !loading && !result && (
          <div className="anim-fade" role={searchError ? "alert" : undefined} style={{ marginTop: 16, color: searchError ? "var(--danger)" : "var(--text-muted)", fontSize: 12 }}>
            {searchError ? t('search.searchError') : t('search.notFound')}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      width: "100%",
      padding: result ? "32px 24px 24px" : "56px 24px 48px",
      borderBottom: "1px solid var(--border)",
      transition: "padding 0.3s ease",
    }}>
      <div style={{ maxWidth: result ? 960 : 640, margin: "0 auto", textAlign: "center", transition: "max-width 0.3s ease" }}>
        {!result && (
          <>
            <h1 className="heading-display" style={{ fontSize: 36, marginBottom: 10, lineHeight: 1.1 }}>
              {t('search.title')}
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: 16, marginBottom: 32, maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
              {t('search.subtitle')}
            </p>
          </>
        )}

        <div className="address-search-bar" data-tour="address-input">
          <input
            className="input"
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
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
            aria-label={t('search.searchButton')}
            style={{ padding: "14px 28px", fontSize: 14 }}
          >
            {loading ? t('search.searching') : t('search.searchButton')}
          </button>
        </div>

        {loading && (
          <div
            aria-live="polite"
            aria-label={t('search.loading')}
            style={{
              marginTop: 28,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              color: "var(--text-muted)",
              fontSize: 14,
            }}
          >
            <div
              className="btn-spinner"
              role="status"
              aria-hidden="true"
              style={{ borderTopColor: "#e5a04b", width: 20, height: 20, borderWidth: 2 }}
            />
            {t('search.loading')}
          </div>
        )}

        {result && (
          <div className="anim-up building-result-grid address-result-glow" style={{
            marginTop: 28,
            textAlign: "left",
          }}>
            {/* 3D Preview */}
            <div style={{
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
              border: "1px solid var(--border)",
              background: "var(--bg-secondary)",
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
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="badge badge-amber">
                      {resolveBuildingType(result.building_info.type)}
                    </span>
                    <ConfidenceBadge provenance={buildingResultToProvenance(result)} />
                    {canEditBuilding && (
                      <span className="badge" style={{ fontSize: 11 }}>
                        {t('search.editHint')}
                      </span>
                    )}
                    {updatingBuilding && (
                      <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                        {t('search.updatingBuilding')}
                      </span>
                    )}
                  </div>
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

              <dl className="building-info-grid" style={{
                marginBottom: 16,
                flex: 1,
                margin: 0,
              }}>
                {[
                  {
                    label: t('search.type'),
                    value: canEditBuilding
                      ? renderSelect(
                        result.building_info.type,
                        BUILDING_TYPE_OPTIONS,
                        resolveBuildingType,
                        (value) => void updateBuildingDetails({ type: value }),
                        t('search.type'),
                      )
                      : resolveBuildingType(result.building_info.type),
                  },
                  {
                    label: t('search.yearBuilt'),
                    value: canEditBuilding ? (
                      <input
                        key={`year-${result.building_info.year_built}`}
                        className="input"
                        type="number"
                        min={1800}
                        max={new Date().getFullYear() + 1}
                        defaultValue={result.building_info.year_built}
                        disabled={updatingBuilding}
                        aria-label={t('search.yearBuilt')}
                        onBlur={(event) => void updateBuildingDetails({ year_built: Number(event.currentTarget.value) })}
                        style={editControlStyle}
                      />
                    ) : String(result.building_info.year_built),
                  },
                  {
                    label: t('search.area'),
                    value: canEditBuilding ? (
                      <input
                        key={`area-${result.building_info.area_m2}`}
                        className="input"
                        type="number"
                        min={20}
                        max={2000}
                        step={0.5}
                        defaultValue={result.building_info.area_m2}
                        disabled={updatingBuilding}
                        aria-label={t('search.area')}
                        onBlur={(event) => void updateBuildingDetails({ area_m2: Number(event.currentTarget.value) })}
                        style={editControlStyle}
                      />
                    ) : `${result.building_info.area_m2} m\u00B2`,
                  },
                  {
                    label: t('search.floors'),
                    value: canEditBuilding ? (
                      <input
                        key={`floors-${result.building_info.floors}`}
                        className="input"
                        type="number"
                        min={1}
                        max={10}
                        step={1}
                        defaultValue={result.building_info.floors}
                        disabled={updatingBuilding}
                        aria-label={t('search.floors')}
                        onBlur={(event) => void updateBuildingDetails({ floors: Number(event.currentTarget.value) })}
                        style={editControlStyle}
                      />
                    ) : String(result.building_info.floors),
                  },
                  {
                    label: t('search.material'),
                    value: canEditBuilding
                      ? renderSelect(
                        result.building_info.material,
                        MATERIAL_OPTIONS,
                        resolveMaterial,
                        (value) => void updateBuildingDetails({ material: value }),
                        t('search.material'),
                      )
                      : resolveMaterial(result.building_info.material),
                  },
                  {
                    label: t('search.heating'),
                    value: canEditBuilding
                      ? renderSelect(
                        result.building_info.heating,
                        HEATING_OPTIONS,
                        resolveHeating,
                        (value) => void updateBuildingDetails({ heating: value }),
                        t('search.heating'),
                      )
                      : resolveHeating(result.building_info.heating),
                  },
                  {
                    label: t('search.roofType'),
                    value: canEditBuilding
                      ? renderSelect(
                        result.building_info.roof_type ?? "harjakatto",
                        ROOF_TYPE_OPTIONS,
                        resolveRoofType,
                        (value) => void updateBuildingDetails({ roof_type: value }),
                        t('search.roofType'),
                      )
                      : resolveRoofType(result.building_info.roof_type ?? "harjakatto"),
                  },
                  { label: t('search.bomRows'), value: `${result.bom_suggestion.length} ${locale === 'fi' ? 'kpl' : locale === 'sv' ? 'st' : 'pcs'}` },
                ].map((item, i) => (
                  <div key={i} style={{
                    padding: "10px 12px",
                    background: "var(--bg-tertiary)",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border)",
                  }}>
                    <dt className="label-mono" style={{ marginBottom: 4, fontSize: 10 }}>{item.label}</dt>
                    <dd style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{item.value}</dd>
                  </div>
                ))}
              </dl>

              {result.data_sources && result.data_sources.length > 0 && (
                <DataSourcesSection
                  label={t('search.dataSources')}
                  sources={result.data_sources}
                />
              )}

              <DataSourceWarning message={result.data_source_error} />

              {result.coordinates && (
                <MapPreview lat={result.coordinates.lat} lon={result.coordinates.lon} />
              )}

              {editError && (
                <div className="inline-error-banner" role="alert">
                  {t('search.updateError')}
                </div>
              )}

              {createError && (
                <div className="inline-error-banner" role="alert">
                  {t('search.createError')}
                </div>
              )}
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setCreating(true);
                  setCreateError(false);
                  try {
                    await onCreateProject(result);
                  } catch {
                    setCreateError(true);
                    setCreating(false);
                  }
                }}
                disabled={creating}
                style={{ width: "100%", padding: "14px 16px", fontSize: 15, fontWeight: 600, opacity: creating ? 0.7 : 1 }}
              >
                {creating ? t('search.creatingProject') : t('search.createFromBuilding')}
              </button>
            </div>
          </div>
        )}

        {searched && !loading && !result && (
          <div className="anim-fade" role={searchError ? "alert" : undefined} style={{
            marginTop: 20,
            padding: "16px",
            color: searchError ? "var(--danger)" : "var(--text-muted)",
            fontSize: 13,
          }}>
            {searchError ? t('search.searchError') : t('search.notFound')}
          </div>
        )}
      </div>
    </div>
  );
}
