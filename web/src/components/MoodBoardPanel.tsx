"use client";

import { useMemo, useRef, useState, type ChangeEvent, type PointerEvent } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import type { Material, MoodBoardItem, MoodBoardState } from "@/types";

interface MoodBoardPanelProps {
  board?: MoodBoardState | null;
  materials: Material[];
  bomMaterialIds: Set<string>;
  onChange: (board: MoodBoardState) => void;
  onAddMaterialToBom: (materialId: string) => void;
}

interface DragState {
  ids: string[];
  startX: number;
  startY: number;
  origins: Record<string, { x: number; y: number }>;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getPrimaryPrice(material: Material): NonNullable<Material["pricing"]>[number] | null {
  return material.pricing?.find((price) => price.is_primary) ?? material.pricing?.[0] ?? null;
}

function getUnitPrice(material?: Material | null): number {
  if (!material) return 0;
  return Number(getPrimaryPrice(material)?.unit_price ?? 0);
}

function getMaterialName(material: Material, locale: string): string {
  if (locale === "fi") return material.name_fi || material.name;
  if (locale === "en") return material.name_en || material.name;
  return material.name;
}

function materialSwatch(material: Material): string {
  const albedo = material.visual_albedo;
  if (Array.isArray(albedo) && albedo.length >= 3) {
    const [r, g, b] = albedo.map((value) => Math.max(0, Math.min(255, Math.round(Number(value) * 255))));
    return `rgb(${r}, ${g}, ${b})`;
  }
  const palette = ["#8b6f47", "#c49058", "#4a5568", "#4a8b7f", "#718096", "#cbd5e0", "#d6a15d"];
  const seed = Array.from(material.category_name || material.name).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return palette[seed % palette.length];
}

function formatCurrency(amount: number, locale: string): string {
  return `${Math.round(amount).toLocaleString(locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB")} EUR`;
}

function nextPosition(items: MoodBoardItem[]) {
  const index = items.length;
  return {
    x: 24 + (index % 4) * 34,
    y: 24 + Math.floor(index / 4) * 34,
  };
}

function copyFor(locale: string) {
  if (locale === "fi") {
    return {
      code: "Koodi",
      mood: "Tunnelma",
      title: "Tunnelmataulu",
      subtitle: "Kerää materiaalit, värit, kuvat ja muistiinpanot samaan ostoa edeltävään näkymään.",
      addMaterial: "+ Materiaali",
      addPhoto: "+ Kuva",
      addColor: "+ Väri",
      addNote: "+ Muistiinpano",
      removeSelected: "Poista valitut",
      materialPlaceholder: "Valitse materiaali",
      colorValue: "Värin hex-arvo",
      roughTotal: "Materiaalien karkea summa",
      selected: "valittu",
      emptyTitle: "Lisää materiaaleja ja inspiraatiokuvia",
      emptyBody: "Aloita materiaalikortilla, värillä, kuvalla tai vapaalla muistiinpanolla.",
      addToBom: "Lisää BOMiin",
      inBom: "BOMissa",
      notePlaceholder: "Kirjoita tyyli, huoli tai päätös...",
      dragHint: "Vedä kortteja vapaasti. Shift-klikkaus valitsee useita.",
    };
  }
  if (locale === "sv") {
    return {
      code: "Kod",
      mood: "Stämning",
      title: "Moodboard",
      subtitle: "Samla material, färger, bilder och anteckningar innan teknisk projektering.",
      addMaterial: "+ Material",
      addPhoto: "+ Foto",
      addColor: "+ Färg",
      addNote: "+ Anteckning",
      removeSelected: "Ta bort valda",
      materialPlaceholder: "Välj material",
      colorValue: "Färgens hexvärde",
      roughTotal: "Grov materialsumma",
      selected: "vald",
      emptyTitle: "Lägg till material och inspirationsbilder",
      emptyBody: "Börja med ett materialkort, en färg, en bild eller en fri anteckning.",
      addToBom: "Lägg till i BOM",
      inBom: "I BOM",
      notePlaceholder: "Skriv stil, risk eller beslut...",
      dragHint: "Dra korten fritt. Shift-klick väljer flera.",
    };
  }
  return {
    code: "Code",
    mood: "Mood",
    title: "Mood board",
    subtitle: "Collect materials, colors, photos, and notes before the technical design hardens.",
    addMaterial: "+ Material",
    addPhoto: "+ Photo",
    addColor: "+ Color",
    addNote: "+ Note",
    removeSelected: "Remove selected",
    materialPlaceholder: "Choose material",
    colorValue: "Color hex value",
    roughTotal: "Rough material total",
    selected: "selected",
    emptyTitle: "Add materials and inspiration photos",
    emptyBody: "Start with a material card, color chip, photo, or free-form note.",
    addToBom: "Add to BOM",
    inBom: "In BOM",
    notePlaceholder: "Write style, concern, or decision...",
    dragHint: "Drag cards freely. Shift-click selects several.",
  };
}

export default function MoodBoardPanel({
  board,
  materials,
  bomMaterialIds,
  onChange,
  onAddMaterialToBom,
}: MoodBoardPanelProps) {
  const { locale } = useTranslation();
  const copy = copyFor(locale);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [drag, setDrag] = useState<DragState | null>(null);
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [color, setColor] = useState("#d6a15d");
  const items = board?.items ?? [];
  const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
  const materialTotal = items.reduce((sum, item) => {
    if (item.type !== "material") return sum;
    return sum + getUnitPrice(materialById.get(item.material_id));
  }, 0);

  function updateItems(updater: (current: MoodBoardItem[]) => MoodBoardItem[]) {
    onChange({
      items: updater(items),
      updated_at: new Date().toISOString(),
    });
  }

  function addMaterial() {
    const selectedMaterialId = materialId || materials[0]?.id;
    if (!selectedMaterialId) return;
    const position = nextPosition(items);
    updateItems((current) => [
      ...current,
      {
        id: createId("material"),
        type: "material",
        material_id: selectedMaterialId,
        x: position.x,
        y: position.y,
        width: 142,
        height: 166,
      },
    ]);
  }

  function addColor() {
    const position = nextPosition(items);
    updateItems((current) => [
      ...current,
      {
        id: createId("color"),
        type: "color",
        color,
        title: color.toUpperCase(),
        x: position.x,
        y: position.y,
        width: 96,
        height: 96,
      },
    ]);
  }

  function addNote() {
    const position = nextPosition(items);
    updateItems((current) => [
      ...current,
      {
        id: createId("note"),
        type: "note",
        text: "",
        x: position.x,
        y: position.y,
        width: 210,
        height: 132,
      },
    ]);
  }

  function addPhoto(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const src = typeof reader.result === "string" ? reader.result : "";
      if (!src) return;
      const position = nextPosition(items);
      updateItems((current) => [
        ...current,
        {
          id: createId("photo"),
          type: "photo",
          src,
          file_name: file.name,
          title: file.name,
          x: position.x,
          y: position.y,
          width: 180,
          height: 132,
        },
      ]);
    };
    reader.readAsDataURL(file);
  }

