"use client";

import { useState, useEffect, useCallback } from "react";
import { api, setToken, getToken } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { SkeletonProjectCard, SkeletonBlock } from "@/components/Skeleton";
import { useTranslation } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

interface Project {
  id: string;
  name: string;
  description: string;
  estimated_cost: number;
  updated_at: string;
}

interface BuildingResult {
  address: string;
  coordinates: { lat: number; lon: number };
  building_info: {
    type: string;
    year_built: number;
    material: string;
    floors: number;
    area_m2: number;
    heating: string;
    roof_type?: string;
    roof_material?: string;
    units?: number;
  };
  scene_js: string;
  bom_suggestion: { material_id: string; quantity: number; unit: string }[];
}

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

function AddressSearch({ onCreateProject }: { onCreateProject: (building: BuildingResult) => void }) {
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
      padding: "48px 24px 40px",
      background: "linear-gradient(180deg, rgba(196,145,92,0.06) 0%, transparent 100%)",
      borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center" }}>
        <div className="label-mono" style={{ color: "var(--amber)", marginBottom: 12, letterSpacing: "0.12em" }}>
          {t('search.demoLabel')}
        </div>
        <h2 className="heading-display" style={{ fontSize: 28, marginBottom: 8 }}>
          {t('search.title')}
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginBottom: 24 }}>
          {t('search.subtitle')}
        </p>

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
          <div className="card anim-up" style={{
            marginTop: 24,
            padding: "24px 28px",
            textAlign: "left",
            maxWidth: 520,
            marginLeft: "auto",
            marginRight: "auto",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 className="heading-display" style={{ fontSize: 18, marginBottom: 4 }}>
                  {result.address}
                </h3>
                <span className="badge badge-amber">
                  {buildingTypeLabels[result.building_info.type] || result.building_info.type}
                </span>
              </div>
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-muted)",
                textAlign: "right",
              }}>
                {result.coordinates.lat.toFixed(4)}, {result.coordinates.lon.toFixed(4)}
              </div>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginBottom: 20,
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
              style={{ width: "100%", padding: "13px 16px", fontSize: 14 }}
            >
              {t('search.createFromBuilding')}
            </button>
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

