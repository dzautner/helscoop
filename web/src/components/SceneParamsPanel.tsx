"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import type { SceneParam } from "@/lib/scene-interpreter";
import type { ParamPreset } from "@/types";
import { useTranslation } from "@/components/LocaleProvider";
import { useCursorGlow } from "@/hooks/useCursorGlow";

interface SceneParamsPanelProps {
  params: SceneParam[];
  onParamChange: (name: string, value: number) => void;
  presets?: ParamPreset[];
  activePreset?: string | null;
  onSavePreset?: (name: string, values: Record<string, number>) => void;
  onLoadPreset?: (preset: ParamPreset) => void;
  onDeletePreset?: (name: string) => void;
  onResetDefaults?: () => void;
}

export default function SceneParamsPanel({
  params,
  onParamChange,
  presets = [],
  activePreset,
  onSavePreset,
  onLoadPreset,
  onDeletePreset,
  onResetDefaults,
}: SceneParamsPanelProps) {
  const { t } = useTranslation();
  const glow = useCursorGlow();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showPresetMenu, setShowPresetMenu] = useState(false);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const presetMenuRef = useRef<HTMLDivElement>(null);

  const sections = useMemo(() => {
    const map = new Map<string, SceneParam[]>();
    for (const p of params) {
      const list = map.get(p.section) || [];
      list.push(p);
      map.set(p.section, list);
    }
    return map;
  }, [params]);

  const handleChange = useCallback(
    (name: string, value: number) => {
      if (debounceRefs.current[name]) clearTimeout(debounceRefs.current[name]);
      debounceRefs.current[name] = setTimeout(() => {
        onParamChange(name, value);
      }, 16);
    },
    [onParamChange],
  );

  const handleSavePreset = useCallback(() => {
    const name = presetName.trim();
    if (!name || !onSavePreset) return;
    const values: Record<string, number> = {};
    for (const p of params) {
      values[p.name] = p.value;
    }
    onSavePreset(name, values);
    setPresetName("");
    setSavingPreset(false);
    setShowPresetMenu(false);
  }, [presetName, params, onSavePreset]);

  if (params.length === 0) return null;

  return (
    <div className="scene-params-panel panel-glow" ref={glow.ref} onMouseMove={glow.onMouseMove} onMouseLeave={glow.onMouseLeave}>
      <div className="scene-params-header">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="4" y1="21" x2="4" y2="14" />
          <line x1="4" y1="10" x2="4" y2="3" />
          <line x1="12" y1="21" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12" y2="3" />
          <line x1="20" y1="21" x2="20" y2="16" />
          <line x1="20" y1="12" x2="20" y2="3" />
          <line x1="1" y1="14" x2="7" y2="14" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="17" y1="16" x2="23" y2="16" />
        </svg>
        <span>{t("editor.parameters")}</span>
        <span className="scene-params-count">{params.length}</span>
        {onSavePreset && (
          <div style={{ position: "relative", marginLeft: "auto" }}>
            <button
              className="scene-params-preset-btn"
              onClick={() => setShowPresetMenu((v) => !v)}
              title={t("editor.presets")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              {activePreset || t("editor.presets")}
            </button>
            {showPresetMenu && (
              <div className="scene-params-preset-menu" ref={presetMenuRef}>
                {onResetDefaults && (
                  <button
                    className="scene-params-preset-item"
                    data-active={!activePreset}
                    onClick={() => {
                      onResetDefaults();
                      setShowPresetMenu(false);
                    }}
                  >
                    <span>{t("editor.presetDefault")}</span>
                  </button>
                )}
                {presets.map((preset) => (
                  <div key={preset.name} className="scene-params-preset-item-row">
                    <button
                      className="scene-params-preset-item"
                      data-active={activePreset === preset.name}
                      onClick={() => {
                        onLoadPreset?.(preset);
                        setShowPresetMenu(false);
                      }}
                    >
                      <span>{preset.name}</span>
                    </button>
                    {onDeletePreset && (
                      <button
                        className="scene-params-preset-delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePreset(preset.name);
                        }}
                        title={t("editor.presetDelete")}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
                <div className="scene-params-preset-divider" />
                {savingPreset ? (
                  <div className="scene-params-preset-save-form">
                    <input
                      type="text"
                      className="scene-params-preset-input"
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSavePreset();
                        if (e.key === "Escape") setSavingPreset(false);
                      }}
                      placeholder={t("editor.presetNamePlaceholder")}
                      maxLength={40}
                      autoFocus
                    />
                    <button
                      className="scene-params-preset-save-confirm"
                      onClick={handleSavePreset}
                      disabled={!presetName.trim()}
                    >
                      {t("editor.presetSave")}
                    </button>
                  </div>
                ) : (
                  <button
                    className="scene-params-preset-item scene-params-preset-add"
                    onClick={() => setSavingPreset(true)}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>{t("editor.presetSaveCurrent")}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="scene-params-body">
        {Array.from(sections.entries()).map(([section, sectionParams]) => {
          const sectionId = `scene-params-section-${section.toLowerCase().replace(/\s+/g, "-")}`;
          const isOpen = !collapsed[section];
          return (
          <div key={section} className="scene-params-section">
            <button
              className="scene-params-section-toggle"
              aria-expanded={isOpen}
              aria-controls={sectionId}
              onClick={() =>
                setCollapsed((prev) => ({
                  ...prev,
                  [section]: !prev[section],
                }))
              }
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                style={{
                  transform: collapsed[section]
                    ? "rotate(-90deg)"
                    : "rotate(0deg)",
                  transition: "transform 0.15s ease",
                }}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              <span>{section}</span>
              <span className="scene-params-section-count">
                {sectionParams.length}
              </span>
            </button>
            <div
              id={sectionId}
              className="scene-params-section-body"
              data-open={isOpen}
            >
              <div className="scene-params-section-body-inner">
                <div className="scene-params-items">
                  {sectionParams.map((p) => (
                    <ParamSlider
                      key={p.name}
                      param={p}
                      onChange={handleChange}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}

function ParamSlider({
  param,
  onChange,
}: {
  param: SceneParam;
  onChange: (name: string, value: number) => void;
}) {
  const { t } = useTranslation();
  const [localValue, setLocalValue] = useState(param.value);
  const [dragging, setDragging] = useState(false);

  const handleInput = (val: number) => {
    const clamped = Math.min(param.max, Math.max(param.min, val));
    setLocalValue(clamped);
    onChange(param.name, clamped);
  };

  const pct =
    param.max === param.min
      ? 100
      : ((localValue - param.min) / (param.max - param.min)) * 100;

  const displayValue =
    param.step >= 1
      ? String(Math.round(localValue))
      : localValue.toFixed(Math.max(0, -Math.floor(Math.log10(param.step))));

  return (
    <div className="scene-param-item">
      <div className="scene-param-label-row">
        <label className="scene-param-label" htmlFor={`param-${param.name}`}>{param.label}</label>
        <input
          id={`param-${param.name}`}
          type="number"
          className="scene-param-value"
          value={localValue}
          min={param.min}
          max={param.max}
          step={param.step}
          onChange={(e) => handleInput(parseFloat(e.target.value) || param.min)}
        />
      </div>
      <div className="scene-param-slider-wrap">
        <span
          className="scene-param-slider-tooltip"
          data-visible={dragging}
          style={{ left: `${pct}%` }}
        >
          {displayValue}
        </span>
        <input
          id={`param-${param.name}-slider`}
          type="range"
          className="scene-param-slider"
          min={param.min}
          max={param.max}
          step={param.step}
          value={localValue}
          disabled={param.max === param.min}
          aria-label={t("editor.paramSliderLabel", { name: param.label })}
          aria-valuemin={param.min}
          aria-valuemax={param.max}
          aria-valuenow={localValue}
          onChange={(e) => handleInput(parseFloat(e.target.value))}
          onPointerDown={() => setDragging(true)}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          style={
            {
              "--pct": `${pct}%`,
            } as React.CSSProperties
          }
        />
      </div>
    </div>
  );
}
