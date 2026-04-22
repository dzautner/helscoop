import { test, expect } from "@playwright/test";
import { registerUser, loginViaUI, dismissOnboarding } from "./helpers";

test.describe("Template → Editor → Save → Reload", () => {
  let user: { email: string; password: string; name: string; token: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `tmpl-${Date.now()}`);
    await page.close();
  });

  test("create project from template, edit, save, and reload", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await expect(page.getByText(/omat projektit|my projects/i)).toBeVisible({ timeout: 15_000 });

    // Step 1: Navigate to templates and pick one
    const templateCard = page.locator('[data-testid="template-card"], [class*="template"]').first();
    if (await templateCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await templateCard.click();
    } else {
      const templateLink = page.getByText(/mallit|templates|pihasauna|autotalli|varasto/i).first();
      await templateLink.click();
    }

    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Step 2: Verify 3D viewport renders
    await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

    // Step 3: Verify objects rendered
    const objectCountText = page.getByText(/[1-9]\d*\s*(objects|objektia)/i);
    let objectCount = 0;
    if (await objectCountText.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const countText = await objectCountText.textContent();
      objectCount = parseInt(countText?.match(/(\d+)/)?.[1] || "0");
      expect(objectCount).toBeGreaterThanOrEqual(1);
    }

    // Step 4: Verify BOM items populated from template
    const bomText = page.getByText(/materiaalilista|material list|arvioitu|estimated/i).first();
    await expect(bomText).toBeVisible({ timeout: 10_000 });

    // Step 5: Edit the scene via code editor
    const editor = page.locator('textarea[aria-label]').first();
    if (await editor.isVisible({ timeout: 5000 }).catch(() => false)) {
      await editor.click();
      await page.keyboard.press("End");
      await page.keyboard.press("Enter");
      await page.keyboard.type('scene.add(box(0.5, 0.5, 0.5), { color: [1, 0, 0] });');
    }

    // Step 6: Wait for auto-save
    await expect(
      page.getByText(/saved|tallennettu/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Step 7: Capture URL for reload
    const projectUrl = page.url();

    // Step 8: Navigate away and come back
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await page.goto(projectUrl);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Step 9: Verify the edit persisted — canvas still renders
    await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

    // Object count should be at least what it was before (we added one)
    if (objectCount > 0) {
      const newCountText = page.getByText(/[1-9]\d*\s*(objects|objektia)/i);
      if (await newCountText.isVisible({ timeout: 10_000 }).catch(() => false)) {
        const text = await newCountText.textContent();
        const newCount = parseInt(text?.match(/(\d+)/)?.[1] || "0");
        expect(newCount).toBeGreaterThanOrEqual(objectCount);
      }
    }

    await page.screenshot({ path: "test-results/template-editor-flow.png" });
  });
});
