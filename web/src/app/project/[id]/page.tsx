"use client";

import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { api, hasAuthSession, setToken } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";
import { SkeletonProjectEditor } from "@/components/Skeleton";
import { useTranslation } from "@/components/LocaleProvider";
import SceneEditor from "@/components/SceneEditor";
import BomPanel, { matchSceneMaterial } from "@/components/BomPanel";
import EnergyDashboard from "@/components/EnergyDashboard";
import MoodBoardPanel from "@/components/MoodBoardPanel";
import MaterialPicker from "@/components/MaterialPicker";
import type { BomPriceOverride } from "@/components/BomSavingsPanel";
import ChatPanel from "@/components/ChatPanel";
import ReferencePhotosPanel from "@/components/ReferencePhotosPanel";
import CreditBalancePill from "@/components/CreditBalancePill";
import MobileEditorTabs, { type MobileEditorSwipeDirection } from "@/components/MobileEditorTabs";
import SceneParamsPanel from "@/components/SceneParamsPanel";
import SceneApiReference from "@/components/SceneApiReference";
import SharePresentationPanel from "@/components/SharePresentationPanel";
import BeforeAfterSharePanel from "@/components/BeforeAfterSharePanel";
import ArCameraOverlay, { type ArModification } from "@/components/ArCameraOverlay";
import ScenarioRenderPanel from "@/components/ScenarioRenderPanel";
import ProjectVersionPanel from "@/components/ProjectVersionPanel";
import LayerPanel from "@/components/LayerPanel";
import NeighborhoodInsightsPanel from "@/components/NeighborhoodInsightsPanel";
import AssemblyGuidePanel from "@/components/AssemblyGuidePanel";
import ConstructionTimelapsePanel from "@/components/ConstructionTimelapsePanel";
import GuidedRenovationWizard from "@/components/GuidedRenovationWizard";
import TaloyhtioPanel from "@/components/TaloyhtioPanel";
import { parseSceneParams, applyParamToScript } from "@/lib/scene-interpreter";
import {
  getAssemblyProgressStorageKey,
  readAssemblyProgressFromStorage,
  writeAssemblyProgressToStorage,
} from "@/lib/assembly-progress-storage";
import {
  analyzeSceneGeometry,
  suggestGeometryBomUpdates,
  type GeometryBomSuggestion,
  type SceneGeometryMetrics,
} from "@/lib/scene-geometry-bom";
import { replaceSceneMaterialReferences } from "@/lib/scene-materials";
import { safeGetLocalStorageItem, safeSetLocalStorageItem } from "@/lib/browser-storage";
import { copyTextToClipboard } from "@/lib/clipboard";
import { countSceneAddCalls } from "@/lib/scene-a11y";
import {
  calculateSurfaceAnnualHeatLossKwh,
  calculateThermalLoss,
  checkCodeCompliance,
  CLIMATE_LOCATIONS,
  estimateBomAreaM2,
  getComplianceSummary,
  getHeatLossRating,
  heatFluxToColor,
  type SurfaceThermalData,
} from "@/lib/thermal-engine";
import { analyzeAirflow } from "@/lib/airflow-engine";
import type { BomImportMode } from "@/lib/bom-import";
import { estimateRenovationRoi } from "@/lib/renovation-roi";
import { formatRenovationCompareCurrency, summarizeRenovationComparison } from "@/lib/renovation-compare";
import KeyboardShortcutsHelp from "@/components/KeyboardShortcutsHelp";
import CommandPalette from "@/components/CommandPalette";
import type { Command } from "@/components/CommandPalette";
import OnboardingTour from "@/components/OnboardingTour";
import DaylightPanel, { type DaylightViewportShadowStudy } from "@/components/DaylightPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import ConfettiCelebration from "@/components/ConfettiCelebration";
import { generateAraGrantPdf, generateProposalPdf } from "@/lib/pdf";
import { useTheme } from "@/components/ThemeProvider";
import Link from "next/link";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useAnalytics, useEditorSession } from "@/hooks/useAnalytics";
import { useDraftRecovery } from "@/hooks/useDraftRecovery";
import { useAutoSave } from "@/hooks/useAutoSave";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useAmbientSound } from "@/hooks/useAmbientSound";
import {
  useProjectCollaboration,
  type CollaborationBomUpdateEvent,
  type CollaborationProjectUpdateEvent,
} from "@/hooks/useProjectCollaboration";
import type { SaveableFields } from "@/hooks/useAutoSave";
import type { KeyboardShortcut } from "@/hooks/useKeyboardShortcuts";
import SaveStatusIndicator from "@/components/SaveStatusIndicator";
import EditorStatusBar from "@/components/EditorStatusBar";
import type { SaveStatus } from "@/components/SaveStatusIndicator";
import type { Material, BomItem, Project, ProjectVersionSnapshot, ProjectPriceChangeSummary, ProjectImage, MoodBoardState, SharePreviewState } from "@/types";
import type { PhotoOverlayState } from "@/types";
import type { GuidedRenovationPlan, RenovationWizardState, WizardStepId } from "@/lib/renovation-wizard";
import type { ViewportAssemblyGuideState, ViewportCameraState, ViewportMaterialSelection, ViewportPresentationApi } from "@/components/Viewport3D";
import type { PresentationPresetId } from "@/lib/presentation-export";
import { shortcutLabel } from "@/lib/shortcut-label";
import ConfidenceBadge from "@/components/ConfidenceBadge";
import PriceSummaryBar from "@/components/PriceSummaryBar";
import type { DataProvenance } from "@/lib/confidence";
import { buildSceneLayers, type LayerSeed } from "@/lib/scene-layers";
import { buildAssemblyGuide, getAssemblyViewportState, type AssemblyGuideSpeed } from "@/lib/assembly-guide";
import { buildConstructionTimelapse, type TimelapseCameraMode, type TimelapseSpeed } from "@/lib/construction-timelapse";
import {
  PHOTO_OVERLAY_DEFAULTS,
  composePhotoOverlayExport,
  normalizePhotoOverlayState,
  readPhotoOverlayFile,
} from "@/lib/photo-overlay";

/** Parse a validation warning key like "validation.typoDetected:scene" into
 *  an i18n key and parameters, then resolve via the translation function. */
function formatWarning(raw: string, t: (key: string, params?: Record<string, string | number>) => string): string {
  const colonIdx = raw.indexOf(":");
  if (colonIdx === -1) return t(raw);
  const key = raw.substring(0, colonIdx);
  const rest = raw.substring(colonIdx + 1);

  // Different keys use different param names
  if (key === "validation.unmatchedCloser" || key === "validation.unmatchedOpener") {
    const [char, line] = rest.split(":");
    return t(key, { char, line });
  }
  if (key === "validation.typoDetected") {
    return t(key, { name: rest });
  }
  if (key === "validation.undefinedIdentifier") {
    return t(key, { name: rest });
  }
  if (key === "validation.tooManyObjects") {
    return t(key, { count: rest });
  }
  if (key === "validation.farFromOrigin") {
    return t(key, { distance: rest });
  }
  if (key === "validation.invalidDimension") {
    return t(key, { geometry: rest });
  }
  if (key === "validation.highTriCount" || key === "validation.unmaterialized" || key === "validation.highObjectCount") {
    return t(key, { count: rest });
  }
  return t(key);
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable;
}

