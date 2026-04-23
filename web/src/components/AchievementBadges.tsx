"use client";

import { useMemo } from "react";
import { useTranslation } from "@/components/LocaleProvider";
import type { Project } from "@/types";

interface Achievement {
  id: string;
  icon: string;
  labelKey: string;
  earned: boolean;
}

interface AchievementBadgesProps {
  project: Project;
}

export default function AchievementBadges({ project }: AchievementBadgesProps) {
  const { t } = useTranslation();

  const achievements = useMemo((): Achievement[] => {
    const bom = project.bom ?? [];
    const hasBom = bom.length > 0;
    const materialCount = new Set(bom.map((b) => b.material_id)).size;

    return [
      {
        id: "first_step",
        icon: "\u{1F3E0}",
        labelKey: "achievements.firstStep",
        earned: true,
      },
      {
        id: "architect",
        icon: "\u{1F4D0}",
        labelKey: "achievements.architect",
        earned: !!project.scene_js,
      },
      {
        id: "designer",
        icon: "\u{1F3A8}",
        labelKey: "achievements.designer",
        earned: materialCount >= 3,
      },
      {
        id: "budget_guru",
        icon: "\u{1F4B0}",
        labelKey: "achievements.budgetGuru",
        earned: project.estimated_cost > 0,
      },
      {
        id: "shopping_list",
        icon: "\u{1F4CB}",
        labelKey: "achievements.shoppingList",
        earned: hasBom && materialCount >= 5,
      },
      {
        id: "underway",
        icon: "\u{1F528}",
        labelKey: "achievements.underway",
        earned: project.status === "in_progress" || project.status === "completed",
      },
      {
        id: "complete",
        icon: "\u{2B50}",
        labelKey: "achievements.complete",
        earned: project.status === "completed",
      },
    ];
  }, [project.scene_js, project.bom, project.estimated_cost, project.status]);

  const earned = achievements.filter((a) => a.earned);
  if (earned.length === 0) return null;

  return (
    <div className="achievement-badges">
      <span className="achievement-badges-title">{t("achievements.title")}</span>
      <div className="achievement-badges-row">
        {achievements.map((a) => (
          <span
            key={a.id}
            className={`achievement-badge ${a.earned ? "achievement-badge--earned" : "achievement-badge--locked"}`}
            title={t(a.labelKey as any)}
          >
            <span className="achievement-badge-icon">{a.icon}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
