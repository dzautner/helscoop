"use client";

import { useId, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/components/LocaleProvider";
import { useToast } from "@/components/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import type { BomImportMode } from "@/lib/bom-import";
import type { BuildingInfo, BomItem, RoomScanResponse, RoomScanRoom, RoomScanUpload } from "@/types";

const COPY = {
  en: {
    eyebrow: "LiDAR as-built intake",
    title: "RoomPlan / USDZ scan import",
    subtitle: "Upload a RoomPlan-compatible USDZ/USD export, extract rooms, walls, openings, and turn scanned surfaces into editable scene geometry and BOM rows.",
    creditCost: "10 credits",
    creditTooltip: "Scan import uses quantityTakeoff credits",
    dropHint: "Choose USDZ, USD, USDA, USDC, or JSON scan",
    selected: "Selected",
    fileInput: "Room scan file",
    floor: "Floor label",
    width: "Known width (m)",
    depth: "Known depth (m)",
    area: "Known floor area (m2)",
    notes: "Scan notes",
    notesPlaceholder: "Example: ground floor, sauna included, MagicPlan export from iPhone LiDAR",
    importScan: "Import room scan",
    importing: "Importing scan...",
    noFile: "Choose a scan file first.",
    insufficientCredits: "Not enough credits for LiDAR scan import.",
    error: "Room scan import failed.",
    quality: "Scan quality",
    features: "Features",
    surfaces: "Surfaces",
    rooms: "rooms",
    walls: "walls",
    openings: "openings",
    overlay: "Detected scan footprint",
    materialRows: "BOM rows",
    planningRange: "Planning range",
    applyScene: "Append scan to 3D scene",
    appliedScene: "Scan appended",
    importBom: "Add {{count}} rows to BOM",
    importedBom: "{{count}} scan rows added to BOM",
    importedShort: "Imported",
    assumptions: "Assumptions",
    verify: "Verify scan scale, wall build-up, and RoomPlan openings before purchase or permit use.",
  },
  fi: {
    eyebrow: "LiDAR-as-built",
    title: "RoomPlan / USDZ -skannauksen tuonti",
    subtitle: "Lataa RoomPlan-yhteensopiva USDZ/USD-vienti, pura huoneet, seinat ja aukot, ja tee niista muokattava 3D-luonnos ja BOM-rivit.",
    creditCost: "10 krediittia",
    creditTooltip: "Skannauksen tuonti kayttaa quantityTakeoff-krediitteja",
    dropHint: "Valitse USDZ, USD, USDA, USDC tai JSON -skannaus",
    selected: "Valittu",
    fileInput: "Huoneskannaustiedosto",
    floor: "Kerroksen nimi",
    width: "Tunnettu leveys (m)",
    depth: "Tunnettu syvyys (m)",
    area: "Tunnettu ala (m2)",
    notes: "Skannauksen huomiot",
    notesPlaceholder: "Esim. alakerta, sauna mukana, MagicPlan-vienti iPhone LiDARilla",
    importScan: "Tuo huoneskannaus",
    importing: "Tuodaan skannausta...",
    noFile: "Valitse ensin skannaustiedosto.",
    insufficientCredits: "Krediitit eivat riita LiDAR-tuontiin.",
    error: "Huoneskannauksen tuonti epaonnistui.",
    quality: "Skannauksen laatu",
    features: "Havainnot",
    surfaces: "Pinnat",
    rooms: "huonetta",
    walls: "seinaa",
    openings: "aukkoa",
    overlay: "Havaittu skannauspohja",
    materialRows: "BOM-rivit",
    planningRange: "Suunnitteluarvio",
    applyScene: "Liita skannaus 3D-malliin",
    appliedScene: "Skannaus liitetty",
    importBom: "Lisaa {{count}} rivia BOMiin",
    importedBom: "{{count}} skannausrivia lisatty BOMiin",
    importedShort: "Tuotu",
    assumptions: "Oletukset",
    verify: "Tarkista skaalat, seinarakenteet ja RoomPlan-aukot ennen ostoa tai lupakayttoa.",
  },
  sv: {
    eyebrow: "LiDAR as-built",
    title: "RoomPlan / USDZ-skanimport",
    subtitle: "Ladda upp RoomPlan-kompatibel USDZ/USD-export, extrahera rum, vaggar och oppningar, och skapa redigerbar scen och BOM-rader.",
    creditCost: "10 krediter",
    creditTooltip: "Skanimport anvander quantityTakeoff-krediter",
    dropHint: "Valj USDZ, USD, USDA, USDC eller JSON-skan",
    selected: "Vald",
    fileInput: "Rumsskanfil",
    floor: "Vaningsnamn",
    width: "Kand bredd (m)",
    depth: "Kant djup (m)",
    area: "Kand golvyta (m2)",
    notes: "Skananteckningar",
    notesPlaceholder: "Exempel: bottenvaning, bastu med, MagicPlan-export fran iPhone LiDAR",
    importScan: "Importera rumsskan",
    importing: "Importerar skan...",
    noFile: "Valj en skanfil forst.",
    insufficientCredits: "Inte tillrackligt med krediter for LiDAR-import.",
    error: "Rumsskanimporten misslyckades.",
    quality: "Skankvalitet",
    features: "Funktioner",
    surfaces: "Ytor",
    rooms: "rum",
    walls: "vaggar",
    openings: "oppningar",
    overlay: "Upptackt skanfotavtryck",
    materialRows: "BOM-rader",
    planningRange: "Planeringsintervall",
    applyScene: "Lagg skan till 3D-scen",
    appliedScene: "Skan tillagd",
    importBom: "Lagg till {{count}} rader i BOM",
    importedBom: "{{count}} skanrader lades till i BOM",
    importedShort: "Importerad",
    assumptions: "Antaganden",
    verify: "Verifiera skala, vaggkonstruktion och RoomPlan-oppningar fore inkop eller lov.",
  },
} as const;

const ROOM_COLORS: Record<RoomScanRoom["type"], string> = {
  entry: "rgba(203, 171, 95, 0.56)",
  living: "rgba(111, 150, 103, 0.5)",
  kitchen: "rgba(218, 147, 70, 0.52)",
  bedroom: "rgba(88, 128, 178, 0.5)",
  bath: "rgba(79, 151, 179, 0.54)",
  sauna: "rgba(151, 100, 67, 0.54)",
  utility: "rgba(100, 112, 124, 0.5)",
  unknown: "rgba(126, 132, 138, 0.46)",
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read scan"));
    reader.readAsDataURL(file);
  });
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatNumber(value: number, locale: string, digits = 1): string {
  const numberLocale = locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-US";
  return value.toLocaleString(numberLocale, { maximumFractionDigits: digits });
}

