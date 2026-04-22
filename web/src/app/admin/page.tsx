"use client";

import { useState, useEffect } from "react";
import { api, getToken, setToken } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { SkeletonTableRow } from "@/components/Skeleton";
import { useTranslation } from "@/components/LocaleProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { AdminStats, AdminStalePrice } from "@/types";

type Tab = "dashboard" | "materials" | "suppliers" | "pricing";

interface Material {
  id: string;
  name: string;
  category_name: string;
  waste_factor: number;
  image_url: string | null;
  pricing: {
    supplier_name: string;
    unit_price: number;
    unit: string;
    currency: string;
    is_primary: boolean;
    last_scraped_at: string | null;
  }[] | null;
}

interface Supplier {
  id: string;
  name: string;
  website: string;
  product_count: number;
  oldest_price: string | null;
}

type StalePrice = AdminStalePrice;

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  fontSize: 13,
};

const thStyle = {
  padding: "10px 16px",
  textAlign: "left" as const,
  fontSize: 11,
  fontWeight: 600 as const,
  color: "var(--text-muted)",
  textTransform: "uppercase" as const,
  letterSpacing: "0.05em",
  borderBottom: "1px solid var(--border)",
};

const tdStyle = {
  padding: "12px 16px",
  borderBottom: "1px solid var(--border)",
};

const freshnessColors = {
  fresh: "var(--success)",
  aging: "var(--warning)",
  stale: "var(--danger)",
  never: "var(--text-muted)",
};

function localeTag(locale: string): string {
  if (locale === "fi") return "fi-FI";
  if (locale === "sv") return "sv-SE";
  return "en-GB";
}

function formatNumber(value: number, locale: string) {
  return new Intl.NumberFormat(localeTag(locale)).format(value);
}

