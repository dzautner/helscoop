"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import { api } from "@/lib/api";
import type {
  BuildingInfo,
  EnergyApplicantAgeGroup,
  EnergyBuildingType,
  EnergyHeatingSystemCondition,
  EnergyHeatingType,
  EnergySubsidyRequest,
  EnergySubsidyResponse,
} from "@/types";

function normalizeHeating(value?: string): EnergyHeatingType {
  const raw = (value || "").toLowerCase();
  if (raw.includes("ölj") || raw.includes("olj") || raw.includes("oil")) return "oil";
  if (raw.includes("maakaasu") || raw.includes("natural_gas") || raw.includes("gas")) return "natural_gas";
  if (raw.includes("kaukol") || raw.includes("district")) return "district_heat";
  if (raw.includes("maal") || raw.includes("ground")) return "ground_source_heat_pump";
  if (raw.includes("ilma-ves") || raw.includes("air_water")) return "air_water_heat_pump";
  if (raw.includes("sähk") || raw.includes("sahk") || raw.includes("electric")) return "direct_electric";
  if (raw.includes("puu") || raw.includes("wood")) return "wood";
  return "unknown";
}

function normalizeBuildingType(value?: string): EnergyBuildingType {
  const raw = (value || "").toLowerCase();
  if (raw.includes("omakoti") || raw.includes("detached")) return "omakotitalo";
  if (raw.includes("pari") || raw.includes("semi")) return "paritalo";
  if (raw.includes("rivi") || raw.includes("row")) return "rivitalo";
  if (raw.includes("kerros") || raw.includes("apartment")) return "kerrostalo";
  return "unknown";
}

function formatEur(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 0 }) + " \u20ac";
}

