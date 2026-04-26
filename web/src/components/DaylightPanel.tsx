"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import {
  buildShadowStudySvg,
  calculateShadowStudy,
  calculateSunPosition,
  calculateSunriseSunset,
  getSeasonalLightingPreset,
  SEASON_PRESETS,
  sunPositionToLightDirection,
} from "@/lib/sun-position";
import { downloadBlob } from "@/lib/download";
import type { SeasonalLighting, ShadowStudy } from "@/lib/sun-position";

export interface DaylightViewportShadowStudy {
  samples: ShadowStudy["samples"];
}

interface DaylightPanelProps {
  latitude: number;
  longitude: number;
  projectName?: string;
  onLightDirection: (dir: [number, number, number], altitude: number) => void;
  onLightingPreset?: (preset: SeasonalLighting) => void;
  onShadowStudyChange?: (study: DaylightViewportShadowStudy | null) => void;
  onClose: () => void;
}

function formatTimeFromMinutes(totalMinutes: number): string {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatTime(hours: number): string {
  return formatTimeFromMinutes(Math.round(hours * 60));
}

function toDateValue(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateValue(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  return {
    year: Number.isFinite(year) ? year : 2026,
    month: Number.isFinite(month) ? Math.max(0, Math.min(11, month - 1)) : 5,
    day: Number.isFinite(day) ? Math.max(1, Math.min(31, day)) : 21,
  };
}

function downloadSvg(filename: string, svg: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}

export default function DaylightPanel({
  latitude,
  longitude,
  projectName = "Helscoop project",
  onLightDirection,
  onLightingPreset,
  onShadowStudyChange,
  onClose,
}: DaylightPanelProps) {
  const { t } = useTranslation();
  const now = new Date();
  const [dateValue, setDateValue] = useState(toDateValue(2026, now.getMonth(), now.getDate()));
  const [timeMinutes, setTimeMinutes] = useState(now.getHours() * 60);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [showShadowStudy, setShowShadowStudy] = useState(false);
  const [shadowStart, setShadowStart] = useState(8);
  const [shadowEnd, setShadowEnd] = useState(20);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const timeRef = useRef(0);

  const dateParts = useMemo(() => parseDateValue(dateValue), [dateValue]);
  const hour = Math.floor(timeMinutes / 60);
  const minute = timeMinutes % 60;

  const sunPos = useMemo(() => {
    const date = new Date(dateParts.year, dateParts.month, dateParts.day, hour, minute);
    return calculateSunPosition(latitude, longitude, date);
  }, [dateParts, hour, latitude, longitude, minute]);

  const sunTimes = useMemo(
    () => calculateSunriseSunset(latitude, longitude, dateParts.month, dateParts.day, { year: dateParts.year }),
    [dateParts, latitude, longitude],
  );

  const shadowStudy = useMemo(
    () => calculateShadowStudy({
      latitude,
      longitude,
      year: dateParts.year,
      month: dateParts.month,
      day: dateParts.day,
      startHour: shadowStart,
      endHour: Math.max(shadowEnd, shadowStart + 1),
      intervalMinutes: 60,
      objectHeightM: 3.2,
    }),
    [dateParts, latitude, longitude, shadowEnd, shadowStart],
  );

  useEffect(() => {
    const renderAltitude = sunPos.isAboveHorizon ? sunPos.altitude : 0.5;
    const dir = sunPositionToLightDirection(sunPos.azimuth, renderAltitude);
    onLightDirection(dir, sunPos.altitude);
  }, [sunPos, onLightDirection]);

  useEffect(() => {
    onLightingPreset?.(getSeasonalLightingPreset(dateParts.month, hour));
  }, [dateParts.month, hour, onLightingPreset]);

  useEffect(() => {
    onShadowStudyChange?.(showShadowStudy ? { samples: shadowStudy.samples } : null);
    return () => onShadowStudyChange?.(null);
  }, [onShadowStudyChange, shadowStudy.samples, showShadowStudy]);

  useEffect(() => {
    if (!playing) return;
    timeRef.current = timeMinutes;

    const tick = (timestamp: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = timestamp;
      const elapsed = timestamp - lastFrameRef.current;
      lastFrameRef.current = timestamp;

      const minutesPerSecond = (24 * 60) / 20 * speed;
      timeRef.current += (elapsed / 1000) * minutesPerSecond;
      if (timeRef.current >= 24 * 60) timeRef.current -= 24 * 60;

      setTimeMinutes(Math.floor(timeRef.current));
      rafRef.current = requestAnimationFrame(tick);
    };

    lastFrameRef.current = 0;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [playing, speed, timeMinutes]);

  const applyPreset = useCallback((preset: (typeof SEASON_PRESETS)[number]) => {
    setDateValue(toDateValue(2026, preset.month, preset.day));
    setTimeMinutes(preset.hour * 60 + (preset.minute ?? 0));
    setPlaying(false);
  }, []);

  const exportShadowStudy = useCallback(() => {
    const svg = buildShadowStudySvg({
      title: `${projectName} shadow study`,
      latitude,
      longitude,
      month: dateParts.month,
      day: dateParts.day,
      year: dateParts.year,
      study: shadowStudy,
    });
    const filename = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "helscoop"}-shadow-study.svg`;
    downloadSvg(filename, svg);
  }, [dateParts, latitude, longitude, projectName, shadowStudy]);

  const sunrisePct = Math.max(0, Math.min(100, (sunTimes.sunrise / 24) * 100));
  const sunsetPct = Math.max(0, Math.min(100, (sunTimes.sunset / 24) * 100));

  return (
    <div className="daylight-panel">
      <div className="daylight-panel-header">
        <div>
          <span className="daylight-panel-title">{t("editor.daylightTitle")}</span>
          <span className="daylight-location">
            {latitude.toFixed(2)}, {longitude.toFixed(2)}
          </span>
        </div>
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
        {SEASON_PRESETS.map((preset) => (
          <button
            key={preset.key}
            className="daylight-preset-btn"
            onClick={() => applyPreset(preset)}
            data-active={dateParts.month === preset.month && dateParts.day === preset.day && hour === preset.hour}
          >
            {t(`editor.${preset.key}` as any)}
          </button>
        ))}
      </div>

      <div className="daylight-panel-controls">
        <label className="daylight-label">
          <span>{t("editor.daylightDate")}</span>
          <input
            type="date"
            value={dateValue}
            min="2026-01-01"
            max="2026-12-31"
            onChange={(event) => { setPlaying(false); setDateValue(event.target.value); }}
            className="daylight-date-input"
          />
        </label>
        <label className="daylight-label">
          <span>{t("editor.daylightTime")}</span>
          <div className="daylight-slider-row">
            <div className="daylight-time-slider-wrap">
              <input
                type="range"
                min={0}
                max={1439}
                step={15}
                value={timeMinutes}
                onChange={(event) => { setPlaying(false); setTimeMinutes(Number(event.target.value)); }}
                className="daylight-slider"
              />
              <span className="daylight-sun-marker" style={{ left: `${sunrisePct}%` }} />
              <span className="daylight-sun-marker daylight-sun-marker--sunset" style={{ left: `${sunsetPct}%` }} />
            </div>
            <span className="daylight-value">{formatTimeFromMinutes(timeMinutes)}</span>
          </div>
        </label>
        <div className="daylight-playback-row">
          <button
            type="button"
            className="daylight-play-btn"
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? t("editor.daylightPause") : t("editor.daylightPlay")}
            title={playing ? t("editor.daylightPause") : t("editor.daylightPlay")}
          >
            {playing ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z" /></svg>
            )}
          </button>
          {[1, 2, 4].map((value) => (
            <button
              key={value}
              type="button"
              className="daylight-speed-btn"
              data-active={speed === value}
              onClick={() => setSpeed(value)}
            >
              {value}×
            </button>
          ))}
        </div>
      </div>

      <div className="daylight-panel-sun-times">
        <div className="daylight-sun-row">
          <span className="daylight-sun-icon">&#9728;</span>
          <span>{formatTime(sunTimes.sunrise)}</span>
          <span className="daylight-sun-separator">-</span>
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
      </div>
      {!sunPos.isAboveHorizon && (
        <span className="daylight-night">{t("editor.daylightNight")}</span>
      )}

      <label className="daylight-study-toggle">
        <input
          type="checkbox"
          checked={showShadowStudy}
          onChange={(event) => setShowShadowStudy(event.target.checked)}
        />
        <span>{t("editor.daylightShadowStudy")}</span>
      </label>

      {showShadowStudy && (
        <div className="daylight-study">
          <div className="daylight-study-ranges">
            <label>
              <span>{t("editor.daylightStudyStart")}</span>
              <input
                type="range"
                min={0}
                max={23}
                value={shadowStart}
                onChange={(event) => setShadowStart(Math.min(Number(event.target.value), shadowEnd - 1))}
                className="daylight-slider"
              />
              <strong>{formatTime(shadowStart)}</strong>
            </label>
            <label>
              <span>{t("editor.daylightStudyEnd")}</span>
              <input
                type="range"
                min={1}
                max={24}
                value={shadowEnd}
                onChange={(event) => setShadowEnd(Math.max(Number(event.target.value), shadowStart + 1))}
                className="daylight-slider"
              />
              <strong>{formatTime(shadowEnd)}</strong>
            </label>
          </div>
          <ShadowStudyMiniMap study={shadowStudy} />
          <div className="daylight-study-summary">
            <span>{shadowStudy.samples.length} {t("editor.daylightSamples")}</span>
            <span>{shadowStudy.totalShadowHours.toFixed(0)}{t("editor.daylightHoursUnit")}</span>
          </div>
          <button type="button" className="daylight-export-btn" onClick={exportShadowStudy}>
            {t("editor.daylightExportSvg")}
          </button>
        </div>
      )}
    </div>
  );
}

function ShadowStudyMiniMap({ study }: { study: ShadowStudy }) {
  const maxLength = Math.max(1, ...study.samples.map((sample) => sample.shadowLength));
  const centerX = 130;
  const centerY = 82;
  const scale = Math.min(7, 82 / maxLength);

  return (
    <svg className="daylight-shadow-map" viewBox="0 0 260 166" role="img" aria-label="Shadow study preview">
      <circle cx={centerX} cy={centerY} r="76" className="daylight-shadow-range" />
      {study.samples.map((sample, index) => {
        const [vx, vz] = sample.shadowVector;
        const length = sample.shadowLength * scale;
        const px = -vz;
        const py = vx;
        const nearWidth = 30;
        const farWidth = 18;
        const baseX = centerX + vx * 6;
        const baseY = centerY + vz * 6;
        const farX = centerX + vx * length;
        const farY = centerY + vz * length;
        const points = [
          [baseX + px * nearWidth / 2, baseY + py * nearWidth / 2],
          [baseX - px * nearWidth / 2, baseY - py * nearWidth / 2],
          [farX - px * farWidth / 2, farY - py * farWidth / 2],
          [farX + px * farWidth / 2, farY + py * farWidth / 2],
        ].map(([x, y]) => `${x},${y}`).join(" ");
        return (
          <polygon
            key={`${sample.label}-${index}`}
            points={points}
            fill={sample.color}
            opacity={0.16 + Math.min(0.16, index * 0.015)}
          />
        );
      })}
      <rect x={centerX - 24} y={centerY - 15} width="48" height="30" rx="2" className="daylight-shadow-building" />
      <line x1={centerX} y1="12" x2={centerX} y2="32" className="daylight-shadow-north" />
      <path d={`M${centerX - 5} 19 L${centerX} 12 L${centerX + 5} 19`} className="daylight-shadow-north" />
      <text x={centerX + 8} y="26" className="daylight-shadow-label">N</text>
    </svg>
  );
}