function LoginForm({ onLogin, pendingBuilding }: { onLogin: () => void; pendingBuilding: BuildingResult | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isRegister, setIsRegister] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useTranslation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = isRegister
        ? await api.register(email, password, name)
        : await api.login(email, password);
      setToken(result.token);
      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.loginFailed'));
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      position: "relative",
    }}>
      {/* Left: Brand panel */}
      <div style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 80px",
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(160deg, #1a1510 0%, #12110f 100%)",
      }}>
        {/* Decorative diagonal lines */}
        <div style={{
          position: "absolute",
          inset: 0,
          opacity: 0.03,
          backgroundImage: `repeating-linear-gradient(
            -45deg,
            transparent,
            transparent 40px,
            var(--amber) 40px,
            var(--amber) 41px
          )`,
        }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div className="anim-up" style={{ marginBottom: 48 }}>
            <div className="label-mono" style={{ color: "var(--amber)", marginBottom: 16, letterSpacing: "0.12em" }}>
              {t('brand.tagline')}
            </div>
            <h1 className="heading-display" style={{ fontSize: 56, lineHeight: 1.05, marginBottom: 20 }}>
              <span style={{ color: "var(--text-primary)" }}>Hel</span>
              <span style={{ color: "var(--amber)" }}>scoop</span>
            </h1>
            <p style={{ fontSize: 18, lineHeight: 1.7, color: "var(--text-secondary)", maxWidth: 420 }}>
              {t('brand.description')}
            </p>
          </div>

          <div className="anim-up delay-2" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {[
              { num: "28", label: t('brand.featureMaterials'), desc: t('brand.featureMaterialsDesc') },
              { num: "6", label: t('brand.featureSuppliers'), desc: t('brand.featureSuppliersDesc') },
              { num: "AI", label: t('brand.featureAI'), desc: t('brand.featureAIDesc') },
            ].map((item, i) => (
              <div key={i} style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                padding: "14px 0",
                borderBottom: "1px solid var(--border)",
              }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: "var(--radius-sm)",
                  background: "var(--amber-glow)",
                  border: "1px solid var(--amber-border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "var(--font-display)",
                  fontWeight: 700,
                  fontSize: item.num === "AI" ? 14 : 18,
                  color: "var(--amber)",
                  flexShrink: 0,
                }}>
                  {item.num}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{item.label}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 13 }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Login form */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 40px",
        background: "var(--bg-secondary)",
        borderLeft: "1px solid var(--border)",
        position: "relative",
      }}>
        <div style={{ position: "absolute", top: 16, right: 16 }}>
          <LanguageSwitcher />
        </div>
        <div className="anim-up delay-1" style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ marginBottom: 36 }}>
            <h2 className="heading-display" style={{ fontSize: 28, marginBottom: 8 }}>
              {isRegister ? t('auth.registerTitle') : t('auth.loginTitle')}
            </h2>
            <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
              {pendingBuilding
                ? t('auth.loginSubtitleBuilding') + pendingBuilding.address
                : isRegister
                  ? t('auth.registerSubtitle')
                  : t('auth.loginSubtitle')}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {isRegister && (
              <div>
                <label className="label-mono" style={{ display: "block", marginBottom: 8 }}>{t('auth.name')}</label>
                <input
                  className="input"
                  placeholder={t('auth.namePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="label-mono" style={{ display: "block", marginBottom: 8 }}>{t('auth.email')}</label>
              <input
                className="input"
                type="email"
                placeholder={t('auth.emailPlaceholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label-mono" style={{ display: "block", marginBottom: 8 }}>{t('auth.password')}</label>
              <input
                className="input"
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div style={{
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                background: "var(--danger-dim)",
                color: "var(--danger)",
                fontSize: 13,
                border: "1px solid rgba(199,95,95,0.12)",
              }}>
                {error}
              </div>
            )}

            <button
              className="btn btn-primary"
              type="submit"
              disabled={loading}
              style={{ width: "100%", padding: "13px 16px", fontSize: 14, marginTop: 4 }}
            >
              {loading ? t('auth.loading') : isRegister ? t('auth.register') : t('auth.login')}
            </button>
          </form>

          <div className="divider-amber" style={{ marginTop: 28, marginBottom: 20 }} />

          <div style={{ textAlign: "center" }}>
            <button
              onClick={() => { setIsRegister(!isRegister); setError(""); }}
              style={{
                background: "none",
                border: "none",
                color: "var(--amber)",
                cursor: "pointer",
                fontSize: 13,
                fontFamily: "var(--font-body)",
              }}
            >
              {isRegister ? t('auth.hasAccount') : t('auth.noAccount')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  estimated_cost: number;
  scene_js: string;
  bom: { material_id: string; quantity: number; unit: string }[];
}

const TEMPLATE_ICONS: Record<string, string> = {
  sauna: "M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M5 21V5l7-3 7 3v16",
  garage: "M3 21V8l9-5 9 5v13M3 21h18M9 21v-6h6v6",
  shed: "M3 21V10l4-3h10l4 3v11M3 21h18M10 21v-4h4v4",
  pergola: "M4 22V12M20 22V12M2 12h20M6 12v-2M10 12v-2M14 12v-2M18 12v-2",
};

function ProjectList() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t, locale } = useTranslation();

  useEffect(() => {
    let mounted = true;
    Promise.all([api.getProjects(), api.getTemplates()])
      .then(([projs, tmpls]) => {
        if (mounted) {
          setProjects(projs);
          setTemplates(tmpls);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          toast(err instanceof Error ? err.message : t('toast.loadProjectsFailed'), "error");
          setLoading(false);
        }
      });
    return () => { mounted = false; };
  }, [toast, t]);

  async function createProject() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const p = await api.createProject({ name: newName });
      setProjects([p, ...projects]);
      setNewName("");
      toast(t('toast.projectCreated'), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.createProjectFailed'), "error");
    }
    setCreating(false);
  }

  async function createFromTemplate(tmpl: Template) {
    setCreating(true);
    try {
      const p = await api.createProject({
        name: tmpl.name,
        description: tmpl.description,
        scene_js: tmpl.scene_js,
      });
      if (tmpl.bom.length > 0) {
        await api.saveBOM(p.id, tmpl.bom);
      }
      setProjects([{ ...p, estimated_cost: tmpl.estimated_cost }, ...projects]);
      setShowTemplates(false);
      toast(t('toast.templateCreated'), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.templateFailed'), "error");
    }
    setCreating(false);
  }

  async function deleteProject(id: string) {
    if (!confirm(t('project.deleteConfirm'))) return;
    try {
      await api.deleteProject(id);
      setProjects(projects.filter((p) => p.id !== id));
      toast(t('toast.projectDeleted'), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.deleteFailed'), "error");
    }
  }

  async function duplicateProject(id: string) {
    try {
      const p = await api.duplicateProject(id);
      setProjects([p, ...projects]);
      toast(t('toast.projectDuplicated'), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.duplicateFailed'), "error");
    }
  }

  function projectCountText(count: number): string {
    if (locale === 'fi') {
      return `${count} projekti${count !== 1 ? "a" : ""}`;
    }
    return `${count} project${count !== 1 ? "s" : ""}`;
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      {/* Top bar */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(18,17,15,0.85)",
        backdropFilter: "blur(16px) saturate(1.2)",
        borderBottom: "1px solid var(--border)",
      }}>
        <div style={{
          maxWidth: 1080,
          margin: "0 auto",
          padding: "12px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="heading-display" style={{ fontSize: 20 }}>
              <span style={{ color: "var(--text-primary)" }}>Hel</span>
              <span style={{ color: "var(--amber)" }}>scoop</span>
            </span>
            <div style={{ width: 1, height: 20, background: "var(--border-strong)", margin: "0 4px" }} />
            <span className="label-mono">{t('nav.projects')}</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <LanguageSwitcher />
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => (window.location.href = "/admin")}>
              {t('nav.admin')}
            </button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => { setToken(null); window.location.reload(); }}>
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "40px 24px 80px" }}>
        {/* Hero create section */}
        <div className="anim-up" style={{ marginBottom: 48 }}>
          <h1 className="heading-display" style={{ fontSize: 36, marginBottom: 6 }}>
            {t('project.myProjects')}
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: 15, marginBottom: 24 }}>
            {loading
              ? t('project.loadingProjects')
              : projects.length > 0
                ? projectCountText(projects.length)
                : t('project.startFirst')}
          </p>

          <div style={{ display: "flex", gap: 8, maxWidth: 560 }}>
            <input
              className="input"
              placeholder={t('project.newProjectPlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createProject()}
              style={{ flex: 1 }}
            />
            <button
              className={`btn ${newName.trim() ? "btn-primary" : "btn-ghost"}`}
              onClick={createProject}
              disabled={creating || !newName.trim()}
              style={{ padding: "11px 24px" }}
            >
              {creating ? "..." : t('project.create')}
            </button>
          </div>

          {/* Template picker */}
          <div style={{ marginTop: 28 }}>
            <div className="label-mono" style={{ marginBottom: 14, letterSpacing: "0.1em" }}>
              {t('project.orStartFromTemplate')}
            </div>
            {loading ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 12,
              }}>
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="card"
                    style={{
                      padding: "24px 20px",
                      animation: `fadeIn 0.3s ease ${i * 0.08}s both`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
                      <SkeletonBlock width={48} height={48} radius="var(--radius-sm)" />
                      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6, paddingTop: 4 }}>
                        <SkeletonBlock width="70%" height={16} />
                        <SkeletonBlock width={60} height={20} radius={100} />
                      </div>
                    </div>
                    <SkeletonBlock width="90%" height={12} />
                    <SkeletonBlock width="60%" height={12} style={{ marginTop: 6 }} />
                  </div>
                ))}
              </div>
            ) : templates.length > 0 ? (
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                gap: 12,
              }}>
                {templates.map((t, i) => (
                  <button
                    key={t.id}
                    className="card anim-up"
                    disabled={creating}
                    onClick={() => createFromTemplate(t)}
                    style={{
                      animationDelay: `${i * 0.06}s`,
                      padding: "24px 20px",
                      cursor: creating ? "wait" : "pointer",
                      textAlign: "left",
                      width: "100%",
                      font: "inherit",
                      color: "inherit",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "var(--amber-border)";
                      e.currentTarget.style.boxShadow = "var(--shadow-amber)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--border)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 10 }}>
                      <div style={{
                        width: 48,
                        height: 48,
                        borderRadius: "var(--radius-sm)",
                        background: "var(--amber-glow)",
                        border: "1px solid var(--amber-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--amber)"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d={TEMPLATE_ICONS[t.icon] || TEMPLATE_ICONS.shed} />
                        </svg>
                      </div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="heading-display" style={{ fontSize: 15, marginBottom: 4 }}>
                          {t.name}
                        </div>
                        <span className="badge badge-amber">
                          ~{Number(t.estimated_cost).toLocaleString("fi-FI")} &euro;
                        </span>
                      </div>
                    </div>
                    <div style={{
                      color: "var(--text-muted)",
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}>
                      {t.description}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div style={{ display: "grid", gap: 10 }}>
            {[0, 1, 2].map((i) => (
              <SkeletonProjectCard key={i} delay={i * 0.08} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="anim-up delay-1" style={{
            padding: "80px 40px",
            textAlign: "center",
            borderRadius: "var(--radius-xl)",
            border: "1px dashed var(--border-strong)",
            background: "var(--bg-secondary)",
          }}>
            <div style={{
              width: 72,
              height: 72,
              borderRadius: 18,
              background: "var(--amber-glow)",
              border: "1px solid var(--amber-border)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 24,
            }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--amber)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M9 8h1M9 12h1M9 16h1M14 8h1M14 12h1M5 21V5l7-3 7 3v16" />
              </svg>
            </div>
            <h3 className="heading-display" style={{ fontSize: 22, marginBottom: 8 }}>
              {t('project.noProjects')}
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: 14, maxWidth: 360, margin: "0 auto" }}>
              {t('project.noProjectsDesc')}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {projects.map((p, i) => (
              <div
                key={p.id}
                className="card anim-up"
                style={{
                  animationDelay: `${i * 0.04}s`,
                  padding: "22px 28px",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--amber-border)";
                  e.currentTarget.style.boxShadow = "var(--shadow-amber)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.boxShadow = "none";
                }}
                onClick={() => (window.location.href = `/project/${p.id}`)}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
                    <h3 className="heading-display" style={{ fontSize: 18 }}>{p.name}</h3>
                    {p.estimated_cost > 0 && (
                      <span className="badge badge-amber">
                        {Number(p.estimated_cost).toFixed(0)} &euro;
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--text-muted)", fontSize: 13 }}>
                    <span>{p.description || t('project.emptyDescription')}</span>
                    <span style={{ opacity: 0.5 }}>&middot;</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
                      {new Date(p.updated_at).toLocaleDateString(locale === 'fi' ? 'fi-FI' : 'en-GB')}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => (window.location.href = `/project/${p.id}`)}>
                    {t('project.open')}
                  </button>
                  <button className="btn btn-ghost" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => duplicateProject(p.id)}>
                    {t('project.copy')}
                  </button>
                  <button className="btn btn-danger" style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => deleteProject(p.id)}>
                    {t('project.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [pendingBuilding, setPendingBuilding] = useState<BuildingResult | null>(null);

  useEffect(() => {
    if (getToken()) {
      api.me().then(() => setLoggedIn(true)).catch(() => setToken(null));
    }
  }, []);

  async function handleCreateFromBuilding(building: BuildingResult) {
    if (!loggedIn) {
      // Store the building and prompt login
      setPendingBuilding(building);
      return;
    }
    await createProjectFromBuilding(building);
  }

  async function createProjectFromBuilding(building: BuildingResult) {
    try {
      const buildingTypeLabels = BUILDING_TYPE_LABELS.fi;
      const project = await api.createProject({
        name: building.address,
        description: `${buildingTypeLabels[building.building_info.type] || building.building_info.type}, ${building.building_info.year_built}, ${building.building_info.area_m2} m\u00B2`,
        scene_js: building.scene_js,
      });
      if (building.bom_suggestion.length > 0) {
        await api.saveBOM(project.id, building.bom_suggestion);
      }
      window.location.href = `/project/${project.id}`;
    } catch (err) {
      console.error("Failed to create project from building:", err);
    }
  }

  async function handleLogin() {
    setLoggedIn(true);
    // If there was a pending building lookup, create the project now
    if (pendingBuilding) {
      await createProjectFromBuilding(pendingBuilding);
      setPendingBuilding(null);
    }
  }

  if (!loggedIn) {
    return (
      <div>
        <AddressSearch onCreateProject={handleCreateFromBuilding} />
        <LoginForm onLogin={handleLogin} pendingBuilding={pendingBuilding} />
      </div>
    );
  }

  return (
    <div>
      <AddressSearch onCreateProject={handleCreateFromBuilding} />
      <ProjectList />
    </div>
  );
}
