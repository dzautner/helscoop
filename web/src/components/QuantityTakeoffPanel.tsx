"use client";

import { useId, useMemo, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useTranslation } from "@/components/LocaleProvider";
import { useToast } from "@/components/ToastProvider";
import { useAnalytics } from "@/hooks/useAnalytics";
import type {
  BuildingInfo,
  BomItem,
  QuantityTakeoffDrawing,
  QuantityTakeoffResponse,
  QuantityTakeoffRoom,
} from "@/types";
import type { BomImportMode } from "@/lib/bom-import";

const COPY = {
  en: {
    eyebrow: "AI-ready drawing takeoff",
    title: "Floor plan to material takeoff",
    subtitle: "Upload a pohjapiirros, PDF, or drawing photo, add scale hints, and turn detected rooms into editable BOM rows.",
    creditCost: "10 credits",
    creditTooltip: "Quantity takeoff uses quantityTakeoff credits",
    dropHint: "Choose floor plan PDF or image",
    selected: "Selected",
    fileInput: "Floor plan drawing file",
    width: "Known width (m)",
    depth: "Known depth (m)",
    area: "Known floor area (m2)",
    scale: "Scale note",
    floor: "Floor label",
    notes: "Rooms / scope notes",
    notesPlaceholder: "Example: sauna, KHH, 2 bedrooms, kitchen opens to living room",
    analyze: "Analyze drawing takeoff",
    analyzing: "Analyzing drawing...",
    noFile: "Choose a drawing first.",
    insufficientCredits: "Not enough credits for quantity takeoff.",
    error: "Drawing takeoff failed.",
    rangeLabel: "Planning range",
    rooms: "Rooms",
    openings: "Openings",
    detected: "Detected takeoff overlay",
    materialRows: "BOM rows",
    assumptions: "Assumptions",
    import: "Add {{count}} rows to BOM",
    imported: "{{count}} takeoff rows added to BOM",
    importedShort: "Imported",
    verify: "Verify scale, wet-room build-up, and product choices before purchase.",
    scaleSource: "Scale",
    drawingType: "Floor plan",
    mixed: "Mixed drawings",
    elevation: "Elevation",
  },
  fi: {
    eyebrow: "Tekoalyvalmis maaralaskenta",
    title: "Pohjakuvasta materiaalilaskenta",
    subtitle: "Lataa pohjapiirros, PDF tai kuva, anna mittavihjeet ja muuta havaitut huoneet muokattaviksi BOM-riveiksi.",
    creditCost: "10 krediittiä",
    creditTooltip: "Määrälaskenta käyttää quantityTakeoff-krediittejä",
    dropHint: "Valitse pohjapiirros-PDF tai kuva",
    selected: "Valittu",
    fileInput: "Pohjakuvatiedosto",
    width: "Tunnettu leveys (m)",
    depth: "Tunnettu syvyys (m)",
    area: "Tunnettu ala (m2)",
    scale: "Mittakaavahuomio",
    floor: "Kerroksen nimi",
    notes: "Huoneet / työn rajaus",
    notesPlaceholder: "Esim. sauna, KHH, 2 makuuhuonetta, keittiö avautuu olohuoneeseen",
    analyze: "Analysoi määrälaskenta",
    analyzing: "Analysoidaan piirrosta...",
    noFile: "Valitse ensin piirros.",
    insufficientCredits: "Krediitit eivät riitä määrälaskentaan.",
    error: "Piirroksen määrälaskenta epäonnistui.",
    rangeLabel: "Suunnitteluarvio",
    rooms: "Huoneet",
    openings: "Aukot",
    detected: "Havaittu laskentaoverlay",
    materialRows: "BOM-rivit",
    assumptions: "Oletukset",
    import: "Lisää {{count}} riviä BOMiin",
    imported: "{{count}} laskentariviä lisätty BOMiin",
    importedShort: "Tuotu",
    verify: "Tarkista mittakaava, märkätilarakenne ja tuotteet ennen ostoa.",
    scaleSource: "Mittakaava",
    drawingType: "Pohjakuva",
    mixed: "Useita piirroksia",
    elevation: "Julkisivu",
  },
  sv: {
    eyebrow: "AI-redo mängdavtagning",
    title: "Planritning till materialmängder",
    subtitle: "Ladda upp planritning, PDF eller foto, ange skalhintar och skapa redigerbara BOM-rader.",
    creditCost: "10 krediter",
    creditTooltip: "Mängdavtagning använder quantityTakeoff-krediter",
    dropHint: "Välj plan-PDF eller bild",
    selected: "Vald",
    fileInput: "Planritningsfil",
    width: "Känd bredd (m)",
    depth: "Känt djup (m)",
    area: "Känd golvyta (m2)",
    scale: "Skalnotering",
    floor: "Våningsnamn",
    notes: "Rum / omfattning",
    notesPlaceholder: "Exempel: bastu, grovkök, 2 sovrum, kök mot vardagsrum",
    analyze: "Analysera mängder",
    analyzing: "Analyserar ritning...",
    noFile: "Välj en ritning först.",
    insufficientCredits: "Inte tillräckligt med krediter för mängdavtagning.",
    error: "Mängdavtagningen misslyckades.",
    rangeLabel: "Planeringsintervall",
    rooms: "Rum",
    openings: "Öppningar",
    detected: "Upptäckt mängdoverlay",
    materialRows: "BOM-rader",
    assumptions: "Antaganden",
    import: "Lägg till {{count}} rader i BOM",
    imported: "{{count}} mängdrader lades till i BOM",
    importedShort: "Importerad",
    verify: "Verifiera skala, våtrumskonstruktion och produkter före köp.",
    scaleSource: "Skala",
    drawingType: "Planritning",
    mixed: "Blandade ritningar",
    elevation: "Fasad",
  },
} as const;