export default function SubsidyCalculator({
  totalCost,
  buildingInfo,
}: {
  totalCost: number;
  buildingInfo?: BuildingInfo | null;
}) {
  const { t, locale } = useTranslation();
  const [answers, setAnswers] = useState<Omit<EnergySubsidyRequest, "totalCost">>(() => ({
    currentHeating: normalizeHeating(buildingInfo?.heating),
    targetHeating: "air_water_heat_pump",
    buildingType: normalizeBuildingType(buildingInfo?.type),
    buildingYear: buildingInfo?.year_built ?? null,
    yearRoundResidential: true,
    applicantAgeGroup: "under_65",
    applicantDisabled: false,
    heatingSystemCondition: "unknown",
  }));
  const [result, setResult] = useState<EnergySubsidyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setAnswers((prev) => ({
      ...prev,
      currentHeating: prev.currentHeating === "unknown" ? normalizeHeating(buildingInfo?.heating) : prev.currentHeating,
      buildingType: prev.buildingType === "unknown" ? normalizeBuildingType(buildingInfo?.type) : prev.buildingType,
      buildingYear: prev.buildingYear ?? buildingInfo?.year_built ?? null,
    }));
  }, [buildingInfo]);

  const request = useMemo<EnergySubsidyRequest>(() => ({
    ...answers,
    totalCost,
  }), [answers, totalCost]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    api.estimateEnergySubsidy(request)
      .then((data: EnergySubsidyResponse) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [request]);

  const ely = result?.programs.find((program) => program.program === "ely_oil_gas_heating");
  const ara = result?.programs.find((program) => program.program === "ara_repair_elderly_disabled");
  const eligible = ely?.status === "eligible";
  const possibleAra = ara?.status === "maybe";

  const selectStyle: CSSProperties = {
    width: "100%",
    padding: "6px 8px",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-sm)",
    background: "var(--bg-secondary)",
    color: "var(--text-primary)",
    fontSize: 11,
    fontFamily: "var(--font-body)",
  };

  const labelStyle: CSSProperties = {
    display: "block",
    marginBottom: 4,
    color: "var(--text-muted)",
    fontSize: 10,
    fontFamily: "var(--font-mono)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  };

  return (
    <div
      style={{
        marginTop: 12,
        padding: "14px 16px",
        background: eligible ? "rgba(74, 124, 89, 0.08)" : "var(--bg-tertiary)",
        border: eligible ? "1px solid rgba(74, 124, 89, 0.24)" : "1px solid var(--border)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div>
          <div className="label-mono" style={{ fontSize: 10, color: "var(--text-muted)" }}>
            {t("subsidy.sectionLabel")}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginTop: 2 }}>
            {eligible ? t("subsidy.eligibleTitle") : possibleAra ? t("subsidy.maybeTitle") : t("subsidy.checkTitle")}
          </div>
        </div>
        <span
          title={t("subsidy.deadlineTooltip")}
          style={{
            padding: "3px 7px",
            borderRadius: 999,
            background: "var(--amber-glow)",
            border: "1px solid var(--amber-border)",
            color: "var(--amber)",
            fontSize: 10,
            fontFamily: "var(--font-mono)",
            whiteSpace: "nowrap",
          }}
        >
          {result ? t("subsidy.deadlineCountdown", { days: Math.max(0, result.daysUntilDeadline) }) : t("subsidy.loading")}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 }}>
        <label>
          <span style={labelStyle}>{t("subsidy.currentHeating")}</span>
          <select
            value={answers.currentHeating}
            onChange={(e) => setAnswers((prev) => ({ ...prev, currentHeating: e.target.value as EnergyHeatingType }))}
            style={selectStyle}
          >
            <option value="unknown">{t("subsidy.heating.unknown")}</option>
            <option value="oil">{t("subsidy.heating.oil")}</option>
            <option value="natural_gas">{t("subsidy.heating.naturalGas")}</option>
            <option value="direct_electric">{t("subsidy.heating.directElectric")}</option>
            <option value="wood">{t("subsidy.heating.wood")}</option>
            <option value="district_heat">{t("subsidy.heating.districtHeat")}</option>
          </select>
        </label>
        <label>
          <span style={labelStyle}>{t("subsidy.targetHeating")}</span>
          <select
            value={answers.targetHeating}
            onChange={(e) => setAnswers((prev) => ({ ...prev, targetHeating: e.target.value as EnergyHeatingType }))}
            style={selectStyle}
          >
            <option value="air_water_heat_pump">{t("subsidy.heating.airWater")}</option>
            <option value="ground_source_heat_pump">{t("subsidy.heating.groundSource")}</option>
            <option value="district_heat">{t("subsidy.heating.districtHeat")}</option>
            <option value="other_non_fossil">{t("subsidy.heating.otherNonFossil")}</option>
            <option value="fossil">{t("subsidy.heating.fossil")}</option>
          </select>
        </label>
        <label>
          <span style={labelStyle}>{t("subsidy.household")}</span>
          <select
            value={answers.applicantDisabled ? "disabled" : answers.applicantAgeGroup}
            onChange={(e) => {
              const value = e.target.value;
              setAnswers((prev) => ({
                ...prev,
                applicantAgeGroup: value === "65_plus" ? "65_plus" : "under_65",
                applicantDisabled: value === "disabled",
              }));
            }}
            style={selectStyle}
          >
            <option value="under_65">{t("subsidy.householdUnder65")}</option>
            <option value="65_plus">{t("subsidy.household65Plus")}</option>
            <option value="disabled">{t("subsidy.householdDisabled")}</option>
          </select>
        </label>
        <label>
          <span style={labelStyle}>{t("subsidy.systemCondition")}</span>
          <select
            value={answers.heatingSystemCondition}
            onChange={(e) => setAnswers((prev) => ({ ...prev, heatingSystemCondition: e.target.value as EnergyHeatingSystemCondition }))}
            style={selectStyle}
          >
            <option value="unknown">{t("subsidy.conditionUnknown")}</option>
            <option value="ok">{t("subsidy.conditionOk")}</option>
            <option value="broken_or_end_of_life">{t("subsidy.conditionBroken")}</option>
            <option value="hard_to_maintain">{t("subsidy.conditionHard")}</option>
          </select>
        </label>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 11, color: "var(--text-secondary)" }}>
        <input
          type="checkbox"
          checked={answers.yearRoundResidential}
          onChange={(e) => setAnswers((prev) => ({ ...prev, yearRoundResidential: e.target.checked }))}
        />
        {t("subsidy.yearRoundResidential")}
      </label>

      <div
        style={{
          marginTop: 12,
          padding: "10px 12px",
          background: "var(--bg-secondary)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border)",
        }}
      >
        {loading && !result ? (
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("subsidy.loading")}</div>
        ) : error ? (
          <div style={{ fontSize: 12, color: "var(--danger)" }}>{t("subsidy.error")}</div>
        ) : result && ely ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{t("subsidy.netCost")}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-primary)" }}>
                {eligible
                  ? `${formatEur(result.totalCost, locale)} \u2192 ${formatEur(result.netCost, locale)}`
                  : formatEur(result.totalCost, locale)}
              </span>
            </div>
            {eligible && (
              <div style={{ marginTop: 6, color: "var(--success)", fontSize: 12, fontWeight: 600 }}>
                {t("subsidy.elyDeduction", { amount: formatEur(ely.amount, locale) })}
              </div>
            )}
            {!eligible && (
              <div style={{ marginTop: 6, color: "var(--text-muted)", fontSize: 11, lineHeight: 1.45 }}>
                {ely.reasons[0] || t("subsidy.notEligible")}
              </div>
            )}
            {possibleAra && (
              <div style={{ marginTop: 8, color: "var(--amber)", fontSize: 11, lineHeight: 1.45 }}>
                {t("subsidy.araMaybe")}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <a
                href={ely.applicationUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: "var(--amber)",
                  fontSize: 11,
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                {t("subsidy.applyEly")}
              </a>
              {ara && (
                <a
                  href={ara.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--text-muted)",
                    fontSize: 11,
                    fontWeight: 600,
                    textDecoration: "none",
                  }}
                >
                  {t("subsidy.readAra")}
                </a>
              )}
            </div>
          </>
        ) : null}
      </div>

      {result && (
        <div style={{ marginTop: 8, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.45 }}>
          {result.disclaimer}
        </div>
      )}
    </div>
  );
}
