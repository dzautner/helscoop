"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, setToken, getToken } from "@/lib/api";
import LoginForm from "@/components/LoginForm";
import AddressSearch from "@/components/AddressSearch";
import FeatureHighlights from "@/components/FeatureHighlights";
import LandingFooter from "@/components/LandingFooter";
import ProjectList from "@/components/ProjectList";
import { useAnalytics } from "@/hooks/useAnalytics";
import { useTranslation } from "@/components/LocaleProvider";
import type { BuildingResult } from "@/types";

export default function Home() {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [pendingBuilding, setPendingBuilding] = useState<BuildingResult | null>(null);
  const { track } = useAnalytics();
  const { t } = useTranslation();

  useEffect(() => {
    if (getToken()) {
      api.me().then(() => setLoggedIn(true)).catch(() => setToken(null));
    }
  }, []);

  async function handleCreateFromBuilding(building: BuildingResult) {
    if (!loggedIn) {
      setPendingBuilding(building);
      return;
    }
    await createProjectFromBuilding(building);
  }

  async function createProjectFromBuilding(building: BuildingResult) {
    track("project_created", { source: "address", building_type: building.building_info.type });
    const inferredProjectType = Number(building.building_info.units || 0) > 1
      || ["kerrostalo", "rivitalo", "taloyhtio"].includes(String(building.building_info.type))
      ? "taloyhtio"
      : "omakotitalo";
    const buildingTypeLabel = t(`building.${building.building_info.type}`) || building.building_info.type;
    const materialLabel = t(`building.material.${building.building_info.material}`) || building.building_info.material;
    const project = await api.createProject({
      name: building.address,
      description: `${buildingTypeLabel}, ${materialLabel}, ${building.building_info.year_built}, ${building.building_info.area_m2} m²`,
      scene_js: building.scene_js,
      project_type: inferredProjectType,
      unit_count: inferredProjectType === "taloyhtio" ? Number(building.building_info.units || 1) : null,
      building_info: {
        address: building.address,
        ...building.building_info,
        confidence: building.confidence,
        data_sources: building.data_sources,
        climate_zone: building.climate_zone,
        heating_degree_days: building.heating_degree_days,
        data_source_error: building.data_source_error,
      },
    });
    if (building.bom_suggestion.length > 0) {
      await api.saveBOM(project.id, building.bom_suggestion);
    }
    router.push(`/project/${project.id}`);
  }

  async function handleLogin() {
    setLoggedIn(true);
    if (pendingBuilding) {
      await createProjectFromBuilding(pendingBuilding);
      setPendingBuilding(null);
    }
  }

  if (!loggedIn) {
    return (
      <main id="main-content" tabIndex={-1}>
        <div className="scroll-progress" aria-hidden="true" />
        <LoginForm
          onLogin={handleLogin}
          pendingBuilding={pendingBuilding}
          addressSearch={
            <AddressSearch onCreateProject={handleCreateFromBuilding} compact />
          }
        />
        <FeatureHighlights />
        <LandingFooter />
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1}>
      <ProjectList onCreateFromBuilding={handleCreateFromBuilding} />
    </main>
  );
}