function formatCurrency(value: number, locale: string) {
  return new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function freshnessPercent(count: number, total: number) {
  if (total <= 0 || count <= 0) return 0;
  return Math.max(2, Math.round((count / total) * 100));
}

function StatCard({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}) {
  const toneColor = tone === "success"
    ? "var(--success)"
    : tone === "warning"
      ? "var(--warning)"
      : tone === "danger"
        ? "var(--danger)"
        : "var(--accent)";

  return (
    <div
      className="card"
      style={{
        padding: 18,
        minHeight: 118,
        borderColor: tone === "neutral" ? "var(--border)" : toneColor,
      }}
    >
      <div style={{ color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </div>
      <div className="heading-display" style={{ fontSize: 28, marginTop: 10, color: toneColor }}>
        {value}
      </div>
      <div style={{ color: "var(--text-secondary)", fontSize: 12, marginTop: 6 }}>
        {detail}
      </div>
    </div>
  );
}

function StalePricesTable({
  prices,
  loading,
  onRequestRescrape,
}: {
  prices: StalePrice[];
  loading: boolean;
  onRequestRescrape: (supplierId: string) => void;
}) {
  const { t, locale } = useTranslation();

  if (loading) {
    return (
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{t('admin.material')}</th>
            <th style={thStyle}>{t('admin.supplier')}</th>
            <th style={thStyle}>{t('admin.price')}</th>
            <th style={thStyle}>{t('admin.lastUpdated')}</th>
            <th style={thStyle}>{t('admin.age')}</th>
            <th style={thStyle}>{t('admin.action')}</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonTableRow key={i} columns={6} delay={i * 0.05} />
          ))}
        </tbody>
      </table>
    );
  }

  if (prices.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "40px 20px" }}>
        <span className="badge badge-forest" style={{ padding: "6px 16px", fontSize: 13 }}>
          {t('admin.allUpToDate')}
        </span>
      </div>
    );
  }

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          <th style={thStyle}>{t('admin.material')}</th>
          <th style={thStyle}>{t('admin.supplier')}</th>
          <th style={thStyle}>{t('admin.price')}</th>
          <th style={thStyle}>{t('admin.lastUpdated')}</th>
          <th style={thStyle}>{t('admin.age')}</th>
          <th style={thStyle}>{t('admin.action')}</th>
        </tr>
      </thead>
      <tbody>
        {prices.map((s, i) => (
          <tr
            key={`${s.material_name}-${s.supplier_id}-${i}`}
            style={{ animation: `fadeIn 0.2s ease-out ${i * 0.04}s both` }}
          >
            <td style={{ ...tdStyle, fontWeight: 500 }}>{s.material_name}</td>
            <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{s.supplier_name}</td>
            <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {s.unit_price.toFixed(2)} EUR
            </td>
            <td style={{ ...tdStyle, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
              {s.last_scraped_at
                ? new Date(s.last_scraped_at).toLocaleDateString(locale === "fi" ? "fi-FI" : "en-GB")
                : t('admin.never')}
            </td>
            <td style={tdStyle}>
              <span className={`badge ${(s.days_stale ?? 999) > 60 ? "badge-danger" : "badge-warning"}`}>
                {s.days_stale == null ? t('admin.never') : `${s.days_stale}d`}
              </span>
            </td>
            <td style={tdStyle}>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => onRequestRescrape(s.supplier_id)}
                aria-label={`${t('admin.markRescrape')}: ${s.supplier_name}`}
                style={{ padding: "6px 10px", fontSize: 12 }}
              >
                {t('admin.markRescrape')}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DashboardTab() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingSupplier, setRefreshingSupplier] = useState<string | null>(null);
  const { toast } = useToast();
  const { t, locale } = useTranslation();

  useEffect(() => {
    api.getAdminStats()
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : t('toast.loadPricingFailed'), "error");
        setLoading(false);
      });
  }, [toast, t]);

  const requestRescrape = (supplierId: string) => {
    setRefreshingSupplier(supplierId);
    api.requestSupplierRescrape(supplierId)
      .then(() => {
        toast(t('admin.rescrapeQueued'), "success");
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : t('admin.rescrapeFailed'), "error");
      })
      .finally(() => setRefreshingSupplier(null));
  };

  if (loading || !stats) {
    return (
      <div style={{ display: "grid", gap: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card" style={{ height: 118, padding: 18 }}>
              <div className="skeleton" style={{ width: "45%", height: 12, marginBottom: 18 }} />
              <div className="skeleton" style={{ width: "70%", height: 30, marginBottom: 10 }} />
              <div className="skeleton" style={{ width: "55%", height: 12 }} />
            </div>
          ))}
        </div>
        <StalePricesTable prices={[]} loading onRequestRescrape={() => {}} />
      </div>
    );
  }

  const freshness = stats.price_freshness;
  const projectSourceLabel = (source: AdminStats["recent_projects"][number]["source"]) => {
    if (source === "address") return t('admin.projectSourceAddress');
    if (source === "template") return t('admin.projectSourceTemplate');
    return t('admin.projectSourceBlank');
  };

  return (
    <div style={{ display: "grid", gap: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard
          label={t('admin.apiUptime')}
          value={formatUptime(stats.api_health.uptime_seconds)}
          detail={`${t('admin.healthChecked')} ${new Date(stats.api_health.checked_at).toLocaleTimeString(locale === "fi" ? "fi-FI" : "en-GB")}`}
          tone="success"
        />
        <StatCard
          label={t('admin.activeUsers')}
          value={`${formatNumber(stats.users_active_7d, locale)}`}
          detail={`${stats.users_active_24h}/${stats.users_active_7d}/${stats.users_active_30d} ${t('admin.activeUsersWindow')}`}
        />
        <StatCard
          label={t('admin.totalProjects')}
          value={formatNumber(stats.projects_total, locale)}
          detail={`${formatNumber(stats.users_total, locale)} ${t('admin.totalUsers')}`}
        />
        <StatCard
          label={t('admin.totalBomValue')}
          value={formatCurrency(stats.bom_total_value, locale)}
          detail={`${formatNumber(stats.users_new_30d, locale)} ${t('admin.newUsers30d')}`}
        />
      </div>

      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t('admin.priceFreshness')}</h3>
            <p style={{ margin: "4px 0 0", color: "var(--text-muted)", fontSize: 12 }}>
              {formatNumber(freshness.total, locale)} {t('admin.primaryPricesTracked')}
            </p>
          </div>
          <span className={`badge ${freshness.alert ? "badge-danger" : "badge-forest"}`}>
            {freshness.alert ? t('admin.staleAlert') : t('admin.staleHealthy')}
          </span>
        </div>
        <div style={{ display: "flex", height: 12, overflow: "hidden", borderRadius: 999, background: "var(--bg-elevated)" }}>
          <div style={{ width: `${freshnessPercent(freshness.fresh, freshness.total)}%`, background: freshnessColors.fresh }} />
          <div style={{ width: `${freshnessPercent(freshness.aging, freshness.total)}%`, background: freshnessColors.aging }} />
          <div style={{ width: `${freshnessPercent(freshness.stale, freshness.total)}%`, background: freshnessColors.stale }} />
          <div style={{ width: `${freshnessPercent(freshness.never, freshness.total)}%`, background: freshnessColors.never }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12, fontSize: 12, color: "var(--text-secondary)" }}>
          <span>{t('admin.fresh')}: {freshness.fresh}</span>
          <span>{t('admin.aging')}: {freshness.aging}</span>
          <span>{t('admin.stale')}: {freshness.stale}</span>
          <span>{t('admin.never')}: {freshness.never}</span>
          <span>{t('admin.staleShare')}: {freshness.stale_percent}%</span>
        </div>
      </div>

      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{t('admin.mostStalePrices')}</h3>
          {refreshingSupplier && <span className="badge badge-amber">{t('admin.queueing')}</span>}
        </div>
        <StalePricesTable
          prices={stats.stale_prices}
          loading={false}
          onRequestRescrape={requestRescrape}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>{t('admin.recentProjects')}</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {stats.recent_projects.length === 0 ? (
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{t('admin.noRecentActivity')}</span>
            ) : stats.recent_projects.map((project) => (
              <div key={project.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 13 }}>{project.name}</span>
                <span className="badge badge-amber">{projectSourceLabel(project.source)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 15, fontWeight: 700 }}>{t('admin.recentRegistrations')}</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {stats.recent_signups.length === 0 ? (
              <span style={{ color: "var(--text-muted)", fontSize: 13 }}>{t('admin.noRecentActivity')}</span>
            ) : stats.recent_signups.map((user, index) => (
              <div key={user.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 13 }}>{t('admin.userRegistered')} #{index + 1}</span>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {new Date(user.created_at).toLocaleDateString(locale === "fi" ? "fi-FI" : "en-GB")}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MaterialsTab() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    api.getMaterials()
      .then((mats) => {
        setMaterials(mats);
        setLoading(false);
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : t('toast.loadMaterialsFailed'), "error");
        setLoading(false);
      });
  }, [toast, t]);

  const filtered = materials.filter(
    (m) =>
      m.name.toLowerCase().includes(filter.toLowerCase()) ||
      m.category_name.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, alignItems: "center" }}>
        <input
          className="input"
          placeholder={t('admin.search')}
          aria-label={t('admin.search')}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, padding: "8px 14px", fontSize: 13 }}
        />
        <span className="badge badge-amber">
          {filtered.length}/{materials.length}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 48 }}></th>
              <th style={thStyle}>{t('admin.name')}</th>
              <th style={thStyle}>{t('admin.category')}</th>
              <th style={thStyle}>{t('admin.wasteFactor')}</th>
              <th style={thStyle}>{t('admin.price')}</th>
              <th style={thStyle}>{t('admin.supplier')}</th>
              <th style={thStyle}>{t('admin.others')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <SkeletonTableRow key={i} columns={7} delay={i * 0.05} />
              ))
            ) : (
              filtered.map((m, i) => {
                const primary = m.pricing?.find((p) => p.is_primary);
                const altCount = (m.pricing?.length || 0) - (primary ? 1 : 0);
                return (
                  <tr
                    key={m.id}
                    style={{
                      animation: `fadeIn 0.2s ease-out ${i * 0.02}s both`,
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ ...tdStyle, padding: "6px 8px" }}>
                      {m.image_url ? (
                        <img
                          src={m.image_url}
                          alt={m.name}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "var(--radius-sm)",
                            objectFit: "cover",
                            display: "block",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "var(--radius-sm)",
                            background: "var(--bg-elevated)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--text-muted)",
                            fontSize: 10,
                          }}
                        >
                          -
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{m.name}</td>
                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{m.category_name}</td>
                    <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                      {((m.waste_factor - 1) * 100).toFixed(0)}%
                    </td>
                    <td style={tdStyle}>
                      {primary ? (
                        <span style={{ color: "var(--success)", fontFamily: "var(--font-mono)", fontWeight: 500, fontSize: 12 }}>
                          {primary.unit_price.toFixed(2)} {primary.currency}/{primary.unit}
                        </span>
                      ) : (
                        <span className="badge badge-danger">{t('admin.noPrice')}</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, color: "var(--text-muted)" }}>
                      {primary?.supplier_name || "-"}
                    </td>
                    <td style={tdStyle}>
                      {altCount > 0 ? (
                        <span className="badge badge-amber">+{altCount}</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { t, locale } = useTranslation();

  useEffect(() => {
    api.getSuppliers()
      .then((sups) => {
        setSuppliers(sups);
        setLoading(false);
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : t('toast.loadSuppliersFailed'), "error");
        setLoading(false);
      });
  }, [toast, t]);

  return (
    <div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>{t('admin.supplier')}</th>
            <th style={thStyle}>{t('admin.website')}</th>
            <th style={thStyle}>{t('admin.products')}</th>
            <th style={thStyle}>{t('admin.oldestPrice')}</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <SkeletonTableRow key={i} columns={4} delay={i * 0.05} />
            ))
          ) : (
            suppliers.map((s, i) => (
              <tr
                key={s.id}
                style={{ animation: `fadeIn 0.2s ease-out ${i * 0.04}s both`, transition: "background 0.1s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <td style={{ ...tdStyle, fontWeight: 500 }}>{s.name}</td>
                <td style={tdStyle}>
                  {s.website ? (
                    <a
                      href={s.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent)", textDecoration: "none" }}
                    >
                      {new URL(s.website).hostname}
                    </a>
                  ) : (
                    <span style={{ color: "var(--text-muted)" }}>-</span>
                  )}
                </td>
                <td style={tdStyle}>
                  <span className="badge badge-amber">{s.product_count}</span>
                </td>
                <td style={{ ...tdStyle, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {s.oldest_price ? new Date(s.oldest_price).toLocaleDateString(locale === "fi" ? "fi-FI" : "en-GB") : "-"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PricingTab() {
  const [stale, setStale] = useState<StalePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingSupplier, setRefreshingSupplier] = useState<string | null>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    api.getStalePrices()
      .then((prices) => {
        setStale(prices);
        setLoading(false);
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : t('toast.loadPricingFailed'), "error");
        setLoading(false);
      });
  }, [toast, t]);

  const requestRescrape = (supplierId: string) => {
    setRefreshingSupplier(supplierId);
    api.requestSupplierRescrape(supplierId)
      .then(() => {
        toast(t('admin.rescrapeQueued'), "success");
      })
      .catch((err) => {
        toast(err instanceof Error ? err.message : t('admin.rescrapeFailed'), "error");
      })
      .finally(() => setRefreshingSupplier(null));
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{t('admin.stalePrices')}</h3>
        <span className="badge badge-amber">{t('admin.staleThreshold')}</span>
        {refreshingSupplier && <span className="badge badge-amber">{t('admin.queueing')}</span>}
      </div>
      <StalePricesTable prices={stale} loading={loading} onRequestRescrape={requestRescrape} />
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [authorized, setAuthorized] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/";
      return;
    }
    api
      .me()
      .then((user) => {
        if (user.role !== "admin") {
          window.location.href = "/";
        } else {
          setAuthorized(true);
        }
      })
      .catch(() => {
        setToken(null);
        window.location.href = "/";
      });
  }, []);

  if (!authorized) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "var(--text-muted)" }}>
        {t('admin.checkingAccess')}
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "dashboard", label: t('admin.dashboard'), icon: "M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z" },
    { key: "materials", label: t('admin.materials'), icon: "M4 6h16M4 12h16M4 18h16" },
    { key: "suppliers", label: t('admin.suppliers'), icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
    { key: "pricing", label: t('admin.pricing'), icon: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  ];

  return (
    <div className="anim-up" style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 32,
        }}
      >
        <div>
          <h1 className="heading-display" style={{ fontSize: 24, margin: "0 0 4px" }}>{t('admin.adminPanel')}</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            {t('admin.adminDesc')}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <ThemeToggle />
            <LanguageSwitcher />
          <button
            className="btn btn-ghost"
            onClick={() => (window.location.href = "/")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {t('nav.back')}
          </button>
        </div>
      </div>

      <div role="tablist" style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {tabs.map((tabItem) => (
          <button
            key={tabItem.key}
            role="tab"
            aria-selected={tab === tabItem.key}
            className="btn"
            onClick={() => setTab(tabItem.key)}
            style={{
              padding: "10px 20px",
              background: tab === tabItem.key ? "var(--amber-glow)" : "transparent",
              color: tab === tabItem.key ? "var(--amber)" : "var(--text-muted)",
              fontWeight: tab === tabItem.key ? 600 : 400,
              borderRadius: "var(--radius-sm)",
              border: tab === tabItem.key ? "1px solid var(--amber-border)" : "1px solid transparent",
            }}
          >
            {tabItem.label}
          </button>
        ))}
      </div>

      <div
        className="card"
        style={{ padding: 24 }}
      >
        {tab === "dashboard" && <DashboardTab />}
        {tab === "materials" && <MaterialsTab />}
        {tab === "suppliers" && <SuppliersTab />}
        {tab === "pricing" && <PricingTab />}
      </div>
    </div>
  );
}