function formatEuro(value: number, locale: string): string {
  return `${Math.round(value).toLocaleString(locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-US")} EUR`;
}

function renderTemplate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params[key] ?? ""));
}

function guessMimeType(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (file.type) return file.type;
  if (ext === "json") return "application/json";
  if (ext === "usdz") return "model/vnd.usdz+zip";
  if (ext === "usd" || ext === "usda") return "model/vnd.usd";
  return "application/octet-stream";
}

function mergeSuggestions(result: RoomScanResponse): BomItem[] {
  return result.bom_suggestions.map((suggestion) => ({
    material_id: suggestion.material_id,
    material_name: suggestion.material_name,
    category_name: suggestion.category_name || undefined,
    quantity: suggestion.quantity,
    unit: suggestion.unit,
    unit_price: suggestion.unit_price,
    total: suggestion.total,
    supplier: suggestion.supplier || undefined,
    link: suggestion.link,
    stock_level: "unknown",
    note: suggestion.note,
  }));
}

function mergeScene(currentSceneJs: string | undefined, scanSceneJs: string): { sceneJs: string; mode: "append" | "replace" } {
  const current = currentSceneJs?.trim();
  if (!current) return { sceneJs: scanSceneJs, mode: "replace" };
  return {
    sceneJs: `${current}\n\n// --- Imported LiDAR / RoomPlan scan overlay ---\n${scanSceneJs}`,
    mode: "append",
  };
}

