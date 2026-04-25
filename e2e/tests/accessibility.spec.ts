import AxeBuilder from "@axe-core/playwright";
import type { AxeResults, Result as AxeViolation } from "axe-core";
import { test, expect, type Page } from "@playwright/test";
import {
  createProjectViaAPI,
  expectMainViewportVisible,
  mainViewportCanvas,
  registerUser,
  saveBomViaAPI,
  setAuthToken,
} from "./helpers";

const SEVERE_IMPACTS = new Set(["critical", "serious"]);

async function preparePage(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("helscoop_onboarding_completed", "true");
  });
}

async function runWcagAudit(page: Page): Promise<AxeViolation[]> {
  const results: AxeResults = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  return results.violations.filter((violation) =>
    SEVERE_IMPACTS.has(violation.impact ?? "")
  );
}

function formatViolations(violations: AxeViolation[]): string {
  if (violations.length === 0) return "No critical or serious accessibility violations";

  return violations
    .map((violation) => {
      const targets = violation.nodes
        .flatMap((node) => node.target)
        .slice(0, 5)
        .join(", ");
      return `${violation.impact}: ${violation.id} - ${violation.help} (${targets})`;
    })
    .join("\n");
}

async function expectNoCriticalOrSeriousViolations(page: Page) {
  const violations = await runWcagAudit(page);
  expect(violations, formatViolations(violations)).toEqual([]);
}

async function createAccessibleProject(page: Page) {
  const user = await registerUser(page, `a11y-${Date.now()}`);
  const projectId = await createProjectViaAPI(page, user.token, {
    name: "Accessibility Audit Project",
    description: "Project used by the axe accessibility audit",
    scene_js:
      'const floor = box(6,0.2,4);\nscene.add(floor, {material: "foundation", color: [0.7,0.7,0.7]});',
  });

  await saveBomViaAPI(page, user.token, projectId, [
    { material_id: "pine_48x148_c24", quantity: 12, unit: "jm" },
    { material_id: "concrete_c25", quantity: 1, unit: "m3" },
  ]);

  return { user, projectId };
}

test.describe("Accessibility audits", () => {
  test("landing page has no critical or serious WCAG violations in light and dark themes", async ({ page }) => {
    await preparePage(page);
    await page.goto("/");
    await expect(page).toHaveTitle(/helscoop/i);

    const addressInput = page.locator('[data-tour="address-input"] input');
    await expect(addressInput).toBeVisible();
    await expect(addressInput).toHaveAccessibleName(/address|osoite|search|hae/i);

    await expect(page.locator("#login-email")).toHaveAccessibleName(/email|sähköposti/i);
    await expect(page.locator("#login-password")).toHaveAccessibleName(/password|salasana/i);

    const themeToggle = page
      .getByRole("button", { name: /theme|teema|dark|light|tumma|vaalea/i })
      .first();
    await expect(themeToggle).toBeVisible();

    await expectNoCriticalOrSeriousViolations(page);

    await themeToggle.click();
    await page.waitForFunction(() =>
      document.documentElement.getAttribute("data-theme") === "light" &&
      !document.documentElement.classList.contains("theme-transitioning")
    );
    await expectNoCriticalOrSeriousViolations(page);
  });

  test("project editor exposes accessible viewport, BOM, chat, icon buttons, and shortcuts dialog", async ({ page }) => {
    await preparePage(page);
    const { user, projectId } = await createAccessibleProject(page);

    await setAuthToken(page, user.token);
    await page.goto(`/project/${projectId}`);
    await page.waitForLoadState("networkidle");
    await expectMainViewportVisible(page);

    await expect(
      page.getByRole("application", { name: /3d|viewport|näkymä|malli/i })
    ).toBeVisible();
    await expect(mainViewportCanvas(page)).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByRole("list", { name: /material|materiaali/i })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /chat|viesti|message/i })).toBeVisible();

    const unlabeledIconButtons = await page.locator("button").evaluateAll((buttons) =>
      buttons
        .filter((button) => {
          const rect = button.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;

          const visibleText = (button.textContent ?? "").replace(/\s+/g, " ").trim();
          const hasAccessibleName =
            Boolean(button.getAttribute("aria-label")) ||
            Boolean(button.getAttribute("aria-labelledby")) ||
            visibleText.length > 1;
          const looksIconOnly = Boolean(button.querySelector("svg")) || visibleText.length <= 1;

          return looksIconOnly && !hasAccessibleName;
        })
        .map((button) => button.outerHTML.slice(0, 180))
    );
    expect(unlabeledIconButtons).toEqual([]);

    await page.keyboard.press("Control+/");
    const shortcutsDialog = page.getByRole("dialog", { name: /keyboard|shortcuts|pikanäpp/i });
    await expect(shortcutsDialog).toBeVisible();
    await expect(shortcutsDialog.getByRole("button", { name: /close|sulje/i })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(shortcutsDialog).toBeHidden();

    await expectNoCriticalOrSeriousViolations(page);
  });
});