const ROOM_COLORS: Record<QuantityTakeoffRoom["type"], string> = {
  entry: "rgba(203, 171, 95, 0.56)",
  living: "rgba(111, 150, 103, 0.5)",
  kitchen: "rgba(218, 147, 70, 0.52)",
  bedroom: "rgba(88, 128, 178, 0.5)",
  bath: "rgba(79, 151, 179, 0.54)",
  sauna: "rgba(151, 100, 67, 0.54)",
  utility: "rgba(100, 112, 124, 0.5)",
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read drawing"));
    reader.readAsDataURL(file);
  });
}

function parseNumber(value: string): number | null {
  const parsed = Number(value.replace(",", ".").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatEuro(value: number, locale: string): string {
  const numberLocale = locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-US";
  return `${Math.round(value).toLocaleString(numberLocale)} €`;
}

function formatNumber(value: number, locale: string, digits = 1): string {
  const numberLocale = locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-US";
  return value.toLocaleString(numberLocale, { maximumFractionDigits: digits });
}

function renderTemplate(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => String(params[key] ?? ""));
}

function mergeSuggestions(result: QuantityTakeoffResponse): BomItem[] {
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

function averageConfidence(result: QuantityTakeoffResponse): number {
  if (result.rooms.length === 0) return 0;
  return result.rooms.reduce((sum, room) => sum + room.confidence, 0) / result.rooms.length;
}

function TakeoffOverlay({ result }: { result: QuantityTakeoffResponse }) {
  const width = Math.max(1, result.drawing_context.width_m);
  const depth = Math.max(1, result.drawing_context.depth_m);
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
        const roomWidth = (room.width_m / width) * 100;
        const roomDepth = (room.depth_m / depth) * 100;
        return (
          <div
            key={room.id}
            style={{
              position: "absolute",
              left: `${Math.max(0, left)}%`,
              top: `${Math.max(0, top)}%`,
              width: `${Math.min(100, roomWidth)}%`,
              height: `${Math.min(100, roomDepth)}%`,
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
    </div>
  );
}

export default function QuantityTakeoffPanel({
  projectId,
  projectName,
  buildingInfo,
  onImportBom,
}: {
  projectId: string;
  projectName?: string;
  buildingInfo?: BuildingInfo | null;
  onImportBom?: (items: BomItem[], mode: BomImportMode) => void;
}) {
  const { locale } = useTranslation();
  const { toast } = useToast();
  const { track } = useAnalytics();
  const inputId = useId();
  const labels = COPY[locale] ?? COPY.en;
  const [files, setFiles] = useState<File[]>([]);
  const [drawingType, setDrawingType] = useState<"floor_plan" | "elevation" | "mixed">("floor_plan");
  const [floorLabel, setFloorLabel] = useState("Main floor");
  const [width, setWidth] = useState("");
  const [depth, setDepth] = useState("");
  const [area, setArea] = useState("");
  const [scaleText, setScaleText] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QuantityTakeoffResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imported, setImported] = useState(false);

  const importableItems = useMemo(() => result ? mergeSuggestions(result) : [], [result]);
  const accepted = "image/jpeg,image/png,image/webp,application/pdf";

  async function analyze() {
    if (files.length === 0 || loading) {
      toast(labels.noFile, "warning");
      return;
    }
    setLoading(true);
    setError(null);
    setImported(false);
    try {
      const drawings: QuantityTakeoffDrawing[] = await Promise.all(files.map(async (file) => ({
        name: file.name,
        mime_type: file.type || "application/pdf",
        size: file.size,
        data_url: await readFileAsDataUrl(file),
      })));
      const response = await api.analyzeQuantityTakeoff(projectId, {
        drawings,
        building_info: buildingInfo ?? null,
        options: {
          drawing_type: drawingType,
          floor_label: floorLabel,
          notes,
          scale_text: scaleText,
          width_m: parseNumber(width),
          depth_m: parseNumber(depth),
          area_m2: parseNumber(area),
        },
      });
      setResult(response);
      track("quantity_takeoff_generated", {
        project_id: projectId,
        drawing_count: files.length,
        room_count: response.rooms.length,
        estimate_mid: response.estimate.mid,
        confidence: averageConfidence(response),
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

  function importTakeoff() {
    if (!result || importableItems.length === 0 || !onImportBom) return;
    onImportBom(importableItems, "merge");
    setImported(true);
    toast(renderTemplate(labels.imported, { count: importableItems.length }), "success");
    track("quantity_takeoff_imported", {
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
        background: "linear-gradient(135deg, rgba(45,95,109,0.1), rgba(74,124,89,0.07))",
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
          <path d="M8 8h8" />
          <path d="M8 12h8" />
          <path d="M8 16h5" />
        </svg>
        {files.length > 0
          ? `${labels.selected}: ${files.map((file) => file.name).join(", ")}`
          : labels.dropHint}
      </label>
      <input
        id={`${inputId}-file`}
        aria-label={labels.fileInput}
        type="file"
        accept={accepted}
        multiple
        style={{ display: "none" }}
        onChange={(event) => {
          const selected = Array.from(event.target.files || [])
            .filter((file) => file.type.startsWith("image/") || file.type === "application/pdf")
            .slice(0, 3);
          setFiles(selected);
          setResult(null);
          setError(null);
          setImported(false);
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.drawingType}
          <select className="input" value={drawingType} onChange={(event) => setDrawingType(event.target.value as typeof drawingType)} style={{ fontSize: 12 }}>
            <option value="floor_plan">{labels.drawingType}</option>
            <option value="mixed">{labels.mixed}</option>
            <option value="elevation">{labels.elevation}</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.floor}
          <input className="input" value={floorLabel} onChange={(event) => setFloorLabel(event.target.value)} style={{ fontSize: 12 }} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.width}
          <input className="input" inputMode="decimal" value={width} onChange={(event) => setWidth(event.target.value)} placeholder="9.2" style={{ fontSize: 12 }} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.depth}
          <input className="input" inputMode="decimal" value={depth} onChange={(event) => setDepth(event.target.value)} placeholder="7.4" style={{ fontSize: 12 }} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.area}
          <input className="input" inputMode="decimal" value={area} onChange={(event) => setArea(event.target.value)} placeholder={buildingInfo?.area_m2 ? String(buildingInfo.area_m2) : "68"} style={{ fontSize: 12 }} />
        </label>
        <label style={{ display: "grid", gap: 4, fontSize: 11, color: "var(--text-secondary)" }}>
          {labels.scale}
          <input className="input" value={scaleText} onChange={(event) => setScaleText(event.target.value)} placeholder="1:100" style={{ fontSize: 12 }} />
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
        disabled={files.length === 0 || loading}
        onClick={() => { void analyze(); }}
        style={{ width: "100%", marginTop: 10, fontSize: 12, opacity: files.length === 0 || loading ? 0.55 : 1 }}
      >
        {loading ? labels.analyzing : labels.analyze}
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
              {labels.rangeLabel}
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
              {projectName || result.project_name} · {formatNumber(result.drawing_context.floor_area_m2, locale)} m2 · {labels.scaleSource}: {result.drawing_context.scale_source}
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            <div style={{ padding: 8, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)" }}>
              <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 3 }}>{labels.rooms}</div>
              <strong>{result.rooms.length}</strong>
            </div>
            <div style={{ padding: 8, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)" }}>
              <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 3 }}>{labels.openings}</div>
              <strong>{result.drawing_context.door_count}/{result.drawing_context.window_count}</strong>
            </div>
            <div style={{ padding: 8, border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", background: "var(--bg-secondary)" }}>
              <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 3 }}>{labels.materialRows}</div>
              <strong>{result.bom_suggestions.length}</strong>
            </div>
          </div>

          <div>
            <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 6 }}>
              {labels.detected}
            </div>
            <TakeoffOverlay result={result} />
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
              {result.assumptions.slice(0, 3).map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={importableItems.length === 0 || !onImportBom || imported}
            onClick={importTakeoff}
            style={{ width: "100%", fontSize: 12 }}
          >
            {imported ? labels.importedShort : renderTemplate(labels.import, { count: importableItems.length })}
          </button>
        </div>
      )}
    </section>
  );
}
