"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import {
  calculateSunPosition,
  sunPositionToLightDirection,
  SEASON_PRESETS,
} from "@/lib/sun-position";

interface DaylightPanelProps {
  latitude: number;
  longitude: number;
  onLightDirection: (dir: [number, number, number], altitude: number) => void;
  onClose: () => void;
}

export default function DaylightPanel({
  latitude,
  longitude,
  onLightDirection,
  onClose,
}: DaylightPanelProps) {
  const { t } = useTranslation();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [day, setDay] = useState(now.getDate());
  const [hour, setHour] = useState(now.getHours());
  const [minute, setMinute] = useState(0);

  const sunPos = useMemo(() => {
    const date = new Date(2026, month, day, hour, minute);
    return calculateSunPosition(latitude, longitude, date);
  }, [latitude, longitude, month, day, hour, minute]);

  const updateLight = useCallback(() => {
    if (sunPos.isAboveHorizon) {
      const dir = sunPositionToLightDirection(sunPos.azimuth, sunPos.altitude);
      onLightDirection(dir, sunPos.altitude);
    }
  }, [sunPos, onLightDirection]);

  const applyPreset = useCallback(
    (preset: (typeof SEASON_PRESETS)[number]) => {
      setMonth(preset.month);
      setDay(preset.day);
      setHour(preset.hour);
      setMinute(0);
    },
    [],
  );

  useMemo(() => {
    updateLight();
  }, [updateLight]);

  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  return (
    <div className="daylight-panel">
      <div className="daylight-panel-header">
        <span className="daylight-panel-title">{t("editor.daylightTitle")}</span>
        <button
          className="btn btn-ghost"
          onClick={onClose}
          style={{ padding: "2px 6px", fontSize: 11 }}
          aria-label={t("editor.close")}
        >
          &times;
        </button>
      </div>

      <div className="daylight-panel-presets">
        {SEASON_PRESETS.map((p) => (
          <button
            key={p.key}
            className="daylight-preset-btn"
            onClick={() => applyPreset(p)}
            data-active={month === p.month && day === p.day}
          >
            {t(`editor.${p.key}` as any)}
          </button>
        ))}
      </div>

      <div className="daylight-panel-controls">
        <label className="daylight-label">
          <span>{t("editor.daylightMonth")}</span>
          <div className="daylight-slider-row">
            <input
              type="range"
              min={0}
              max={11}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="daylight-slider"
            />
            <span className="daylight-value">{monthNames[month]}</span>
          </div>
        </label>
        <label className="daylight-label">
          <span>{t("editor.daylightDay")}</span>
          <div className="daylight-slider-row">
            <input
              type="range"
              min={1}
              max={31}
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className="daylight-slider"
            />
            <span className="daylight-value">{day}</span>
          </div>
        </label>
        <label className="daylight-label">
          <span>{t("editor.daylightTime")}</span>
          <div className="daylight-slider-row">
            <input
              type="range"
              min={0}
              max={23}
              value={hour}
              onChange={(e) => setHour(Number(e.target.value))}
              className="daylight-slider"
            />
            <span className="daylight-value">
              {String(hour).padStart(2, "0")}:00
            </span>
          </div>
        </label>
      </div>

      <div className="daylight-panel-info">
        <span>
          {t("editor.daylightAzimuth")}: {sunPos.azimuth.toFixed(0)}&deg;
        </span>
        <span>
          {t("editor.daylightAltitude")}: {sunPos.altitude.toFixed(1)}&deg;
        </span>
        {!sunPos.isAboveHorizon && (
          <span className="daylight-night">{t("editor.daylightNight")}</span>
        )}
      </div>
    </div>
  );
}
