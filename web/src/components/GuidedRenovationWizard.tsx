"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import {
  DEFAULT_RENOVATION_WIZARD_STATE,
  WIZARD_CURRENT_STATE_OPTIONS,
  WIZARD_DESIGN_TIER_OPTIONS,
  WIZARD_ENERGY_OPTIONS,
  WIZARD_HOUSE_SIZE_OPTIONS,
  WIZARD_SCOPE_OPTIONS,
  buildGuidedRenovationPlan,
  estimateWizardCost,
  type GuidedRenovationPlan,
  type RenovationWizardState,
  type WizardCurrentState,
  type WizardDesignTier,
  type WizardEnergyUpgrade,
  type WizardHouseSize,
  type WizardOption,
  type WizardRenovationType,
} from "@/lib/renovation-wizard";
import type { BuildingInfo, Material } from "@/types";

type WizardStepId = "scope" | "house" | "current" | "design" | "review";
type WizardSource = "project_list" | "editor";

interface GuidedRenovationWizardProps {
  materials: Material[];
  buildingInfo?: BuildingInfo | null;
  source: WizardSource;
  onClose: () => void;
  onComplete: (plan: GuidedRenovationPlan, state: RenovationWizardState) => Promise<void> | void;
  onCompleteAdvanced?: (plan: GuidedRenovationPlan, state: RenovationWizardState) => Promise<void> | void;
  onStepViewed?: (step: number, stepId: WizardStepId, state: RenovationWizardState) => void;
}

const STEPS: { id: WizardStepId; label: string; description: string }[] = [
  { id: "scope", label: "Renovation type", description: "Choose one scope to keep the first pass focused." },
  { id: "house", label: "Your house", description: "Set project scale before choosing materials." },
  { id: "current", label: "Current state", description: "Add a realistic risk buffer for older houses." },
  { id: "design", label: "Design choices", description: "Pick a material tier and optional energy add-on." },
  { id: "review", label: "Review", description: "Create a real scene script and material list." },
];

const COPY = {
  fi: {
    title: "Ohjattu remonttivelho",
    subtitle: "Valitse 3-5 asiaa kerrallaan. Helscoop luo mallin, BOMin ja kustannuspolun.",
    total: "Juokseva arvio",
    preview: "Live 3D -esikatselu",
    showMore: "Näytä lisävaihtoehto",
    showLess: "Piilota lisävaihtoehto",
    customize: "Mukauta lisää",
    back: "Takaisin",
    next: "Seuraava",
    close: "Sulje",
    apply: "Luo suunnitelma",
    applyAdvanced: "Luo ja avaa advanced-tila",
    bom: "BOM-rivit",
    scene: "Scene script",
    cost: "Arvioitu kokonaisbudjetti",
    energy: "Energiapäivitys",
    noEnergy: "Ei lisäystä",
  },
  en: {
    title: "Guided renovation wizard",
    subtitle: "Choose 3-5 things at a time. Helscoop creates the model, BOM, and cost path.",
    total: "Running estimate",
    preview: "Live 3D preview",
    showMore: "Show more option",
    showLess: "Hide extra option",
    customize: "Customize further",
    back: "Back",
    next: "Next",
    close: "Close",
    apply: "Create plan",
    applyAdvanced: "Create and open advanced mode",
    bom: "BOM rows",
    scene: "Scene script",
    cost: "Estimated total budget",
    energy: "Energy add-on",
    noEnergy: "No add-on",
  },
  sv: {
    title: "Guidad renoveringsguide",
    subtitle: "Valj 3-5 saker i taget. Helscoop skapar modell, BOM och kostnadsvag.",
    total: "Lopande uppskattning",
    preview: "Live 3D-forhandsvisning",
    showMore: "Visa fler alternativ",
    showLess: "Dolj extra alternativ",
    customize: "Anpassa mer",
    back: "Tillbaka",
    next: "Nasta",
    close: "Stang",
    apply: "Skapa plan",
    applyAdvanced: "Skapa och oppna avancerat lage",
    bom: "BOM-rader",
    scene: "Scene script",
    cost: "Uppskattad totalbudget",
    energy: "Energitillagg",
    noEnergy: "Inget tillagg",
  },
} as const;

function localeKey(locale: string): keyof typeof COPY {
  if (locale === "fi" || locale === "sv") return locale;
  return "en";
}

