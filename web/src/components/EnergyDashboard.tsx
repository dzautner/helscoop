"use client";

import { useState, useMemo } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import {
  calculateAnnualEnergy,
  CLIMATE_LOCATIONS,
  DEFAULT_ANNUAL_ENERGY_SETTINGS,
  DEFAULT_THERMAL_SETTINGS,
  type AnnualEnergySettings,
  type BomAreaItem,
} from "@/lib/thermal-engine";
import type { Material, BomItem } from "@/types";

interface EnergyDashboardProps {
  materials: Material[];
  bom: BomItem[];
  onClose: () => void;
}

const MONTH_KEYS = [
  "energy.jan",
  "energy.feb",
  "energy.mar",
  "energy.apr",
  "energy.may",
  "energy.jun",
  "energy.jul",
  "energy.aug",
  "energy.sep",
  "energy.oct",
  "energy.nov",
  "energy.dec",
] as const;

const PRICE_PRESETS = [
  { label: "energy.priceSpot", value: 8 },
  { label: "energy.priceAvg", value: 12 },
  { label: "energy.priceFixed", value: 16 },
  { label: "energy.pricePeak", value: 25 },
] as const;

export default function EnergyDashboard({ materials, bom, onClose }: EnergyDashboardProps) {
  const { t, locale } = useTranslation();
  const localeTag = locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB";

  const [settings, setSettings] = useState<AnnualEnergySettings>(DEFAULT_ANNUAL_ENERGY_SETTINGS);

  const bomAreaItems: BomAreaItem[] = useMemo(
    () => bom.map((b) => ({ material_id: b.material_id, quantity: b.quantity, unit: b.unit })),
    [bom],
  );

  const result = useMemo(
    () => calculateAnnualEnergy(materials, bomAreaItems, settings, DEFAULT_THERMAL_SETTINGS),
    [materials, bomAreaItems, settings],
  );

  const maxMonthCost = result
    ? Math.max(...result.months.map((m) => m.heatingCost_EUR))
    : 0;

  const fmt = (v: number, decimals = 0) =>
    v.toLocaleString(localeTag, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  return (
    <div className="energy-dashboard">
      <div className="energy-dashboard-header">
        <h3>{t("energy.title")}</h3>
        <button className="energy-dashboard-close" onClick={onClose} aria-label={t("energy.close")}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Controls */}
      <div className="energy-controls">
        <div className="energy-control-row">
          <label>{t("energy.location")}</label>
          <select
            value={settings.locationIndex}
            onChange={(e) =>
              setSettings((s) => ({ ...s, locationIndex: parseInt(e.target.value, 10) }))
            }
          >
            {CLIMATE_LOCATIONS.map((loc, i) => (
              <option key={loc.code} value={i}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>
        <div className="energy-control-row">
          <label>
            {t("energy.electricityPrice")}
            <span className="energy-price-value">{fmt(settings.electricityPrice_cPerKwh, 1)} c/kWh</span>
          </label>
          <input
            type="range"
            min={4}
            max={40}
            step={0.5}
            value={settings.electricityPrice_cPerKwh}
            onChange={(e) =>
              setSettings((s) => ({ ...s, electricityPrice_cPerKwh: parseFloat(e.target.value) }))
            }
          />
          <div className="energy-price-presets">
            {PRICE_PRESETS.map((p) => (
              <button
                key={p.value}
                className="energy-price-preset"
                data-active={settings.electricityPrice_cPerKwh === p.value}
                onClick={() => setSettings((s) => ({ ...s, electricityPrice_cPerKwh: p.value }))}
              >
                {t(p.label as any)}
              </button>
            ))}
          </div>
        </div>
        <div className="energy-control-row">
          <label>
            {t("energy.targetTemp")}
            <span className="energy-price-value">{fmt(settings.targetInsideTemp)}°C</span>
          </label>
          <input
            type="range"
            min={5}
            max={25}
            step={1}
            value={settings.targetInsideTemp}
            onChange={(e) =>
              setSettings((s) => ({ ...s, targetInsideTemp: parseInt(e.target.value, 10) }))
            }
          />
        </div>
      </div>

      {!result ? (
        <div className="energy-empty">{t("energy.noData")}</div>
      ) : (
        <>
          {/* Summary metrics */}
          <div className="energy-summary">
            <div className="energy-metric">
              <span className="energy-metric-value">{fmt(result.annualHeatingCost_EUR)} €</span>
              <span className="energy-metric-label">{t("energy.annualCost")}</span>
            </div>
            <div className="energy-metric">
              <span className="energy-metric-value">{fmt(result.annualHeatLoss_kWh)} kWh</span>
              <span className="energy-metric-label">{t("energy.annualHeatLoss")}</span>
            </div>
            <div className="energy-metric">
              <span className="energy-metric-value">{fmt(result.averageMonthlyCost_EUR, 1)} €</span>
              <span className="energy-metric-label">{t("energy.monthlyAvg")}</span>
            </div>
            <div className="energy-metric">
              <span className="energy-metric-value">{fmt(result.peakCost_EUR, 1)} €</span>
              <span className="energy-metric-label">
                {t("energy.peakMonth")}: {t(MONTH_KEYS[result.peakMonth] as any)}
              </span>
            </div>
          </div>

          {/* Monthly bar chart */}
          <div className="energy-chart">
            <div className="energy-chart-title">{t("energy.chartTitle")}</div>
            <div className="energy-chart-bars">
              {result.months.map((m, i) => {
                const barHeight = maxMonthCost > 0 ? (m.heatingCost_EUR / maxMonthCost) * 100 : 0;
                return (
                  <div key={i} className="energy-bar-col">
                    <div className="energy-bar-value">{fmt(m.heatingCost_EUR)}€</div>
                    <div className="energy-bar-track">
                      <div
                        className="energy-bar-fill"
                        style={{ height: `${barHeight}%` }}
                        data-peak={i === result.peakMonth}
                      />
                    </div>
                    <div className="energy-bar-label">{t(MONTH_KEYS[i] as any)}</div>
                    <div className="energy-bar-temp">{fmt(m.outsideTemp, 1)}°</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Price sensitivity */}
          <div className="energy-sensitivity">
            <div className="energy-sensitivity-title">{t("energy.sensitivity")}</div>
            <div className="energy-sensitivity-row">
              {[8, 12, 16, 20, 25].map((price) => {
                const cost = (result.annualHeatLoss_kWh * price) / 100;
                const isActive = price === settings.electricityPrice_cPerKwh;
                return (
                  <div key={price} className="energy-sensitivity-item" data-active={isActive}>
                    <span className="energy-sensitivity-price">{price} c</span>
                    <span className="energy-sensitivity-cost">{fmt(cost)} €</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
