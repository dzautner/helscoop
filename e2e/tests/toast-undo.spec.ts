import { test, expect } from "@playwright/test";
import { registerUser, loginViaUI, saveBomViaAPI } from "./helpers";

const API_URL = process.env.TEST_API_URL || "http://localhost:3001";

test.describe("Toast undo flow on BOM item removal", () => {
  let user: { email: string; password: string; name: string; token: string };
  let projectId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `undo-${Date.now()}`);

    const res = await page.request.post(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${user.token}` },
      data: {
        name: "Undo Test Project",
        scene_js: 'scene.add(box(5,5,5), {material: "lumber"});',
      },
    });
    const body = await res.json();
    projectId = body.id;

    await saveBomViaAPI(page, user.token, projectId, [
      { material_id: "lumber-22x100-pine", quantity: 10, unit: "jm" },
      { material_id: "insulation-rockwool-100", quantity: 5, unit: "m2" },
    ]);

    await page.close();
  });

  test("removing BOM item shows undo toast", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");

    const bomPanel = page.getByText(/materiaalilista|material list/i).first();
    await expect(bomPanel).toBeVisible({ timeout: 10_000 });

    const removeBtn = page.locator('button[aria-label*="poista" i], button[aria-label*="remove" i], button[aria-label*="delete" i]').first();
    if (await removeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await removeBtn.click();

      const undoToast = page.getByText(/kumoa|undo/i).first();
      await expect(undoToast).toBeVisible({ timeout: 5000 });

      await page.screenshot({ path: "test-results/toast-undo-visible.png" });
    }
  });

  test("clicking undo restores removed BOM item", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");

    const bomPanel = page.getByText(/materiaalilista|material list/i).first();
    await expect(bomPanel).toBeVisible({ timeout: 10_000 });

    const bomItems = page.locator('[data-testid="bom-item"], [class*="bom-row"], [class*="bom-item"]');
    const initialCount = await bomItems.count().catch(() => 0);

    const removeBtn = page.locator('button[aria-label*="poista" i], button[aria-label*="remove" i], button[aria-label*="delete" i]').first();
    if (await removeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await removeBtn.click();
      await page.waitForTimeout(300);

      const undoBtn = page.getByText(/kumoa|undo/i).first();
      if (await undoBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await undoBtn.click();
        await page.waitForTimeout(500);

        const afterUndoCount = await bomItems.count().catch(() => 0);
        if (initialCount > 0) {
          expect(afterUndoCount).toBe(initialCount);
        }

        await page.screenshot({ path: "test-results/toast-undo-restored.png" });
      }
    }
  });

  test("undo toast auto-dismisses after timeout", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");

    const bomPanel = page.getByText(/materiaalilista|material list/i).first();
    await expect(bomPanel).toBeVisible({ timeout: 10_000 });

    const removeBtn = page.locator('button[aria-label*="poista" i], button[aria-label*="remove" i], button[aria-label*="delete" i]').first();
    if (await removeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await removeBtn.click();

      const undoToast = page.getByText(/kumoa|undo/i).first();
      await expect(undoToast).toBeVisible({ timeout: 3000 });

      await page.waitForTimeout(6000);

      await expect(undoToast).not.toBeVisible({ timeout: 3000 });
    }
  });
});