function formatEuro(value: number, locale: string): string {
  return `${value.toLocaleString(locale === "fi" ? "fi-FI" : "en-GB", { maximumFractionDigits: 0 })} EUR`;
}

function OptionGrid<T extends string>({
  options,
  value,
  onSelect,
  maxPrimary = 5,
  showMore,
  onToggleMore,
  showMoreLabel = "Show more",
  showLessLabel = "Show less",
}: {
  options: WizardOption<T>[];
  value: T;
  onSelect: (value: T) => void;
  maxPrimary?: number;
  showMore?: boolean;
  onToggleMore?: () => void;
  showMoreLabel?: string;
  showLessLabel?: string;
}) {
  const visible = showMore ? options : options.slice(0, maxPrimary);
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        {visible.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            className="btn btn-ghost"
            data-active={value === option.id}
            style={{
              minHeight: 112,
              alignItems: "stretch",
              justifyContent: "flex-start",
              flexDirection: "column",
              textAlign: "left",
              padding: 12,
              borderColor: value === option.id ? "var(--amber-border)" : "var(--border)",
              background: value === option.id ? "rgba(229,160,75,0.12)" : "var(--bg-tertiary)",
            }}
          >
            <span style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 800 }}>{option.label}</span>
            <span style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.35, marginTop: 5 }}>
              {option.description}
            </span>
            <span className="badge badge-amber" style={{ marginTop: "auto", alignSelf: "flex-start", fontSize: 10 }}>
              {option.costHint}
            </span>
          </button>
        ))}
      </div>
      {options.length > maxPrimary && onToggleMore && (
        <button type="button" className="btn btn-ghost" onClick={onToggleMore} style={{ justifySelf: "start", fontSize: 12 }}>
          {showMore ? showLessLabel : showMoreLabel}
        </button>
      )}
    </div>
  );
}

function PreviewModel({ state }: { state: RenovationWizardState }) {
  const roofColor = state.renovationType === "roof" ? "#9aa3a7" : "#c99a5b";
  const wallColor = state.designTier === "best" ? "#e7d7b8" : state.designTier === "better" ? "#d7be8f" : "#bca577";
  const accent = state.energyUpgrade === "none" ? "#e5a04b" : "#7abf87";
  return (
    <div
      data-testid="wizard-3d-preview"
      aria-label="Live 3D preview"
      style={{
        minHeight: 220,
        borderRadius: 18,
        border: "1px solid rgba(229,160,75,0.24)",
        background: "radial-gradient(circle at 30% 20%, rgba(229,160,75,0.18), transparent 30%), linear-gradient(145deg, #101820, #0b1117)",
        display: "grid",
        placeItems: "center",
        perspective: 900,
        overflow: "hidden",
      }}
    >
      <div style={{ position: "relative", width: 165, height: 140, transform: "rotateX(58deg) rotateZ(-38deg)", transformStyle: "preserve-3d" }}>
        <div style={{ position: "absolute", inset: "58px 20px 18px", background: "#3b3f3d", transform: "translateZ(-8px)", boxShadow: "0 24px 40px rgba(0,0,0,0.35)" }} />
        <div style={{ position: "absolute", left: 35, top: 58, width: 100, height: 58, background: wallColor, transform: "rotateX(90deg) translateZ(29px)", border: "1px solid rgba(255,255,255,0.16)" }} />
        <div style={{ position: "absolute", left: 35, top: 29, width: 100, height: 58, background: wallColor, transform: "translateZ(29px)", border: "1px solid rgba(255,255,255,0.14)" }} />
        <div style={{ position: "absolute", left: 135, top: 29, width: 58, height: 58, background: "#9e875e", transformOrigin: "left", transform: "rotateY(90deg) translateZ(0)", border: "1px solid rgba(255,255,255,0.12)" }} />
        <div style={{ position: "absolute", left: 26, top: 20, width: 118, height: 34, background: roofColor, transform: "translateZ(42px)", border: `2px solid ${accent}`, boxShadow: `0 0 24px ${accent}55` }} />
        <div style={{ position: "absolute", left: 64, top: 66, width: 42, height: 20, background: accent, transform: "translateZ(34px)", opacity: 0.9 }} />
      </div>
    </div>
  );
}