  function removeSelected() {
    if (selectedIds.size === 0) return;
    updateItems((current) => current.filter((item) => !selectedIds.has(item.id)));
    setSelectedIds(new Set());
  }

  function selectItem(itemId: string, additive: boolean) {
    setSelectedIds((current) => {
      const next = additive ? new Set(current) : new Set<string>();
      if (additive && next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function beginDrag(event: PointerEvent<HTMLElement>, item: MoodBoardItem) {
    const target = event.target as HTMLElement;
    if (target.closest("button,input,textarea,select,a")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const alreadySelected = selectedIds.has(item.id);
    const ids = alreadySelected ? Array.from(selectedIds) : [item.id];
    if (!alreadySelected) setSelectedIds(new Set([item.id]));
    setDrag({
      ids,
      startX: event.clientX,
      startY: event.clientY,
      origins: Object.fromEntries(items.filter((candidate) => ids.includes(candidate.id)).map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }])),
    });
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    updateItems((current) => current.map((item) => {
      const origin = drag.origins[item.id];
      if (!origin) return item;
      return {
        ...item,
        x: Math.max(0, origin.x + dx),
        y: Math.max(0, origin.y + dy),
      };
    }));
  }

  function endDrag(event: PointerEvent<HTMLElement>) {
    if (drag) event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(null);
  }

  function updateNote(id: string, text: string) {
    updateItems((current) => current.map((item) => (item.id === id && item.type === "note" ? { ...item, text } : item)));
  }

  function handlePhotoInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) addPhoto(file);
    event.target.value = "";
  }

