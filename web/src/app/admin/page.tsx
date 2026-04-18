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
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          placeholder="Filter materials..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            flex: 1,
            padding: "8px 12px",
            border: "1px solid #ddd",
            borderRadius: 6,
            fontSize: 13,
          }}
        />
        <span style={{ padding: "8px 0", color: "#666", fontSize: 13 }}>
          {filtered.length} of {materials.length}
        </span>
      </div>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
            <th style={{ padding: "8px 12px" }}>Name</th>
            <th style={{ padding: "8px 12px" }}>Category</th>
            <th style={{ padding: "8px 12px" }}>Waste</th>
            <th style={{ padding: "8px 12px" }}>Primary Price</th>
            <th style={{ padding: "8px 12px" }}>Supplier</th>
            <th style={{ padding: "8px 12px" }}>Alt Prices</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((m) => {
            const primary = m.pricing?.find((p) => p.is_primary);
            const altCount = (m.pricing?.length || 0) - (primary ? 1 : 0);
            return (
              <tr
                key={m.id}
                style={{ borderBottom: "1px solid #f3f4f6" }}
              >
                <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                  {m.name}
                </td>
                <td style={{ padding: "8px 12px", color: "#666" }}>
                  {m.category_name}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  {((m.waste_factor - 1) * 100).toFixed(0)}%
                </td>
                <td style={{ padding: "8px 12px" }}>
                  {primary ? (
                    <span style={{ color: "#059669", fontWeight: 500 }}>
                      {primary.unit_price.toFixed(2)} {primary.currency}/{primary.unit}
                    </span>
                  ) : (
                    <span style={{ color: "#dc2626" }}>No price</span>
                  )}
                </td>
                <td style={{ padding: "8px 12px", color: "#666" }}>
                  {primary?.supplier_name || "-"}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  {altCount > 0 ? (
                    <span
                      style={{
                        background: "#dbeafe",
                        color: "#2563eb",
                        padding: "2px 8px",
                        borderRadius: 10,
                        fontSize: 11,
                      }}
                    >
                      +{altCount}
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 13,
        }}
      >
        <thead>
          <tr style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}>
            <th style={{ padding: "8px 12px" }}>Supplier</th>
            <th style={{ padding: "8px 12px" }}>Website</th>
            <th style={{ padding: "8px 12px" }}>Products</th>
            <th style={{ padding: "8px 12px" }}>Oldest Price</th>
          </tr>
        </thead>
        <tbody>
          {suppliers.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                {s.name}
              </td>
              <td style={{ padding: "8px 12px" }}>
                {s.website ? (
                  <a
                    href={s.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#2563eb", textDecoration: "none" }}
                  >
                    {new URL(s.website).hostname}
                  </a>
                ) : (
                  "-"
                )}
              </td>
              <td style={{ padding: "8px 12px" }}>{s.product_count}</td>
              <td style={{ padding: "8px 12px", color: "#666" }}>
                {s.oldest_price
                  ? new Date(s.oldest_price).toLocaleDateString()
                  : "-"}
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
      <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>
        Stale Prices (&gt;30 days old)
      </h3>
      {stale.length === 0 ? (
        <p style={{ color: "#059669", padding: 20, textAlign: "center" }}>
          All prices are up to date.
        </p>
      ) : (
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
          }}
        >
          <thead>
            <tr
              style={{ borderBottom: "2px solid #e5e7eb", textAlign: "left" }}
            >
              <th style={{ padding: "8px 12px" }}>Material</th>
              <th style={{ padding: "8px 12px" }}>Supplier</th>
              <th style={{ padding: "8px 12px" }}>Price</th>
              <th style={{ padding: "8px 12px" }}>Last Scraped</th>
              <th style={{ padding: "8px 12px" }}>Days Stale</th>
            </tr>
          </thead>
          <tbody>
            {stale.map((s, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "8px 12px", fontWeight: 500 }}>
                  {s.material_name}
                </td>
                <td style={{ padding: "8px 12px" }}>{s.supplier_name}</td>
                <td style={{ padding: "8px 12px" }}>
                  {s.unit_price.toFixed(2)} EUR
                </td>
                <td style={{ padding: "8px 12px", color: "#666" }}>
                  {new Date(s.last_scraped_at).toLocaleDateString()}
                </td>
                <td style={{ padding: "8px 12px" }}>
                  <span
                    style={{
                      background:
                        s.days_stale > 60 ? "#fee2e2" : "#fef3c7",
                      color: s.days_stale > 60 ? "#dc2626" : "#d97706",
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
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
      <div style={{ padding: 40, textAlign: "center", color: "#666" }}>
        Checking access...
      </div>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "materials", label: "Materials" },
    { key: "suppliers", label: "Suppliers" },
    { key: "pricing", label: "Pricing" },
  ];

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24 }}>Admin Panel</h1>
        <button
          onClick={() => (window.location.href = "/")}
          style={{
            background: "none",
            border: "1px solid #ddd",
            padding: "6px 14px",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 13,
          }}
        >
          Back to Projects
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 24,
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 20px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? "#2563eb" : "#666",
              borderBottom:
                tab === t.key ? "2px solid #2563eb" : "2px solid transparent",
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
        }}
      >
        {tab === "materials" && <MaterialsTab />}
        {tab === "suppliers" && <SuppliersTab />}
        {tab === "pricing" && <PricingTab />}
      </div>
    </div>
  );
}
