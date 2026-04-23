"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import type { SceneLayer } from "@/lib/scene-layers";

interface LayerPanelProps {
  layers: SceneLayer[];
  selectedLayerId: string | null;
  hiddenLayerIds: Set<string>;
  lockedLayerIds: Set<string>;
  onSelectLayer: (layerId: string) => void;
  onToggleLayerVisibility: (layerId: string, options?: { solo?: boolean }) => void;
  onToggleLayerLock: (layerId: string) => void;
  onOpenLayerMaterial?: (layerId: string) => void;
  onFocusLayer?: (layerId: string) => void;
  onSetHiddenLayers?: (ids: Set<string>) => void;
  style?: React.CSSProperties;
}

function colorToCss(color: [number, number, number]): string {
  const [r, g, b] = color.map((value) => Math.max(0, Math.min(255, Math.round(value * 255))));
  return `rgb(${r}, ${g}, ${b})`;
}

function formatApproxCost(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function VisibilityIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
      {hidden ? <path d="M4 4l16 16" /> : null}
    </svg>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      {locked ? (
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      ) : (
        <path d="M16 11V8a4 4 0 0 0-7.4-2" />
      )}
    </svg>
  );
}

export default function LayerPanel({
  layers,
  selectedLayerId,
  hiddenLayerIds,
  lockedLayerIds,
  onSelectLayer,
  onToggleLayerVisibility,
  onToggleLayerLock,
  onOpenLayerMaterial,
  onFocusLayer,
  onSetHiddenLayers,
  style,
}: LayerPanelProps) {
  const { t, locale } = useTranslation();
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const orderedIds = useMemo(() => layers.map((layer) => layer.id), [layers]);

  const [autoplayActive, setAutoplayActive] = useState(false);
  const [autoplayStep, setAutoplayStep] = useState(0);
  const autoplayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedHiddenRef = useRef<Set<string> | null>(null);

  const stopAutoplay = useCallback(() => {
    setAutoplayActive(false);
    if (autoplayTimerRef.current) {
      clearTimeout(autoplayTimerRef.current);
      autoplayTimerRef.current = null;
    }
    if (savedHiddenRef.current !== null) {
      onSetHiddenLayers?.(savedHiddenRef.current);
      savedHiddenRef.current = null;
    }
  }, [onSetHiddenLayers]);

  const advanceAutoplay = useCallback((step: number) => {
    if (step >= orderedIds.length) {
      stopAutoplay();
      return;
    }
    setAutoplayStep(step);
    const hiddenIds = new Set(orderedIds.slice(step + 1));
    onSetHiddenLayers?.(hiddenIds);
    onSelectLayer(orderedIds[step]);
    onFocusLayer?.(orderedIds[step]);
    autoplayTimerRef.current = setTimeout(() => advanceAutoplay(step + 1), 3000);
  }, [orderedIds, onSetHiddenLayers, onSelectLayer, onFocusLayer, stopAutoplay]);

  const startAutoplay = useCallback(() => {
    if (orderedIds.length === 0 || !onSetHiddenLayers) return;
    savedHiddenRef.current = new Set(hiddenLayerIds);
    setAutoplayActive(true);
    setAutoplayStep(0);
    onSetHiddenLayers(new Set(orderedIds));
    setTimeout(() => advanceAutoplay(0), 500);
  }, [orderedIds, hiddenLayerIds, onSetHiddenLayers, advanceAutoplay]);

  useEffect(() => {
    return () => {
      if (autoplayTimerRef.current) clearTimeout(autoplayTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedLayerId) return;
    const row = rowRefs.current.get(selectedLayerId);
    if (row && typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest" });
    }
  }, [selectedLayerId]);

  const handleListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (orderedIds.length === 0) return;
    const currentIndex = selectedLayerId ? orderedIds.indexOf(selectedLayerId) : -1;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = currentIndex >= 0 ? Math.min(currentIndex + 1, orderedIds.length - 1) : 0;
      onSelectLayer(orderedIds[nextIndex]);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      const nextIndex = currentIndex >= 0 ? Math.max(currentIndex - 1, 0) : 0;
      onSelectLayer(orderedIds[nextIndex]);
      return;
    }

    if (!selectedLayerId) return;

    const lowerKey = event.key.toLowerCase();
    if (lowerKey === "v") {
      event.preventDefault();
      onToggleLayerVisibility(selectedLayerId);
    } else if (lowerKey === "l") {
      event.preventDefault();
      onToggleLayerLock(selectedLayerId);
    } else if (lowerKey === "s") {
      event.preventDefault();
      onToggleLayerVisibility(selectedLayerId, { solo: true });
    } else if (event.key === "Enter" && !lockedLayerIds.has(selectedLayerId)) {
      event.preventDefault();
      onOpenLayerMaterial?.(selectedLayerId);
    }
  };

  return (
    <div
      className="editor-bom-panel editor-layer-panel"
      data-panel="layers"
      style={{ width: 280, minWidth: 280, ...style }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "12px 14px 10px",
          borderBottom: "1px solid var(--glass-mid-border)",
          flexShrink: 0,
        }}
      >
        <div>
          <div className="label-mono" style={{ marginBottom: 6 }}>{t("layers.eyebrow")}</div>
          <div className="heading-display" style={{ fontSize: 18 }}>{t("layers.title")}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {layers.length > 1 && onSetHiddenLayers && (
            <button
              type="button"
              className="layer-autoplay-btn"
              onClick={autoplayActive ? stopAutoplay : startAutoplay}
              aria-label={autoplayActive ? t("layers.stopAutoplay") : t("layers.startAutoplay")}
              title={autoplayActive ? t("layers.stopAutoplay") : t("layers.startAutoplay")}
            >
              {autoplayActive ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="6,4 20,12 6,20" />
                </svg>
              )}
            </button>
          )}
          <span className="badge badge-amber" aria-label={t("layers.layerCount", { count: layers.length })}>
            {layers.length}
          </span>
        </div>
      </div>

      {autoplayActive && (
        <div style={{ padding: "0 14px 8px", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            flex: 1,
            height: 3,
            background: "var(--border)",
            borderRadius: 2,
            overflow: "hidden",
          }}>
            <div style={{
              width: `${((autoplayStep + 1) / layers.length) * 100}%`,
              height: "100%",
              background: "var(--amber)",
              transition: "width 0.4s ease-out",
            }} />
          </div>
          <span className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
            {autoplayStep + 1}/{layers.length}
          </span>
        </div>
      )}

      {layers.length === 0 ? (
        <div
          style={{
            padding: 16,
            color: "var(--text-muted)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {t("layers.empty")}
        </div>
      ) : (
        <div
          role="listbox"
          aria-label={t("layers.title")}
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            padding: 8,
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {layers.map((layer) => {
            const selected = layer.id === selectedLayerId;
            const hidden = hiddenLayerIds.has(layer.id);
            const locked = lockedLayerIds.has(layer.id);

            return (
              <div
                key={layer.id}
                ref={(node) => {
                  if (node) rowRefs.current.set(layer.id, node);
                  else rowRefs.current.delete(layer.id);
                }}
                role="option"
                aria-selected={selected}
                aria-disabled={locked}
                tabIndex={selected ? 0 : -1}
                onClick={() => {
                  if (!locked) {
                    onSelectLayer(layer.id);
                    onFocusLayer?.(layer.id);
                  }
                }}
                onDoubleClick={() => {
                  if (!locked) onOpenLayerMaterial?.(layer.id);
                }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "10px 32px 32px minmax(0, 1fr)",
                  alignItems: "center",
                  gap: 8,
                  minHeight: 52,
                  padding: "8px 10px",
                  borderRadius: "var(--radius-md)",
                  border: selected ? "1px solid var(--amber)" : "1px solid var(--border)",
                  background: selected ? "rgba(229, 160, 75, 0.08)" : "var(--bg-secondary)",
                  boxShadow: selected ? "var(--focus-ring), var(--focus-ring-offset)" : "none",
                  cursor: locked ? "not-allowed" : "pointer",
                  opacity: hidden ? 0.55 : locked ? 0.7 : 1,
                  transition: "border-color var(--transition-fast), background var(--transition-fast), opacity var(--transition-fast)",
                }}
              >
                <div
                  aria-hidden="true"
                  style={{
                    width: 4,
                    height: 22,
                    borderRadius: 999,
                    background: selected ? "var(--amber)" : "rgba(255,255,255,0.08)",
                  }}
                />

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleLayerVisibility(layer.id, { solo: event.shiftKey });
                  }}
                  aria-label={hidden ? t("layers.showLayer", { name: layer.name }) : t("layers.hideLayer", { name: layer.name })}
                  style={{
                    width: 32,
                    height: 32,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "transparent",
                    color: hidden ? "var(--text-muted)" : "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <VisibilityIcon hidden={hidden} />
                </button>

                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggleLayerLock(layer.id);
                  }}
                  aria-label={locked ? t("layers.unlockLayer", { name: layer.name }) : t("layers.lockLayer", { name: layer.name })}
                  style={{
                    width: 32,
                    height: 32,
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    background: "transparent",
                    color: locked ? "var(--amber)" : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  <LockIcon locked={locked} />
                </button>

                <div style={{ minWidth: 0, display: "grid", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span
                      aria-hidden="true"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        background: colorToCss(layer.color),
                        border: "1px solid rgba(255,255,255,0.18)",
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "var(--text-primary)",
                        fontSize: 13,
                        textDecoration: hidden ? "line-through" : "none",
                      }}
                    >
                      {layer.name}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span
                      className="label-mono"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: "var(--text-muted)",
                        fontSize: 10,
                        minWidth: 0,
                      }}
                    >
                      {layer.materialId}
                    </span>
                    <span
                      className="badge"
                      title={t("layers.costApprox")}
                      style={{
                        marginLeft: "auto",
                        background: "rgba(229, 160, 75, 0.1)",
                        color: "var(--amber)",
                        border: "1px solid rgba(229, 160, 75, 0.18)",
                      }}
                    >
                      {layer.approxCost > 0 ? formatApproxCost(layer.approxCost, locale) : t("layers.noCost")}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
