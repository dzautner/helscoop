"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useTranslation } from "@/components/LocaleProvider";
import type { BuildingInfo, NeighborhoodInsightsResponse, ProjectType } from "@/types";

interface NeighborhoodInsightsPanelProps {
  projectId: string;
  buildingInfo?: BuildingInfo | null;
  projectType?: ProjectType;
  onClose: () => void;
}

export function extractPostalCode(buildingInfo?: BuildingInfo | null): string | null {
  if (!buildingInfo) return null;
  const direct = buildingInfo.postal_code || buildingInfo.postalCode || buildingInfo.postinumero;
  const match = `${direct || ""} ${buildingInfo.address || ""}`.match(/\b\d{5}\b/);
  return match?.[0] ?? null;
}

function formatEuro(value: number, locale: string): string {
  return `${Math.round(value || 0).toLocaleString(locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB")} EUR`;
}

export default function NeighborhoodInsightsPanel({
  projectId,
  buildingInfo,
  projectType,
  onClose,
}: NeighborhoodInsightsPanelProps) {
  const { t, locale } = useTranslation();
  const postalCode = extractPostalCode(buildingInfo);
  const [insights, setInsights] = useState<NeighborhoodInsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!postalCode) return;
    let active = true;
    setLoading(true);
    setError(false);
    api.getNeighborhoodInsights({
      postal_code: postalCode,
      project_type: projectType,
      exclude_project_id: projectId,
      limit: 3,
    })
      .then((result) => {
        if (active) setInsights(result);
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [postalCode, projectId, projectType]);

  return (
    <aside className="neighborhood-panel" aria-label={t("neighborhood.title")}>
      <div className="neighborhood-panel-header">
        <div>
          <span>{t("neighborhood.eyebrow")}</span>
          <h3>{t("neighborhood.title")}</h3>
        </div>
        <button type="button" className="energy-dashboard-close" onClick={onClose} aria-label={t("energy.close")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {!postalCode && (
        <div className="neighborhood-empty">
          <strong>{t("neighborhood.noPostalTitle")}</strong>
          <p>{t("neighborhood.noPostalBody")}</p>
        </div>
      )}

      {postalCode && loading && (
        <div className="neighborhood-empty">{t("neighborhood.loading")}</div>
      )}

      {postalCode && error && (
        <div className="neighborhood-empty" role="alert">{t("neighborhood.error")}</div>
      )}

      {postalCode && !loading && !error && insights && (
        <>
          <div className="neighborhood-summary">
            <div>
              <span>{t("neighborhood.postalCode")}</span>
              <strong>{insights.postal_code_area}</strong>
            </div>
            <div>
              <span>{t("neighborhood.projectsThisYear")}</span>
              <strong>{insights.projects_this_year}</strong>
            </div>
            <div>
              <span>{t("neighborhood.averageCost")}</span>
              <strong>{formatEuro(insights.average_cost, locale)}</strong>
            </div>
          </div>

          <div className="neighborhood-section">
            <div className="neighborhood-section-title">{t("neighborhood.popularMaterials")}</div>
            {insights.popular_materials.length > 0 ? (
              <div className="neighborhood-chip-grid">
                {insights.popular_materials.map((item) => (
                  <span key={item.name}>
                    {item.name} <b>{item.share_pct}%</b>
                  </span>
                ))}
              </div>
            ) : (
              <p>{t("neighborhood.noMaterials")}</p>
            )}
          </div>

          <div className="neighborhood-section">
            <div className="neighborhood-section-title">{t("neighborhood.renovationTypes")}</div>
            {insights.renovation_types.length > 0 ? (
              <div className="neighborhood-chip-grid">
                {insights.renovation_types.map((item) => (
                  <span key={item.type}>
                    {item.type} <b>{item.count}</b>
                  </span>
                ))}
              </div>
            ) : (
              <p>{t("neighborhood.noTypes")}</p>
            )}
          </div>

          <div className="neighborhood-section">
            <div className="neighborhood-section-title">{t("neighborhood.similarProjects")}</div>
            {insights.similar_projects.length > 0 ? (
              <div className="neighborhood-similar-list">
                {insights.similar_projects.map((project) => (
                  <Link key={project.id} href={`/gallery/${project.id}`} target="_blank" rel="noreferrer">
                    <strong>{project.name}</strong>
                    <span>{formatEuro(Number(project.estimated_cost), locale)} · {project.postal_code_area || project.region || "Finland"}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p>{t("neighborhood.noSimilar")}</p>
            )}
          </div>

          <Link
            className="neighborhood-gallery-link"
            href={`/gallery?postal_code=${encodeURIComponent(insights.postal_code_area)}`}
            target="_blank"
            rel="noreferrer"
          >
            {t("neighborhood.openGallery")}
          </Link>
        </>
      )}
    </aside>
  );
}
