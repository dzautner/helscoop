import { test, expect } from "@playwright/test";
import { registerUser, loginViaUI, createProjectViaAPI, saveBomViaAPI } from "./helpers";

test.describe("BOM item removal — undo toast flow", () => {
  let user: { email: string; password: string; name: string; token: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `bom-undo-${Date.now()}`);
    await page.close();
  });

  test("remove BOM item shows undo toast, clicking undo restores item", async ({ page }) => {
    const projectId = await createProjectViaAPI(page, user.token, {
      name: "BOM Undo Test",
      scene_js: 'scene.add(box(4, 3, 5), { material: "lumber" });',
    });

    await saveBomViaAPI(page, user.token, projectId, [
      { material_id: "pine_48x98_c24", quantity: 10, unit: "jm" },
      { material_id: "osb_9mm", quantity: 5, unit: "m2" },
    ]);

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Open BOM panel if not visible
    const bomToggle = page.locator('button[aria-label*="BOM" i], button[aria-label*="materiaali" i], button[data-tooltip*="BOM" i]');
    if (await bomToggle.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      const bomPanel = page.locator('[data-testid="bom-panel"], .bom-panel');
      if (!(await bomPanel.isVisible({ timeout: 1_000 }).catch(() => false))) {
        await bomToggle.first().click();
        await page.waitForTimeout(500);
      }
    }

    // Verify both BOM items are present
    const pineRow = page.getByText(/pine.*48.*98|mänty.*48.*98/i).first();
    const osbRow = page.getByText(/osb.*9.*mm/i).first();
    await expect(pineRow).toBeVisible({ timeout: 5_000 });
    await expect(osbRow).toBeVisible({ timeout: 5_000 });

    // Remove the pine item by clicking its remove button
    const removeBtn = page.locator('button.bom-remove-btn, button[aria-label*="poista" i], button[aria-label*="remove" i]').first();
    await expect(removeBtn).toBeVisible({ timeout: 3_000 });
    await removeBtn.click();

    // Confirm removal dialog if present
    const confirmBtn = page.locator('button').filter({ hasText: /poista|remove|kyllä|yes|vahvista|confirm/i });
    if (await confirmBtn.first().isVisible({ timeout: 1_500 }).catch(() => false)) {
      await confirmBtn.first().click();
    }

    // Undo toast should appear with "Kumoa" / "Undo" button
    const undoButton = page.locator('button').filter({ hasText: /kumoa|undo/i });
    await expect(undoButton.first()).toBeVisible({ timeout: 3_000 });

    // Click undo
    await undoButton.first().click();
    await page.waitForTimeout(500);

    // Verify the item is restored — both items should be visible again
    await expect(page.getByText(/pine.*48.*98|mänty.*48.*98/i).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/osb.*9.*mm/i).first()).toBeVisible({ timeout: 5_000 });
  });

  test("remove BOM item without undo permanently removes it", async ({ page }) => {
    const projectId = await createProjectViaAPI(page, user.token, {
      name: "BOM No-Undo Test",
      scene_js: 'scene.add(box(2, 2, 2), { material: "lumber" });',
    });

    await saveBomViaAPI(page, user.token, projectId, [
      { material_id: "pine_48x98_c24", quantity: 8, unit: "jm" },
    ]);

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Open BOM panel
    const bomToggle = page.locator('button[aria-label*="BOM" i], button[aria-label*="materiaali" i], button[data-tooltip*="BOM" i]');
    if (await bomToggle.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      const bomPanel = page.locator('[data-testid="bom-panel"], .bom-panel');
      if (!(await bomPanel.isVisible({ timeout: 1_000 }).catch(() => false))) {
        await bomToggle.first().click();
        await page.waitForTimeout(500);
      }
    }

    // Verify item exists
    const pineRow = page.getByText(/pine.*48.*98|mänty.*48.*98/i).first();
    await expect(pineRow).toBeVisible({ timeout: 5_000 });

    // Remove item
    const removeBtn = page.locator('button.bom-remove-btn, button[aria-label*="poista" i], button[aria-label*="remove" i]').first();
    await expect(removeBtn).toBeVisible({ timeout: 3_000 });
    await removeBtn.click();

    // Confirm removal dialog if present
    const confirmBtn = page.locator('button').filter({ hasText: /poista|remove|kyllä|yes|vahvista|confirm/i });
    if (await confirmBtn.first().isVisible({ timeout: 1_500 }).catch(() => false)) {
      await confirmBtn.first().click();
    }

    // Toast appears — wait for it to auto-dismiss (5 seconds)
    const toastText = page.getByText(/poistettu|removed/i);
    await expect(toastText.first()).toBeVisible({ timeout: 3_000 });

    // Wait for toast to disappear
    await page.waitForTimeout(6_000);

    // Verify item is gone — BOM should be empty or not show pine
    await expect(page.getByText(/pine.*48.*98|mänty.*48.*98/i).first()).not.toBeVisible({ timeout: 3_000 });
  });
});