function ScanOverlay({ result }: { result: RoomScanResponse }) {
  const width = Math.max(1, result.width_m);
  const depth = Math.max(1, result.depth_m);
  return (
    <div
      aria-hidden="true"
      style={{
        position: "relative",
        minHeight: 150,
        borderRadius: "var(--radius-sm)",
        border: "1px dashed rgba(45, 95, 109, 0.32)",
        background:
          "linear-gradient(90deg, rgba(45,95,109,0.08) 1px, transparent 1px), linear-gradient(0deg, rgba(45,95,109,0.08) 1px, transparent 1px)",
        backgroundSize: "18px 18px",
        overflow: "hidden",
      }}
    >
      {result.rooms.map((room) => {
        const left = ((room.x - room.width_m / 2 + width / 2) / width) * 100;
        const top = ((room.z - room.depth_m / 2 + depth / 2) / depth) * 100;
        return (
          <div
            key={room.id}
            style={{
              position: "absolute",
              left: `${Math.max(0, left)}%`,
              top: `${Math.max(0, top)}%`,
              width: `${Math.min(100, (room.width_m / width) * 100)}%`,
              height: `${Math.min(100, (room.depth_m / depth) * 100)}%`,
              border: "1px solid rgba(26, 56, 64, 0.28)",
              background: ROOM_COLORS[room.type],
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 4,
              textAlign: "center",
              color: "var(--text-primary)",
              fontSize: 9,
              lineHeight: 1.15,
              overflow: "hidden",
            }}
          >
            {room.name}
          </div>
        );
      })}
      {result.openings.map((opening) => (
        <span
          key={opening.id}
          title={opening.type}
          style={{
            position: "absolute",
            left: `${((opening.x + width / 2) / width) * 100}%`,
            top: `${((opening.z + depth / 2) / depth) * 100}%`,
            width: 8,
            height: 8,
            borderRadius: 999,
            transform: "translate(-50%, -50%)",
            background: opening.type === "window" ? "rgba(56, 117, 169, 0.9)" : "rgba(111, 73, 42, 0.9)",
            boxShadow: "0 0 0 2px rgba(255,255,255,0.7)",
          }}
        />
      ))}
    </div>
  );
}