export default function GuidedRenovationWizard({
  materials,
  buildingInfo,
  source,
  onClose,
  onComplete,
  onCompleteAdvanced,
  onStepViewed,
}: GuidedRenovationWizardProps) {
  const { locale } = useTranslation();
  const copy = COPY[localeKey(locale)];
  const [state, setState] = useState<RenovationWizardState>(DEFAULT_RENOVATION_WIZARD_STATE);
  const [stepIndex, setStepIndex] = useState(0);
  const [showMoreScope, setShowMoreScope] = useState(false);
  const [showAdvancedChoices, setShowAdvancedChoices] = useState(false);
  const [saving, setSaving] = useState(false);
  const step = STEPS[stepIndex];
  const estimate = estimateWizardCost(state, buildingInfo);
  const plan = useMemo(() => buildGuidedRenovationPlan(state, materials, buildingInfo), [buildingInfo, materials, state]);

  useEffect(() => {
    onStepViewed?.(stepIndex + 1, step.id, state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, stepIndex]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const update = <K extends keyof RenovationWizardState>(key: K, value: RenovationWizardState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
  };

  const complete = async (advanced: boolean) => {
    setSaving(true);
    try {
      if (advanced && onCompleteAdvanced) {
        await onCompleteAdvanced(plan, state);
      } else {
        await onComplete(plan, state);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guided-renovation-wizard-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1400,
        padding: 18,
        background: "rgba(2,6,12,0.72)",
        display: "grid",
        placeItems: "center",
      }}
    >
      <section
        data-testid="guided-renovation-wizard"
        style={{
          width: "min(1120px, 100%)",
          maxHeight: "min(780px, calc(100vh - 36px))",
          overflow: "auto",
          borderRadius: 22,
          border: "1px solid rgba(229,160,75,0.24)",
          background: "linear-gradient(145deg, rgba(22,27,31,0.98), rgba(10,15,22,0.98))",
          boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
        }}
      >
        <header style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: 18, borderBottom: "1px solid var(--border)" }}>
          <div>
            <div className="label-mono" style={{ color: "var(--amber)", marginBottom: 6 }}>WIZARD</div>
            <h2 id="guided-renovation-wizard-title" className="heading-display" style={{ fontSize: 24, margin: 0 }}>
              {copy.title}
            </h2>
            <p style={{ color: "var(--text-muted)", margin: "6px 0 0", fontSize: 13, lineHeight: 1.45 }}>
              {copy.subtitle}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ textAlign: "right" }}>
              <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 10 }}>{copy.total}</div>
              <strong style={{ color: "var(--amber)", fontSize: 18 }}>{formatEuro(estimate, locale)}</strong>
            </div>
            <button type="button" className="btn btn-ghost" onClick={onClose} aria-label={copy.close}>
              {copy.close}
            </button>
          </div>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: 18, padding: 18 }}>
          <div style={{ minWidth: 0 }}>
            <nav aria-label="Wizard steps" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6, marginBottom: 16 }}>
              {STEPS.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStepIndex(index)}
                  className="btn btn-ghost"
                  data-active={index === stepIndex}
                  style={{
                    padding: "8px 6px",
                    fontSize: 11,
                    borderColor: index === stepIndex ? "var(--amber-border)" : "var(--border)",
                    color: index === stepIndex ? "var(--amber)" : "var(--text-secondary)",
                  }}
                >
                  {index + 1}. {item.label}
                </button>
              ))}
            </nav>

            <div style={{ marginBottom: 14 }}>
              <h3 style={{ color: "var(--text-primary)", margin: 0, fontSize: 18 }}>{step.label}</h3>
              <p style={{ color: "var(--text-muted)", margin: "4px 0 0", fontSize: 12 }}>{step.description}</p>
            </div>

            {step.id === "scope" && (
              <OptionGrid<WizardRenovationType>
                options={WIZARD_SCOPE_OPTIONS}
                value={state.renovationType}
                onSelect={(value) => update("renovationType", value)}
                showMore={showMoreScope}
                onToggleMore={() => setShowMoreScope((visible) => !visible)}
                showMoreLabel={copy.showMore}
                showLessLabel={copy.showLess}
              />
            )}
            {step.id === "house" && (
              <OptionGrid<WizardHouseSize>
                options={WIZARD_HOUSE_SIZE_OPTIONS}
                value={state.houseSize}
                onSelect={(value) => update("houseSize", value)}
              />
            )}
            {step.id === "current" && (
              <OptionGrid<WizardCurrentState>
                options={WIZARD_CURRENT_STATE_OPTIONS}
                value={state.currentState}
                onSelect={(value) => update("currentState", value)}
              />
            )}
            {step.id === "design" && (
              <div style={{ display: "grid", gap: 12 }}>
                <OptionGrid<WizardDesignTier>
                  options={WIZARD_DESIGN_TIER_OPTIONS}
                  value={state.designTier}
                  onSelect={(value) => update("designTier", value)}
                />
                <details open={showAdvancedChoices} onToggle={(event) => setShowAdvancedChoices(event.currentTarget.open)}>
                  <summary style={{ cursor: "pointer", color: "var(--amber)", fontSize: 12, fontWeight: 800 }}>
                    {copy.customize}: {copy.energy}
                  </summary>
                  <div style={{ marginTop: 10 }}>
                    <OptionGrid<WizardEnergyUpgrade>
                      options={WIZARD_ENERGY_OPTIONS}
                      value={state.energyUpgrade}
                      onSelect={(value) => update("energyUpgrade", value)}
                    />
                  </div>
                </details>
              </div>
            )}
            {step.id === "review" && (
              <div style={{ display: "grid", gap: 12 }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
                  <Metric label={copy.cost} value={formatEuro(plan.estimatedCost, locale)} />
                  <Metric label={copy.bom} value={String(plan.bom.length)} />
                  <Metric label={copy.scene} value={`${plan.sceneJs.split("\n").length} lines`} />
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "var(--bg-tertiary)" }}>
                  <h4 style={{ margin: "0 0 8px", color: "var(--text-primary)", fontSize: 13 }}>{plan.name}</h4>
                  <p style={{ margin: 0, color: "var(--text-muted)", fontSize: 12, lineHeight: 1.45 }}>{plan.description}</p>
                  <ul style={{ margin: "10px 0 0", paddingLeft: 18, display: "grid", gap: 4 }}>
                    {plan.bom.slice(0, 5).map((item) => (
                      <li key={item.material_id} style={{ color: "var(--text-secondary)", fontSize: 11 }}>
                        {item.material_name}: {item.quantity} {item.unit}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <footer style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 18 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setStepIndex((index) => Math.max(0, index - 1))} disabled={stepIndex === 0}>
                {copy.back}
              </button>
              {stepIndex < STEPS.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={() => setStepIndex((index) => Math.min(STEPS.length - 1, index + 1))}>
                  {copy.next}
                </button>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  {onCompleteAdvanced && (
                    <button type="button" className="btn btn-ghost" onClick={() => void complete(true)} disabled={saving}>
                      {copy.applyAdvanced}
                    </button>
                  )}
                  <button type="button" className="btn btn-primary" onClick={() => void complete(false)} disabled={saving}>
                    {saving ? <span className="btn-spinner" /> : copy.apply}
                  </button>
                </div>
              )}
            </footer>
          </div>

          <aside style={{ display: "grid", gap: 12, alignSelf: "start" }}>
            <div>
              <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 6 }}>{copy.preview}</div>
              <PreviewModel state={state} />
            </div>
            <div style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 12, background: "var(--bg-tertiary)" }}>
              <div className="label-mono" style={{ color: "var(--text-muted)", marginBottom: 8 }}>
                {source === "editor" ? "EDITOR WEDGE" : "NEW PROJECT WEDGE"}
              </div>
              <div style={{ display: "grid", gap: 7, fontSize: 12, color: "var(--text-secondary)" }}>
                <span>Scope: {WIZARD_SCOPE_OPTIONS.find((option) => option.id === state.renovationType)?.label}</span>
                <span>Tier: {WIZARD_DESIGN_TIER_OPTIONS.find((option) => option.id === state.designTier)?.label}</span>
                <span>{copy.energy}: {WIZARD_ENERGY_OPTIONS.find((option) => option.id === state.energyUpgrade)?.label ?? copy.noEnergy}</span>
                <span>{copy.bom}: {plan.bom.length}</span>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 10, background: "var(--bg-secondary)" }}>
      <div className="label-mono" style={{ color: "var(--text-muted)", fontSize: 9, marginBottom: 4 }}>{label}</div>
      <div style={{ color: "var(--text-primary)", fontSize: 13, fontWeight: 800 }}>{value}</div>
    </div>
  );
}