function Viewport3DLoading() {
  const { t } = useTranslation();
  return (
    <div style={{ width: "100%", height: "100%", background: "var(--bg-secondary)", borderRadius: "var(--radius-md)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, overflow: "hidden", position: "relative" }}>
      <div className="skeleton" style={{ position: "absolute", inset: 0, opacity: 0.3 }} />
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
      <span style={{ color: "var(--text-muted)", fontSize: 12, position: "relative" }}>{t('editor.loading3D')}</span>
    </div>
  );
}

const Viewport3D = dynamic(() => import("@/components/Viewport3D"), {
  ssr: false,
  loading: () => <Viewport3DLoading />,
});

const DEFAULT_SCENE = `// Helscoop Scene Script
// Available: box(w,h,d), cylinder(r,h), sphere(r)
// Transforms: translate(mesh, x,y,z), rotate(mesh, rx,ry,rz)
// Boolean: union(a,b), subtract(a,b), intersect(a,b)
// Output: scene.add(mesh, {material: "name", color: [r,g,b]})

const floor = box(6, 0.2, 4);
const wall1 = translate(box(6, 2.8, 0.15), 0, 1.5, -1.925);
const wall2 = translate(box(6, 2.8, 0.15), 0, 1.5, 1.925);
const wall3 = translate(box(0.15, 2.8, 4), -2.925, 1.5, 0);
const wall4 = translate(box(0.15, 2.8, 4), 2.925, 1.5, 0);

scene.add(floor, { material: "foundation", color: [0.7, 0.7, 0.7] });
scene.add(wall1, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall2, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall3, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall4, { material: "lumber", color: [0.85, 0.75, 0.55] });
`;

const HISTORY_LIMIT = 50;
const MOBILE_EDITOR_QUERY = "(max-width: 768px)";

type MobileEditorPanel = "viewport" | "chat" | "mood" | "bom" | "code" | "params" | "docs";
type MobilePanelSize = "normal" | "expanded" | "minimized";

interface GeometryBomUpdateState {
  sceneJs: string;
  metrics: SceneGeometryMetrics;
  previousMetrics: SceneGeometryMetrics | null;
  suggestions: GeometryBomSuggestion[];
  skippedManual: GeometryBomSuggestion[];
}

type SceneAnnouncementKey =
  | "editor.sceneAppliedFromChat"
  | "editor.sceneUpdatedFromEditor"
  | "editor.sceneParameterChanged"
  | "editor.sceneDraftRestored"
  | "editor.sceneResetAnnounced"
  | "editor.sceneMaterialChanged"
  | "editor.sceneUndoAnnounced"
  | "editor.sceneRedoAnnounced"
  | "editor.sceneVersionRestored"
  | "editor.sceneSnippetInserted";

function getBomWidthBounds(): { min: number; max: number } {
  if (typeof window === "undefined") return { min: 260, max: 600 };
  const isTabletOrNarrow = window.innerWidth <= 1024;
  const min = isTabletOrNarrow ? 220 : 260;
  const max = isTabletOrNarrow
    ? Math.max(min, Math.min(430, Math.floor(window.innerWidth * 0.42)))
    : 600;
  return { min, max };
}

function clampBomWidth(width: number): number {
  const { min, max } = getBomWidthBounds();
  return Math.max(min, Math.min(max, width));
}

function clampCompareSplit(value: number): number {
  return Math.max(22, Math.min(78, value));
}

function buildBomItemFromMaterial(material: Material, quantity = 1): BomItem {
  const pricing = material.pricing?.find((price) => price.is_primary) || material.pricing?.[0];
  const unitPrice = Number(pricing?.unit_price ?? 0);

  return {
    material_id: material.id,
    material_name: material.name,
    category_name: material.category_name,
    image_url: material.image_url,
    quantity,
    unit: material.design_unit || pricing?.unit || "kpl",
    unit_price: unitPrice,
    total: unitPrice * quantity,
    supplier: pricing?.supplier_name,
    link: pricing?.link,
    in_stock: pricing?.in_stock,
    stock_level: pricing?.stock_level ?? "unknown",
    store_location: pricing?.store_location,
    stock_last_checked_at: pricing?.last_checked_at,
  };
}

function buildProjectVersionSnapshot(fields: {
  name: string;
  description: string;
  scene_js: string;
  bom: { material_id: string; quantity: number; unit: string }[];
}): ProjectVersionSnapshot {
  return {
    name: fields.name,
    description: fields.description,
    scene_js: fields.scene_js,
    bom: fields.bom.map((item) => ({
      material_id: item.material_id,
      quantity: item.quantity,
      unit: item.unit,
    })),
  };
}

function normalizeMoodBoardState(value: Project["mood_board"]): MoodBoardState {
  return value && Array.isArray(value.items) ? value : { items: [] };
}

function hydrateSnapshotBom(snapshot: ProjectVersionSnapshot, materials: Material[]): BomItem[] {
  return snapshot.bom.map((item) => {
    const material = materials.find((candidate) => candidate.id === item.material_id);
    if (!material) {
      return {
        material_id: item.material_id,
        material_name: item.material_id,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: 0,
        total: 0,
        stock_level: "unknown",
      };
    }
    const hydrated = buildBomItemFromMaterial(material, item.quantity);
    return {
      ...hydrated,
      unit: item.unit || hydrated.unit,
      total: (hydrated.unit_price || 0) * item.quantity,
    };
  });
}

function formatGeometryNumber(value: number, unit: string, locale: string): string {
  return `${value.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", {
    maximumFractionDigits: value >= 10 ? 1 : 2,
  })} ${unit}`;
}

function formatGeometryMetricChange(update: GeometryBomUpdateState, locale: string): string {
  const previous = update.previousMetrics;
  if (!previous) {
    return locale === "fi"
      ? `Seinäalaa ${formatGeometryNumber(update.metrics.wallAreaM2, "m²", locale)}, kattoa ${formatGeometryNumber(update.metrics.roofAreaM2, "m²", locale)}`
      : `Wall area ${formatGeometryNumber(update.metrics.wallAreaM2, "m²", locale)}, roof ${formatGeometryNumber(update.metrics.roofAreaM2, "m²", locale)}`;
  }
  return locale === "fi"
    ? `Seinäala ${formatGeometryNumber(previous.wallAreaM2, "m²", locale)} → ${formatGeometryNumber(update.metrics.wallAreaM2, "m²", locale)}, katto ${formatGeometryNumber(previous.roofAreaM2, "m²", locale)} → ${formatGeometryNumber(update.metrics.roofAreaM2, "m²", locale)}`
    : `Wall area ${formatGeometryNumber(previous.wallAreaM2, "m²", locale)} → ${formatGeometryNumber(update.metrics.wallAreaM2, "m²", locale)}, roof ${formatGeometryNumber(previous.roofAreaM2, "m²", locale)} → ${formatGeometryNumber(update.metrics.roofAreaM2, "m²", locale)}`;
}

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const { toast } = useToast();
  const { t, locale } = useTranslation();
  const { toggle: toggleTheme, resolved: resolvedTheme } = useTheme();
  const { track } = useAnalytics();
  const { play: playSound } = useAmbientSound();
  const { markCodeEditor, markChat } = useEditorSession();
  const isMobileEditor = useMediaQuery(MOBILE_EDITOR_QUERY);

  const [project, setProject] = useState<Project | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [bom, setBom] = useState<BomItem[]>([]);
  const [moodBoard, setMoodBoard] = useState<MoodBoardState>({ items: [] });
  const [manualBomOverrideIds, setManualBomOverrideIds] = useState<Set<string>>(() => new Set());
  const [geometryBomUpdate, setGeometryBomUpdate] = useState<GeometryBomUpdateState | null>(null);
  const [surfacePickerMaterialId, setSurfacePickerMaterialId] = useState<string | null>(null);
  const [sceneJs, setSceneJs] = useState("");
  const [originalSceneJs, setOriginalSceneJs] = useState("");
  const [sceneA11yAnnouncement, setSceneA11yAnnouncement] = useState("");
  const [savedScript, setSavedScript] = useState("");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saveFailCount, setSaveFailCount] = useState(0);
  const [saveErrorVisible, setSaveErrorVisible] = useState(false);
  const [clipboardCopied, setClipboardCopied] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [projectName, setProjectName] = useState("");
  const previousNameRef = useRef("");
  const [projectDesc, setProjectDesc] = useState("");
  const collaborationClientIdRef = useRef<string | null>(null);
  const lastRemoteSceneRef = useRef<string | null>(null);
  const lastRemoteBomJsonRef = useRef<string | null>(null);
  const lastCollaborationToastRef = useRef(0);
  const [projectStatus, setProjectStatus] = useState<import("@/types").ProjectStatus>("planning");
  const [projectTags, setProjectTags] = useState<string[]>([]);
  const [householdDeductionJoint, setHouseholdDeductionJoint] = useState(false);
  const [paramPresets, setParamPresets] = useState<import("@/types").ParamPreset[]>([]);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const defaultParamsRef = useRef<Record<string, number>>({});
  const [showCode, setShowCode] = useState(false);
  const [editorMode, setEditorMode] = useState<"simple" | "advanced">("simple");
  const [showGuidedWizard, setShowGuidedWizard] = useState(false);
  const [showMoodBoard, setShowMoodBoard] = useState(false);
  const [showBom, setShowBom] = useState(true);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [showDocs, setShowDocs] = useState(false);
  const [showParams, setShowParams] = useState(true);
  const [showLayers, setShowLayers] = useState(false);
  const [showAssemblyGuide, setShowAssemblyGuide] = useState(false);
  const [assemblyStepIndex, setAssemblyStepIndex] = useState(0);
  const [assemblyCompletedStepIds, setAssemblyCompletedStepIds] = useState<Set<string>>(() => new Set());
  const [assemblyPlaying, setAssemblyPlaying] = useState(false);
  const [assemblySpeed, setAssemblySpeed] = useState<AssemblyGuideSpeed>(1);
  const [assemblyProgressLoaded, setAssemblyProgressLoaded] = useState(false);
  const [showConstructionTimelapse, setShowConstructionTimelapse] = useState(false);
  const [timelapsePlaying, setTimelapsePlaying] = useState(false);
  const [timelapseSpeed, setTimelapseSpeed] = useState<TimelapseSpeed>(1);
  const [timelapseCameraMode, setTimelapseCameraMode] = useState<TimelapseCameraMode>("orbit");
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showVersionPanel, setShowVersionPanel] = useState(false);
  const [showEnergyDashboard, setShowEnergyDashboard] = useState(false);
  const [showNeighborhoodInsights, setShowNeighborhoodInsights] = useState(false);
  const [showDaylightPanel, setShowDaylightPanel] = useState(false);
  const [photoOverlay, setPhotoOverlay] = useState<PhotoOverlayState | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const compareDragging = useRef(false);
  const [sunDirection, setSunDirection] = useState<[number, number, number] | undefined>();
  const [sunAltitude, setSunAltitude] = useState<number | undefined>();
  const [daylightShadowStudy, setDaylightShadowStudy] = useState<DaylightViewportShadowStudy | null>(null);
  const [activeVersionBranchId, setActiveVersionBranchId] = useState<string | null>(null);
  const [activeMobilePanel, setActiveMobilePanel] = useState<MobileEditorPanel>("viewport");
  const [mobilePanelSize, setMobilePanelSize] = useState<MobilePanelSize>("normal");
  const [exportingFormat, setExportingFormat] = useState<"pdf" | "proposal" | "csv" | "json" | "ara" | "ifc" | "permit" | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showAraChecklist, setShowAraChecklist] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareExpiresAt, setShareExpiresAt] = useState<string | null>(null);
  const [sharePreview, setSharePreview] = useState<SharePreviewState | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [isPublicGalleryProject, setIsPublicGalleryProject] = useState(false);
  const [publishLoading, setPublishLoading] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [renovationCompareMode, setRenovationCompareMode] = useState(false);
  const [renovationCompareSplit, setRenovationCompareSplit] = useState(50);
  const [renovationCompareCamera, setRenovationCompareCamera] = useState<ViewportCameraState | null>(null);
  const renovationCompareRef = useRef<HTMLDivElement>(null);
  const renovationCompareDragging = useRef(false);
  const [thermalView, setThermalView] = useState(false);
  const [thermalLocationIndex, setThermalLocationIndex] = useState(0);
  const [thermalInsideTemp, setThermalInsideTemp] = useState(21);
  const [thermalOutsideTemp, setThermalOutsideTemp] = useState(CLIMATE_LOCATIONS[0]?.designTemp ?? -26);
  const [thermalInspection, setThermalInspection] = useState<{
    materialId: string;
    objectId?: string;
    clientX?: number;
    clientY?: number;
  } | null>(null);
  const [airflowView, setAirflowView] = useState(false);
  const [airflowParticleDensity, setAirflowParticleDensity] = useState(500);
  const [airflowSpeed, setAirflowSpeed] = useState(1);
  const [airflowShowArrows, setAirflowShowArrows] = useState(true);
  const [airflowWindSpeed, setAirflowWindSpeed] = useState(4);
  const [airflowWindDirection, setAirflowWindDirection] = useState(225);
  const [lightingPreset, setLightingPreset] = useState<import("@/components/Viewport3D").LightingPresetId>("default");
  const [showLightingMenu, setShowLightingMenu] = useState(false);
  const [showScenarioRenderPanel, setShowScenarioRenderPanel] = useState(false);
  const [showArOverlay, setShowArOverlay] = useState(false);
  const [scenarioRenderToken, setScenarioRenderToken] = useState(0);
  const lightingMenuRef = useRef<HTMLDivElement>(null);
  const [viewportMeasurementMode, setViewportMeasurementMode] = useState(false);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [hiddenLayerIds, setHiddenLayerIds] = useState<Set<string>>(() => new Set());
  const [lockedLayerIds, setLockedLayerIds] = useState<Set<string>>(() => new Set());
  const [renderedLayers, setRenderedLayers] = useState<LayerSeed[]>([]);
  const [priceChangeSummary, setPriceChangeSummary] = useState<ProjectPriceChangeSummary | null>(null);
  const [explodedView, setExplodedView] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [bomWidth, setBomWidth] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = safeGetLocalStorageItem("helscoop_bom_width");
      if (saved) {
        const parsed = Number.parseInt(saved, 10);
        if (Number.isFinite(parsed)) return clampBomWidth(parsed);
      }
    }
    return 340;
  });
  const [objectCount, setObjectCount] = useState(0);
  const [sceneError, setSceneError] = useState<string | null>(null);
  const [sceneErrorLine, setSceneErrorLine] = useState<number | null>(null);
  const [viewportKey, setViewportKey] = useState(0);
  const [sceneWarnings, setSceneWarnings] = useState<string[]>([]);
  const [chatMessageCount, setChatMessageCount] = useState(0);
  const [projectImages, setProjectImages] = useState<ProjectImage[]>([]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const shareDialogRef = useRef<HTMLDivElement>(null);
  const araDialogRef = useRef<HTMLDivElement>(null);

  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const pendingSceneAnnouncementRef = useRef<SceneAnnouncementKey | null>(null);

  const initialLoadDoneRef = useRef(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const captureThumbRef = useRef<(() => string | null) | null>(null);
  const presentationRef = useRef<ViewportPresentationApi | null>(null);
  const focusObjectRef = useRef<((objectId: string) => void) | null>(null);
  const resizingRef = useRef(false);
  const activeVersionBranchRef = useRef<string | null>(null);
  const geometryBaselineRef = useRef<{ sceneJs: string; metrics: SceneGeometryMetrics } | null>(null);
  const dismissedGeometrySceneRef = useRef<string | null>(null);

  const photoOverlayUrl = photoOverlay?.data_url ?? null;
  const photoOverlayOpacity = photoOverlay?.opacity ?? PHOTO_OVERLAY_DEFAULTS.opacity;
  const photoCompareMode = photoOverlay?.compare_mode ?? PHOTO_OVERLAY_DEFAULTS.compare_mode;
  const photoComparePos = photoOverlay?.compare_position ?? PHOTO_OVERLAY_DEFAULTS.compare_position;
  const photoOffsetX = photoOverlay?.offset_x ?? PHOTO_OVERLAY_DEFAULTS.offset_x;
  const photoOffsetY = photoOverlay?.offset_y ?? PHOTO_OVERLAY_DEFAULTS.offset_y;
  const photoScale = photoOverlay?.scale ?? PHOTO_OVERLAY_DEFAULTS.scale;
  const photoRotation = photoOverlay?.rotation ?? PHOTO_OVERLAY_DEFAULTS.rotation;
  const renovationBaselineSceneJs = originalSceneJs || sceneJs || DEFAULT_SCENE;
  const renovationCompareSummary = useMemo(() => summarizeRenovationComparison(bom, 0), [bom]);
  const compareCurrentCostLabel = formatRenovationCompareCurrency(renovationCompareSummary.currentEstimatedValue, locale);
  const compareRenovationCostLabel = formatRenovationCompareCurrency(renovationCompareSummary.renovationCost, locale);
  const compareNewValueLabel = formatRenovationCompareCurrency(renovationCompareSummary.newTotalValue, locale);

  const handleRenovationCompareCamera = useCallback((state: ViewportCameraState) => {
    setRenovationCompareCamera((current) => {
      if (
        current
        && current.position.every((value, index) => Math.abs(value - state.position[index]) < 0.001)
        && current.target.every((value, index) => Math.abs(value - state.target[index]) < 0.001)
      ) {
        return current;
      }
      return state;
    });
  }, []);

  const updateRenovationCompareSplit = useCallback((clientX: number, clientY: number) => {
    const container = renovationCompareRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const vertical = rect.width < 720;
    const raw = vertical
      ? ((clientY - rect.top) / rect.height) * 100
      : ((clientX - rect.left) / rect.width) * 100;
    setRenovationCompareSplit(clampCompareSplit(raw));
  }, []);

  const toggleRenovationCompareMode = useCallback(() => {
    setRenovationCompareCamera(null);
    setRenovationCompareMode((current) => !current);
  }, []);

  const triggerScenarioRender = useCallback(() => {
    setShowScenarioRenderPanel(true);
    setScenarioRenderToken((token) => token + 1);
  }, []);

  const updatePhotoOverlay = useCallback((patch: Partial<PhotoOverlayState>) => {
    setPhotoOverlay((current) => {
      if (!current) return current;
      return {
        ...current,
        ...patch,
        updated_at: new Date().toISOString(),
      };
    });
  }, []);

  const handlePhotoOverlayFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const next = await readPhotoOverlayFile(file);
      setPhotoOverlay(next);
      toast(t("photoOverlay.uploaded"), "success");
      track("project_photo_overlay_uploaded", { file_type: file.type });
    } catch (err) {
      const message = err instanceof Error ? t(err.message) : t("photoOverlay.readFailed");
      toast(message, "error");
    }
  }, [t, toast, track]);

  const clearPhotoOverlay = useCallback(() => {
    setPhotoOverlay(null);
  }, []);

  const resetPhotoOverlayAlignment = useCallback(() => {
    updatePhotoOverlay({
      offset_x: PHOTO_OVERLAY_DEFAULTS.offset_x,
      offset_y: PHOTO_OVERLAY_DEFAULTS.offset_y,
      scale: PHOTO_OVERLAY_DEFAULTS.scale,
      rotation: PHOTO_OVERLAY_DEFAULTS.rotation,
    });
  }, [updatePhotoOverlay]);

  const exportPhotoOverlayPng = useCallback(async () => {
    if (!photoOverlay) return;
    const modelFrame = presentationRef.current?.captureFrame({ watermark: false });
    if (!modelFrame) {
      toast(t("photoOverlay.exportFailed"), "error");
      return;
    }
    try {
      const dataUrl = await composePhotoOverlayExport(modelFrame, photoOverlay);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${projectName.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_-]/g, "_") || "helscoop"}_photo_overlay.png`;
      link.click();
      toast(t("photoOverlay.exported"), "success");
      track("project_exported", { format: "photo_overlay_png" });
      playSound("exportDone");
    } catch {
      toast(t("photoOverlay.exportFailed"), "error");
      playSound("error");
    }
  }, [photoOverlay, playSound, projectName, t, toast, track]);

  const queueSceneAnnouncement = useCallback((actionKey: SceneAnnouncementKey) => {
    pendingSceneAnnouncementRef.current = actionKey;
  }, []);

  useEffect(() => {
    const actionKey = pendingSceneAnnouncementRef.current;
    if (!actionKey) return;

    pendingSceneAnnouncementRef.current = null;
    const count = countSceneAddCalls(sceneJs);
    setSceneA11yAnnouncement(t("editor.sceneChangeAnnouncement", {
      action: t(actionKey),
      count,
      objects: count === 1 ? t("editor.objectSingular") : t("editor.objectPlural"),
    }));
  }, [sceneJs, t]);

  const pushHistory = useCallback((code: string) => {
    const history = historyRef.current;
    const idx = historyIndexRef.current;
    const newHistory = history.slice(0, idx + 1);
    newHistory.push(code);
    if (newHistory.length > HISTORY_LIMIT) {
      newHistory.shift();
    }
    historyRef.current = newHistory;
    historyIndexRef.current = newHistory.length - 1;
  }, []);

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  useEffect(() => {
    activeVersionBranchRef.current = activeVersionBranchId;
  }, [activeVersionBranchId]);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current -= 1;
      queueSceneAnnouncement("editor.sceneUndoAnnounced");
      setSceneJs(historyRef.current[historyIndexRef.current]);
      toast(t("shortcuts.undone"), "info");
    }
  }, [queueSceneAnnouncement, toast, t]);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current += 1;
      queueSceneAnnouncement("editor.sceneRedoAnnounced");
      setSceneJs(historyRef.current[historyIndexRef.current]);
      toast(t("shortcuts.redone"), "info");
    }
  }, [queueSceneAnnouncement, toast, t]);

  useEffect(() => {
    if (!hasAuthSession()) {
      router.push("/");
      return;
    }
    Promise.all([api.getProject(projectId), api.getMaterials()])
      .then(([proj, mats]) => {
        setProject(proj);
        setProjectName(proj.name);
        previousNameRef.current = proj.name;
        setProjectDesc(proj.description || "");
        setHouseholdDeductionJoint(Boolean(proj.household_deduction_joint));
        setProjectStatus(proj.status || "planning");
        setProjectTags(proj.tags || []);
        setIsPublicGalleryProject(Boolean(proj.is_public));
        if (proj.share_token) {
          setShareToken(proj.share_token);
          setShareExpiresAt(proj.share_token_expires_at ?? null);
        }
        setSharePreview(proj.share_preview ?? null);
        const initialPhotoOverlay = normalizePhotoOverlayState(proj.photo_overlay);
        const initialMoodBoard = normalizeMoodBoardState(proj.mood_board);
        setPhotoOverlay(initialPhotoOverlay);
        setMoodBoard(initialMoodBoard);
        setParamPresets(proj.param_presets || []);
        const initialScene = proj.scene_js || DEFAULT_SCENE;
        setOriginalSceneJs(proj.original_scene_js || initialScene);
        setSceneJs(initialScene);
        setSavedScript(initialScene);
        geometryBaselineRef.current = { sceneJs: initialScene, metrics: analyzeSceneGeometry(initialScene) };
        dismissedGeometrySceneRef.current = null;
        historyRef.current = [initialScene];
        historyIndexRef.current = 0;
        setMaterials(mats);
        const initialBom = proj.bom
          ? proj.bom.map((b: BomItem & { line_cost?: number }) => ({
              ...b,
              total: b.total ?? b.line_cost ?? ((b.unit_price || 0) * b.quantity),
            }))
          : [];
        setBom(initialBom);
        setManualBomOverrideIds(new Set());
        setGeometryBomUpdate(null);
        // Set the auto-save baseline to match what the server has
        setSavedSnapshot({
          name: proj.name,
          description: proj.description || "",
          scene_js: initialScene,
          bom: initialBom.map((b: BomItem) => ({
            material_id: b.material_id,
            quantity: b.quantity,
            unit: b.unit,
          })),
          photo_overlay: initialPhotoOverlay,
          mood_board: initialMoodBoard,
        });
        setTimeout(() => {
          initialLoadDoneRef.current = true;
          setInitialLoadDone(true);
        }, 0);
      })
      .catch((err) => {
        if (err.message?.includes("401") || err.message?.includes("authorization") || err.message?.includes("Session expired")) {
          setToken(null);
          router.push("/");
        } else {
          toast(err instanceof Error ? err.message : t('toast.loadProjectFailed'), "error");
          setLoadError(true);
        }
      });
  }, [projectId, router, toast, t]);

  useEffect(() => {
    if (!hasAuthSession()) return;
    let cancelled = false;
    api.getProjectImages(projectId)
      .then((result) => {
        if (!cancelled) setProjectImages(result.images);
      })
      .catch(() => {
        if (!cancelled) setProjectImages([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!hasAuthSession()) return;
    let cancelled = false;
    api.getProjectPriceChange(projectId)
      .then((summary) => {
        if (!cancelled) setPriceChangeSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setPriceChangeSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Memoize the BOM in a save-friendly format to avoid unnecessary re-renders
  const bomForSave = useMemo(
    () => bom.map((b) => ({ material_id: b.material_id, quantity: b.quantity, unit: b.unit })),
    [bom]
  );

  const saveableFields = useMemo<SaveableFields>(
    () => ({
      name: projectName,
      description: projectDesc,
      scene_js: sceneJs,
      bom: bomForSave,
      photo_overlay: photoOverlay,
      mood_board: moodBoard,
    }),
    [projectName, projectDesc, sceneJs, bomForSave, photoOverlay, moodBoard]
  );
  const currentVersionSnapshot = useMemo(
    () => buildProjectVersionSnapshot({
      name: projectName,
      description: projectDesc,
      scene_js: sceneJs,
      bom: bomForSave,
    }),
    [bomForSave, projectDesc, projectName, sceneJs],
  );

  const autoSaveCallbacks = useMemo(
    () => ({
      onSaveProject: async (dirty: Partial<Pick<SaveableFields, "name" | "description" | "scene_js" | "photo_overlay">>) => {
        await api.updateProject(projectId, dirty, collaborationClientIdRef.current);
      },
      onSaveBom: async (items: SaveableFields["bom"]) => {
        await api.saveBOM(projectId, items, collaborationClientIdRef.current);
      },
      onSaveMoodBoard: async (nextMoodBoard: SaveableFields["mood_board"]) => {
        await api.saveMoodBoard(projectId, nextMoodBoard, collaborationClientIdRef.current);
      },
      onSaveThumbnail: async () => {
        const thumbDataUrl = captureThumbRef.current?.();
        if (thumbDataUrl) {
          await api.saveThumbnail(projectId, thumbDataUrl);
        }
      },
      onStatusChange: (status: "saved" | "saving" | "unsaved") => {
        setSaveStatus(status);
      },
      onSaveSuccess: (saved: SaveableFields) => {
        setSavedScript(saved.scene_js);
        setLastSaved(new Date().toLocaleTimeString());
        setSaveFailCount(0);
        setSaveErrorVisible(false);
        api.createProjectVersion(projectId, {
          snapshot: buildProjectVersionSnapshot(saved),
          branch_id: activeVersionBranchRef.current,
          event_type: "auto",
          thumbnail_url: captureThumbRef.current?.() ?? null,
        }).catch(() => {
          // Version history should not block core saving.
        });
        toast(t('toast.saved'), "success");
        playSound("save");
      },
      onSaveError: (err: unknown) => {
        setSaveStatus("error");
        toast(err instanceof Error ? err.message : t('toast.saveFailed'), "error");
        playSound("error");
        setSaveFailCount((c) => c + 1);
        setSaveErrorVisible(true);
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, toast, t]
  );

  const { saveNow: save, setSavedSnapshot } = useAutoSave(saveableFields, autoSaveCallbacks, {
    initialLoadDone,
    debounceMs: 2000,
    typingDebounceMs: 4000,
    rapidFireThresholdMs: 800,
  });

  const notifyCollaborationChange = useCallback((message: string) => {
    const now = Date.now();
    if (now - lastCollaborationToastRef.current < 5000) return;
    lastCollaborationToastRef.current = now;
    toast(message, "info");
  }, [toast]);

  const handleRemoteProjectUpdate = useCallback((event: CollaborationProjectUpdateEvent) => {
    const patch = event.patch;
    let nextName = projectName;
    let nextDescription = projectDesc;
    let nextScene = sceneJs;
    let nextPhotoOverlay = photoOverlay;

    if (typeof patch.name === "string") {
      nextName = patch.name;
      previousNameRef.current = patch.name;
      setProjectName(patch.name);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "description")) {
      nextDescription = typeof patch.description === "string" ? patch.description : "";
      setProjectDesc(nextDescription);
    }
    if (typeof patch.scene_js === "string" && patch.scene_js !== sceneJs) {
      nextScene = patch.scene_js;
      lastRemoteSceneRef.current = patch.scene_js;
      setSceneJs(patch.scene_js);
      setSavedScript(patch.scene_js);
      pushHistory(patch.scene_js);
      geometryBaselineRef.current = { sceneJs: patch.scene_js, metrics: analyzeSceneGeometry(patch.scene_js) };
      dismissedGeometrySceneRef.current = null;
      setSceneA11yAnnouncement(t("collaboration.remoteProjectUpdate", {
        name: event.sourceName || t("collaboration.someone"),
      }));
    }
    if (Object.prototype.hasOwnProperty.call(patch, "photo_overlay")) {
      nextPhotoOverlay = normalizePhotoOverlayState(patch.photo_overlay);
      setPhotoOverlay(nextPhotoOverlay);
    }

    setProject((current) => current ? {
      ...current,
      name: nextName,
      description: nextDescription,
      scene_js: nextScene,
      photo_overlay: nextPhotoOverlay,
    } : current);
    setSavedSnapshot({
      name: nextName,
      description: nextDescription,
      scene_js: nextScene,
      bom: bomForSave,
      photo_overlay: nextPhotoOverlay,
    });
    notifyCollaborationChange(t("collaboration.remoteProjectUpdate", {
      name: event.sourceName || t("collaboration.someone"),
    }));
  }, [
    bomForSave,
    notifyCollaborationChange,
    photoOverlay,
    projectDesc,
    projectName,
    pushHistory,
    sceneJs,
    setSavedSnapshot,
    t,
  ]);

  const handleRemoteBomUpdate = useCallback((event: CollaborationBomUpdateEvent) => {
    const nextBom = event.items.map((item) => {
      const material = materials.find((candidate) => candidate.id === item.material_id);
      if (!material) {
        return {
          material_id: item.material_id,
          material_name: item.material_id,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: 0,
          total: 0,
          stock_level: "unknown" as const,
        };
      }
      const hydrated = buildBomItemFromMaterial(material, item.quantity);
      return {
        ...hydrated,
        unit: item.unit || hydrated.unit,
        total: (hydrated.unit_price || 0) * item.quantity,
      };
    });
    lastRemoteBomJsonRef.current = JSON.stringify(event.items);
    setBom(nextBom);
    setSavedSnapshot({
      name: projectName,
      description: projectDesc,
      scene_js: sceneJs,
      bom: event.items,
      photo_overlay: photoOverlay,
    });
    notifyCollaborationChange(t("collaboration.remoteBomUpdate", {
      name: event.sourceName || t("collaboration.someone"),
    }));
  }, [
    materials,
    notifyCollaborationChange,
    photoOverlay,
    projectDesc,
    projectName,
    sceneJs,
    setSavedSnapshot,
    t,
  ]);

  const collaboration = useProjectCollaboration({
    projectId,
    enabled: initialLoadDone,
    shareToken,
    onProjectUpdate: handleRemoteProjectUpdate,
    onBomUpdate: handleRemoteBomUpdate,
  });
  const {
    clientId: collaborationClientId,
    peers: collaborationPeers,
    status: collaborationStatus,
    sendCursor: sendCollaborationCursor,
    sendSceneUpdate,
    sendBomUpdate,
  } = collaboration;

  useEffect(() => {
    collaborationClientIdRef.current = collaborationClientId;
  }, [collaborationClientId]);

  useEffect(() => {
    if (!initialLoadDone || collaborationStatus !== "connected") return;
    if (lastRemoteSceneRef.current === sceneJs) {
      lastRemoteSceneRef.current = null;
      return;
    }
    sendSceneUpdate(sceneJs);
  }, [collaborationStatus, initialLoadDone, sceneJs, sendSceneUpdate]);

  useEffect(() => {
    if (!initialLoadDone || collaborationStatus !== "connected") return;
    const bomJson = JSON.stringify(bomForSave);
    if (lastRemoteBomJsonRef.current === bomJson) {
      lastRemoteBomJsonRef.current = null;
      return;
    }
    sendBomUpdate(bomForSave);
  }, [bomForSave, collaborationStatus, initialLoadDone, sendBomUpdate]);

  const collaborationPresenceLabel = useMemo(() => {
    if (collaborationStatus === "connecting") return t("collaboration.connecting");
    if (collaborationStatus !== "connected") return t("collaboration.offline");
    if (collaborationPeers.length === 0) return t("collaboration.connectedSolo");
    if (collaborationPeers.length === 1) {
      return t("collaboration.alsoViewing", { name: collaborationPeers[0].name });
    }
    return t("collaboration.manyViewing", { count: collaborationPeers.length + 1 });
  }, [collaborationPeers, collaborationStatus, t]);

  // Block navigation when there are unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (saveStatus === "unsaved" || saveStatus === "saving" || saveStatus === "error" || chatMessageCount > 3) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [saveStatus, chatMessageCount]);

  // Intercept browser back button (popstate) when there are unsaved changes
  useEffect(() => {
    if (saveStatus !== "unsaved" && saveStatus !== "saving" && saveStatus !== "error") return;
    // Push a sentinel state so pressing back triggers popstate instead of leaving
    window.history.pushState({ helscoop_guard: true }, "");
    const handler = () => {
      if (window.confirm(t("editor.unsavedWarning"))) {
        // User confirmed — actually go back
        window.history.back();
      } else {
        // User cancelled — re-push sentinel to keep the guard active
        window.history.pushState({ helscoop_guard: true }, "");
      }
    };
    window.addEventListener("popstate", handler);
    return () => {
      window.removeEventListener("popstate", handler);
      // Clean up the sentinel state if the component unmounts normally
      if (window.history.state?.helscoop_guard) {
        window.history.back();
      }
    };
  }, [saveStatus, t]);

  useEffect(() => {
    if (!showExportMenu) return;
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-tour="export-btn"]')) setShowExportMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowExportMenu(false);
        const trigger = document.querySelector<HTMLElement>('[data-tour="export-btn"] button');
        trigger?.focus();
        return;
      }
      const menu = document.querySelector<HTMLElement>('[data-tour="export-btn"] [role="menu"]');
      if (!menu) return;
      const items = Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
      if (items.length === 0) return;
      const idx = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        items[(idx + 1) % items.length].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        items[(idx - 1 + items.length) % items.length].focus();
      }
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    requestAnimationFrame(() => {
      const firstItem = document.querySelector<HTMLElement>('[data-tour="export-btn"] [role="menuitem"]');
      firstItem?.focus();
    });
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [showExportMenu]);

  useEffect(() => {
    if (!showHeaderMenu) return;
    const close = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("[data-editor-mobile-actions]")) return;
      setShowHeaderMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowHeaderMenu(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [showHeaderMenu]);

  useEffect(() => {
    if (!showLightingMenu) return;
    const close = (e: MouseEvent) => {
      if (lightingMenuRef.current?.contains(e.target as Node)) return;
      setShowLightingMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowLightingMenu(false);
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [showLightingMenu]);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = bomWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      const next = clampBomWidth(startWidth + delta);
      setBomWidth(next);
    };
    const onUp = () => {
      resizingRef.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setBomWidth((w) => {
        safeSetLocalStorageItem("helscoop_bom_width", String(w));
        return w;
      });
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [bomWidth]);

  const startTouchResize = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.touches[0].clientX;
    const startWidth = bomWidth;
    const onMove = (ev: TouchEvent) => {
      if (ev.touches.length !== 1) return;
      const delta = startX - ev.touches[0].clientX;
      const next = clampBomWidth(startWidth + delta);
      setBomWidth(next);
    };
    const onEnd = () => {
      resizingRef.current = false;
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", onEnd);
      setBomWidth((w) => {
        safeSetLocalStorageItem("helscoop_bom_width", String(w));
        return w;
      });
    };
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onEnd);
    document.addEventListener("touchcancel", onEnd);
  }, [bomWidth]);

  const materialCategoryMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of materials) map[m.id] = m.category_name;
    return map;
  }, [materials]);

  const arModifications = useMemo<ArModification[]>(() => {
    const groups = new Map<string, ArModification>();
    const palette: Record<ArModification["kind"], string> = {
      wall: "rgba(228,182,92,0.34)",
      roof: "rgba(108,157,120,0.32)",
      ground: "rgba(92,145,228,0.26)",
      opening: "rgba(255,255,255,0.36)",
    };
    const classify = (text: string): ArModification["kind"] => {
      const lower = text.toLowerCase();
      if (/roof|katto|tak|tiili|pelti/.test(lower)) return "roof";
      if (/window|door|ikkuna|ovi/.test(lower)) return "opening";
      if (/terrace|deck|ground|piha|terassi|perustus/.test(lower)) return "ground";
      return "wall";
    };

    for (const item of bom) {
      const labelSource = item.category_name || item.material_name || item.material_id;
      const kind = classify(`${item.category_name || ""} ${item.material_name || ""} ${item.material_id}`);
      if (groups.has(kind)) continue;
      groups.set(kind, {
        id: kind,
        kind,
        color: palette[kind],
        label: labelSource,
      });
    }
    return Array.from(groups.values()).slice(0, 6);
  }, [bom]);

  const sceneParams = useMemo(() => parseSceneParams(sceneJs), [sceneJs]);

  const thermalBomAreaItems = useMemo(
    () => bom.map((item) => ({ material_id: item.material_id, quantity: item.quantity, unit: item.unit })),
    [bom],
  );

  const thermalData = useMemo(() => {
    if (!thermalView || materials.length === 0) return undefined;
    const location = CLIMATE_LOCATIONS[thermalLocationIndex] ?? CLIMATE_LOCATIONS[0];
    const result = calculateThermalLoss(materials, {
      insideTemp: thermalInsideTemp,
      outsideTemp: thermalOutsideTemp,
      surfaceRInside: 0.13,
      surfaceROutside: 0.04,
    });
    const colorMap = new Map<string, [number, number, number]>();
    result.surfaces.forEach((data) => {
      colorMap.set(data.materialId, heatFluxToColor(data.heatFluxDensity, result.minHeatFlux, result.maxHeatFlux));
    });
    const compliance = getComplianceSummary(result.surfaces);
    return { colorMap, compliance, location, result };
  }, [materials, thermalInsideTemp, thermalLocationIndex, thermalOutsideTemp, thermalView]);
  const sceneLayers = useMemo(() => buildSceneLayers(renderedLayers, bom), [bom, renderedLayers]);
  const assemblyGuide = useMemo(() => buildAssemblyGuide(sceneLayers, bom, materials), [bom, materials, sceneLayers]);
  const constructionTimelapsePlan = useMemo(() => buildConstructionTimelapse(assemblyGuide), [assemblyGuide]);
  const airflowAnalysis = useMemo(
    () => analyzeAirflow(sceneLayers, sceneParams, project?.building_info ?? null, {
      particleDensity: airflowParticleDensity,
      speedMultiplier: airflowSpeed,
      showArrows: airflowShowArrows,
      windSpeedMps: airflowWindSpeed,
      windDirectionDeg: airflowWindDirection,
    }),
    [
      airflowParticleDensity,
      airflowShowArrows,
      airflowSpeed,
      airflowWindDirection,
      airflowWindSpeed,
      project?.building_info,
      sceneLayers,
      sceneParams,
    ],
  );
  const constructionSequenceActive = showAssemblyGuide || showConstructionTimelapse;
  const assemblyStepSignature = useMemo(
    () => assemblyGuide.steps.map((step) => step.id).join("|"),
    [assemblyGuide.steps],
  );
  const assemblyViewportState = useMemo(
    () => constructionSequenceActive ? getAssemblyViewportState(assemblyGuide.steps, assemblyStepIndex) : null,
    [assemblyGuide.steps, assemblyStepIndex, constructionSequenceActive],
  );
  const assemblyViewportHiddenObjectIds = useMemo(
    () => assemblyViewportState ? new Set(assemblyViewportState.hiddenObjectIds) : hiddenLayerIds,
    [assemblyViewportState, hiddenLayerIds],
  );
  const activeTimelapseStep = constructionTimelapsePlan.steps[assemblyStepIndex] ?? constructionTimelapsePlan.steps[0] ?? null;
  const viewportAssemblyGuideState = useMemo<ViewportAssemblyGuideState | null>(
    () => assemblyViewportState
      ? {
        stepKey: assemblyViewportState.stepKey,
        completedObjectIds: assemblyViewportState.completedObjectIds,
        currentObjectIds: assemblyViewportState.currentObjectIds,
        ghostObjectIds: assemblyViewportState.ghostObjectIds,
      }
      : null,
    [assemblyViewportState],
  );
  const isAdvancedMode = editorMode === "advanced";

  const thermalColorMap = thermalData?.colorMap;
  const thermalInspectionDetails = useMemo(() => {
    if (!thermalView) return null;

    const layer = thermalInspection?.objectId
      ? sceneLayers.find((entry) => entry.id === thermalInspection.objectId)
      : selectedLayerId
        ? sceneLayers.find((entry) => entry.id === selectedLayerId)
        : null;
    const sceneMaterialId = thermalInspection?.materialId ?? layer?.materialId ?? null;
    if (!sceneMaterialId) return null;

    const matchedMaterial = materials.find((material) => material.id === sceneMaterialId)
      ?? matchSceneMaterial(sceneMaterialId, materials);
    const resolvedMaterialId = matchedMaterial?.id ?? sceneMaterialId;
    const data: SurfaceThermalData | undefined = thermalData?.result.surfaces.get(sceneMaterialId)
      ?? thermalData?.result.surfaces.get(resolvedMaterialId);
    const materialName = matchedMaterial
      ? locale === "fi"
        ? matchedMaterial.name_fi || matchedMaterial.name || matchedMaterial.id
        : matchedMaterial.name_en || matchedMaterial.name || matchedMaterial.id
      : sceneMaterialId;
    const areaM2 = data ? estimateBomAreaM2(data.materialId, thermalBomAreaItems) : 0;
    const annualHeatLossKwh = data && thermalData
      ? calculateSurfaceAnnualHeatLossKwh(data, areaM2, thermalData.location, thermalInsideTemp)
      : 0;
    const compliance = data ? checkCodeCompliance(data.category, data.uValue, data.materialId) : null;

    return {
      areaM2,
      annualHeatLossKwh,
      compliance,
      data,
      layerName: layer?.name ?? thermalInspection?.objectId ?? null,
      materialName,
      sceneMaterialId,
      rating: data ? getHeatLossRating(data.heatFluxDensity) : null,
    };
  }, [
    locale,
    materials,
    sceneLayers,
    selectedLayerId,
    thermalBomAreaItems,
    thermalData,
    thermalInspection,
    thermalInsideTemp,
    thermalView,
  ]);

  const renovationRoi = useMemo(
    () => estimateRenovationRoi(bom, materials, project?.building_info ?? null, { coupleMode: householdDeductionJoint }),
    [bom, householdDeductionJoint, materials, project?.building_info],
  );
  const manualOverrideKey = useMemo(
    () => Array.from(manualBomOverrideIds).sort().join("|"),
    [manualBomOverrideIds],
  );

  useEffect(() => {
    const nextIds = new Set(sceneLayers.map((layer) => layer.id));
    const hasSameMembers = (left: Set<string>, right: Set<string>) => left.size === right.size && Array.from(left).every((id) => right.has(id));

    setSelectedLayerId((current) => (current && nextIds.has(current) ? current : null));
    setHiddenLayerIds((current) => {
      const filtered = new Set(Array.from(current).filter((id) => nextIds.has(id)));
      return hasSameMembers(current, filtered) ? current : filtered;
    });
    setLockedLayerIds((current) => {
      const filtered = new Set(Array.from(current).filter((id) => nextIds.has(id)));
      return hasSameMembers(current, filtered) ? current : filtered;
    });
  }, [sceneLayers]);

  useEffect(() => {
    if (!showLayers) setSelectedLayerId(null);
  }, [showLayers]);

  useEffect(() => {
    if (!thermalView) setThermalInspection(null);
  }, [thermalView]);

  useEffect(() => {
    setAssemblyProgressLoaded(false);
    if (typeof window === "undefined") return;
    const validIds = new Set(assemblyGuide.steps.map((step) => step.id));
    const storageKey = getAssemblyProgressStorageKey(projectId);
    setAssemblyCompletedStepIds(readAssemblyProgressFromStorage(window.localStorage, storageKey, validIds));
    setAssemblyProgressLoaded(true);
  }, [assemblyStepSignature, assemblyGuide.steps, projectId]);

  useEffect(() => {
    if (!assemblyProgressLoaded || typeof window === "undefined") return;
    const storageKey = getAssemblyProgressStorageKey(projectId);
    writeAssemblyProgressToStorage(window.localStorage, storageKey, assemblyCompletedStepIds);
  }, [assemblyCompletedStepIds, assemblyProgressLoaded, projectId]);

  useEffect(() => {
    if (assemblyStepIndex < assemblyGuide.steps.length) return;
    setAssemblyStepIndex(Math.max(0, assemblyGuide.steps.length - 1));
  }, [assemblyGuide.steps.length, assemblyStepIndex]);

  useEffect(() => {
    if (showLayers) setSurfacePickerMaterialId(null);
  }, [showLayers]);

  useEffect(() => {
    if (!initialLoadDone) return;
    if (dismissedGeometrySceneRef.current === sceneJs) return;

    const timer = window.setTimeout(() => {
      const baseline = geometryBaselineRef.current;
      if (!baseline || baseline.sceneJs === sceneJs) {
        if (!baseline) {
          geometryBaselineRef.current = { sceneJs, metrics: analyzeSceneGeometry(sceneJs) };
        }
        return;
      }

      const result = suggestGeometryBomUpdates(sceneJs, bom, materials, manualBomOverrideIds);
      if (result.suggestions.length === 0 && result.skippedManual.length === 0) {
        geometryBaselineRef.current = { sceneJs, metrics: result.metrics };
        setGeometryBomUpdate(null);
        return;
      }

      setGeometryBomUpdate({
        sceneJs,
        metrics: result.metrics,
        previousMetrics: baseline.metrics,
        suggestions: result.suggestions,
        skippedManual: result.skippedManual,
      });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [bom, initialLoadDone, manualBomOverrideIds, manualOverrideKey, materials, sceneJs]);

  const handleParamChange = useCallback(
    (name: string, value: number) => {
      queueSceneAnnouncement("editor.sceneParameterChanged");
      setActivePreset(null);
      setSceneJs((prev) => {
        const updated = applyParamToScript(prev, name, value);
        pushHistory(updated);
        return updated;
      });
    },
    [pushHistory, queueSceneAnnouncement]
  );

  // Capture default param values on first parse
  useMemo(() => {
    if (sceneParams.length > 0 && Object.keys(defaultParamsRef.current).length === 0) {
      const defaults: Record<string, number> = {};
      for (const p of sceneParams) defaults[p.name] = p.value;
      defaultParamsRef.current = defaults;
    }
  }, [sceneParams]);

  const handleSavePreset = useCallback(
    (name: string, values: Record<string, number>) => {
      const updated = [...paramPresets.filter((p) => p.name !== name), { name, values }];
      setParamPresets(updated);
      setActivePreset(name);
      api.updateProject(projectId, { param_presets: updated });
    },
    [paramPresets, projectId],
  );

  const handleLoadPreset = useCallback(
    (preset: import("@/types").ParamPreset) => {
      setActivePreset(preset.name);
      setSceneJs((prev) => {
        let script = prev;
        for (const [paramName, value] of Object.entries(preset.values)) {
          script = applyParamToScript(script, paramName, value);
        }
        pushHistory(script);
        return script;
      });
    },
    [pushHistory],
  );

  const handleDeletePreset = useCallback(
    (name: string) => {
      const updated = paramPresets.filter((p) => p.name !== name);
      setParamPresets(updated);
      if (activePreset === name) setActivePreset(null);
      api.updateProject(projectId, { param_presets: updated });
    },
    [paramPresets, activePreset, projectId],
  );

  const handleResetDefaults = useCallback(() => {
    setActivePreset(null);
    const defaults = defaultParamsRef.current;
    if (Object.keys(defaults).length === 0) return;
    setSceneJs((prev) => {
      let script = prev;
      for (const [paramName, value] of Object.entries(defaults)) {
        script = applyParamToScript(script, paramName, value);
      }
      pushHistory(script);
      return script;
    });
  }, [pushHistory]);

  const handleSceneChange = useCallback(
    (code: string) => {
      queueSceneAnnouncement("editor.sceneUpdatedFromEditor");
      setSceneJs(code);
      pushHistory(code);
    },
    [pushHistory, queueSceneAnnouncement]
  );

  const handleRestoreDraft = useCallback(
    (draft: string) => {
      queueSceneAnnouncement("editor.sceneDraftRestored");
      setSceneJs(draft);
      pushHistory(draft);
    },
    [pushHistory, queueSceneAnnouncement]
  );

  const { hasDraft, restore: restoreDraft, discard: discardDraft, clearDraft } = useDraftRecovery(
    projectId,
    sceneJs,
    savedScript,
    handleRestoreDraft,
  );

  // Clear localStorage draft after successful save
  useEffect(() => {
    if (saveStatus === "saved" && savedScript) {
      clearDraft();
    }
  }, [saveStatus, savedScript, clearDraft]);

  const lastAiApplyRef = useRef<number>(0);

  const handleApplyCode = useCallback(
    (code: string) => {
      markChat();
      queueSceneAnnouncement("editor.sceneAppliedFromChat");
      lastAiApplyRef.current = Date.now();
      setSceneJs(code);
      pushHistory(code);
    },
    [pushHistory, markChat, queueSceneAnnouncement]
  );

  const handleEditorModeChange = useCallback((mode: "simple" | "advanced") => {
    setEditorMode(mode);
    track("editor_mode_changed", { mode });
    if (mode === "advanced") markCodeEditor();
  }, [markCodeEditor, track]);

  const handleBlueprintSceneApply = useCallback(
    (code: string) => {
      queueSceneAnnouncement("editor.sceneUpdatedFromEditor");
      setSceneJs(code);
      pushHistory(code);
      handleEditorModeChange("advanced");
      setShowCode(true);
      if (isMobileEditor) setActiveMobilePanel("code");
    },
    [handleEditorModeChange, isMobileEditor, pushHistory, queueSceneAnnouncement],
  );

  const applyGuidedPlan = useCallback(
    (plan: GuidedRenovationPlan, state: RenovationWizardState, advanced = false) => {
      track("renovation_wizard_completed", {
        source: "editor",
        renovation_type: state.renovationType,
        estimated_cost: plan.estimatedCost,
        bom_count: plan.bom.length,
      });
      queueSceneAnnouncement("editor.sceneUpdatedFromEditor");
      setProjectName(plan.name);
      previousNameRef.current = plan.name;
      setProjectDesc(plan.description);
      setSceneJs(plan.sceneJs);
      pushHistory(plan.sceneJs);
      setBom(plan.bom);
      setManualBomOverrideIds(new Set(plan.bom.map((item) => item.material_id)));
      setGeometryBomUpdate(null);
      setShowBom(true);
      setShowGuidedWizard(false);
      if (advanced) {
        handleEditorModeChange("advanced");
        setShowCode(true);
      } else {
        handleEditorModeChange("simple");
      }
      toast(locale === "fi" ? "Ohjattu suunnitelma otettu kayttoon" : "Guided plan applied", "success");
    },
    [handleEditorModeChange, locale, pushHistory, queueSceneAnnouncement, toast, track],
  );

  useEffect(() => {
    if (!sceneError || Date.now() - lastAiApplyRef.current > 3000) return;
    toast(t('editor.aiErrorRecovery'), "warning", {
      action: { label: t('editor.undo'), onClick: undo },
    });
  }, [sceneError, t, toast, undo]);

  const handleMobilePanelChange = useCallback(
    (panel: MobileEditorPanel) => {
      setActiveMobilePanel(panel);
      setMobilePanelSize(panel === "viewport" ? "minimized" : "normal");
      if (panel === "chat") markChat();
      if (panel === "bom") setShowBom(true);
      if (panel === "mood") {
        setShowMoodBoard(true);
        setShowCode(false);
      }
      if (panel === "code") {
        if (!showCode) markCodeEditor();
        setShowCode(true);
        setShowMoodBoard(false);
      }
      if (panel === "params") setShowParams(true);
      if (panel === "docs") setShowDocs(true);
    },
    [markChat, markCodeEditor, showCode]
  );

  const mobilePanelOrder = useMemo<MobileEditorPanel[]>(() => [
    "viewport",
    "chat",
    "mood",
    "bom",
    ...(isAdvancedMode ? (["code"] as MobileEditorPanel[]) : []),
    ...(isAdvancedMode && sceneParams.length > 0 ? (["params"] as MobileEditorPanel[]) : []),
    ...(isAdvancedMode && showDocs ? (["docs"] as MobileEditorPanel[]) : []),
  ], [isAdvancedMode, sceneParams.length, showDocs]);

  useEffect(() => {
    if (isAdvancedMode) return;
    setShowCode(false);
    setShowDocs(false);
    setShowParams(false);
    setShowLayers(false);
    if (activeMobilePanel === "code" || activeMobilePanel === "params" || activeMobilePanel === "docs") {
      setActiveMobilePanel("viewport");
    }
  }, [activeMobilePanel, isAdvancedMode]);

  const handleMobilePanelSwipe = useCallback((direction: MobileEditorSwipeDirection) => {
    if (direction === "up") {
      if (activeMobilePanel === "viewport") handleMobilePanelChange("chat");
      setMobilePanelSize("expanded");
      return;
    }

    if (direction === "down") {
      setMobilePanelSize((size) => (size === "expanded" ? "normal" : "minimized"));
      return;
    }

    const currentIndex = mobilePanelOrder.indexOf(activeMobilePanel);
    if (currentIndex === -1) return;
    const delta = direction === "left" ? 1 : -1;
    const nextIndex = Math.max(0, Math.min(mobilePanelOrder.length - 1, currentIndex + delta));
    const nextPanel = mobilePanelOrder[nextIndex];
    if (nextPanel && nextPanel !== activeMobilePanel) {
      handleMobilePanelChange(nextPanel);
    }
  }, [activeMobilePanel, handleMobilePanelChange, mobilePanelOrder]);

  const toggleCodePanel = useCallback(() => {
    if (!showCode) {
      setEditorMode("advanced");
      markCodeEditor();
    }
    setShowCode((visible) => {
      const next = !visible;
      if (isMobileEditor) setActiveMobilePanel(next ? "code" : "viewport");
      if (next) setShowMoodBoard(false);
      return next;
    });
  }, [isMobileEditor, markCodeEditor, showCode]);

  const toggleMoodBoardPanel = useCallback(() => {
    setShowMoodBoard((visible) => {
      const next = !visible;
      if (next) setShowCode(false);
      if (isMobileEditor) setActiveMobilePanel(next ? "mood" : "viewport");
      return next;
    });
  }, [isMobileEditor]);

  const toggleDocsPanel = useCallback(() => {
    setEditorMode("advanced");
    setShowDocs((visible) => {
      const next = !visible;
      if (isMobileEditor) setActiveMobilePanel(next ? "docs" : "viewport");
      return next;
    });
  }, [isMobileEditor]);

  const toggleParamsPanel = useCallback(() => {
    setEditorMode("advanced");
    setShowParams((visible) => {
      const next = !visible;
      if (isMobileEditor) setActiveMobilePanel(next ? "params" : "viewport");
      return next;
    });
  }, [isMobileEditor]);

  const toggleLayersPanel = useCallback(() => {
    if (isMobileEditor) return;
    setShowLayers((visible) => {
      const next = !visible;
      if (next) {
        setShowAssemblyGuide(false);
        setShowConstructionTimelapse(false);
        setTimelapsePlaying(false);
      }
      return next;
    });
  }, [isMobileEditor]);

  const focusAssemblyStep = useCallback((index: number) => {
    const step = assemblyGuide.steps[index];
    const layerId = step?.layerIds[0];
    if (!layerId) return;
    setSelectedLayerId(layerId);
    window.setTimeout(() => focusObjectRef.current?.(layerId), 0);
  }, [assemblyGuide.steps]);

  const selectAssemblyStep = useCallback((index: number) => {
    if (assemblyGuide.steps.length === 0) return;
    const nextIndex = Math.min(Math.max(index, 0), assemblyGuide.steps.length - 1);
    setAssemblyStepIndex(nextIndex);
    focusAssemblyStep(nextIndex);
  }, [assemblyGuide.steps.length, focusAssemblyStep]);

  const toggleAssemblyGuide = useCallback(() => {
    if (isMobileEditor) return;
    setEditorMode("advanced");
    setShowAssemblyGuide((visible) => {
      const next = !visible;
      if (next) {
        setShowLayers(false);
        setShowConstructionTimelapse(false);
        setTimelapsePlaying(false);
        setAssemblyPlaying(false);
        window.setTimeout(() => focusAssemblyStep(assemblyStepIndex), 0);
      }
      return next;
    });
  }, [assemblyStepIndex, focusAssemblyStep, isMobileEditor]);

  const focusTimelapseStep = useCallback((index: number) => {
    const step = assemblyGuide.steps[index];
    const layerId = step?.layerIds[0];
    if (layerId) setSelectedLayerId(layerId);

    if (timelapseCameraMode === "follow") {
      focusAssemblyStep(index);
      return;
    }

    const orbitPresets: PresentationPresetId[] = ["front", "side", "iso", "aerial"];
    const cinematicPresets: PresentationPresetId[] = ["front", "iso", "side", "aerial", "iso"];
    const presets = timelapseCameraMode === "cinematic" ? cinematicPresets : orbitPresets;
    presentationRef.current?.focusPreset(presets[index % presets.length]);
  }, [assemblyGuide.steps, focusAssemblyStep, timelapseCameraMode]);

  const selectTimelapseStep = useCallback((index: number) => {
    if (assemblyGuide.steps.length === 0) return;
    const nextIndex = Math.min(Math.max(index, 0), assemblyGuide.steps.length - 1);
    setAssemblyStepIndex(nextIndex);
    focusTimelapseStep(nextIndex);
  }, [assemblyGuide.steps.length, focusTimelapseStep]);

  const toggleConstructionTimelapse = useCallback((playImmediately = false) => {
    if (isMobileEditor) return;
    setEditorMode("advanced");
    setShowConstructionTimelapse((visible) => {
      const next = !visible || playImmediately;
      if (next) {
        setShowLayers(false);
        setShowAssemblyGuide(false);
        setAssemblyPlaying(false);
        if (playImmediately) setTimelapsePlaying(true);
        window.setTimeout(() => focusTimelapseStep(assemblyStepIndex), 0);
      } else {
        setTimelapsePlaying(false);
      }
      return next;
    });
  }, [assemblyStepIndex, focusTimelapseStep, isMobileEditor]);

  const toggleAssemblyStepComplete = useCallback((stepId: string) => {
    setAssemblyCompletedStepIds((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!showAssemblyGuide || !assemblyPlaying || assemblyGuide.steps.length === 0) return;
    if (assemblyStepIndex >= assemblyGuide.steps.length - 1) {
      setAssemblyPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      selectAssemblyStep(assemblyStepIndex + 1);
    }, 3600 / assemblySpeed);
    return () => window.clearTimeout(timer);
  }, [assemblyGuide.steps.length, assemblyPlaying, assemblySpeed, assemblyStepIndex, selectAssemblyStep, showAssemblyGuide]);

  useEffect(() => {
    if (!showConstructionTimelapse || !timelapsePlaying || constructionTimelapsePlan.steps.length === 0) return;
    if (assemblyStepIndex >= constructionTimelapsePlan.steps.length - 1) {
      setTimelapsePlaying(false);
      return;
    }
    const current = constructionTimelapsePlan.steps[assemblyStepIndex];
    const delay = Math.max(350, ((current?.durationSeconds ?? 3) * 1000) / timelapseSpeed);
    const timer = window.setTimeout(() => {
      selectTimelapseStep(assemblyStepIndex + 1);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [
    assemblyStepIndex,
    constructionTimelapsePlan.steps,
    selectTimelapseStep,
    showConstructionTimelapse,
    timelapsePlaying,
    timelapseSpeed,
  ]);

  useEffect(() => {
    if (!showAssemblyGuide) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectAssemblyStep(assemblyStepIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        selectAssemblyStep(assemblyStepIndex + 1);
      } else if (event.key === " ") {
        event.preventDefault();
        setAssemblyPlaying((playing) => !playing);
      } else if (event.key.toLowerCase() === "c") {
        const step = assemblyGuide.steps[assemblyStepIndex];
        if (step) {
          event.preventDefault();
          toggleAssemblyStepComplete(step.id);
        }
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        focusAssemblyStep(assemblyStepIndex);
      } else if (event.key === "Home") {
        event.preventDefault();
        selectAssemblyStep(0);
      } else if (event.key === "End") {
        event.preventDefault();
        selectAssemblyStep(assemblyGuide.steps.length - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [assemblyGuide.steps, assemblyStepIndex, focusAssemblyStep, selectAssemblyStep, showAssemblyGuide, toggleAssemblyStepComplete]);

  useEffect(() => {
    if (!showConstructionTimelapse) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectTimelapseStep(assemblyStepIndex - 1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        selectTimelapseStep(assemblyStepIndex + 1);
      } else if (event.key === " ") {
        event.preventDefault();
        setTimelapsePlaying((playing) => !playing);
      } else if (event.key.toLowerCase() === "p") {
        event.preventDefault();
        setTimelapsePlaying((playing) => !playing);
      } else if (event.key === "Home") {
        event.preventDefault();
        selectTimelapseStep(0);
      } else if (event.key === "End") {
        event.preventDefault();
        selectTimelapseStep(constructionTimelapsePlan.steps.length - 1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [assemblyStepIndex, constructionTimelapsePlan.steps.length, selectTimelapseStep, showConstructionTimelapse]);

  const duplicateProject = useCallback(async () => {
    setShowHeaderMenu(false);
    setDuplicating(true);
    try {
      const dup = await api.duplicateProject(projectId);
      toast(t('toast.projectDuplicated'), "success");
      router.push(`/project/${dup.id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : t('toast.duplicateFailed'), "error");
    } finally {
      setDuplicating(false);
    }
  }, [projectId, router, t, toast]);

  const togglePublicGalleryProject = useCallback(async (nextPublic: boolean) => {
    setPublishLoading(true);
    try {
      const result = await api.publishProject(projectId, nextPublic);
      setIsPublicGalleryProject(result.is_public);
      setShareToken(result.share_token);
      setShareExpiresAt(result.share_token_expires_at);
      setProject((current) => current ? {
        ...current,
        is_public: result.is_public,
        published_at: result.published_at,
        gallery_status: result.gallery_status,
        share_token: result.share_token,
        share_token_expires_at: result.share_token_expires_at,
      } : current);
      toast(nextPublic ? t("toast.projectPublished") : t("toast.projectUnpublished"), "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("toast.publishFailed"), "error");
    } finally {
      setPublishLoading(false);
    }
  }, [projectId, t, toast]);

  const handleVersionRestored = useCallback(
    ({ snapshot }: { snapshot: ProjectVersionSnapshot; project?: unknown }) => {
      const restoredBom = hydrateSnapshotBom(snapshot, materials);
      queueSceneAnnouncement("editor.sceneVersionRestored");
      setProjectName(snapshot.name);
      previousNameRef.current = snapshot.name;
      setProjectDesc(snapshot.description || "");
      setSceneJs(snapshot.scene_js || DEFAULT_SCENE);
      setSavedScript(snapshot.scene_js || DEFAULT_SCENE);
      setBom(restoredBom);
      geometryBaselineRef.current = {
        sceneJs: snapshot.scene_js || DEFAULT_SCENE,
        metrics: analyzeSceneGeometry(snapshot.scene_js || DEFAULT_SCENE),
      };
      dismissedGeometrySceneRef.current = null;
      setManualBomOverrideIds(new Set());
      setGeometryBomUpdate(null);
      setProject((prev) => prev ? {
        ...prev,
        name: snapshot.name,
        description: snapshot.description,
        scene_js: snapshot.scene_js,
        bom: restoredBom,
      } : prev);
      setSavedSnapshot({
        name: snapshot.name,
        description: snapshot.description || "",
        scene_js: snapshot.scene_js || DEFAULT_SCENE,
        bom: snapshot.bom,
        photo_overlay: photoOverlay,
        mood_board: moodBoard,
      });
      pushHistory(snapshot.scene_js || DEFAULT_SCENE);
      setViewportKey((key) => key + 1);
      toast(t("versions.restoreSuccess"), "success");
    },
    [materials, moodBoard, photoOverlay, pushHistory, queueSceneAnnouncement, setSavedSnapshot, t, toast],
  );

  useEffect(() => {
    if (!isMobileEditor) {
      setBomWidth((width) => clampBomWidth(width));
      setMobilePanelSize("normal");
      return;
    }
    if ((activeMobilePanel === "code" && !showCode) ||
      (activeMobilePanel === "mood" && !showMoodBoard) ||
      (activeMobilePanel === "params" && !showParams) ||
      (activeMobilePanel === "docs" && !showDocs)) {
      setActiveMobilePanel("viewport");
    }
  }, [activeMobilePanel, isMobileEditor, showCode, showDocs, showMoodBoard, showParams]);

  /* ── Keyboard shortcuts ──────────────────────────────────────── */
  const closeAllPanels = useCallback(() => {
    setShowCode(false);
    setShowMoodBoard(false);
    setShowShortcutsHelp(false);
    setShowExportMenu(false);
    setShowHeaderMenu(false);
    setShowDocs(false);
    setShowLayers(false);
    setShowAssemblyGuide(false);
    setAssemblyPlaying(false);
    setShowConstructionTimelapse(false);
    setTimelapsePlaying(false);
    if (isMobileEditor) setActiveMobilePanel("viewport");
  }, [isMobileEditor]);

  const shortcuts = useMemo<KeyboardShortcut[]>(() => [
    {
      key: "Cmd+S",
      mod: true,
      code: "s",
      action: save,
      descriptionKey: "shortcuts.save",
    },
    {
      key: "Cmd+B",
      mod: true,
      code: "b",
      action: () => setShowBom((v) => !v),
      descriptionKey: "shortcuts.toggleBom",
    },
    {
      key: "Cmd+K",
      mod: true,
      code: "k",
      action: () => setShowCommandPalette((v) => !v),
      descriptionKey: "shortcuts.commandPalette",
    },
    {
      key: "Cmd+Enter",
      mod: true,
      code: "Enter",
      action: () => {
        handleApplyCode(sceneJs);
      },
      descriptionKey: "shortcuts.applyCode",
    },
    {
      key: "Escape",
      mod: false,
      code: "Escape",
      action: closeAllPanels,
      descriptionKey: "shortcuts.closePanel",
    },
    {
      key: "Cmd+/",
      mod: true,
      code: "/",
      action: () => setShowShortcutsHelp((v) => !v),
      descriptionKey: "shortcuts.showShortcuts",
    },
    {
      key: "Cmd+Z",
      mod: true,
      code: "z",
      action: undo,
      descriptionKey: "shortcuts.undo",
    },
    {
      key: "Cmd+Shift+Z",
      mod: true,
      shift: true,
      code: "z",
      action: redo,
      descriptionKey: "shortcuts.redo",
    },
    {
      key: "W",
      mod: false,
      code: "w",
      action: () => setWireframe((v) => !v),
      descriptionKey: "shortcuts.wireframe",
    },
    {
      key: "T",
      mod: false,
      code: "t",
      action: () => setThermalView((v) => !v),
      descriptionKey: "shortcuts.thermal",
    },
    {
      key: "V",
      mod: false,
      code: "v",
      action: () => setAirflowView((v) => !v),
      descriptionKey: "shortcuts.airflow",
    },
    {
      key: "E",
      mod: false,
      code: "e",
      action: () => setExplodedView((v) => !v),
      descriptionKey: "shortcuts.explode",
    },
    {
      key: "A",
      mod: false,
      code: "a",
      action: toggleAssemblyGuide,
      descriptionKey: "shortcuts.assemblyGuide",
    },
    {
      key: "P",
      mod: false,
      code: "p",
      action: () => {
        if (!showConstructionTimelapse) toggleConstructionTimelapse(true);
      },
      descriptionKey: "shortcuts.constructionTimelapse",
    },
    {
      key: "E",
      mod: false,
      code: "e",
      action: () => setShowCode((v) => !v),
      descriptionKey: "shortcuts.toggleCode",
    },
    {
      key: "D",
      mod: false,
      code: "d",
      action: () => setShowDocs((v) => !v),
      descriptionKey: "shortcuts.toggleDocs",
    },
  ], [save, handleApplyCode, sceneJs, closeAllPanels, undo, redo, toggleAssemblyGuide, showConstructionTimelapse, toggleConstructionTimelapse]);

  useKeyboardShortcuts(shortcuts);

  const closeShareDialog = useCallback(() => setShowShareDialog(false), []);
  useFocusTrap(shareDialogRef, showShareDialog && !!shareToken, closeShareDialog);

  const closeAraChecklist = useCallback(() => setShowAraChecklist(false), []);
  useFocusTrap(araDialogRef, showAraChecklist, closeAraChecklist);

  const araChecklistItems = useMemo(
    () => locale === "fi"
      ? [
          "Omistusoikeuden todistus tai taloyhtiön päätös",
          "Henkilö-/Y-tunnus ja hakijan yhteystiedot",
          "Virallinen energiatodistus tai energiaselvitys",
          "Urakoitsijan tarjoukset ja aikataulu",
          "Rakennus- tai toimenpideluvat, jos hanke vaatii ne",
          "Valokuvat nykytilanteesta ennen työn aloitusta",
        ]
      : [
          "Proof of ownership or housing-company decision",
          "Applicant tax ID and contact details",
          "Official energy certificate or energy report",
          "Contractor quotes and schedule",
          "Building/action permits if the project requires them",
          "Before-work photos of current conditions",
        ],
    [locale]
  );

  const exportQuotePdf = useCallback(async () => {
    setShowExportMenu(false);
    setExportingFormat("pdf");
    try {
      await save();
      track("bom_exported", { format: "pdf" });
      await api.exportPdf(projectId, projectName, locale);
      toast(t("toast.bomExported"), "success");
      playSound("exportDone");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("toast.bomExportFailed"), "error");
    } finally {
      setExportingFormat(null);
    }
  }, [locale, projectId, projectName, save, t, toast, track]);

  const exportProposalPdf = useCallback(async () => {
    setShowExportMenu(false);
    setExportingFormat("proposal");
    try {
      await save();
      const sceneImage = presentationRef.current?.captureFrame({
        presetId: "iso",
        width: 1600,
        height: 900,
        watermark: false,
      }) ?? captureThumbRef.current?.() ?? project?.thumbnail_url ?? null;
      track("project_exported", { format: "proposal_pdf" });
      generateProposalPdf({
        projectName,
        projectDescription: projectDesc,
        bom,
        locale,
        buildingInfo: project?.building_info,
        sceneJs,
        sceneImage,
        beforeImage: photoOverlay?.data_url ?? null,
        householdDeductionJoint,
      });
      toast(t("proposal.generated"), "success");
      playSound("exportDone");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("proposal.generateFailed"), "error");
      playSound("error");
    } finally {
      setExportingFormat(null);
    }
  }, [bom, householdDeductionJoint, locale, photoOverlay, playSound, project?.building_info, project?.thumbnail_url, projectDesc, projectName, save, sceneJs, t, toast, track]);

  const exportAraGrantPackage = useCallback(() => {
    setShowAraChecklist(false);
    setShowExportMenu(false);
    setExportingFormat("ara");
    try {
      track("project_exported", { format: "ara_grant_package" });
      generateAraGrantPdf({
        projectName,
        projectDescription: projectDesc,
        bom,
        locale,
        buildingInfo: project?.building_info,
        sceneJs,
        sceneImage: captureThumbRef.current?.() ?? project?.thumbnail_url,
        manualChecklist: araChecklistItems,
      });
      toast(locale === "fi" ? "ARA-avustuspaketti viety" : "ARA grant package exported", "success");
      playSound("exportDone");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("toast.bomExportFailed"), "error");
    } finally {
      setExportingFormat(null);
    }
  }, [araChecklistItems, bom, locale, project?.building_info, project?.thumbnail_url, projectDesc, projectName, sceneJs, t, toast, track]);

  const exportIfcPermitModel = useCallback(async () => {
    setShowExportMenu(false);
    setExportingFormat("ifc");
    try {
      track("project_exported", { format: "ifc4x3_permit" });
      await api.exportIFC(projectId, projectName);
      toast(t("ifcExport.generated"), "success");
      playSound("exportDone");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("ifcExport.generateFailed"), "error");
    } finally {
      setExportingFormat(null);
    }
  }, [playSound, projectId, projectName, t, toast, track]);

  const exportPermitPack = useCallback(async () => {
    setShowExportMenu(false);
    setExportingFormat("permit");
    try {
      track("project_exported", { format: "permit_pack_zip" });
      await api.exportPermitPack(projectId, projectName);
      toast(t("permitPack.generated"), "success");
      playSound("exportDone");
    } catch (err) {
      toast(err instanceof Error ? err.message : t("permitPack.generateFailed"), "error");
    } finally {
      setExportingFormat(null);
    }
  }, [playSound, projectId, projectName, t, toast, track]);

  type ViewportDomApi = HTMLDivElement & {
    resetCamera?: () => void;
    toggleMeasurementMode?: () => void;
  };

  const getViewportApi = useCallback(() => {
    const container = viewportRef.current;
    return (
      container?.querySelector(".renovation-compare-pane--planned [role='application']")
      ?? container?.querySelector("[role='application']")
    ) as ViewportDomApi | null;
  }, []);

  const resetViewportCamera = useCallback(() => {
    getViewportApi()?.resetCamera?.();
  }, [getViewportApi]);

  const toggleViewportMeasurementMode = useCallback(() => {
    getViewportApi()?.toggleMeasurementMode?.();
  }, [getViewportApi]);

  /* ── Command palette commands ───────────────────────────── */
  const paletteCommands = useMemo<Command[]>(() => {
    const icon = (d: string) => (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    );

    return [
      {
        id: "toggle-wireframe",
        labelKey: "commandPalette.toggleWireframe",
        labelSecondaryKey: "commandPalette.toggleWireframeEn",
        icon: icon("M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"),
        action: () => setWireframe((v) => !v),
        isActive: wireframe,
      },
      {
        id: "toggle-renovation-compare",
        labelKey: "commandPalette.toggleCompare",
        labelSecondaryKey: "commandPalette.toggleCompareEn",
        icon: icon("M12 3v18M4 6h16M4 18h16"),
        action: toggleRenovationCompareMode,
        isActive: renovationCompareMode,
      },
      {
        id: "render-scenario",
        labelKey: "editor.renderScenario",
        labelSecondaryKey: "editor.renderScenario",
        icon: icon("M4 4h16v10H4zM8 18h8M10 14l-2 4M14 14l2 4"),
        action: triggerScenarioRender,
        isActive: showScenarioRenderPanel,
      },
      {
        id: "toggle-airflow",
        labelKey: "commandPalette.toggleAirflow",
        labelSecondaryKey: "commandPalette.toggleAirflowEn",
        shortcut: "V",
        icon: icon("M4 12c3-4 7 4 10 0 2-3 5 1 6 3M3 6c4-4 9 4 13 0M5 18c2-2 5 2 8 0"),
        action: () => setAirflowView((value) => !value),
        isActive: airflowView,
      },
      {
        id: "toggle-assembly-guide",
        labelKey: "commandPalette.toggleAssemblyGuide",
        labelSecondaryKey: "commandPalette.toggleAssemblyGuideEn",
        shortcut: "A",
        icon: icon("M4 19V7l8-4 8 4v12l-8 4-8-4zM4 7l8 4 8-4M12 11v12"),
        action: toggleAssemblyGuide,
        isActive: showAssemblyGuide,
      },
      {
        id: "toggle-construction-timelapse",
        labelKey: "commandPalette.toggleTimelapse",
        labelSecondaryKey: "commandPalette.toggleTimelapseEn",
        shortcut: "P",
        icon: icon("M4 5h16M4 19h16M7 5v14M17 5v14M9 9l5 3-5 3V9z"),
        action: () => toggleConstructionTimelapse(false),
        isActive: showConstructionTimelapse,
      },
      {
        id: "reset-camera",
        labelKey: "commandPalette.resetCamera",
        labelSecondaryKey: "commandPalette.resetCameraEn",
        icon: icon("M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10"),
        action: resetViewportCamera,
      },
      {
        id: "toggle-ruler",
        labelKey: "commandPalette.toggleRuler",
        labelSecondaryKey: "commandPalette.toggleRulerEn",
        shortcut: "Cmd+M",
        icon: icon("M3 17L17 3l4 4L7 21l-4-4zM14 6l4 4M11 9l2 2M8 12l4 4M5 15l2 2"),
        action: toggleViewportMeasurementMode,
        isActive: viewportMeasurementMode,
      },
      {
        id: "toggle-code-editor",
        labelKey: "commandPalette.toggleCodeEditor",
        labelSecondaryKey: "commandPalette.toggleCodeEditorEn",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6" />
            <polyline points="8 6 2 12 8 18" />
          </svg>
        ),
        action: toggleCodePanel,
        isActive: showCode,
      },
      {
        id: "toggle-bom",
        labelKey: "commandPalette.toggleBom",
        labelSecondaryKey: "commandPalette.toggleBomEn",
        shortcut: "Cmd+B",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        ),
        action: () => setShowBom((v) => !v),
        isActive: showBom,
      },
      {
        id: "export-pdf",
        labelKey: "commandPalette.exportPdf",
        labelSecondaryKey: "commandPalette.exportPdfEn",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        ),
        action: () => { void exportQuotePdf(); },
      },
      {
        id: "export-proposal-pdf",
        labelKey: "commandPalette.exportProposal",
        labelSecondaryKey: "commandPalette.exportProposalEn",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16v16H4z" />
            <path d="M8 8h8M8 12h5M8 16h8" />
          </svg>
        ),
        action: () => { void exportProposalPdf(); },
      },
      {
        id: "export-ara-grant",
        labelKey: "commandPalette.exportAraGrant",
        labelSecondaryKey: "commandPalette.exportAraGrantEn",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 11l3 3L22 4" />
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
          </svg>
        ),
        action: () => setShowAraChecklist(true),
      },
      {
        id: "export-ifc-permit",
        labelKey: "commandPalette.exportIfcPermit",
        labelSecondaryKey: "commandPalette.exportIfcPermitEn",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7l9-4 9 4-9 4-9-4z" />
            <path d="M3 12l9 4 9-4" />
            <path d="M3 17l9 4 9-4" />
          </svg>
        ),
        action: () => { void exportIfcPermitModel(); },
      },
      {
        id: "export-permit-pack",
        labelKey: "commandPalette.exportPermitPack",
        labelSecondaryKey: "commandPalette.exportPermitPackEn",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" />
            <path d="M1 3h22v5H1z" />
            <path d="M10 12h4" />
          </svg>
        ),
        action: () => { void exportPermitPack(); },
      },
      {
        id: "export-project",
        labelKey: "commandPalette.exportProject",
        labelSecondaryKey: "commandPalette.exportProjectEn",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        ),
        action: () => {
          try {
            track("project_exported", { format: "helscoop" });
            const exportData = {
              version: 1,
              name: projectName,
              description: projectDesc,
              scene_js: sceneJs,
              original_scene_js: renovationBaselineSceneJs,
              bom: bom.map((b) => ({
                material_id: b.material_id,
                material_name: b.material_name,
                quantity: b.quantity,
                unit: b.unit,
                unit_price: b.unit_price,
                total: b.total,
                link: b.link,
                in_stock: b.in_stock,
                stock_level: b.stock_level,
                store_location: b.store_location,
                stock_last_checked_at: b.stock_last_checked_at,
              })),
              exportedAt: new Date().toISOString(),
            };
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${projectName.replace(/\s+/g, '_')}.helscoop`;
            a.click();
            URL.revokeObjectURL(url);
            toast(t("toast.projectExported"), "success");
            playSound("exportDone");
          } catch (err) {
            toast(err instanceof Error ? err.message : t("toast.projectExportFailed"), "error");
          }
        },
      },
      {
        id: "share-project",
        labelKey: "commandPalette.shareProject",
        labelSecondaryKey: "commandPalette.shareProjectEn",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
        ),
        action: async () => {
          if (!shareToken) {
            setShareLoading(true);
            try {
              const res = await api.shareProject(projectId);
              setShareToken(res.share_token);
              setShareExpiresAt(res.expires_at ?? null);
            } catch (err) {
              toast(err instanceof Error ? err.message : t("toast.shareFailed"), "error");
              setShareLoading(false);
              return;
            }
            setShareLoading(false);
          }
          setShowShareDialog(true);
        },
      },
      {
        id: "toggle-theme",
        labelKey: "commandPalette.toggleTheme",
        labelSecondaryKey: "commandPalette.toggleThemeEn",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        ),
        action: toggleTheme,
        isActive: resolvedTheme === "dark",
      },
      {
        id: "show-shortcuts",
        labelKey: "commandPalette.showShortcuts",
        labelSecondaryKey: "commandPalette.showShortcutsEn",
        shortcut: "Cmd+/",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <line x1="6" y1="8" x2="6.01" y2="8" />
            <line x1="10" y1="8" x2="10.01" y2="8" />
            <line x1="14" y1="8" x2="14.01" y2="8" />
            <line x1="18" y1="8" x2="18.01" y2="8" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        ),
        action: () => setShowShortcutsHelp(true),
      },
      {
        id: "save",
        labelKey: "commandPalette.save",
        labelSecondaryKey: "commandPalette.saveEn",
        shortcut: "Cmd+S",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            <polyline points="17 21 17 13 7 13 7 21" />
            <polyline points="7 3 7 8 15 8" />
          </svg>
        ),
        action: save,
      },
      {
        id: "show-docs",
        labelKey: "commandPalette.showDocs",
        labelSecondaryKey: "commandPalette.showDocsEn",
        icon: (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        ),
        action: toggleDocsPanel,
        isActive: isAdvancedMode && showDocs,
      },
    ];
  }, [save, toast, t, track, locale, projectName, projectDesc, bom, projectId, shareToken, toggleTheme, showCode, toggleCodePanel, wireframe, renovationCompareMode, showAssemblyGuide, showConstructionTimelapse, showBom, showDocs, isAdvancedMode, resolvedTheme, exportIfcPermitModel, exportPermitPack, exportProposalPdf, exportQuotePdf, resetViewportCamera, toggleAssemblyGuide, toggleConstructionTimelapse, toggleRenovationCompareMode, toggleViewportMeasurementMode, viewportMeasurementMode, toggleDocsPanel, renovationBaselineSceneJs, showScenarioRenderPanel, triggerScenarioRender, airflowView]);

  const handleViewportReset = useCallback(() => {
    queueSceneAnnouncement("editor.sceneResetAnnounced");
    setSceneJs(DEFAULT_SCENE);
    pushHistory(DEFAULT_SCENE);
    setSceneError(null);
    setSceneErrorLine(null);
    setViewportKey((k) => k + 1);
  }, [pushHistory, queueSceneAnnouncement]);

  const addBomItem = useCallback(
    (materialId: string, quantity: number) => {
      const mat = materials.find((m) => m.id === materialId);
      if (!mat) return;
      const pricing = mat.pricing?.find((p) => p.is_primary) || mat.pricing?.[0];

      track("bom_item_added", { material_id: materialId, category: mat.category_name || "" });
      playSound("bomAdd");
      setBom((prev) => [
        ...prev,
        {
          material_id: materialId,
          material_name: mat.name,
          image_url: mat.image_url,
          quantity,
          unit: pricing?.unit || "kpl",
          unit_price: pricing?.unit_price || 0,
          total: (pricing?.unit_price || 0) * quantity,
          supplier: pricing?.supplier_name,
          link: pricing?.link,
          in_stock: pricing?.in_stock,
          stock_level: pricing?.stock_level ?? "unknown",
          store_location: pricing?.store_location,
          stock_last_checked_at: pricing?.last_checked_at,
        },
      ]);
    },
    [materials, track, playSound]
  );

  const addMoodMaterialToBom = useCallback((materialId: string) => {
    if (bom.some((item) => item.material_id === materialId)) {
      setShowBom(true);
      toast(locale === "fi" ? "Materiaali on jo materiaalilistalla" : "Material is already in the BOM", "info");
      return;
    }
    addBomItem(materialId, 1);
    setShowBom(true);
    toast(locale === "fi" ? "Tunnelmataulun materiaali lisätty BOMiin" : "Mood board material added to BOM", "success");
  }, [addBomItem, bom, locale, toast]);

  const addImportedBomItem = useCallback(
    (item: BomItem, material: Material) => {
      setMaterials((prev) => {
        const existing = prev.find((m) => m.id === material.id);
        if (existing) {
          return prev.map((m) => (m.id === material.id ? { ...m, ...material } : m));
        }
        return [...prev, material];
      });

      track("bom_item_added", { material_id: item.material_id, category: item.category_name || "kesko" });
      setBom((prev) => {
        if (prev.some((b) => b.material_id === item.material_id)) return prev;
        return [...prev, item];
      });
    },
    [track],
  );

  const importBomItems = useCallback(
    (items: BomItem[], mode: BomImportMode) => {
      setBom((prev) => {
        if (mode === "replace") return items;

        const merged = new Map(prev.map((item) => [item.material_id, item]));
        for (const item of items) {
          const existing = merged.get(item.material_id);
          if (!existing) {
            merged.set(item.material_id, item);
            continue;
          }

          const quantity = Number(existing.quantity || 0) + Number(item.quantity || 0);
          const unitPrice = Number(item.unit_price ?? existing.unit_price ?? 0);
          merged.set(item.material_id, {
            ...existing,
            ...item,
            quantity,
            unit_price: unitPrice,
            total: unitPrice * quantity,
            note: item.note || existing.note,
          });
        }
        return Array.from(merged.values());
      });

      track("bom_imported", { count: items.length, mode });
      playSound("bomAdd");
      toast(t("bom.importSuccess", { count: items.length }), "success");
    },
    [playSound, t, toast, track],
  );

  const replaceBomMaterial = useCallback(
    (fromMaterialId: string, toMaterialId: string, options?: { undo?: boolean; source?: string }) => {
      const mat = materials.find((m) => m.id === toMaterialId);
      if (!mat) return;
      const previousItem = options?.undo ? bom.find((item) => item.material_id === fromMaterialId) : undefined;
      const pricing = mat.pricing?.find((p) => p.is_primary) || mat.pricing?.[0];
      const unitPrice = Number(pricing?.unit_price ?? 0);

      track("bom_package_material_replaced", {
        from_material_id: fromMaterialId,
        to_material_id: toMaterialId,
        category: mat.category_name || "",
        source: options?.source ?? "package",
      });

      setSceneJs((prev) => {
        const result = replaceSceneMaterialReferences(prev, fromMaterialId, toMaterialId);
        if (result.replacements > 0) {
          queueSceneAnnouncement("editor.sceneMaterialChanged");
          pushHistory(result.code);
        }
        return result.code;
      });

      setBom((prev) =>
        prev.map((item) =>
          item.material_id === fromMaterialId
            ? {
                ...item,
                material_id: toMaterialId,
                material_name: mat.name,
                category_name: mat.category_name,
                image_url: mat.image_url,
                unit: mat.design_unit || pricing?.unit || item.unit,
                unit_price: unitPrice,
                total: unitPrice * item.quantity,
                supplier: pricing?.supplier_name,
                link: pricing?.link,
                in_stock: pricing?.in_stock,
                stock_level: pricing?.stock_level ?? "unknown",
                store_location: pricing?.store_location,
                stock_last_checked_at: pricing?.last_checked_at,
              }
            : item
        )
      );

      if (options?.undo && previousItem) {
        toast(t("bomSavings.swapApplied"), "success", {
          duration: 5000,
          action: {
            label: t("toast.undo"),
            onClick: () => {
              track("bom_optimization_undo", { type: "material_substitution", material_id: fromMaterialId });
              setBom((prev) =>
                prev.map((item) =>
                  item.material_id === toMaterialId ? previousItem : item
                )
              );
              setSceneJs((prev) => {
                const result = replaceSceneMaterialReferences(prev, toMaterialId, fromMaterialId);
                if (result.replacements > 0) {
                  queueSceneAnnouncement("editor.sceneUndoAnnounced");
                  pushHistory(result.code);
                }
                return result.code;
              });
            },
          },
        });
      }
    },
    [bom, materials, pushHistory, queueSceneAnnouncement, t, toast, track],
  );

  const handleSelectLayer = useCallback((layerId: string) => {
    setSelectedLayerId(layerId);
  }, []);

  const handleToggleLayerVisibility = useCallback((layerId: string, options?: { solo?: boolean }) => {
    setHiddenLayerIds((current) => {
      if (options?.solo) {
        return new Set(sceneLayers.filter((layer) => layer.id !== layerId).map((layer) => layer.id));
      }

      const next = new Set(current);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, [sceneLayers]);

  const handleToggleLayerLock = useCallback((layerId: string) => {
    setLockedLayerIds((current) => {
      const next = new Set(current);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }, []);

  const handleViewportObjectSelect = useCallback((objectId: string) => {
    setSelectedLayerId(objectId);
    if (thermalView) {
      const layer = sceneLayers.find((entry) => entry.id === objectId);
      if (layer) {
        setThermalInspection({ materialId: layer.materialId, objectId });
      }
    }
  }, [sceneLayers, thermalView]);

  const surfacePickerContext = useMemo(() => {
    if (!surfacePickerMaterialId) return null;

    const directBomItem = bom.find((item) => item.material_id === surfacePickerMaterialId) ?? null;
    const matchedMaterial = matchSceneMaterial(surfacePickerMaterialId, materials);
    const matchedBomItem = matchedMaterial
      ? bom.find((item) => item.material_id === matchedMaterial.id) ?? null
      : null;
    const bomItem = directBomItem ?? matchedBomItem ?? (matchedMaterial ? buildBomItemFromMaterial(matchedMaterial) : null);
    if (!bomItem) return null;

    return {
      sceneMaterialId: surfacePickerMaterialId,
      currentMaterialId: bomItem.material_id,
      bomItem,
    };
  }, [bom, materials, surfacePickerMaterialId]);

  const handleOpenLayerMaterial = useCallback((layerId: string) => {
    const layer = sceneLayers.find((entry) => entry.id === layerId);
    if (!layer) return;

    const hasBomMaterial = bom.some((item) => item.material_id === layer.materialId);
    const matchedMaterial = matchSceneMaterial(layer.materialId, materials);
    if (!hasBomMaterial && !matchedMaterial) {
      toast(t("materialPicker.surfaceNoMatch", { material: layer.materialId }), "info");
      return;
    }

    setSurfacePickerMaterialId(layer.materialId);
  }, [bom, materials, sceneLayers, t, toast]);

  const openAssemblyStepMaterial = useCallback((index: number) => {
    const layerId = assemblyGuide.steps[index]?.layerIds[0];
    if (!layerId) return;
    handleOpenLayerMaterial(layerId);
  }, [assemblyGuide.steps, handleOpenLayerMaterial]);

  const handleViewportMaterialSurfaceSelect = useCallback((selection: ViewportMaterialSelection) => {
    if (thermalView) {
      setThermalInspection({
        materialId: selection.materialId,
        objectId: selection.objectId,
        clientX: selection.clientX,
        clientY: selection.clientY,
      });
      if (selection.objectId) setSelectedLayerId(selection.objectId);
      track("thermal_surface_inspected", {
        material_id: selection.materialId,
        object_id: selection.objectId ?? "",
      });
      return;
    }

    const hasBomMaterial = bom.some((item) => item.material_id === selection.materialId);
    const matchedMaterial = matchSceneMaterial(selection.materialId, materials);
    if (!hasBomMaterial && !matchedMaterial) {
      toast(t("materialPicker.surfaceNoMatch", { material: selection.materialId }), "info");
      return;
    }

    track("material_surface_selected", {
      material_id: selection.materialId,
      object_id: selection.objectId ?? "",
    });
    setSurfacePickerMaterialId(selection.materialId);
  }, [bom, materials, t, thermalView, toast, track]);

  const handleSurfacePickerSelect = useCallback((toMaterialId: string) => {
    if (!surfacePickerContext) return;
    const toMaterial = materials.find((material) => material.id === toMaterialId);
    if (!toMaterial) return;

    const existingBomItem = bom.find((item) => item.material_id === surfacePickerContext.sceneMaterialId)
      ?? bom.find((item) => item.material_id === surfacePickerContext.currentMaterialId)
      ?? null;

    if (existingBomItem) {
      replaceBomMaterial(existingBomItem.material_id, toMaterialId, { source: "viewport_surface" });
      if (existingBomItem.material_id !== surfacePickerContext.sceneMaterialId) {
        setSceneJs((prev) => {
          const result = replaceSceneMaterialReferences(prev, surfacePickerContext.sceneMaterialId, toMaterialId);
          if (result.replacements > 0) pushHistory(result.code);
          return result.code;
        });
      }
    } else {
      setSceneJs((prev) => {
        const result = replaceSceneMaterialReferences(prev, surfacePickerContext.sceneMaterialId, toMaterialId);
        if (result.replacements > 0) pushHistory(result.code);
        return result.code;
      });
      setBom((prev) => {
        if (prev.some((item) => item.material_id === toMaterialId)) return prev;
        return [...prev, buildBomItemFromMaterial(toMaterial, surfacePickerContext.bomItem.quantity)];
      });
    }

    track("material_surface_replaced", {
      from_material_id: surfacePickerContext.sceneMaterialId,
      to_material_id: toMaterialId,
      category: toMaterial.category_name || "",
    });
    setSurfacePickerMaterialId(null);
    toast(t("materialPicker.surfaceApplied", { material: toMaterial.name }), "success");
  }, [bom, materials, pushHistory, replaceBomMaterial, surfacePickerContext, t, toast, track]);

  const applyBomPriceOverride = useCallback(
    (override: BomPriceOverride) => {
      const previousItem = bom.find((item) => item.material_id === override.materialId);
      if (!previousItem) return;

      const unitPrice = Number(override.unitPrice || 0);
      track("bom_supplier_price_applied", {
        material_id: override.materialId,
        supplier: override.supplier || "",
        unit_price: unitPrice,
      });

      setBom((prev) =>
        prev.map((item) =>
          item.material_id === override.materialId
            ? {
                ...item,
                unit: override.unit || item.unit,
                unit_price: unitPrice,
                total: unitPrice * item.quantity,
                supplier: override.supplier || item.supplier,
                link: override.link ?? item.link,
                stock_level: override.stockLevel ?? item.stock_level,
              }
            : item
        )
      );

      toast(t("bomSavings.priceApplied"), "success", {
        duration: 5000,
        action: {
          label: t("toast.undo"),
          onClick: () => {
            track("bom_optimization_undo", { type: "supplier_price", material_id: override.materialId });
            setBom((prev) =>
              prev.map((item) =>
                item.material_id === override.materialId ? previousItem : item
              )
            );
          },
        },
      });
    },
    [bom, t, toast, track],
  );

  const dismissGeometryBomUpdate = useCallback(() => {
    if (geometryBomUpdate) {
      geometryBaselineRef.current = {
        sceneJs: geometryBomUpdate.sceneJs,
        metrics: geometryBomUpdate.metrics,
      };
      dismissedGeometrySceneRef.current = geometryBomUpdate.sceneJs;
    }
    setGeometryBomUpdate(null);
  }, [geometryBomUpdate]);

  const applyGeometryBomUpdate = useCallback((includeManualOverrides: boolean) => {
    if (!geometryBomUpdate) return;
    const selected = includeManualOverrides
      ? [...geometryBomUpdate.suggestions, ...geometryBomUpdate.skippedManual]
      : geometryBomUpdate.suggestions;
    if (selected.length === 0) return;

    const selectedById = new Map(selected.map((suggestion) => [suggestion.materialId, suggestion]));
    setBom((prev) =>
      prev.map((item) => {
        const suggestion = selectedById.get(item.material_id);
        if (!suggestion) return item;
        return {
          ...item,
          quantity: suggestion.suggestedQuantity,
          total: (item.unit_price || 0) * suggestion.suggestedQuantity,
          manual_override: includeManualOverrides ? false : item.manual_override,
          geometry_driven: true,
        };
      }),
    );

    if (includeManualOverrides) {
      setManualBomOverrideIds((prev) => {
        const next = new Set(prev);
        for (const suggestion of selected) next.delete(suggestion.materialId);
        return next;
      });
    }

    geometryBaselineRef.current = {
      sceneJs: geometryBomUpdate.sceneJs,
      metrics: geometryBomUpdate.metrics,
    };
    dismissedGeometrySceneRef.current = null;
    setGeometryBomUpdate(null);
    toast(
      locale === "fi"
        ? `Päivitettiin ${selected.length} materiaalimäärää geometriasta`
        : `Updated ${selected.length} material quantities from geometry`,
      "success",
    );
  }, [geometryBomUpdate, locale, toast]);

  const removeBomItem = useCallback((materialId: string) => {
    let removedItem: BomItem | undefined;
    setBom((prev) => {
      removedItem = prev.find((b) => b.material_id === materialId);
      return prev.filter((b) => b.material_id !== materialId);
    });
    track("bom_item_removed", { material_id: materialId });
    playSound("bomRemove");

    // Show undo toast — if the user clicks "Undo" within 5s, re-add the item
    if (removedItem) {
      const item = removedItem;
      toast(t("toast.materialRemoved"), "info", {
        duration: 5000,
        action: {
          label: t("toast.undo"),
          onClick: () => {
            track("bom_item_undo_remove", { material_id: materialId });
            setBom((prev) => [...prev, item]);
          },
        },
      });
    }
  }, [track, toast, t, playSound]);

  const updateBomQty = useCallback((materialId: string, qty: number) => {
    setManualBomOverrideIds((prev) => new Set(prev).add(materialId));
    setBom((prev) =>
      prev.map((b) =>
        b.material_id === materialId
          ? { ...b, quantity: qty, total: (b.unit_price || 0) * qty, manual_override: true, geometry_driven: false }
          : b
      )
    );
  }, []);

  const updateBomNote = useCallback((materialId: string, note: string) => {
    setBom((prev) =>
      prev.map((b) =>
        b.material_id === materialId ? { ...b, note } : b
      )
    );
  }, []);

  const reorderBom = useCallback((fromIndex: number, toIndex: number) => {
    setBom((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const updateHouseholdDeductionMode = useCallback(async (joint: boolean) => {
    const previous = householdDeductionJoint;
    setHouseholdDeductionJoint(joint);
    setProject((prev) => prev ? { ...prev, household_deduction_joint: joint } : prev);
    try {
      await api.updateProject(projectId, { household_deduction_joint: joint });
    } catch (err) {
      setHouseholdDeductionJoint(previous);
      setProject((prev) => prev ? { ...prev, household_deduction_joint: previous } : prev);
      toast(err instanceof Error ? err.message : t("toast.saveFailed"), "error");
    }
  }, [householdDeductionJoint, projectId, t, toast]);

  const saveTaloyhtioMetadata = useCallback(async (patch: Record<string, unknown>) => {
    const updated = await api.updateProject(projectId, patch) as Project;
    setProject((prev) => prev ? { ...prev, ...updated } : updated);
    toast(t("taloyhtio.saved"), "success");
  }, [projectId, t, toast]);

  if (loadError) {
    return (
      <div className="anim-up" role="alert" style={{ padding: 60, textAlign: "center" }}>
        <h2 className="heading-display" style={{ marginBottom: 8 }}>{t('editor.error')}</h2>
        <p style={{ color: "var(--danger)", marginBottom: 16 }}>{t('editor.errorLoadProject')}</p>
        <button className="btn btn-primary" onClick={() => router.push("/")}>
          {t('editor.backToProjects')}
        </button>
      </div>
    );
  }

  if (!project) {
    return <SkeletonProjectEditor />;
  }

  return (
    <div
      className="editor-page"
      data-mobile-panel={isMobileEditor ? activeMobilePanel : undefined}
      data-mobile-panel-size={isMobileEditor ? mobilePanelSize : undefined}
    >
      {showConfetti && <ConfettiCelebration onComplete={() => setShowConfetti(false)} />}
      {showGuidedWizard && (
        <GuidedRenovationWizard
          materials={materials}
          buildingInfo={project?.building_info ?? null}
          source="editor"
          onClose={() => setShowGuidedWizard(false)}
          onComplete={(plan, state) => applyGuidedPlan(plan, state, false)}
          onCompleteAdvanced={(plan, state) => applyGuidedPlan(plan, state, true)}
          onStepViewed={(step, stepId: WizardStepId, state) => {
            track("renovation_wizard_step_viewed", {
              source: "editor",
              step,
              step_id: stepId,
              renovation_type: state.renovationType,
            });
          }}
        />
      )}

      {/* Header */}
      <div className="editor-header">
        <button className="btn btn-ghost" onClick={() => router.push("/")} style={{ padding: "6px 10px" }} data-tooltip={t('nav.back')} aria-label={t('nav.back')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="editor-header-divider" style={{ width: 1, height: 18, background: "var(--border)", flexShrink: 0 }} />
        <div className="editor-header-name-wrapper">
          <input
            className="editor-header-name"
            value={projectName}
            aria-label={t('project.nameField')}
            aria-describedby={projectName.length > 80 ? "project-name-count" : undefined}
            onChange={(e) => setProjectName(e.target.value)}
            onBlur={() => {
              const trimmed = projectName.trim();
              if (trimmed.length === 0) {
                setProjectName(previousNameRef.current);
              } else {
                previousNameRef.current = trimmed;
              }
            }}
            maxLength={100}
            title={projectName}
          />
          {projectName.length > 80 && (
            <span
              id="project-name-count"
              className="editor-header-name-count"
              data-near-limit={projectName.length >= 95}
              aria-live="polite"
            >
              {projectName.length}/100
            </span>
          )}
        </div>
        <SaveStatusIndicator status={saveStatus} lastSaved={lastSaved} />
        <div
          className="collaboration-presence"
          title={collaborationPresenceLabel}
          aria-label={collaborationPresenceLabel}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            minHeight: 28,
            padding: "3px 8px",
            border: "1px solid var(--border)",
            borderRadius: 999,
            background: "var(--bg-tertiary)",
            color: collaborationStatus === "connected" ? "var(--text-secondary)" : "var(--text-muted)",
            fontSize: 11,
            whiteSpace: "nowrap",
          }}
        >
          <span
            aria-hidden
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              background: collaborationStatus === "connected" ? "#8bc48b" : collaborationStatus === "connecting" ? "#e5a04b" : "var(--text-muted)",
              boxShadow: collaborationStatus === "connected" ? "0 0 0 3px rgba(139, 196, 139, 0.16)" : "none",
              flexShrink: 0,
            }}
          />
          {collaborationPeers.slice(0, 3).map((peer) => (
            <span
              key={peer.clientId}
              aria-hidden
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginLeft: -4,
                background: peer.color,
                color: "#101012",
                fontSize: 9,
                fontWeight: 800,
                border: "1px solid var(--bg-tertiary)",
              }}
            >
              {peer.name.slice(0, 1).toUpperCase()}
            </span>
          ))}
          <span>{collaborationPresenceLabel}</span>
        </div>
        <select
          className="select"
          value={projectStatus}
          onChange={(e) => {
            const newStatus = e.target.value as import("@/types").ProjectStatus;
            setProjectStatus(newStatus);
            if (newStatus === "completed" && projectStatus !== "completed") {
              setShowConfetti(true);
              toast(t("project.completionCelebration"), "success");
            }
            api.updateProject(projectId, { status: newStatus } as Record<string, unknown>, collaborationClientIdRef.current).catch(() => {});
          }}
          aria-label={t('project.filterByStatus')}
          style={{ fontSize: 11, padding: "3px 6px", maxWidth: 110, height: 28 }}
        >
          <option value="planning">{t('project.statusPlanning')}</option>
          <option value="in_progress">{t('project.statusInProgress')}</option>
          <option value="completed">{t('project.statusCompleted')}</option>
          <option value="archived">{t('project.statusArchived')}</option>
        </select>
        <div
          role="group"
          aria-label="Editor complexity mode"
          style={{ display: "flex", gap: 2, padding: 2, border: "1px solid var(--border)", borderRadius: 999, background: "var(--bg-tertiary)" }}
        >
          {(["simple", "advanced"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="btn btn-ghost"
              aria-pressed={editorMode === mode}
              data-active={editorMode === mode}
              onClick={() => handleEditorModeChange(mode)}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                border: "none",
                color: editorMode === mode ? "var(--amber)" : "var(--text-muted)",
              }}
            >
              {mode === "simple" ? "Simple" : "Advanced"}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={() => {
            track("renovation_wizard_opened", { source: "editor" });
            setShowGuidedWizard(true);
          }}
          style={{ padding: "5px 10px", fontSize: 12 }}
        >
          Wizard
        </button>
        <div className="editor-header-actions">
          <CreditBalancePill compact />
          <button
            className="btn btn-ghost editor-action-secondary"
            onClick={undo}
            disabled={!canUndo}
            data-tooltip={`${t('editor.undo')} (${shortcutLabel('Cmd+Z')})`}
            aria-label={`${t('editor.undo')} (${shortcutLabel('Cmd+Z')})`}
            style={{ padding: "5px 7px", opacity: canUndo ? 1 : 0.3 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
          </button>
          <button
            className="btn btn-ghost editor-action-secondary"
            onClick={redo}
            disabled={!canRedo}
            data-tooltip={`${t('editor.redo')} (${shortcutLabel('Cmd+Shift+Z')})`}
            aria-label={`${t('editor.redo')} (${shortcutLabel('Cmd+Shift+Z')})`}
            style={{ padding: "5px 7px", opacity: canRedo ? 1 : 0.3 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10" />
            </svg>
          </button>
          <button
            className="btn btn-ghost editor-action-secondary"
            data-tooltip={t('versions.title')}
            aria-label={t('versions.title')}
            onClick={() => setShowVersionPanel((visible) => !visible)}
            style={{ padding: "5px 7px", color: showVersionPanel ? "var(--forest)" : undefined }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 3v6h6" />
              <path d="M3 9a9 9 0 1 0 2.64-6.36L3 6" />
              <path d="M12 7v5l3 2" />
            </svg>
          </button>
          <button
            className="btn btn-ghost editor-action-secondary"
            data-tooltip={t('project.copy')}
            aria-label={t('editor.duplicateProject')}
            disabled={duplicating}
            onClick={duplicateProject}
            style={{ padding: "5px 7px" }}
          >
            {duplicating ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "spin 1s linear infinite" }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
          <div className="editor-action-divider" style={{ width: 1, height: 18, background: "var(--border)", flexShrink: 0 }} />
          <div className="editor-mobile-actions" data-editor-mobile-actions>
            <button
              className="btn btn-ghost editor-mobile-actions-btn"
              type="button"
              aria-label={t("toast.overflowMore", { count: 3 })}
              aria-haspopup="menu"
              aria-expanded={showHeaderMenu}
              onClick={() => setShowHeaderMenu((v) => !v)}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" />
                <circle cx="5" cy="12" r="1" />
              </svg>
            </button>
            {showHeaderMenu && (
              <div className="editor-mobile-actions-menu dropdown-menu" role="menu">
                <button
                  role="menuitem"
                  className="btn btn-ghost"
                  disabled={!canUndo}
                  onClick={() => {
                    setShowHeaderMenu(false);
                    undo();
                  }}
                >
                  {t("editor.undo")}
                </button>
                <button
                  role="menuitem"
                  className="btn btn-ghost"
                  disabled={!canRedo}
                  onClick={() => {
                    setShowHeaderMenu(false);
                    redo();
                  }}
                >
                  {t("editor.redo")}
                </button>
                <button
                  role="menuitem"
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowHeaderMenu(false);
                    setShowVersionPanel(true);
                  }}
                >
                  {t("versions.title")}
                </button>
                <button
                  role="menuitem"
                  className="btn btn-ghost"
                  disabled={duplicating}
                  onClick={duplicateProject}
                >
                  {t("editor.duplicateProject")}
                </button>
              </div>
            )}
          </div>
          <button
            className="btn btn-ghost"
            data-tooltip={t('editor.share')}
            aria-label={t('editor.share')}
            disabled={shareLoading}
            onClick={async () => {
              if (!shareToken) {
                setShareLoading(true);
                try {
                  const res = await api.shareProject(projectId);
                  setShareToken(res.share_token);
                  setShareExpiresAt(res.expires_at ?? null);
                } catch (err) {
                  toast(err instanceof Error ? err.message : t('toast.shareFailed'), "error");
                  setShareLoading(false);
                  return;
                }
                setShareLoading(false);
              }
              setShowShareDialog(true);
            }}
            style={{ padding: "5px 7px", display: "flex", alignItems: "center", gap: 4, opacity: shareLoading ? 0.5 : 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {shareToken && (
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--forest)", flexShrink: 0 }} />
            )}
          </button>
          <div style={{ position: "relative" }} data-tour="export-btn">
            <button
              className="btn btn-ghost"
              data-tooltip={exportingFormat ? t('toast.exportingBom') : t('editor.export')}
              aria-label={exportingFormat ? t('toast.exportingBom') : t('editor.export')}
              aria-busy={exportingFormat !== null}
              aria-haspopup="menu"
              aria-expanded={showExportMenu}
              disabled={exportingFormat !== null}
              onClick={() => setShowExportMenu(v => !v)}
              style={{ padding: "5px 7px", display: "flex", alignItems: "center", gap: 4 }}
            >
              {exportingFormat ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "toast-spin 1.2s linear infinite" }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </>
              )}
            </button>
            {showExportMenu && (
              <div className="dropdown-menu" role="menu" style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                background: "var(--bg-elevated)",
                border: "1px solid var(--border-strong)",
                borderRadius: "var(--radius-md)",
                boxShadow: "var(--shadow-lg)",
                padding: 4,
                minWidth: 160,
                zIndex: 100,
              }}>
                <button
                  role="menuitem"
                  className="btn btn-ghost"
                  disabled={exportingFormat !== null}
                  onClick={() => { void exportQuotePdf(); }}
                  style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "8px 12px", fontSize: 12, border: "none", opacity: exportingFormat && exportingFormat !== "pdf" ? 0.4 : 1 }}
                >
                  {exportingFormat === "pdf" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "toast-spin 1.2s linear infinite" }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  )}
                  PDF
                </button>
                <button
                  role="menuitem"
                  className="btn btn-ghost"
                  disabled={exportingFormat !== null}
                  onClick={() => { void exportProposalPdf(); }}
                  style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "8px 12px", fontSize: 12, border: "none", opacity: exportingFormat && exportingFormat !== "proposal" ? 0.4 : 1 }}
                >
                  {exportingFormat === "proposal" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "toast-spin 1.2s linear infinite" }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 4h16v16H4z" />
                      <path d="M8 8h8M8 12h5M8 16h8" />
                    </svg>
                  )}
                  {t("proposal.exportMenu")}
                </button>
                <button
                  role="menuitem"
                  className="btn btn-ghost"
                  disabled={exportingFormat !== null}
                  onClick={() => {
                    setShowExportMenu(false);
                    setShowAraChecklist(true);
                  }}
                  style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "8px 12px", fontSize: 12, border: "none", opacity: exportingFormat && exportingFormat !== "ara" ? 0.4 : 1 }}
                >
                  {exportingFormat === "ara" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "toast-spin 1.2s linear infinite" }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                  )}
                  {locale === "fi" ? "ARA-paketti" : "ARA package"}
                </button>
                <button
                  role="menuitem"
                  className="btn btn-ghost"
                  disabled={exportingFormat !== null}
                  onClick={() => { void exportIfcPermitModel(); }}
                  style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "8px 12px", fontSize: 12, border: "none", opacity: exportingFormat && exportingFormat !== "ifc" ? 0.4 : 1 }}
                >
                  {exportingFormat === "ifc" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "toast-spin 1.2s linear infinite" }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7l9-4 9 4-9 4-9-4z" />
                      <path d="M3 12l9 4 9-4" />
                      <path d="M3 17l9 4 9-4" />
                    </svg>
                  )}
                  {t("ifcExport.exportMenu")}
                </button>
                <button
                  role="menuitem"
                  className="btn btn-ghost"
                  disabled={exportingFormat !== null}
                  onClick={() => { void exportPermitPack(); }}
                  style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "8px 12px", fontSize: 12, border: "none", opacity: exportingFormat && exportingFormat !== "permit" ? 0.4 : 1 }}
                >
                  {exportingFormat === "permit" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "toast-spin 1.2s linear infinite" }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 8v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" />
                      <path d="M1 3h22v5H1z" />
                      <path d="M10 12h4" />
                    </svg>
                  )}
                  {t("permitPack.exportMenu")}
                </button>
                <button
                  className="btn btn-ghost"
                  disabled={exportingFormat !== null}
                  onClick={async () => {
                    setShowExportMenu(false);
                    setExportingFormat("csv");
                    try {
                      track("bom_exported", { format: "csv" });
                      await api.exportBOMCsv(projectId, projectName);
                      toast(t('toast.bomExported'), "success");
                      playSound("exportDone");
                    } catch (err) {
                      toast(err instanceof Error ? err.message : t('toast.bomExportFailed'), "error");
                    } finally {
                      setExportingFormat(null);
                    }
                  }}
                  style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "8px 12px", fontSize: 12, border: "none", opacity: exportingFormat && exportingFormat !== "csv" ? 0.4 : 1 }}
                >
                  {exportingFormat === "csv" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "toast-spin 1.2s linear infinite" }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="3" y1="9" x2="21" y2="9" />
                      <line x1="3" y1="15" x2="21" y2="15" />
                      <line x1="9" y1="3" x2="9" y2="21" />
                    </svg>
                  )}
                  CSV
                </button>
                <button
                  role="menuitem"
                  className="btn btn-ghost"
                  disabled={exportingFormat !== null}
                  onClick={async () => {
                    setShowExportMenu(false);
                    setExportingFormat("json");
                    try {
                      track("bom_exported", { format: "json" });
                      const res = await api.exportBOM(projectId);
                      const blob = new Blob([JSON.stringify(res, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `bom_${projectId}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast(t('toast.bomExported'), "success");
                      playSound("exportDone");
                    } catch (err) {
                      toast(err instanceof Error ? err.message : t('toast.bomExportFailed'), "error");
                    } finally {
                      setExportingFormat(null);
                    }
                  }}
                  style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "8px 12px", fontSize: 12, border: "none", opacity: exportingFormat && exportingFormat !== "json" ? 0.4 : 1 }}
                >
                  {exportingFormat === "json" ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: "toast-spin 1.2s linear infinite" }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z" />
                      <polyline points="16 3 16 8 21 8" />
                    </svg>
                  )}
                  JSON
                </button>
                <div style={{ height: 1, background: "var(--border)", margin: "2px 8px" }} role="separator" />
                <button
                  role="menuitem"
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowExportMenu(false);
                    try {
                      track("project_exported", { format: "helscoop" });
                      const exportData = {
                        version: 1,
                        name: projectName,
                        description: projectDesc,
                        scene_js: sceneJs,
                        original_scene_js: renovationBaselineSceneJs,
                        bom: bom.map((b) => ({
                          material_id: b.material_id,
                          material_name: b.material_name,
                          quantity: b.quantity,
                          unit: b.unit,
                          unit_price: b.unit_price,
                          total: b.total,
                          link: b.link,
                          in_stock: b.in_stock,
                          stock_level: b.stock_level,
                          store_location: b.store_location,
                          stock_last_checked_at: b.stock_last_checked_at,
                        })),
                        exportedAt: new Date().toISOString(),
                      };
                      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${projectName.replace(/\s+/g, '_')}.helscoop`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast(t('toast.projectExported'), "success");
                      playSound("exportDone");
                    } catch (err) {
                      toast(err instanceof Error ? err.message : t('toast.projectExportFailed'), "error");
                    }
                  }}
                  style={{ width: "100%", justifyContent: "flex-start", gap: 8, padding: "8px 12px", fontSize: 12, border: "none" }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {t('editor.exportProject')}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <ProjectVersionPanel
        projectId={projectId}
        open={showVersionPanel}
        snapshot={currentVersionSnapshot}
        activeBranchId={activeVersionBranchId}
        saveNow={save}
        getThumbnail={() => captureThumbRef.current?.() ?? project?.thumbnail_url ?? null}
        onClose={() => setShowVersionPanel(false)}
        onActiveBranchChange={setActiveVersionBranchId}
        onRestored={handleVersionRestored}
      />

      {/* Draft recovery banner */}
      {hasDraft && (
        <div className="draft-recovery-banner">
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
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
          <span>{t('editor.draftFound')}</span>
          <div className="draft-recovery-actions">
            <button
              className="btn btn-ghost draft-recovery-btn"
              onClick={restoreDraft}
            >
              {t('editor.draftRestore')}
            </button>
            <button
              className="btn btn-ghost draft-recovery-btn"
              onClick={discardDraft}
            >
              {t('editor.draftDiscard')}
            </button>
          </div>
        </div>
      )}

      {/* Save failure recovery banner */}
      {saveErrorVisible && (
        <div
          className="save-failure-banner"
          data-critical={saveFailCount >= 3}
          role="alert"
        >
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
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>
            {saveFailCount >= 3
              ? t('editor.saveFailedCritical')
              : t('editor.saveFailedBanner')}
          </span>
          <div className="save-failure-actions">
            <button
              className="btn btn-ghost save-failure-btn"
              onClick={save}
            >
              {t('editor.saveFailedRetry')}
            </button>
            <button
              className="btn btn-ghost save-failure-btn"
              onClick={async () => {
                const copiedToClipboard = await copyTextToClipboard(sceneJs);
                if (copiedToClipboard) {
                  setClipboardCopied(true);
                  toast(t('editor.saveFailedCopied'), "success");
                  setTimeout(() => setClipboardCopied(false), 2000);
                  return;
                }
                toast(t('toast.copyFailed'), "error");
              }}
            >
              {clipboardCopied ? t('editor.saveFailedCopied') : t('editor.saveFailedCopy')}
            </button>
          </div>
        </div>
      )}

      {/* Building provenance bar — shown when project was created from address search */}
      {project?.building_info?.address && (() => {
        const bi = project.building_info!;
        const confidence = bi.confidence ?? "estimated";
        const mappedConfidence: DataProvenance["confidence"] =
          confidence === "template" ? "demo" :
          confidence === "verified" ? "verified" :
          confidence === "manual" ? "manual" :
          "estimated";
        const provenance: DataProvenance = {
          confidence: mappedConfidence,
          source: bi.data_sources?.[0] ?? (confidence === "verified" ? "DVV/MML" : "heuristic"),
        };
        const fields: { label: string; value: string }[] = [
          ...(bi.year_built ? [{ label: t("search.yearBuilt"), value: String(bi.year_built) }] : []),
          ...(bi.area_m2 ? [{ label: t("search.area"), value: `${bi.area_m2} m\u00B2` }] : []),
          ...(bi.floors ? [{ label: t("search.floors"), value: String(bi.floors) }] : []),
          ...(bi.climate_zone ? [{ label: "Climate", value: bi.climate_zone }] : []),
          ...(bi.heating_degree_days ? [{ label: "HDD", value: String(bi.heating_degree_days) }] : []),
        ];
        return (
          <div
            style={{
              padding: "5px 16px",
              background: "var(--bg-tertiary)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 11,
              flexWrap: "wrap",
              flexShrink: 0,
            }}
          >
            <span style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
              {bi.address}
            </span>
            {fields.map((f) => (
              <span key={f.label} style={{ display: "flex", gap: 4, color: "var(--text-secondary)" }}>
                <span style={{ color: "var(--text-muted)" }}>{f.label}:</span>
                <strong>{f.value}</strong>
              </span>
            ))}
            <span style={{ marginLeft: "auto" }}>
              <ConfidenceBadge provenance={provenance} compact />
            </span>
          </div>
        );
      })()}

      {project && (
        <TaloyhtioPanel
          project={project}
          bom={bom}
          onSave={saveTaloyhtioMetadata}
        />
      )}

      {/* Main content */}
      <main id="main-content" className="editor-main" tabIndex={-1}>
        <div
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="scene-a11y-announcer"
        >
          {sceneA11yAnnouncement}
        </div>
        {/* Left: Viewport + Code */}
        <div className="editor-viewport-area">
          {/* 3D Viewport */}
          <div
            ref={viewportRef}
            className="editor-viewport-shell"
            data-tour="viewport"
            onDragOver={(event) => {
              if (Array.from(event.dataTransfer.items).some((item) => item.kind === "file" && item.type.startsWith("image/"))) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "copy";
              }
            }}
            onDrop={(event) => {
              const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"));
              if (!file) return;
              event.preventDefault();
              void handlePhotoOverlayFile(file);
            }}
            style={{
              flex: 1,
              minHeight: 0,
              padding: 8,
              paddingBottom: showCode || showMoodBoard ? 0 : 8,
            }}
          >
            <ErrorBoundary
              key={viewportKey}
              onReset={handleViewportReset}
              fallback={({ error, reset }) => (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--bg-secondary)",
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  <div style={{ textAlign: "center", padding: 32, maxWidth: 420 }}>
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        margin: "0 auto 16px",
                        borderRadius: "50%",
                        background: "rgba(239,68,68,0.1)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--danger)"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <h3
                      style={{
                        color: "var(--text-primary)",
                        fontSize: 16,
                        fontWeight: 600,
                        marginBottom: 8,
                      }}
                    >
                      {t('editor.viewportCrashTitle')}
                    </h3>
                    <p
                      style={{
                        color: "var(--text-muted)",
                        fontSize: 13,
                        lineHeight: 1.5,
                        marginBottom: 8,
                      }}
                    >
                      {t('editor.viewportCrashMessage')}
                    </p>
                    <p
                      style={{
                        color: "var(--danger)",
                        fontSize: 12,
                        fontFamily: "var(--font-mono)",
                        marginBottom: 20,
                        wordBreak: "break-word",
                      }}
                    >
                      {error.message}
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={reset}
                      style={{
                        padding: "8px 20px",
                        fontSize: 13,
                      }}
                    >
                      {t('editor.resetScene')}
                    </button>
                  </div>
                </div>
              )}
            >
              {renovationCompareMode ? (
                <div
                  ref={renovationCompareRef}
                  className="renovation-compare-shell"
                  style={{ "--compare-split": `${renovationCompareSplit}%` } as CSSProperties}
                  data-testid="renovation-compare-shell"
                >
                  <div className="renovation-compare-pane renovation-compare-pane--current">
                    <Viewport3D
                      sceneJs={renovationBaselineSceneJs}
                      wireframe={wireframe}
                      explodedView={false}
                      materialCategoryMap={materialCategoryMap}
                      projectName={projectName}
                      thermalView={thermalView}
                      thermalColorMap={thermalColorMap}
                      lightingPreset={lightingPreset}
                      cameraSyncState={renovationCompareCamera}
                      onCameraSyncChange={handleRenovationCompareCamera}
                      sunDirection={sunDirection}
                      sunAltitude={sunAltitude}
                      shadowStudySamples={daylightShadowStudy?.samples ?? null}
                    />
                    <span className="renovation-compare-label">{t("editor.compareCurrent")}</span>
                  </div>
                  <div className="renovation-compare-pane renovation-compare-pane--planned">
                    <Viewport3D
                      sceneJs={sceneJs}
                      wireframe={wireframe}
                      explodedView={explodedView}
                      materialCategoryMap={materialCategoryMap}
                      onObjectCount={setObjectCount}
                      onError={setSceneError}
                      onErrorLine={setSceneErrorLine}
                      onWarnings={setSceneWarnings}
                      captureRef={captureThumbRef}
                      presentationRef={presentationRef}
                      onToggleWireframe={() => setWireframe(!wireframe)}
                      onMaterialSurfaceSelect={showLayers ? undefined : handleViewportMaterialSurfaceSelect}
                      onObjectSurfaceSelect={showLayers ? handleViewportObjectSelect : undefined}
                      onRenderedLayersChange={setRenderedLayers}
                      onMeasurementModeChange={setViewportMeasurementMode}
                      projectName={projectName}
                      thermalView={thermalView}
                      thermalColorMap={thermalColorMap}
                      lightingPreset={lightingPreset}
                      selectedObjectId={constructionSequenceActive ? assemblyViewportState?.currentObjectIds[0] ?? null : showLayers ? selectedLayerId : null}
                      hiddenObjectIds={constructionSequenceActive ? assemblyViewportHiddenObjectIds : hiddenLayerIds}
                      lockedObjectIds={lockedLayerIds}
                      cameraSyncState={renovationCompareCamera}
                      onCameraSyncChange={handleRenovationCompareCamera}
                      sunDirection={sunDirection}
                      sunAltitude={sunAltitude}
                      shadowStudySamples={daylightShadowStudy?.samples ?? null}
                      assemblyGuideState={viewportAssemblyGuideState}
                      airflowView={airflowView}
                      airflowAnalysis={airflowAnalysis}
                      focusObjectRef={focusObjectRef}
                    />
                    <span className="renovation-compare-label renovation-compare-label--planned">{t("editor.comparePlanned")}</span>
                  </div>
                  <button
                    type="button"
                    className="renovation-compare-divider"
                    aria-label={t("editor.compareDividerLabel")}
                    aria-valuemin={22}
                    aria-valuemax={78}
                    aria-valuenow={Math.round(renovationCompareSplit)}
                    role="separator"
                    onPointerDown={(event) => {
                      renovationCompareDragging.current = true;
                      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
                      updateRenovationCompareSplit(event.clientX, event.clientY);
                    }}
                    onPointerMove={(event) => {
                      if (!renovationCompareDragging.current) return;
                      updateRenovationCompareSplit(event.clientX, event.clientY);
                    }}
                    onPointerUp={() => { renovationCompareDragging.current = false; }}
                    onPointerCancel={() => { renovationCompareDragging.current = false; }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                        event.preventDefault();
                        setRenovationCompareSplit((value) => clampCompareSplit(value - 5));
                      } else if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                        event.preventDefault();
                        setRenovationCompareSplit((value) => clampCompareSplit(value + 5));
                      } else if (event.key === "Home") {
                        event.preventDefault();
                        setRenovationCompareSplit(22);
                      } else if (event.key === "End") {
                        event.preventDefault();
                        setRenovationCompareSplit(78);
                      }
                    }}
                  >
                    <span className="renovation-compare-divider-line" />
                    <span className="renovation-compare-divider-thumb">
                      <svg width="12" height="18" viewBox="0 0 12 18" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 3L1 6l3 3M8 3l3 3-3 3M4 9l-3 3 3 3M8 9l3 3-3 3" />
                      </svg>
                    </span>
                  </button>
                </div>
              ) : (
                <Viewport3D
                  sceneJs={sceneJs}
                  wireframe={wireframe}
                  explodedView={explodedView}
                  materialCategoryMap={materialCategoryMap}
                  onObjectCount={setObjectCount}
                  onError={setSceneError}
                  onErrorLine={setSceneErrorLine}
                  onWarnings={setSceneWarnings}
                  captureRef={captureThumbRef}
                  presentationRef={presentationRef}
                  onToggleWireframe={() => setWireframe(!wireframe)}
                  onMaterialSurfaceSelect={showLayers ? undefined : handleViewportMaterialSurfaceSelect}
                  onObjectSurfaceSelect={showLayers ? handleViewportObjectSelect : undefined}
                  onRenderedLayersChange={setRenderedLayers}
                  onMeasurementModeChange={setViewportMeasurementMode}
                  projectName={projectName}
                  thermalView={thermalView}
                  thermalColorMap={thermalColorMap}
                  lightingPreset={lightingPreset}
                  selectedObjectId={constructionSequenceActive ? assemblyViewportState?.currentObjectIds[0] ?? null : showLayers ? selectedLayerId : null}
                  hiddenObjectIds={constructionSequenceActive ? assemblyViewportHiddenObjectIds : hiddenLayerIds}
                  lockedObjectIds={lockedLayerIds}
                  sunDirection={sunDirection}
                  sunAltitude={sunAltitude}
                  shadowStudySamples={daylightShadowStudy?.samples ?? null}
                  assemblyGuideState={viewportAssemblyGuideState}
                  airflowView={airflowView}
                  airflowAnalysis={airflowAnalysis}
                  focusObjectRef={focusObjectRef}
                />
              )}
            </ErrorBoundary>

            {showConstructionTimelapse && activeTimelapseStep && (
              <div
                className="timelapse-viewport-overlay"
                data-with-photo={!!photoOverlayUrl && !renovationCompareMode}
                data-testid="construction-timelapse-overlay"
                aria-live="polite"
              >
                <div className="timelapse-viewport-main">
                  <span className="label-mono">{activeTimelapseStep.scheduledDay}</span>
                  <strong>{activeTimelapseStep.title}</strong>
                  <span>{activeTimelapseStep.annotation}</span>
                </div>
                <div className="timelapse-viewport-progress" aria-hidden="true">
                  <span
                    style={{
                      width: `${constructionTimelapsePlan.steps.length > 1
                        ? Math.round((assemblyStepIndex / (constructionTimelapsePlan.steps.length - 1)) * 100)
                        : 100}%`,
                    }}
                  />
                </div>
                <div className="timelapse-viewport-actions">
                  <button
                    type="button"
                    className="timelapse-nav-btn"
                    onClick={() => selectTimelapseStep(assemblyStepIndex - 1)}
                    disabled={assemblyStepIndex <= 0}
                    aria-label={t("timelapse.previous")}
                  >
                    &lt;&lt;
                  </button>
                  <button
                    type="button"
                    className="assembly-guide-play"
                    onClick={() => setTimelapsePlaying((playing) => !playing)}
                    aria-pressed={timelapsePlaying}
                  >
                    {timelapsePlaying ? t("timelapse.pause") : t("timelapse.play")}
                  </button>
                  <button
                    type="button"
                    className="timelapse-nav-btn"
                    onClick={() => selectTimelapseStep(assemblyStepIndex + 1)}
                    disabled={assemblyStepIndex >= constructionTimelapsePlan.steps.length - 1}
                    aria-label={t("timelapse.next")}
                  >
                    &gt;&gt;
                  </button>
                  <span className="timelapse-viewport-meta">
                    {assemblyStepIndex + 1}/{constructionTimelapsePlan.steps.length} / {timelapseSpeed}x / {timelapseCameraMode}
                  </span>
                </div>
              </div>
            )}

            {renovationCompareMode && (
              <div className="renovation-cost-compare" data-testid="renovation-cost-compare">
                <div>
                  <span>{t("editor.compareCurrentValue")}</span>
                  <strong>{compareCurrentCostLabel}</strong>
                </div>
                <div>
                  <span>{t("editor.compareRenovationCost")}</span>
                  <strong>{compareRenovationCostLabel}</strong>
                </div>
                <div>
                  <span>{t("editor.compareNewValue")}</span>
                  <strong>{compareNewValueLabel}</strong>
                </div>
              </div>
            )}

            {!renovationCompareMode && photoOverlayUrl && (
              <div
                className="photo-overlay"
                style={{
                  opacity: photoCompareMode ? 1 : photoOverlayOpacity,
                  clipPath: photoCompareMode ? `inset(0 ${100 - photoComparePos}% 0 0)` : undefined,
                }}
              >
                <img
                  src={photoOverlayUrl}
                  alt=""
                  className="photo-overlay-image"
                  style={{
                    transform: `translate(${photoOffsetX}%, ${photoOffsetY}%) rotate(${photoRotation}deg) scale(${photoScale})`,
                  }}
                />
                <div className="photo-alignment-guides" aria-hidden="true">
                  <span className="photo-guide-horizon" />
                  <span className="photo-guide-corner photo-guide-corner--tl" />
                  <span className="photo-guide-corner photo-guide-corner--tr" />
                  <span className="photo-guide-corner photo-guide-corner--bl" />
                  <span className="photo-guide-corner photo-guide-corner--br" />
                </div>
              </div>
            )}

            {!renovationCompareMode && photoOverlayUrl && photoCompareMode && (
              <div
                className="photo-compare-handle"
                style={{ left: `calc(${photoComparePos}% + 8px - 1px)` }}
                onPointerDown={(e) => {
                  compareDragging.current = true;
                  (e.target as HTMLElement).setPointerCapture(e.pointerId);
                }}
                onPointerMove={(e) => {
                  if (!compareDragging.current) return;
                  const container = (e.target as HTMLElement).parentElement;
                  if (!container) return;
                  const rect = container.getBoundingClientRect();
                  const x = Math.max(0, Math.min(1, (e.clientX - rect.left - 8) / (rect.width - 16)));
                  updatePhotoOverlay({ compare_position: Math.round(x * 100) });
                }}
                onPointerUp={() => { compareDragging.current = false; }}
                onPointerCancel={() => { compareDragging.current = false; }}
              >
                <div className="photo-compare-thumb">
                  <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                    <path d="M3 0L0 3v10l3 3V0zM7 0l3 3v10l-3 3V0z" />
                  </svg>
                </div>
              </div>
            )}

            {!renovationCompareMode && photoOverlayUrl && (
              <div className="photo-overlay-controls">
                <label className="photo-overlay-label">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(photoOverlayOpacity * 100)}
                    onChange={(e) => updatePhotoOverlay({ opacity: Number(e.target.value) / 100 })}
                    className="daylight-slider"
                    disabled={photoCompareMode}
                    style={photoCompareMode ? { opacity: 0.4 } : undefined}
                    aria-label={t("photoOverlay.opacity")}
                  />
                  <span className="photo-overlay-value">{Math.round(photoOverlayOpacity * 100)}%</span>
                </label>
                <button
                  type="button"
                  className={`photo-compare-toggle${photoCompareMode ? " active" : ""}`}
                  onClick={() => updatePhotoOverlay({ compare_mode: !photoCompareMode })}
                  title={t("editor.photoCompare")}
                  aria-pressed={photoCompareMode}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="2" x2="12" y2="22" />
                    <polyline points="8 6 4 12 8 18" />
                    <polyline points="16 6 20 12 16 18" />
                  </svg>
                </button>
                <button
                  type="button"
                  className="photo-overlay-action"
                  onClick={() => { void exportPhotoOverlayPng(); }}
                  title={t("photoOverlay.exportPng")}
                >
                  PNG
                </button>
                <button
                  type="button"
                  className="photo-overlay-action"
                  onClick={resetPhotoOverlayAlignment}
                  title={t("photoOverlay.resetAlignment")}
                >
                  0
                </button>
                <button
                  type="button"
                  className="photo-overlay-clear"
                  onClick={clearPhotoOverlay}
                  aria-label={t("editor.photoOverlayClear")}
                >
                  &times;
                </button>
                <div className="photo-alignment-controls" aria-label={t("photoOverlay.alignmentControls")}>
                  <label>
                    <span>{t("photoOverlay.offsetX")}</span>
                    <input
                      type="range"
                      min={-40}
                      max={40}
                      value={photoOffsetX}
                      onChange={(e) => updatePhotoOverlay({ offset_x: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    <span>{t("photoOverlay.offsetY")}</span>
                    <input
                      type="range"
                      min={-40}
                      max={40}
                      value={photoOffsetY}
                      onChange={(e) => updatePhotoOverlay({ offset_y: Number(e.target.value) })}
                    />
                  </label>
                  <label>
                    <span>{t("photoOverlay.scale")}</span>
                    <input
                      type="range"
                      min={60}
                      max={180}
                      value={Math.round(photoScale * 100)}
                      onChange={(e) => updatePhotoOverlay({ scale: Number(e.target.value) / 100 })}
                    />
                  </label>
                  <label>
                    <span>{t("photoOverlay.rotation")}</span>
                    <input
                      type="range"
                      min={-15}
                      max={15}
                      value={photoRotation}
                      onChange={(e) => updatePhotoOverlay({ rotation: Number(e.target.value) })}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Floating viewport toolbar */}
          <div className="viewport-toolbar">
            <button
              className="viewport-toolbar-btn"
              data-active={wireframe}
              onClick={() => setWireframe(!wireframe)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              {t('editor.wireframe')}
            </button>
            <button
              className="viewport-toolbar-btn"
              data-active={renovationCompareMode}
              onClick={toggleRenovationCompareMode}
              aria-pressed={renovationCompareMode}
              title={t("editor.compare")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18" />
                <path d="M4 6h16" />
                <path d="M4 18h16" />
              </svg>
              {t("editor.compare")}
            </button>
            <button
              className="viewport-toolbar-btn"
              data-active={showScenarioRenderPanel}
              onClick={triggerScenarioRender}
              aria-pressed={showScenarioRenderPanel}
              title={t("editor.renderScenario")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="11" rx="2" />
                <path d="M8 19h8" />
                <path d="M10 15l-2 4" />
                <path d="M14 15l2 4" />
              </svg>
              {t("editor.renderScenario")}
            </button>
            {isMobileEditor && (
              <button
                className="viewport-toolbar-btn"
                data-active={showArOverlay}
                onClick={() => {
                  setShowArOverlay(true);
                  track("ar_camera_opened", { project_id: projectId, has_render: Boolean(presentationRef.current) });
                }}
                aria-pressed={showArOverlay}
                title={t("ar.title")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                  <path d="M4 18h4M16 18h4" />
                </svg>
                {t("ar.short")}
              </button>
            )}
            <button
              className="viewport-toolbar-btn"
              data-active={thermalView}
              onClick={() => setThermalView(!thermalView)}
              title={`${t('editor.thermal')} (T)`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
              </svg>
              {t('editor.thermal')}
            </button>
            <button
              className="viewport-toolbar-btn"
              data-active={airflowView}
              onClick={() => setAirflowView((value) => !value)}
              title={`${t('airflow.title')} (V)`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12c3-4 7 4 10 0 2-3 5 1 6 3" />
                <path d="M3 6c4-4 9 4 13 0" />
                <path d="M5 18c2-2 5 2 8 0" />
              </svg>
              {t('airflow.shortTitle')}
            </button>
            <button
              className="viewport-toolbar-btn"
              data-active={explodedView}
              onClick={() => setExplodedView(!explodedView)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l-2 4h4l-2-4z" />
                <path d="M12 22l-2-4h4l-2 4z" />
                <path d="M2 12l4-2v4l-4-2z" />
                <path d="M22 12l-4-2v4l4-2z" />
                <rect x="9" y="9" width="6" height="6" rx="1" />
              </svg>
              {t('editor.explode')}
            </button>
            <div className="viewport-lighting-wrap" ref={lightingMenuRef}>
              <button
                className="viewport-toolbar-btn"
                data-active={lightingPreset !== "default"}
                onClick={() => setShowLightingMenu((v) => !v)}
                title={t('editor.lighting')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                {t('editor.lighting')}
              </button>
              {showLightingMenu && (
                <div className="viewport-lighting-menu">
                  {(["default", "summer", "winter", "evening"] as const).map((id) => (
                    <button
                      key={id}
                      className="viewport-lighting-option"
                      data-active={lightingPreset === id}
                      onClick={() => { setLightingPreset(id); setShowLightingMenu(false); }}
                    >
                      <span className={`viewport-lighting-swatch viewport-lighting-swatch--${id}`} />
                      {t(`editor.lighting${id.charAt(0).toUpperCase() + id.slice(1)}` as any)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              className="viewport-toolbar-btn"
              data-active={showEnergyDashboard}
              onClick={() => setShowEnergyDashboard((v) => !v)}
              title={t('energy.toolbarLabel')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              {t('energy.toolbarLabel')}
            </button>
            <button
              className="viewport-toolbar-btn"
              data-active={showNeighborhoodInsights}
              onClick={() => setShowNeighborhoodInsights((v) => !v)}
              title={t("neighborhood.toolbarLabel")}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21s7-4.4 7-11a7 7 0 0 0-14 0c0 6.6 7 11 7 11z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              {t("neighborhood.toolbarLabel")}
            </button>
            <button
              className="viewport-toolbar-btn"
              data-active={showDaylightPanel}
              onClick={() => setShowDaylightPanel((v) => !v)}
              title={t('editor.daylightTitle')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
              {t('editor.daylightTitle')}
            </button>
            {!isMobileEditor && (
              <button
                className="viewport-toolbar-btn"
                data-active={showAssemblyGuide}
                onClick={toggleAssemblyGuide}
                title={t("assemblyGuide.title")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 7l8-4 8 4-8 4-8-4z" />
                  <path d="M4 7v10l8 4 8-4V7" />
                  <path d="M12 11v10" />
                </svg>
                {t("assemblyGuide.shortTitle")}
              </button>
            )}
            {!isMobileEditor && (
              <button
                className="viewport-toolbar-btn"
                data-active={showConstructionTimelapse}
                onClick={() => toggleConstructionTimelapse(false)}
                title={t("timelapse.title")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 5h16" />
                  <path d="M4 19h16" />
                  <path d="M7 5v14" />
                  <path d="M17 5v14" />
                  <path d="M10 9l5 3-5 3V9z" />
                </svg>
                {t("timelapse.shortTitle")}
              </button>
            )}
            <button
              className="viewport-toolbar-btn"
              data-active={!!photoOverlayUrl}
              onClick={() => {
                if (photoOverlayUrl) {
                  clearPhotoOverlay();
                } else {
                  photoInputRef.current?.click();
                }
              }}
              title={photoOverlayUrl ? t('editor.photoOverlayClear') : t('editor.photoOverlay')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
              {t('editor.photoOverlay')}
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                void handlePhotoOverlayFile(file);
                e.target.value = "";
              }}
            />
            <button
              className="viewport-toolbar-btn"
              data-active={viewportMeasurementMode}
              onClick={toggleViewportMeasurementMode}
              title={`${t('editor.ruler')} (Cmd+M)`}
              aria-label={t('editor.rulerTooltip')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 17L17 3l4 4L7 21l-4-4z" />
                <path d="M14 6l4 4M11 9l2 2M8 12l4 4M5 15l2 2" />
              </svg>
              {t('editor.ruler')}
            </button>
            <button
              className="viewport-toolbar-btn"
              onClick={resetViewportCamera}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4v6h6" />
                <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              {t('editor.resetCamera')}
            </button>
            <span className="viewport-toolbar-sep" />
            <button
              className="viewport-toolbar-btn"
              data-active={showMoodBoard}
              onClick={toggleMoodBoardPanel}
              title={locale === "fi" ? "Tunnelmataulu" : "Mood board"}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                <path d="M15 5l4 4" />
              </svg>
              {locale === "fi" ? "Tunnelma" : "Mood"}
            </button>
            {isAdvancedMode && (
              <button
                className="viewport-toolbar-btn"
                data-active={showCode}
                onClick={toggleCodePanel}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                {showCode ? t('editor.hideCode') : t('editor.showCode')}
              </button>
            )}
            {isAdvancedMode && (
              <button
                className="viewport-toolbar-btn"
                data-active={showDocs}
                onClick={toggleDocsPanel}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                {t('editor.docs') || "Docs"}
              </button>
            )}
            {isAdvancedMode && sceneParams.length > 0 && (
              <button
                className="viewport-toolbar-btn"
                data-active={showParams}
                onClick={toggleParamsPanel}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14" />
                  <line x1="4" y1="10" x2="4" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12" y2="3" />
                  <line x1="20" y1="21" x2="20" y2="16" />
                  <line x1="20" y1="12" x2="20" y2="3" />
                </svg>
                {t('editor.params') || "Params"}
              </button>
            )}
            {isAdvancedMode && !isMobileEditor && (
              <button
                className="viewport-toolbar-btn"
                data-active={showLayers}
                onClick={toggleLayersPanel}
                title={t("layers.title")}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6h16" />
                  <path d="M4 12h16" />
                  <path d="M4 18h16" />
                  <circle cx="8" cy="6" r="1.5" />
                  <circle cx="12" cy="12" r="1.5" />
                  <circle cx="16" cy="18" r="1.5" />
                </svg>
                {t("layers.title")}
              </button>
            )}
            <span className="viewport-toolbar-sep" />
            <span
              className="viewport-status"
              data-error={!!sceneError}
              title={sceneError && sceneError.length > 40 ? sceneError : undefined}
            >
              {sceneError
                ? `${t('editor.sceneErrorPrefix')}: ${sceneError.substring(0, 40)}${sceneError.length > 40 ? "..." : ""}`
                : t('editor.objectCount', { count: objectCount })}
            </span>
          </div>

          {/* Thermal legend */}
          {thermalView && (
            <div className="viewport-thermal-legend" data-testid="thermal-panel">
              <div className="viewport-thermal-legend-title">{t('editor.thermalLegend')}</div>
              <div className="viewport-thermal-legend-bar" />
              <div className="viewport-thermal-legend-labels">
                <span>{t('editor.thermalLow')}</span>
                <span>{t('editor.thermalHigh')}</span>
              </div>
              <div className="thermal-controls">
                <label>
                  <span>{t("editor.thermalLocation")}</span>
                  <select
                    value={thermalLocationIndex}
                    onChange={(event) => {
                      const nextIndex = Number(event.currentTarget.value);
                      setThermalLocationIndex(nextIndex);
                      setThermalOutsideTemp(CLIMATE_LOCATIONS[nextIndex]?.designTemp ?? thermalOutsideTemp);
                    }}
                  >
                    {CLIMATE_LOCATIONS.map((location, index) => (
                      <option key={location.code} value={index}>{location.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>{t("editor.thermalOutdoor")}: {thermalOutsideTemp} °C</span>
                  <input
                    type="range"
                    min={-40}
                    max={30}
                    step={1}
                    value={thermalOutsideTemp}
                    onChange={(event) => setThermalOutsideTemp(Number(event.currentTarget.value))}
                  />
                </label>
                <label>
                  <span>{t("editor.thermalIndoor")}: {thermalInsideTemp} °C</span>
                  <input
                    type="range"
                    min={5}
                    max={25}
                    step={1}
                    value={thermalInsideTemp}
                    onChange={(event) => setThermalInsideTemp(Number(event.currentTarget.value))}
                  />
                </label>
              </div>
              {thermalData?.compliance && (thermalData.compliance.pass + thermalData.compliance.warn + thermalData.compliance.fail) > 0 && (
                <div className="thermal-compliance-row">
                  <span className="thermal-compliance-title">{t('editor.codeCompliance')}</span>
                  <div className="thermal-compliance-badges">
                    {thermalData.compliance.pass > 0 && (
                      <span className="thermal-badge thermal-badge-pass">{t('editor.compliancePass')} {thermalData.compliance.pass}</span>
                    )}
                    {thermalData.compliance.warn > 0 && (
                      <span className="thermal-badge thermal-badge-warn">{t('editor.complianceWarn')} {thermalData.compliance.warn}</span>
                    )}
                    {thermalData.compliance.fail > 0 && (
                      <span className="thermal-badge thermal-badge-fail">{t('editor.complianceFail')} {thermalData.compliance.fail}</span>
                    )}
                  </div>
                </div>
              )}
              <div className="thermal-inspector">
                <div className="thermal-inspector-title">{t("editor.thermalInspect")}</div>
                {thermalInspectionDetails ? (
                  <>
                    <div className="thermal-inspector-name">
                      <strong>{thermalInspectionDetails.materialName}</strong>
                      {thermalInspectionDetails.layerName && (
                        <span>{t("editor.thermalLayer")}: {thermalInspectionDetails.layerName}</span>
                      )}
                    </div>
                    {thermalInspectionDetails.data ? (
                      <>
                        <div className="thermal-inspector-grid">
                          <span>{t("editor.thermalUValue")} <strong>{thermalInspectionDetails.data.uValue.toFixed(2)} W/m²K</strong></span>
                          <span>{t("editor.thermalRValue")} <strong>{thermalInspectionDetails.data.rValue.toFixed(2)} m²K/W</strong></span>
                          <span>{t("editor.thermalFlux")} <strong>{thermalInspectionDetails.data.heatFluxDensity.toFixed(1)} W/m²</strong></span>
                          <span>{t("editor.thermalInsideSurface")} <strong>{thermalInspectionDetails.data.insideSurfaceTempC.toFixed(1)} °C</strong></span>
                          <span>{t("editor.thermalOutsideSurface")} <strong>{thermalInspectionDetails.data.outsideSurfaceTempC.toFixed(1)} °C</strong></span>
                          <span>{t("editor.thermalAnnualLoss")} <strong>{thermalInspectionDetails.areaM2 > 0 ? `${thermalInspectionDetails.annualHeatLossKwh.toFixed(0)} kWh/y` : t("editor.thermalAreaUnknown")}</strong></span>
                        </div>
                        <div className="thermal-inspector-foot">
                          <span>{t("editor.thermalRating")}: {t((`editor.thermalRating_${thermalInspectionDetails.rating}`) as any)}</span>
                          {thermalInspectionDetails.compliance && (
                            <span>
                              {t("editor.thermalComplianceReference")}: {t((`editor.thermalReference_${thermalInspectionDetails.compliance.referenceCategory}`) as any)} ≤ {thermalInspectionDetails.compliance.referenceU.toFixed(2)} W/m²K
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <p>{t("editor.thermalNoData")}</p>
                    )}
                  </>
                ) : (
                  <p>{t("editor.thermalClickHint")}</p>
                )}
              </div>
            </div>
          )}

          {airflowView && (
            <div className="viewport-airflow-panel" data-testid="airflow-panel" aria-label={t("airflow.title")}>
              <div className="viewport-airflow-header">
                <div>
                  <div className="label-mono">{t("airflow.eyebrow")}</div>
                  <strong>{t("airflow.title")}</strong>
                </div>
                <span className={`airflow-ach-badge airflow-ach-badge--${airflowAnalysis.adequacy}`}>
                  {airflowAnalysis.airChangesPerHour} {t("airflow.ach")}
                </span>
              </div>
              <p className="viewport-airflow-summary">
                {t(`airflow.${airflowAnalysis.adequacy}` as any, {
                  openings: airflowAnalysis.openingCount,
                  heat: airflowAnalysis.heatWatts,
                })}
              </p>
              <div className="viewport-airflow-metrics">
                <span>{t("airflow.stack")}: {airflowAnalysis.stackVelocityMps} m/s</span>
                <span>{t("airflow.openings")}: {airflowAnalysis.openingCount}</span>
                <span>{t("airflow.deltaT")}: {airflowAnalysis.deltaTempC} C</span>
              </div>
              <div className="viewport-airflow-controls">
                <label>
                  <span>{t("airflow.particles")}: {airflowParticleDensity}</span>
                  <input
                    type="range"
                    min={50}
                    max={1000}
                    step={50}
                    value={airflowParticleDensity}
                    onChange={(event) => setAirflowParticleDensity(Number(event.currentTarget.value))}
                  />
                </label>
                <label>
                  <span>{t("airflow.speed")}: {airflowSpeed.toFixed(1)}x</span>
                  <input
                    type="range"
                    min={0.5}
                    max={3}
                    step={0.25}
                    value={airflowSpeed}
                    onChange={(event) => setAirflowSpeed(Number(event.currentTarget.value))}
                  />
                </label>
                <label>
                  <span>{t("airflow.wind")}: {airflowWindSpeed.toFixed(1)} m/s</span>
                  <input
                    type="range"
                    min={0}
                    max={15}
                    step={0.5}
                    value={airflowWindSpeed}
                    onChange={(event) => setAirflowWindSpeed(Number(event.currentTarget.value))}
                  />
                </label>
                <label>
                  <span>{t("airflow.windDirection")}: {airflowWindDirection} deg</span>
                  <input
                    type="range"
                    min={0}
                    max={345}
                    step={15}
                    value={airflowWindDirection}
                    onChange={(event) => setAirflowWindDirection(Number(event.currentTarget.value))}
                  />
                </label>
              </div>
              <button
                type="button"
                className="airflow-arrow-toggle"
                data-active={airflowShowArrows}
                onClick={() => setAirflowShowArrows((value) => !value)}
              >
                {airflowShowArrows ? t("airflow.hideArrows") : t("airflow.showArrows")}
              </button>
            </div>
          )}

          {/* Energy dashboard */}
          {showEnergyDashboard && (
            <EnergyDashboard
              materials={materials}
              bom={bom}
              onClose={() => setShowEnergyDashboard(false)}
            />
          )}

          {showNeighborhoodInsights && (
            <NeighborhoodInsightsPanel
              projectId={projectId}
              buildingInfo={project?.building_info ?? null}
              projectType={project?.project_type}
              onClose={() => setShowNeighborhoodInsights(false)}
            />
          )}

          {/* Daylight analysis */}
          {showDaylightPanel && (
            <DaylightPanel
              latitude={project?.permit_metadata?.latitude ?? 60.17}
              longitude={project?.permit_metadata?.longitude ?? 24.94}
              projectName={projectName}
              onLightDirection={(dir, alt) => { setSunDirection(dir); setSunAltitude(alt); }}
              onLightingPreset={setLightingPreset}
              onShadowStudyChange={setDaylightShadowStudy}
              onClose={() => { setShowDaylightPanel(false); setSunDirection(undefined); setSunAltitude(undefined); setDaylightShadowStudy(null); setLightingPreset("default"); }}
            />
          )}

          {showScenarioRenderPanel && (
            <ScenarioRenderPanel
              projectId={projectId}
              projectName={projectName}
              beforeImage={photoOverlayUrl}
              captureApiRef={presentationRef}
              lightingPreset={lightingPreset}
              onLightingPresetChange={setLightingPreset}
              autoGenerateToken={scenarioRenderToken}
              onClose={() => setShowScenarioRenderPanel(false)}
            />
          )}

          <ArCameraOverlay
            open={showArOverlay}
            projectName={projectName}
            modifications={arModifications}
            captureApiRef={presentationRef}
            onClose={() => setShowArOverlay(false)}
            onScreenshot={() => track("ar_screenshot_saved", { project_id: projectId })}
          />

          {/* Scene validation warnings */}
          {sceneWarnings.length > 0 && (
            <div
              style={{
                padding: "6px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                flexShrink: 0,
              }}
            >
              {sceneWarnings.map((w, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 10px",
                    background: "var(--amber-glow)",
                    border: "1px solid var(--amber-border)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: 12,
                    color: "var(--amber)",
                    lineHeight: 1.4,
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ flexShrink: 0 }}
                  >
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span>{formatWarning(w, t)}</span>
                </div>
              ))}
            </div>
          )}

          {isMobileEditor && (
            <MobileEditorTabs<MobileEditorPanel>
              active={activeMobilePanel}
              onChange={handleMobilePanelChange}
              onSwipe={handleMobilePanelSwipe}
              ariaLabel={locale === "fi" ? "Editorin mobiilipaneelit" : "Editor mobile panels"}
              tabs={mobilePanelOrder.map((id) => ({
                id,
                label:
                  id === "viewport" ? t("editor.scene") :
                  id === "chat" ? t("editor.assistant") :
                  id === "mood" ? (locale === "fi" ? "Tunnelma" : "Mood") :
                  id === "bom" ? t("editor.materialList") :
                  id === "code" ? (locale === "fi" ? "Koodi" : "Code") :
                  id === "params" ? t("editor.params") :
                  t("editor.docs") || "Docs",
                badge:
                  id === "chat" ? chatMessageCount || undefined :
                  id === "mood" ? moodBoard.items.length || undefined :
                  id === "bom" ? bom.length || undefined :
                  id === "params" ? sceneParams.length :
                  undefined,
              }))}
            />
          )}

          {showMoodBoard && (
            <MoodBoardPanel
              board={moodBoard}
              materials={materials}
              bomMaterialIds={new Set(bom.map((item) => item.material_id))}
              onChange={setMoodBoard}
              onAddMaterialToBom={addMoodMaterialToBom}
            />
          )}

          {/* Collapsible Code Editor */}
          {isAdvancedMode && showCode && (
            <div
              className="editor-code-panel"
              style={{
                height: 260,
                flexShrink: 0,
                padding: "0 8px 8px 8px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <SceneEditor
                sceneJs={sceneJs}
                onChange={handleSceneChange}
                error={sceneError}
                errorLine={sceneErrorLine}
                materials={materials}
                remoteCursors={collaborationPeers}
                onCursorChange={sendCollaborationCursor}
              />
            </div>
          )}

          {/* Embedded AI assistant */}
          <ChatPanel
            projectId={projectId}
            sceneJs={sceneJs}
            onApplyCode={handleApplyCode}
            bom={bom}
            materials={materials}
            projectName={projectName}
            projectDescription={projectDesc}
            buildingInfo={project?.building_info ?? undefined}
            renovationRoiSummary={renovationRoi?.summary}
            referenceImages={projectImages}
            onMessageCountChange={setChatMessageCount}
          />
          <PriceSummaryBar
            bom={bom}
            onViewBom={showBom ? undefined : () => {
              const el = document.querySelector('[data-panel="bom"]');
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
          />
          {geometryBomUpdate && (
            <div
              role="status"
              aria-live="polite"
              style={{
                position: "absolute",
                left: 18,
                bottom: priceChangeSummary?.show ? 184 : 76,
                zIndex: 12,
                width: "min(520px, calc(100% - 36px))",
                border: "1px solid var(--border-strong)",
                borderRadius: 16,
                padding: "14px 16px",
                background: "color-mix(in srgb, var(--bg-elevated) 92%, transparent)",
                color: "var(--text-primary)",
                boxShadow: "0 22px 70px rgba(0,0,0,0.30)",
                backdropFilter: "blur(16px)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                <div>
                  <div className="label-mono" style={{ color: "var(--amber)", marginBottom: 5 }}>
                    {locale === "fi" ? "Geometria muutti materiaalimääriä" : "Geometry changed BOM quantities"}
                  </div>
                  <strong style={{ fontSize: 15 }}>
                    {locale === "fi"
                      ? `${geometryBomUpdate.suggestions.length} päivitysehdotusta`
                      : `${geometryBomUpdate.suggestions.length} update suggestion${geometryBomUpdate.suggestions.length === 1 ? "" : "s"}`}
                  </strong>
                  <div style={{ marginTop: 5, color: "var(--text-secondary)", fontSize: 12, lineHeight: 1.45 }}>
                    {formatGeometryMetricChange(geometryBomUpdate, locale)}
                  </div>
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={dismissGeometryBomUpdate}
                  aria-label={locale === "fi" ? "Sulje geometriapäivitys" : "Dismiss geometry update"}
                  style={{ padding: "4px 7px", border: "none" }}
                >
                  ×
                </button>
              </div>

              <div style={{ display: "grid", gap: 6, marginTop: 12 }}>
                {[...geometryBomUpdate.suggestions, ...geometryBomUpdate.skippedManual].slice(0, 4).map((suggestion) => (
                  <div
                    key={suggestion.materialId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: 10,
                      background: "var(--bg-secondary)",
                      border: "1px solid var(--border)",
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <strong>{suggestion.materialName}</strong>
                      {manualBomOverrideIds.has(suggestion.materialId) && (
                        <span style={{ color: "var(--amber)", marginLeft: 8 }}>
                          {locale === "fi" ? "manuaalinen" : "manual"}
                        </span>
                      )}
                      <div style={{ color: "var(--text-muted)", marginTop: 2 }}>{suggestion.reason}</div>
                    </div>
                    <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {formatGeometryNumber(suggestion.currentQuantity, suggestion.unit, locale)}
                      {" -> "}
                      <strong>{formatGeometryNumber(suggestion.suggestedQuantity, suggestion.unit, locale)}</strong>
                    </div>
                  </div>
                ))}
              </div>

              {geometryBomUpdate.skippedManual.length > 0 && (
                <div style={{ marginTop: 10, color: "var(--text-muted)", fontSize: 12 }}>
                  {locale === "fi"
                    ? `${geometryBomUpdate.skippedManual.length} manuaalisesti muokattua riviä jätetään ennalleen, ellet valitse uudelleenlaskentaa.`
                    : `${geometryBomUpdate.skippedManual.length} manually edited row${geometryBomUpdate.skippedManual.length === 1 ? "" : "s"} will stay unchanged unless you recalculate all.`}
                </div>
              )}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
                <button className="btn btn-ghost" onClick={dismissGeometryBomUpdate} style={{ padding: "7px 11px", fontSize: 12 }}>
                  {locale === "fi" ? "Pidä nykyiset" : "Keep current"}
                </button>
                {geometryBomUpdate.suggestions.length > 0 && (
                  <button className="btn btn-primary" onClick={() => applyGeometryBomUpdate(false)} style={{ padding: "7px 11px", fontSize: 12 }}>
                    {locale === "fi" ? "Päivitä ehdotetut" : "Update suggested"}
                  </button>
                )}
                {geometryBomUpdate.skippedManual.length > 0 && (
                  <button className="btn btn-secondary" onClick={() => applyGeometryBomUpdate(true)} style={{ padding: "7px 11px", fontSize: 12 }}>
                    {locale === "fi" ? "Laske kaikki uudelleen" : "Recalculate all"}
                  </button>
                )}
              </div>
            </div>
          )}
          {priceChangeSummary?.show && (
            <div
              role="status"
              style={{
                position: "absolute",
                left: 18,
                bottom: 76,
                zIndex: 10,
                maxWidth: 420,
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: "12px 14px",
                background: "rgba(15, 23, 42, 0.88)",
                color: "var(--text-primary)",
                boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
                backdropFilter: "blur(14px)",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 3 }}>
                {locale === "fi" ? "Edellisen käynnin jälkeen" : "Since your last visit"}
              </div>
              <strong style={{ fontSize: 14 }}>
                {priceChangeSummary.delta < 0
                  ? locale === "fi" ? "Materiaalit halpenivat" : "Materials got cheaper"
                  : locale === "fi" ? "Materiaalit kallistuivat" : "Materials got more expensive"}
                {": "}
                {priceChangeSummary.delta > 0 ? "+" : ""}
                {priceChangeSummary.delta.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", {
                  maximumFractionDigits: 0,
                })} EUR
              </strong>
              <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4 }}>
                {priceChangeSummary.previous_total?.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", { maximumFractionDigits: 0 })} EUR{" -> "}
                {priceChangeSummary.current_total.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", { maximumFractionDigits: 0 })} EUR
                {" · "}
                {priceChangeSummary.delta_percent > 0 ? "+" : ""}
                {priceChangeSummary.delta_percent.toFixed(1)}%
              </div>
            </div>
          )}
        </div>

        {/* Scene parameters panel */}
        {isAdvancedMode && showParams && sceneParams.length > 0 && (
          <SceneParamsPanel
            params={sceneParams}
            onParamChange={handleParamChange}
            presets={paramPresets}
            activePreset={activePreset}
            onSavePreset={handleSavePreset}
            onLoadPreset={handleLoadPreset}
            onDeletePreset={handleDeletePreset}
            onResetDefaults={handleResetDefaults}
          />
        )}

        {isAdvancedMode && showLayers && !isMobileEditor && (
          <LayerPanel
            layers={sceneLayers}
            selectedLayerId={selectedLayerId}
            hiddenLayerIds={hiddenLayerIds}
            lockedLayerIds={lockedLayerIds}
            onSelectLayer={handleSelectLayer}
            onToggleLayerVisibility={handleToggleLayerVisibility}
            onToggleLayerLock={handleToggleLayerLock}
            onOpenLayerMaterial={handleOpenLayerMaterial}
            onFocusLayer={(layerId) => focusObjectRef.current?.(layerId)}
            onSetHiddenLayers={setHiddenLayerIds}
          />
        )}

        {isAdvancedMode && showAssemblyGuide && !isMobileEditor && (
          <AssemblyGuidePanel
            guide={assemblyGuide}
            activeStepIndex={assemblyStepIndex}
            completedStepIds={assemblyCompletedStepIds}
            playing={assemblyPlaying}
            speed={assemblySpeed}
            onStepChange={selectAssemblyStep}
            onToggleComplete={toggleAssemblyStepComplete}
            onPlayingChange={setAssemblyPlaying}
            onSpeedChange={setAssemblySpeed}
            onFocusStep={focusAssemblyStep}
            onOpenStepMaterial={openAssemblyStepMaterial}
            onClose={() => { setShowAssemblyGuide(false); setAssemblyPlaying(false); }}
          />
        )}

        {isAdvancedMode && showConstructionTimelapse && !isMobileEditor && (
          <ConstructionTimelapsePanel
            guide={assemblyGuide}
            activeStepIndex={assemblyStepIndex}
            playing={timelapsePlaying}
            speed={timelapseSpeed}
            cameraMode={timelapseCameraMode}
            projectName={projectName}
            onStepChange={selectTimelapseStep}
            onPlayingChange={setTimelapsePlaying}
            onSpeedChange={setTimelapseSpeed}
            onCameraModeChange={setTimelapseCameraMode}
            onFocusStep={focusTimelapseStep}
            onClose={() => { setShowConstructionTimelapse(false); setTimelapsePlaying(false); }}
          />
        )}

        {/* Resize handle + BOM panel */}
        {showBom && (
          <>
            {!isMobileEditor && (
              <div
                className="resize-handle-v"
                role="separator"
                aria-label="Resize BOM panel"
                aria-orientation="vertical"
                onMouseDown={startResize}
                onTouchStart={startTouchResize}
              />
            )}
            <BomPanel
              bom={bom}
              materials={materials}
              onAdd={addBomItem}
              onAddImported={addImportedBomItem}
              onImportBom={importBomItems}
              onReplaceMaterial={replaceBomMaterial}
              onApplySupplierPrice={applyBomPriceOverride}
              onRemove={removeBomItem}
              onUpdateQty={updateBomQty}
              onUpdateNote={updateBomNote}
              onReorder={reorderBom}
              style={isMobileEditor ? undefined : { width: bomWidth }}
              sceneJs={sceneJs}
              projectName={projectName}
              projectDescription={projectDesc}
              buildingInfo={project?.building_info ?? null}
              projectId={projectId}
              projectType={project?.project_type}
              unitCount={project?.unit_count}
              householdDeductionJoint={householdDeductionJoint}
              onHouseholdDeductionJointChange={updateHouseholdDeductionMode}
              onApplyScene={handleBlueprintSceneApply}
              referencePhotosSlot={(
                <ReferencePhotosPanel
                  projectId={projectId}
                  images={projectImages}
                  onImagesChange={setProjectImages}
                />
              )}
            />
          </>
        )}

        {/* Scene API Reference panel */}
        {isAdvancedMode && showDocs && (
          <div className="scene-docs-panel" style={{ width: 320, flexShrink: 0, height: "100%", overflow: "hidden" }}>
            <SceneApiReference
              onInsertCode={(code) => {
                const updated = sceneJs + "\n" + code;
                queueSceneAnnouncement("editor.sceneSnippetInserted");
                setSceneJs(updated);
                pushHistory(updated);
                setShowCode(true);
                if (isMobileEditor) setActiveMobilePanel("code");
              }}
            />
          </div>
        )}
      </main>

      {!isMobileEditor && (
        <EditorStatusBar
          objectCount={objectCount}
          materialCount={bom.length}
          scriptByteSize={new TextEncoder().encode(sceneJs).length}
          saveStatus={saveStatus}
          lastSavedAt={lastSaved ? new Date(lastSaved) : null}
          warningCount={sceneWarnings.length}
        />
      )}

      {surfacePickerContext && (
        <MaterialPicker
          currentMaterialId={surfacePickerContext.currentMaterialId}
          bomItem={surfacePickerContext.bomItem}
          materials={materials}
          disabledMaterialIds={new Set(bom.map((item) => item.material_id).filter((id) => id !== surfacePickerContext.currentMaterialId))}
          onClose={() => setSurfacePickerMaterialId(null)}
          onSelect={handleSurfacePickerSelect}
        />
      )}

      {/* Share dialog */}
      {showShareDialog && shareToken && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            animation: "fadeIn 0.15s ease both",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowShareDialog(false);
          }}
        >
          <div style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(4px)",
          }} />
          <div
            ref={shareDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-dialog-title"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 620,
              maxHeight: "calc(100vh - 48px)",
              overflowY: "auto",
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-lg)",
              padding: "28px 28px 24px",
              boxShadow: "var(--shadow-lg)",
              animation: "dialogSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
            }}
          >
            <h2
              id="share-dialog-title"
              className="heading-display"
              style={{ fontSize: 18, margin: "0 0 8px", color: "var(--text-primary)" }}
            >
              {t('share.title')}
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 20px", lineHeight: 1.5 }}>
              {t('share.description')}
            </p>
            {Number(project?.view_count || 0) > 0 && (
              <div className="badge badge-muted" style={{ display: "inline-flex", marginBottom: 14 }}>
                {t("share.viewCount", { count: Number(project?.view_count || 0) })}
              </div>
            )}
            {shareExpiresAt && (
              <div className="badge badge-muted" style={{ display: "inline-flex", marginBottom: 14, marginLeft: Number(project?.view_count || 0) > 0 ? 8 : 0 }}>
                {t("share.expiresAt", {
                  date: new Date(shareExpiresAt).toLocaleDateString(locale === "fi" ? "fi-FI" : locale === "sv" ? "sv-SE" : "en-GB"),
                })}
              </div>
            )}
            {isPublicGalleryProject && (
              <div className="badge badge-muted" style={{ display: "inline-flex", marginBottom: 14, marginLeft: 8 }}>
                {t("share.publicGalleryBadge")}
              </div>
            )}

            <div className="share-publish-panel">
              <label>
                <input
                  type="checkbox"
                  checked={isPublicGalleryProject}
                  disabled={publishLoading}
                  onChange={(event) => togglePublicGalleryProject(event.currentTarget.checked)}
                />
                <span>{t("share.publishToGallery")}</span>
              </label>
              <p>{t("share.publishToGalleryDesc")}</p>
              {isPublicGalleryProject && (
                <Link href="/gallery" target="_blank" rel="noreferrer">
                  {t("share.viewInGallery")}
                </Link>
              )}
            </div>

            {/* Share URL field */}
            <div style={{
              display: "flex",
              gap: 8,
              marginBottom: 16,
            }}>
              <input
                className="input"
                readOnly
                aria-label={t('share.linkLabel')}
                value={`${typeof window !== "undefined" ? window.location.origin : ""}/shared/${shareToken}`}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontFamily: "var(--font-mono)",
                  padding: "10px 12px",
                }}
              />
              <button
                className="btn btn-primary"
                onClick={async () => {
                  const url = `${window.location.origin}/shared/${shareToken}`;
                  const copiedToClipboard = await copyTextToClipboard(url);
                  if (copiedToClipboard) {
                    setShareCopied(true);
                    toast(t('toast.linkCopied'), "success");
                    setTimeout(() => setShareCopied(false), 2000);
                    return;
                  }
                  toast(t('toast.copyFailed'), "error");
                }}
                style={{ padding: "10px 16px", fontSize: 13, fontWeight: 600, flexShrink: 0 }}
              >
                {shareCopied ? t('share.copied') : t('share.copyLink')}
              </button>
            </div>

            <SharePresentationPanel
              shareToken={shareToken}
              projectName={projectName}
              bom={bom}
              captureApiRef={presentationRef}
              onCopySuccess={() => toast(t('toast.linkCopied'), "success")}
              onCopyError={() => toast(t('toast.copyFailed'), "error")}
            />

            <BeforeAfterSharePanel
              projectId={projectId}
              shareToken={shareToken}
              projectName={projectName}
              beforeImage={photoOverlayUrl}
              initialPreview={sharePreview}
              captureApiRef={presentationRef}
              onShareSaved={(result) => {
                setSharePreview(result.share_preview);
                setShareToken(result.share_token);
                setShareExpiresAt(result.share_token_expires_at);
                setProject((current) => current ? {
                  ...current,
                  share_preview: result.share_preview,
                  share_token: result.share_token,
                  share_token_expires_at: result.share_token_expires_at,
                } : current);
              }}
              onCopySuccess={() => toast(t('toast.linkCopied'), "success")}
              onCopyError={() => toast(t('toast.copyFailed'), "error")}
            />

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
              <button
                className="btn btn-ghost"
                onClick={async () => {
                  if (!confirm(t('share.unshareConfirm'))) return;
                  try {
                    await api.unshareProject(projectId);
                    setShareToken(null);
                    setShareExpiresAt(null);
                    setSharePreview(null);
                    setShowShareDialog(false);
                    toast(t('toast.projectUnshared'), "success");
                  } catch (err) {
                    toast(err instanceof Error ? err.message : t('toast.unshareFailed'), "error");
                  }
                }}
                style={{
                  padding: "10px 16px",
                  fontSize: 13,
                  color: "var(--danger)",
                }}
              >
                {t('share.unshare')}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => setShowShareDialog(false)}
                style={{ padding: "10px 20px", fontSize: 13 }}
              >
                {t('editor.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ARA pre-flight checklist dialog */}
      {showAraChecklist && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            animation: "fadeIn 0.15s ease both",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAraChecklist(false);
          }}
        >
          <div style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0, 0, 0, 0.62)",
            backdropFilter: "blur(4px)",
          }} />
          <div
            ref={araDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ara-dialog-title"
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 560,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--radius-lg)",
              padding: "28px 28px 24px",
              boxShadow: "var(--shadow-lg)",
              animation: "dialogSlideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1) both",
            }}
          >
            <h2
              id="ara-dialog-title"
              className="heading-display"
              style={{ fontSize: 18, margin: "0 0 8px", color: "var(--text-primary)" }}
            >
              {locale === "fi" ? "ARA-avustuspaketin tarkistus" : "ARA grant package pre-flight"}
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", margin: "0 0 18px", lineHeight: 1.5 }}>
              {locale === "fi"
                ? "Helscoop tuottaa energialuokka-arvion, remonttisuunnitelman ja kustannusarvion nykyisestä projektista. Lisää nämä hakemukseen käsin ennen lähettämistä."
                : "Helscoop will generate the energy-class estimate, renovation plan, and cost estimate from this project. Add these owner-supplied attachments manually before submission."}
            </p>

            <div style={{
              display: "grid",
              gap: 8,
              padding: "12px 14px",
              borderRadius: "var(--radius-md)",
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              marginBottom: 16,
            }}>
              {araChecklistItems.map((item) => (
                <label key={item} style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  <input type="checkbox" style={{ marginTop: 2 }} />
                  <span>{item}</span>
                </label>
              ))}
            </div>

            <div style={{
              padding: "10px 12px",
              marginBottom: 18,
              borderRadius: "var(--radius-sm)",
              background: "var(--warning-dim)",
              border: "1px solid var(--warning-border)",
              color: "var(--warning)",
              fontSize: 12,
              lineHeight: 1.5,
            }}>
              {locale === "fi"
                ? "Ei virallinen ARA-päätös tai energiatodistus. Tarkista ARA:n ajantasaiset ehdot ennen työn aloitusta."
                : "Not an official ARA decision or energy certificate. Check current ARA requirements before work starts."}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button
                className="btn btn-ghost"
                onClick={() => setShowAraChecklist(false)}
                style={{ padding: "10px 18px", fontSize: 13 }}
              >
                {t("editor.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={exportAraGrantPackage}
                disabled={exportingFormat !== null}
                style={{ padding: "10px 18px", fontSize: 13, fontWeight: 600 }}
              >
                {exportingFormat === "ara"
                  ? (locale === "fi" ? "Viedään..." : "Exporting...")
                  : (locale === "fi" ? "Vie ARA-paketti" : "Export ARA package")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keyboard shortcuts help overlay */}
      <KeyboardShortcutsHelp
        open={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
        shortcuts={shortcuts}
      />

      {/* Command palette (Cmd+K) */}
      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={paletteCommands}
      />

      <OnboardingTour />
    </div>
  );
}
