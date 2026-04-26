"use client";

import { useId, useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { useToast } from "@/components/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import {
  formatBlueprintHandoff,
  recognizeBlueprintFromMetadata,
  type BlueprintRecognitionResult,
} from "@/lib/blueprint-to-scene";
import { copyTextToClipboard } from "@/lib/clipboard";
import type { BuildingInfo } from "@/types";

const COPY = {
  en: {
    eyebrow: "AI-ready floor plan intake",
    title: "Blueprint-to-3D draft",
    subtitle: "Upload a floor plan image or PDF, add scale hints, and generate editable room, wall, door, and window geometry.",
    dropHint: "Choose floor plan image or PDF",
    selected: "Selected",
    fileInput: "Blueprint file",
    floor: "Floor label",
    width: "Known width (m)",
    depth: "Known depth (m)",
    notes: "Room notes",
    notesPlaceholder: "Example: sauna, KHH, 2 bedrooms, kitchen opens to living room",
    generate: "Generate editable draft",
    regenerate: "Regenerate draft",
    apply: "Apply to 3D scene",
    copy: "Copy scene JS",
    copied: "Copied",
    copyHandoff: "Copy handoff",
    handoffCopied: "Handoff copied",
    noFile: "Choose a blueprint file first.",
    applied: "Blueprint scene applied",
    generated: "Blueprint draft generated",
    confidence: "Confidence",
    footprint: "Footprint",
    rooms: "Rooms",
    openings: "Openings",
    assumptions: "Assumptions",
    doors: "doors",
    windows: "windows",
    verify: "Draft only: verify scale and openings before quote requests or permits.",
    scale: "Scale",
    fallback: "fallback",
    buildingArea: "building area",
    userDimensions: "owner dimensions",
    partialArea: "owner hint + area",
  },
  fi: {
    eyebrow: "Tekoalyvalmis pohjakuva",
    title: "Pohjakuvasta 3D-luonnos",
    subtitle: "Lataa pohjakuva tai PDF, anna mittavihjeet ja luo muokattava huone-, seina-, ovi- ja ikkunaluonnos.",
    dropHint: "Valitse pohjakuva tai PDF",
    selected: "Valittu",
    fileInput: "Pohjakuvatiedosto",
    floor: "Kerroksen nimi",
    width: "Tunnettu leveys (m)",
    depth: "Tunnettu syvyys (m)",
    notes: "Huomioita huoneista",
    notesPlaceholder: "Esim. sauna, KHH, 2 makuuhuonetta, keittio olohuoneen yhteydessa",
    generate: "Luo muokattava luonnos",
    regenerate: "Luo luonnos uudelleen",
    apply: "Vie 3D-nakymaan",
    copy: "Kopioi Scene JS",
    copied: "Kopioitu",
    copyHandoff: "Kopioi yhteenveto",
    handoffCopied: "Yhteenveto kopioitu",
    noFile: "Valitse ensin pohjakuva.",
    applied: "Pohjakuvaluonnos otettu kayttoon",
    generated: "Pohjakuvaluonnos luotu",
    confidence: "Varmuus",
    footprint: "Pohjan koko",
    rooms: "Huoneet",
    openings: "Aukot",
    assumptions: "Oletukset",
    doors: "ovea",
    windows: "ikkunaa",
    verify: "Luonnos: tarkista mittakaava ja aukot ennen tarjous- tai lupakayttoa.",
    scale: "Mittakaava",
    fallback: "oletus",
    buildingArea: "rakennuksen ala",
    userDimensions: "omistajan mitat",
    partialArea: "mittavihje + ala",
  },
  sv: {
    eyebrow: "AI-redo planintag",
    title: "Planritning till 3D-utkast",
    subtitle: "Ladda upp en planbild eller PDF, ange skalhintar och skapa redigerbara rum, vaggar, dorrar och fonster.",
    dropHint: "Valj planbild eller PDF",
    selected: "Vald",
    fileInput: "Planritningsfil",
    floor: "Vaningsnamn",
    width: "Kand bredd (m)",
    depth: "Kant djup (m)",
    notes: "Rumsanteckningar",
    notesPlaceholder: "Exempel: bastu, grovkok, 2 sovrum, kok mot vardagsrum",
    generate: "Skapa redigerbart utkast",
    regenerate: "Skapa utkast igen",
    apply: "Applicera i 3D-scenen",
    copy: "Kopiera Scene JS",
    copied: "Kopierat",
    copyHandoff: "Kopiera sammanfattning",
    handoffCopied: "Sammanfattning kopierad",
    noFile: "Valj en planfil forst.",
    applied: "Planutkast applicerat",
    generated: "Planutkast skapat",
    confidence: "Konfidens",
    footprint: "Fotavtryck",
    rooms: "Rum",
    openings: "Oppningar",
    assumptions: "Antaganden",
    doors: "dorrar",
    windows: "fonster",
    verify: "Endast utkast: verifiera skala och oppningar fore offerter eller lov.",
    scale: "Skala",
    fallback: "standard",
    buildingArea: "byggnadsarea",
    userDimensions: "agarens matt",
    partialArea: "matthint + area",
  },
} as const;

