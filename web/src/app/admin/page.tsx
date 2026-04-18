"use client";

import { useState, useEffect } from "react";
import { api, getToken, setToken } from "@/lib/api";

type Tab = "materials" | "suppliers" | "pricing";

interface Material {
  id: string;
  name: string;
  category_name: string;
  waste_factor: number;
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

interface StalePrice {
  material_name: string;
  supplier_name: string;
  unit_price: number;
  last_scraped_at: string;
  days_stale: number;
}

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

function MaterialsTab() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    api.getMaterials().then(setMaterials).catch(console.error);
  }, []);

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
          placeholder="Filter materials..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ flex: 1, padding: "8px 14px", fontSize: 13 }}
        />
        <span className="badge badge-accent">
          {filtered.length}/{materials.length}
        </span>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Category</th>
              <th style={thStyle}>Waste</th>
              <th style={thStyle}>Primary Price</th>
              <th style={thStyle}>Supplier</th>
              <th style={thStyle}>Alt</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, i) => {
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
                      <span className="badge badge-danger">No price</span>
                    )}
                  </td>
                  <td style={{ ...tdStyle, color: "var(--text-muted)" }}>
                    {primary?.supplier_name || "-"}
                  </td>
                  <td style={tdStyle}>
                    {altCount > 0 ? (
                      <span className="badge badge-accent">+{altCount}</span>
                    ) : (
                      <span style={{ color: "var(--text-muted)" }}>-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    api.getSuppliers().then(setSuppliers).catch(console.error);
  }, []);

  return (
    <div>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={thStyle}>Supplier</th>
            <th style={thStyle}>Website</th>
            <th style={thStyle}>Products</th>
            <th style={thStyle}>Oldest Price</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s, i) => (
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
                <span className="badge badge-accent">{s.product_count}</span>
              </td>
              <td style={{ ...tdStyle, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                {s.oldest_price ? new Date(s.oldest_price).toLocaleDateString() : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PricingTab() {
  const [stale, setStale] = useState<StalePrice[]>([]);

  useEffect(() => {
    api.getStalePrices().then(setStale).catch(console.error);
  }, []);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>Stale Prices</h3>
        <span className="badge badge-warning">&gt;30 days old</span>
      </div>
      {stale.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px" }}>
          <span className="badge badge-success" style={{ padding: "6px 16px", fontSize: 13 }}>
            All prices up to date
          </span>
        </div>
      ) : (
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>Material</th>
              <th style={thStyle}>Supplier</th>
              <th style={thStyle}>Price</th>
              <th style={thStyle}>Last Scraped</th>
              <th style={thStyle}>Stale</th>
            </tr>
          </thead>
          <tbody>
            {stale.map((s, i) => (
              <tr
                key={i}
                style={{ animation: `fadeIn 0.2s ease-out ${i * 0.04}s both` }}
              >
                <td style={{ ...tdStyle, fontWeight: 500 }}>{s.material_name}</td>
                <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{s.supplier_name}</td>
                <td style={{ ...tdStyle, fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {s.unit_price.toFixed(2)} EUR
                </td>
                <td style={{ ...tdStyle, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {new Date(s.last_scraped_at).toLocaleDateString()}
                </td>
                <td style={tdStyle}>
                  <span className={`badge ${s.days_stale > 60 ? "badge-danger" : "badge-warning"}`}>
                    {s.days_stale}d
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("materials");
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      window.location.href = "/";
      return;
    }
    api
      .me()
      .then((user) => {
        if (user.role !== "admin") {
          alert("Admin access required");
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
        Checking access...
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "materials", label: "Materials", icon: "M4 6h16M4 12h16M4 18h16" },
    { key: "suppliers", label: "Suppliers", icon: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" },
    { key: "pricing", label: "Pricing", icon: "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" },
  ];

  return (
    <div className="animate-in" style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 32,
        }}
      >
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px" }}>Admin</h1>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            Manage materials, suppliers, and pricing data
          </p>
        </div>
        <button
          className="btn btn-ghost"
          onClick={() => (window.location.href = "/")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            className="btn"
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 20px",
              background: tab === t.key ? "var(--accent-muted)" : "transparent",
              color: tab === t.key ? "var(--accent)" : "var(--text-muted)",
              fontWeight: tab === t.key ? 600 : 400,
              borderRadius: "var(--radius-sm)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        className="card"
        style={{ padding: 24 }}
      >
        {tab === "materials" && <MaterialsTab />}
        {tab === "suppliers" && <SuppliersTab />}
        {tab === "pricing" && <PricingTab />}
      </div>
    </div>
  );
}