export default function RoomScanImportPanel({
  projectId,
  projectName,
  buildingInfo,
  currentSceneJs,
  onApplyScene,
  onImportBom,
}: {
  projectId: string;
  projectName?: string;
  buildingInfo?: BuildingInfo | null;
  currentSceneJs?: string;
  onApplyScene?: (sceneJs: string) => void;
  onImportBom?: (items: BomItem[], mode: BomImportMode) => void;
}) {
  const { locale } = useTranslation();
  const { toast } = useToast();
  const { track } = useAnalytics();
  const inputId = useId();
  const labels = COPY[locale] ?? COPY.en;
  const [file, setFile] = useState<File | null>(null);
  const [floorLabel, setFloorLabel] = useState("LiDAR scan");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [area, setArea] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RoomScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState(false);
  const [imported, setImported] = useState(false);

  const importableItems = useMemo(() => result ? mergeSuggestions(result) : [], [result]);
  const accepted = ".usdz,.usd,.usda,.usdc,.json,model/vnd.usdz+zip,model/vnd.usd,application/octet-stream,application/json";

  async function importScan() {
    if (!file || loading) {
      toast(labels.noFile, "warning");
      return;
    }
    setLoading(true);
    setError(null);
    setApplied(false);
    setImported(false);
    try {
      const scan: RoomScanUpload = {
        name: file.name,
        mime_type: guessMimeType(file),
        size: file.size,
        data_url: await readFileAsDataUrl(file),
      };
      const response = await api.importRoomScan(projectId, {
        scans: [scan],
        building_info: buildingInfo ?? null,
        options: {
          floor_label: floorLabel,
          notes,
          width_m: parseNumber(width),
          depth_m: parseNumber(depth),
          area_m2: parseNumber(area),
        },
      });
      setResult(response);
      track("room_scan_imported", {
        project_id: projectId,
        source_format: response.source_format,
        room_count: response.rooms.length,
        wall_count: response.walls.length,
        opening_count: response.openings.length,
        coverage_percent: response.quality.coverage_percent,
        parser: response.quality.parser,
      });
    } catch (err) {
      const message = err instanceof ApiError && err.status === 402
        ? labels.insufficientCredits
        : err instanceof Error
          ? err.message
          : labels.error;
      setError(message);
      toast(message, "error");
    } finally {
      setLoading(false);
    }
  }

  function applyScanScene() {
    if (!result || !onApplyScene) return;
    const merged = mergeScene(currentSceneJs, result.scene_js);
    onApplyScene(merged.sceneJs);
    setApplied(true);
    toast(labels.appliedScene, "success");
    track("room_scan_applied", {
      project_id: projectId,
      room_count: result.rooms.length,
      wall_count: result.walls.length,
      merge_mode: merged.mode,
    });
  }

  function importBomRows() {
    if (!result || importableItems.length === 0 || !onImportBom) return;
    onImportBom(importableItems, "merge");
    setImported(true);
    toast(renderTemplate(labels.importedBom, { count: importableItems.length }), "success");
    track("room_scan_bom_imported", {
      project_id: projectId,
      item_count: importableItems.length,
      estimate_mid: result.estimate.mid,
    });
  }

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      style={{
        marginTop: 12,
        padding: 12,
        border: "1px solid rgba(45, 95, 109, 0.28)",
        borderRadius: "var(--radius-md)",
        background: "linear-gradient(135deg, rgba(45,95,109,0.1), rgba(56,117,169,0.07))",
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
        <span className="badge badge-muted" title={labels.creditTooltip}>
          {labels.creditCost}
        </span>
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
          <path d="M7 7l5 4 5-4" />
          <path d="M7 17l5-4 5 4" />
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
          setFile(selected);
          setResult(null);
          setError(null);
          setApplied(false);
          setImported(false);
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.floor}
          <input className="input" value={floorLabel} onChange={(event) => setFloorLabel(event.target.value)} style={{ fontSize: 12 }} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.area}
          <input className="input" inputMode="decimal" value={area} onChange={(event) => setArea(event.target.value)} placeholder={buildingInfo?.area_m2 ? String(buildingInfo.area_m2) : "68"} style={{ fontSize: 12 }} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.width}
          <input className="input" inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} placeholder="9.2" style={{ fontSize: 12 }} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.depth}
          <input className="input" inputMode="decimal" value={depth} onChange={(event) => setDepth(event.target.value)} placeholder="7.4" style={{ fontSize: 12 }} />
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
        disabled={!file || loading}
        onClick={() => { void importScan(); }}
        style={{ width: "100%", marginTop: 10, fontSize: 12, opacity: !file || loading ? 0.55 : 1 }}
      >
        {loading ? labels.importing : labels.importScan}
      </button>

      {error && (
        <div role="alert" style={{ marginTop: 8, color: "var(--danger)", fontSize: 11, lineHeight: 1.4 }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ padding: 10, borderRadius: "var(--radius-sm)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
            <div className="label-mono" style={{ marginBottom: 4, color: "var(--text-muted)" }}>
              {labels.planningRange}
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <strong style={{ fontSize: 16, color: "var(--text-primary)" }}>
                {formatEuro(result.estimate.mid, locale)}
              </strong>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                {formatEuro(result.estimate.low, locale)}-{formatEuro(result.estimate.high, locale)}
              </span>
            </div>
            <p style={{ margin: "6px 0 0", color: "var(--text-muted)", fontSize: 10, lineHeight: 1.4 }}>
              {projectName || result.project_name} - {formatNumber(result.floor_area_m2, locale)} m2 - {result.source_format.toUpperCase()} - {result.quality.parser}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            <div style={{ padding: 8, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)" }}>
              <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 3 }}>{labels.quality}</div>
              <strong>{result.quality.coverage_percent}%</strong>
            </div>
            <div style={{ padding: 8, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)" }}>
              <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 3 }}>{labels.features}</div>
              <strong>{result.rooms.length}/{result.walls.length}/{result.openings.length}</strong>
            </div>
            <div style={{ padding: 8, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)" }}>
              <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 3 }}>{labels.materialRows}</div>
              <strong>{result.bom_suggestions.length}</strong>
            </div>
          </div>

          <div>
            <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 6 }}>
              {labels.overlay}
            </div>
            <ScanOverlay result={result} />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
            <span>{labels.surfaces}: {formatNumber(result.surfaces.floor_area_m2, locale)} m2</span>
            <span>{labels.openings}: {result.openings.length}</span>
            <span>{labels.rooms}: {result.rooms.length}</span>
            <span>{labels.walls}: {formatNumber(result.walls.reduce((sum, wall) => sum + wall.length_m, 0), locale)} m</span>
          </div>

          <div style={{ display: "grid", gap: 5 }}>
            {result.bom_suggestions.slice(0, 5).map((item) => (
              <div key={item.material_id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 11, color: "var(--text-secondary)" }}>
                <span>{item.material_name}</span>
                <span style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                  {formatNumber(item.quantity, locale)} {item.unit}
                </span>
              </div>
            ))}
          </div>

          <div style={{ padding: 9, borderRadius: "var(--radius-sm)", background: "rgba(229,160,75,0.1)", color: "var(--text-muted)", fontSize: 10, lineHeight: 1.45 }}>
            <strong style={{ color: "var(--text-primary)" }}>{labels.verify}</strong>
            <ul style={{ margin: "6px 0 0", paddingLeft: 16 }}>
              {[...result.assumptions, ...result.quality.warnings].slice(0, 4).map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: onApplyScene && onImportBom ? "1fr 1fr" : "1fr", gap: 8 }}>
            {onApplyScene && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={applied}
                onClick={applyScanScene}
                style={{ width: "100%", fontSize: 12 }}
              >
                {applied ? labels.appliedScene : labels.applyScene}
              </button>
            )}
            {onImportBom && (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={importableItems.length === 0 || imported}
                onClick={importBomRows}
                style={{ width: "100%", fontSize: 12 }}
              >
                {imported ? labels.importedShort : renderTemplate(labels.importBom, { count: importableItems.length })}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