type BlueprintCopy = Record<keyof typeof COPY.en, string>;

function parseNumber(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function scaleLabel(result: BlueprintRecognitionResult, labels: BlueprintCopy): string {
  if (result.scaleSource === "user_dimensions") return labels.userDimensions;
  if (result.scaleSource === "building_area") return labels.buildingArea;
  if (result.scaleSource === "user_width_area" || result.scaleSource === "user_depth_area") return labels.partialArea;
  return labels.fallback;
}

function formatMeters(value: number, locale: string): string {
  return value.toLocaleString(locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-US", {
    maximumFractionDigits: 1,
  });
}

export default function BlueprintToScenePanel({
  buildingInfo,
  projectName,
  onApplyScene,
}: {
  buildingInfo?: BuildingInfo | null;
  projectName?: string;
  onApplyScene?: (sceneJs: string) => void;
}) {
  const { locale, t } = useTranslation();
  const { toast } = useToast();
  const { track } = useAnalytics();
  const inputId = useId();
  const labels = COPY[locale] ?? COPY.en;
  const [file, setFile] = useState<File | null>(null);
  const [floorLabel, setFloorLabel] = useState("Main floor");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<BlueprintRecognitionResult | null>(null);
  const [copied, setCopied] = useState<"scene" | "handoff" | null>(null);

  const accepted = "image/jpeg,image/png,image/webp,application/pdf";
  const openingSummary = useMemo(() => {
    if (!result) return null;
    return {
      doors: result.openings.filter((opening) => opening.type === "door").length,
      windows: result.openings.filter((opening) => opening.type === "window").length,
    };
  }, [result]);

  function generateDraft() {
    if (!file) {
      toast(labels.noFile, "warning");
      return;
    }

    const next = recognizeBlueprintFromMetadata({
      fileName: file.name,
      mimeType: file.type,
      projectName,
      floorLabel,
      notes,
      widthMeters: parseNumber(width),
      depthMeters: parseNumber(depth),
      buildingInfo,
    });
    setResult(next);
    setCopied(null);
    toast(labels.generated, "success");
    track("blueprint_scene_generated", {
      file_type: file.type || "unknown",
      room_count: next.rooms.length,
      confidence: next.confidence,
    });
  }

  function applyDraft() {
    if (!result || !onApplyScene) return;
    onApplyScene(result.sceneJs);
    toast(labels.applied, "success");
    track("blueprint_scene_applied", {
      room_count: result.rooms.length,
      confidence: result.confidence,
    });
  }

  async function copyScene() {
    if (!result) return;
    const copiedToClipboard = await copyTextToClipboard(result.sceneJs);
    if (!copiedToClipboard) {
      toast(t("toast.copyFailed"), "error");
      return;
    }
    setCopied("scene");
    toast(labels.copied, "success");
  }

  async function copyHandoff() {
    if (!result) return;
    const copiedToClipboard = await copyTextToClipboard(formatBlueprintHandoff(result));
    if (!copiedToClipboard) {
      toast(t("toast.copyFailed"), "error");
      return;
    }
    setCopied("handoff");
    toast(labels.handoffCopied, "success");
  }

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid rgba(45, 95, 109, 0.28)",
        borderRadius: "var(--radius-md)",
        background: "linear-gradient(135deg, rgba(45,95,109,0.1), rgba(229,160,75,0.07))",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
        <div>
          <div className="label-mono" style={{ color: "var(--accent)", marginBottom: 4 }}>
            {labels.eyebrow}
          </div>
          <h4 id={`${inputId}-title`} style={{ margin: 0, fontSize: 13, color: "var(--text-primary)" }}>
            {labels.title}
          </h4>
          <p style={{ margin: "5px 0 0", color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
            {labels.subtitle}
          </p>
        </div>
        <span className="badge badge-muted">PDF/JPG/PNG</span>
      </div>

      <label
        htmlFor={`${inputId}-file`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginTop: 10,
          minHeight: 58,
          border: "1px dashed var(--border-strong)",
          borderRadius: "var(--radius-sm)",
          background: "var(--bg-secondary)",
          color: "var(--text-secondary)",
          fontSize: 12,
          cursor: "pointer",
          textAlign: "center",
          padding: "8px 10px",
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 4h16v16H4z" />
          <path d="M8 12h8" />
          <path d="M12 8v8" />
        </svg>
        {file ? `${labels.selected}: ${file.name}` : labels.dropHint}
      </label>
      <input
        id={`${inputId}-file`}
        aria-label={labels.fileInput}
        type="file"
        accept={accepted}
        style={{ display: "none" }}
        onChange={(event) => {
          const selected = event.target.files?.[0] ?? null;
          if (selected && (selected.type.startsWith("image/") || selected.type === "application/pdf")) {
            setFile(selected);
            setResult(null);
            setCopied(null);
          }
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.floor}
          <input
            className="input"
            value={floorLabel}
            onChange={(event) => setFloorLabel(event.target.value)}
            style={{ fontSize: 12 }}
          />
        </label>
        <div />
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.width}
          <input
            className="input"
            inputMode="decimal"
            value={width}
            onChange={(event) => setWidth(event.target.value)}
            placeholder={buildingInfo?.area_m2 ? "" : "9.2"}
            style={{ fontSize: 12 }}
          />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.depth}
          <input
            className="input"
            inputMode="decimal"
            value={depth}
            onChange={(event) => setDepth(event.target.value)}
            placeholder={buildingInfo?.area_m2 ? "" : "7.4"}
            style={{ fontSize: 12 }}
          />
        </label>
      </div>

      <label style={{ display: "grid", gap: 4, marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>
        {labels.notes}
        <textarea
          className="input"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={labels.notesPlaceholder}
          rows={3}
          style={{ fontSize: 12, resize: "vertical" }}
        />
      </label>

      <button
        type="button"
        className="btn btn-primary"
        onClick={generateDraft}
        style={{ width: "100%", marginTop: 10, fontSize: 12, opacity: file ? 1 : 0.65 }}
      >
        {result ? labels.regenerate : labels.generate}
      </button>

      {result && openingSummary && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            <div style={{ padding: 8, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)" }}>
              <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 3 }}>{labels.confidence}</div>
              <strong style={{ color: "var(--text-primary)", fontSize: 13 }}>{Math.round(result.confidence * 100)}%</strong>
            </div>
            <div style={{ padding: 8, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)" }}>
              <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 3 }}>{labels.rooms}</div>
              <strong style={{ color: "var(--text-primary)", fontSize: 13 }}>{result.rooms.length}</strong>
            </div>
            <div style={{ padding: 8, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)" }}>
              <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 3 }}>{labels.openings}</div>
              <strong style={{ color: "var(--text-primary)", fontSize: 13 }}>
                {openingSummary.doors}/{openingSummary.windows}
              </strong>
            </div>
          </div>

          <div style={{ padding: 10, borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "var(--text-muted)" }}>
              <span>{labels.footprint}</span>
              <strong style={{ color: "var(--text-primary)" }}>
                {formatMeters(result.widthMeters, locale)} m x {formatMeters(result.depthMeters, locale)} m
              </strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 5, fontSize: 11, color: "var(--text-muted)" }}>
              <span>{labels.scale}</span>
              <strong style={{ color: "var(--text-primary)" }}>{scaleLabel(result, labels)}</strong>
            </div>
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            {result.rooms.slice(0, 6).map((room) => (
              <div key={room.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "var(--text-secondary)" }}>
                <span>{room.name}</span>
                <span>{formatMeters(room.areaM2, locale)} m2</span>
              </div>
            ))}
          </div>

          <div style={{ padding: 9, borderRadius: "var(--radius-sm)", background: "rgba(229,160,75,0.1)", color: "var(--text-muted)", fontSize: 10, lineHeight: 1.45 }}>
            <strong style={{ color: "var(--text-primary)" }}>{labels.verify}</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
              {result.assumptions.slice(0, 3).map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: onApplyScene ? "1fr 1fr" : "1fr", gap: 8 }}>
            {onApplyScene && (
              <button type="button" className="btn btn-primary" onClick={applyDraft} style={{ fontSize: 12 }}>
                {labels.apply}
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={() => { void copyScene(); }} style={{ fontSize: 12 }}>
              {copied === "scene" ? labels.copied : labels.copy}
            </button>
          </div>
          <button type="button" className="btn btn-secondary" onClick={() => { void copyHandoff(); }} style={{ fontSize: 12 }}>
            {copied === "handoff" ? labels.handoffCopied : labels.copyHandoff}
          </button>
        </div>
      )}
    </section>
  );
}
