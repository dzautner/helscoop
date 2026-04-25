"use client";

import { useState } from "react";
import { SkeletonBlock } from "@/components/Skeleton";
import { useTranslation } from "@/components/LocaleProvider";
import type { Template } from "@/types";

const TEMPLATE_ICONS: Record<string, string> = {
  sauna: "M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M5 21V5l7-3 7 3v16",
  garage: "M3 21V8l9-5 9 5v13M3 21h18M9 21v-6h6v6",
  shed: "M3 21V10l4-3h10l4 3v11M3 21h18M10 21v-4h4v4",
  pergola: "M4 22V12M20 22V12M2 12h20M6 12v-2M10 12v-2M14 12v-2M18 12v-2",
  kanala: "M3 21h18M5 21V11l7-4 7 4v10M9 21v-4h6v4M10 11h1M14 11h1M8 15h1",
  greenhouse: "M4 20V10l8-6 8 6v10M4 10h16M8 20V8M16 20V8M12 4v16",
  playhouse: "M4 20V10l8-6 8 6v10M9 20v-5h6v5M9 12h2M13 12h2",
  dock: "M4 17h16M5 13h14M7 9h10M8 21V7M16 21V7",
};

const CATEGORY_OPTIONS = ["all", "sauna", "garage", "shed", "terrace", "other"] as const;
type TemplateCategoryFilter = (typeof CATEGORY_OPTIONS)[number];
type TemplateSort = "popular" | "newest" | "price";

function templateCategory(template: Template): TemplateCategoryFilter {
  const category = template.category;
  return category === "sauna" || category === "garage" || category === "shed" || category === "terrace"
    ? category
    : "other";
}

