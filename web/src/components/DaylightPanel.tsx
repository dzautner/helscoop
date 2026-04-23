"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import {
  calculateSunPosition,
  sunPositionToLightDirection,
  calculateSunriseSunset,
  getSeasonalLightingPreset,
  SEASON_PRESETS,
} from "@/lib/sun-position";
import type { SeasonalLighting } from "@/lib/sun-position";

interface DaylightPanelProps {
  latitude: number;
  longitude: number;
  onLightDirection: (dir: [number, number, number], altitude: number) => void;
  onLightingPreset?: (preset: SeasonalLighting) => void;
  onClose: () => void;
}

function formatTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export default function DaylightPanel({
  latitude,
  longitude,
  onLightDirection,
  onLightingPreset,
  onClose,
}: DaylightPanelProps) {
  const { t, locale } = useTranslation();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [day, setDay] = useState(now.getDate());
  const [hour, setHour] = useState(now.getHours());
  const [minute, setMinute] = useState(0);

  const sunPos = useMemo(() => {
    const date = new Date(2026, month, day, hour, minute);
    return calculateSunPosition(latitude, longitude, date);
  }, [latitude, longitude, month, day, hour, minute]);

  const sunTimes = useMemo(
    () => calculateSunriseSunset(latitude, longitude, month, day),
    [latitude, longitude, month, day],
  );

  const updateLight = useCallback(() => {
    if (sunPos.isAboveHorizon) {
      const dir = sunPositionToLightDirection(sunPos.azimuth, sunPos.altitude);
      onLightDirection(dir, sunPos.altitude);
    }
  }, [sunPos, onLightDirection]);

  useEffect(() => {
    onLightingPreset?.(getSeasonalLightingPreset(month, hour));
  }, [month, hour, onLightingPreset]);

  useMemo(() => {
    updateLight();
  }, [updateLight]);

  const applyPreset = useCallback(
    (preset: (typeof SEASON_PRESETS)[number]) => {
      setMonth(preset.month);
      setDay(preset.day);
      setHour(preset.hour);
      setMinute(0);
    },
    [],
  );

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    if (!playing) return;
    timeRef.current = hour * 60 + minute;

    const tick = (timestamp: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = timestamp;
      const elapsed = timestamp - lastFrameRef.current;
      lastFrameRef.current = timestamp;

      const minutesPerSecond = (24 * 60) / 20 * speed;
      timeRef.current += (elapsed / 1000) * minutesPerSecond;
      if (timeRef.current >= 24 * 60) timeRef.current -= 24 * 60;

      const nextHour = Math.floor(timeRef.current / 60);
      const nextMinute = Math.floor(timeRef.current % 60);
      setHour(nextHour);
      setMinute(nextMinute);
      rafRef.current = requestAnimationFrame(tick);
    };

    lastFrameRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed]);

  const monthLabel = useMemo(() => {
    const loc = locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB";
    const d = new Date(2026, month, 1);
    return d.toLocaleString(loc, { month: "short" });
  }, [month, locale]);

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
            data-active={month === p.month && day === p.day && hour === p.hour}
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
            <span className="daylight-value">{monthLabel}</span>
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
              onChange={(e) => { setPlaying(false); setHour(Number(e.target.value)); setMinute(0); }}
              className="daylight-slider"
            />
            <span className="daylight-value">
              {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
            </span>
          </div>
        </label>
        <div className="daylight-playback-row">
          <button
            type="button"
            className="daylight-play-btn"
            onClick={() => setPlaying((v) => !v)}
            aria-label={playing ? t("editor.daylightPause") : t("editor.daylightPlay")}
            title={playing ? t("editor.daylightPause") : t("editor.daylightPlay")}
          >
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z" /></svg>
            )}
          </button>
          {[1, 2, 4].map((s) => (
            <button
              key={s}
              type="button"
              className="daylight-speed-btn"
              data-active={speed === s}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      <div className="daylight-panel-sun-times">
        <div className="daylight-sun-row">
          <span className="daylight-sun-icon">&#9728;</span>
          <span>{formatTime(sunTimes.sunrise)}</span>
          <span className="daylight-sun-separator">&mdash;</span>
          <span>{formatTime(sunTimes.sunset)}</span>
        </div>
        <span className="daylight-hours">
          {sunTimes.daylightHours.toFixed(1)}{t("editor.daylightHoursUnit")}
        </span>
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