  return (
    <section className="mood-board-panel anim-slide-l" aria-label={copy.title} data-testid="mood-board-panel">
      <div className="mood-board-header">
        <div>
          <div className="mood-board-tabs" role="tablist" aria-label={copy.title}>
            <span className="badge badge-muted" role="tab" aria-selected="false">{copy.code}</span>
            <span className="badge badge-amber" role="tab" aria-selected="true">{copy.mood}</span>
          </div>
          <h3>{copy.title}</h3>
          <p>{copy.subtitle}</p>
        </div>
        <div className="mood-board-total" aria-label={copy.roughTotal}>
          <span>{copy.roughTotal}</span>
          <strong>{formatCurrency(materialTotal, locale)}</strong>
        </div>
      </div>

      <div className="mood-board-toolbar" aria-label={copy.title}>
        <select value={materialId} onChange={(event) => setMaterialId(event.target.value)} aria-label={copy.materialPlaceholder}>
          {materials.slice(0, 80).map((material) => (
            <option key={material.id} value={material.id}>{getMaterialName(material, locale)}</option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost" onClick={addMaterial}>{copy.addMaterial}</button>
        <button type="button" className="btn btn-ghost" onClick={() => fileInputRef.current?.click()}>{copy.addPhoto}</button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handlePhotoInput} />
        <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label={copy.colorValue} />
        <button type="button" className="btn btn-ghost" onClick={addColor}>{copy.addColor}</button>
        <button type="button" className="btn btn-ghost" onClick={addNote}>{copy.addNote}</button>
        <button type="button" className="btn btn-ghost" onClick={removeSelected} disabled={selectedIds.size === 0}>
          {copy.removeSelected}
        </button>
      </div>

      <div className="mood-board-canvas" onClick={() => setSelectedIds(new Set())}>
        <div className="mood-board-hint">{copy.dragHint}</div>
        {items.length === 0 && (
          <div className="mood-board-empty">
            <strong>{copy.emptyTitle}</strong>
            <span>{copy.emptyBody}</span>
          </div>
        )}

        {items.map((item) => {
          const selected = selectedIds.has(item.id);
          const style = {
            left: item.x,
            top: item.y,
            width: item.width,
            minHeight: item.height,
          };
          return (
            <article
              key={item.id}
              className="mood-board-card"
              data-type={item.type}
              data-selected={selected}
              style={style}
              tabIndex={0}
              aria-label={`${item.type} ${selected ? copy.selected : ""}`}
              draggable={item.type === "material"}
              onDragStart={(event) => {
                if (item.type !== "material") return;
                event.dataTransfer.setData("application/x-helscoop-material-id", item.material_id);
                event.dataTransfer.effectAllowed = "copy";
              }}
              onClick={(event) => {
                event.stopPropagation();
                selectItem(item.id, event.shiftKey);
              }}
              onPointerDown={(event) => beginDrag(event, item)}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {item.type === "material" && (() => {
                const material = materialById.get(item.material_id);
                const price = getUnitPrice(material);
                return (
                  <>
                    <div
                      className="mood-board-swatch"
                      style={{ background: material ? materialSwatch(material) : "var(--bg-tertiary)" }}
                    >
                      {material?.image_url && <img src={material.image_url} alt="" />}
                    </div>
                    <strong>{material ? getMaterialName(material, locale) : item.material_id}</strong>
                    <span>{material?.category_name}</span>
                    <em>{formatCurrency(price, locale)}</em>
                    <button
                      type="button"
                      className="mood-board-bom-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        onAddMaterialToBom(item.material_id);
                      }}
                      disabled={bomMaterialIds.has(item.material_id)}
                    >
                      {bomMaterialIds.has(item.material_id) ? copy.inBom : copy.addToBom}
                    </button>
                  </>
                );
              })()}

              {item.type === "photo" && (
                <>
                  <img className="mood-board-photo" src={item.src} alt={item.title || item.file_name || "Mood board photo"} />
                  <span>{item.file_name || item.title}</span>
                </>
              )}

              {item.type === "color" && (
                <>
                  <div className="mood-board-color" style={{ background: item.color }} />
                  <strong>{item.color.toUpperCase()}</strong>
                </>
              )}

              {item.type === "note" && (
                <textarea
                  value={item.text}
                  onChange={(event) => updateNote(item.id, event.target.value)}
                  placeholder={copy.notePlaceholder}
                  aria-label={copy.notePlaceholder}
                />
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