export default function TemplateGrid({
  templates,
  loading,
  creating,
  onCreateFromTemplate,
}: {
  templates: Template[];
  loading: boolean;
  creating: boolean;
  onCreateFromTemplate: (tmpl: Template) => void;
}) {
  const { t, locale } = useTranslation();
  const [category, setCategory] = useState<TemplateCategoryFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<TemplateSort>("popular");
  const numberLocale = locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB";
  const normalizedSearch = search.trim().toLowerCase();
  const visibleTemplates = [...templates]
    .filter((template) => category === "all" || templateCategory(template) === category)
    .filter((template) => {
      if (!normalizedSearch) return true;
      return [
        template.name,
        template.name_fi,
        template.name_en,
        template.description,
        template.description_fi,
        template.description_en,
      ].some((value) => value?.toLowerCase().includes(normalizedSearch));
    })
    .sort((a, b) => {
      if (sort === "price") {
        return (a.estimated_cost ?? Number.MAX_SAFE_INTEGER) - (b.estimated_cost ?? Number.MAX_SAFE_INTEGER);
      }
      if (sort === "newest") {
        return (Date.parse(b.created_at ?? "") || 0) - (Date.parse(a.created_at ?? "") || 0);
      }
      return (b.use_count ?? 0) - (a.use_count ?? 0) || Number(b.is_featured) - Number(a.is_featured);
    });

  return (
    <div className="template-gallery" style={{ marginTop: 28 }}>
      <div className="template-gallery-header">
        <div>
          <div className="label-mono" style={{ marginBottom: 6, letterSpacing: "0.1em" }}>
            {t("project.orStartFromTemplate")}
          </div>
          <p className="template-gallery-subtitle">{t("templates.gallerySubtitle")}</p>
        </div>
        {!loading && templates.length > 0 ? (
          <div className="template-gallery-count">
            {t("templates.count", { count: visibleTemplates.length })}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="template-grid">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="card"
              style={{
                padding: "14px",
                animation: `fadeIn 0.3s ease ${i * 0.08}s both`,
              }}
            >
              <SkeletonBlock width="100%" height={112} radius="var(--radius-sm)" />
              <SkeletonBlock width="70%" height={16} style={{ marginTop: 16 }} />
              <SkeletonBlock width="45%" height={20} radius={100} style={{ marginTop: 8 }} />
              <SkeletonBlock width="90%" height={12} style={{ marginTop: 12 }} />
            </div>
          ))}
        </div>
      ) : templates.length > 0 ? (
        <>
          <div className="template-gallery-controls">
            <div className="template-category-tabs" role="tablist" aria-label={t("templates.categoryTabsLabel")}>
              {CATEGORY_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`template-category-tab ${category === option ? "active" : ""}`}
                  onClick={() => setCategory(option)}
                  role="tab"
                  aria-selected={category === option}
                >
                  {t(`templates.categories.${option}`)}
                </button>
              ))}
            </div>
            <div className="template-gallery-filters">
              <label className="sr-only" htmlFor="template-search">
                {t("templates.searchLabel")}
              </label>
              <input
                id="template-search"
                className="template-search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("templates.searchPlaceholder")}
              />
              <label className="sr-only" htmlFor="template-sort">
                {t("templates.sortLabel")}
              </label>
              <select
                id="template-sort"
                className="template-sort-select"
                value={sort}
                onChange={(event) => setSort(event.target.value as TemplateSort)}
              >
                <option value="popular">{t("templates.sortPopular")}</option>
                <option value="newest">{t("templates.sortNewest")}</option>
                <option value="price">{t("templates.sortPrice")}</option>
              </select>
            </div>
          </div>

          {visibleTemplates.length > 0 ? (
            <div className="template-grid template-grid-rich">
              {visibleTemplates.map((tmpl, i) => (
                <button
                  key={tmpl.id}
                  className="card card-interactive anim-up template-card-rich"
                  disabled={creating}
                  onClick={() => onCreateFromTemplate(tmpl)}
                  aria-label={t("project.useTemplate", { name: tmpl.name })}
                  style={{ animationDelay: `${i * 0.04}s` }}
                >
                  <div className="template-thumb">
                    {tmpl.thumbnail_url ? (
                      // Templates are seeded with trusted SVG data URLs or admin-reviewed URLs.
                      <img src={tmpl.thumbnail_url} alt="" loading="lazy" />
                    ) : (
                      <div className="template-icon template-thumb-fallback">
                        <svg
                          width="28"
                          height="28"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d={TEMPLATE_ICONS[tmpl.icon || ""] || TEMPLATE_ICONS.shed} />
                        </svg>
                      </div>
                    )}
                    {tmpl.is_community ? (
                      <span className="template-community-badge">{t("templates.community")}</span>
                    ) : null}
                  </div>
                  <div className="template-card-body">
                    <div className="template-card-title-row">
                      <div className="heading-display template-card-title">{tmpl.name}</div>
                      <span className={`template-difficulty-dot difficulty-${tmpl.difficulty || "intermediate"}`} />
                    </div>
                    <div className="template-meta-row">
                      <span className="badge badge-amber">
                        {tmpl.estimated_cost === null || tmpl.estimated_cost === undefined
                          ? t("templates.costUnknown")
                          : `~${Number(tmpl.estimated_cost).toLocaleString(numberLocale)} €`}
                      </span>
                      {tmpl.area_m2 ? (
                        <span className="template-meta-pill">
                          {Number(tmpl.area_m2).toLocaleString(numberLocale)} m²
                        </span>
                      ) : null}
                      <span className="template-meta-pill">
                        {t(`templates.difficulty.${tmpl.difficulty || "intermediate"}`)}
                      </span>
                    </div>
                    <p className="template-card-description">{tmpl.description}</p>
                    <div className="template-card-footer">
                      <span>{t("templates.useCount", { count: tmpl.use_count ?? 0 })}</span>
                      {tmpl.author_name ? <span>{tmpl.author_name}</span> : null}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="template-empty-filter">{t("templates.emptyFilter")}</div>
          )}
        </>
      ) : null}
    </div>
  );
}
