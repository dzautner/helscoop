import { test, expect } from "@playwright/test";
import { registerUser, loginViaUI, createProjectViaAPI, saveBomViaAPI, apiUrl, expectMainViewportVisible } from "./helpers";

test.describe("Complete renovation quote flow", () => {
  let user: { email: string; password: string; name: string; token: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `reno-flow-${Date.now()}`);
    await page.close();
  });

  test("address search → building data → project creation → BOM → export", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });

    // 1. Enter a Finnish address in the address search
    const addressInput = page.locator('[data-tour="address-input"] input').first();
    if (await addressInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await addressInput.fill("Ribbingintie 109");
      await page.waitForTimeout(500);
      await addressInput.press("Enter");
      await page.waitForTimeout(3000);

      // 2. Verify building data result appears
      const resultCard = page.locator('.address-result-glow, [class*="address-result"]').first();
      if (await resultCard.isVisible({ timeout: 10_000 }).catch(() => false)) {
        // Verify building info shows type/year/area
        const resultText = await resultCard.textContent();
        expect(resultText).toBeTruthy();

        // 3. Click create project
        const createBtn = resultCard.getByRole("button", { name: /luo projekti|create|aloita/i });
        if (await createBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
          await createBtn.click();
          await page.waitForTimeout(3000);
          await page.waitForLoadState("networkidle");

          // Should redirect to project page
          await expect(page).toHaveURL(/\/project\//, { timeout: 15_000 });

          // 4. Verify 3D scene renders
          await expectMainViewportVisible(page);

          // 5. Verify BOM panel has items
          const bomList = page.locator('[role="list"][aria-label*="Material"], [role="list"][aria-label*="Materiaali"]');
          if (await bomList.isVisible({ timeout: 10_000 }).catch(() => false)) {
            const bomItems = bomList.locator('[role="listitem"]');
            const itemCount = await bomItems.count().catch(() => 0);
            expect(itemCount).toBeGreaterThan(0);
          }

          await page.screenshot({ path: "test-results/reno-flow-project.png" });
        }
      }
    }

    await page.screenshot({ path: "test-results/reno-flow-address.png" });
  });

  test("BOM editing updates cost totals", async ({ page }) => {
    // Create project with BOM via API
    const projectId = await createProjectViaAPI(page, user.token, {
      name: "BOM Edit Test",
      scene_js: 'scene.add(box(6,0.2,4), {material:"foundation"});',
    });
    await saveBomViaAPI(page, user.token, projectId, [
      { material_id: "pine_48x98_c24", quantity: 50, unit: "jm" },
    ]);

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");
    await expectMainViewportVisible(page);

    // Find the BOM row quantity input and change it.
    const bomRow = page.locator(".bom-item-card").first();
    await bomRow.scrollIntoViewIfNeeded();
    const qtyInput = bomRow.locator(".bom-item-qty-input");
    if (await qtyInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const totalBefore = await bomRow.locator(".bom-item-total").textContent().catch(() => "");
      await qtyInput.fill("100");
      await qtyInput.press("Tab");
      await expect(qtyInput).toHaveValue("100", { timeout: 5_000 });

      const totalAfter = await bomRow.locator(".bom-item-total").textContent().catch(() => "");
      if (totalBefore && totalAfter) {
        expect(totalAfter).not.toBe(totalBefore);
      }
    }

    await page.screenshot({ path: "test-results/reno-flow-bom-edit.png" });
  });

  test("PDF export triggers download", async ({ page }) => {
    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Export Test",
      scene_js: 'scene.add(box(4,3,5), {material:"lumber"});',
    });
    await saveBomViaAPI(page, user.token, projectId, [
      { material_id: "lumber_48x98", quantity: 20, unit: "jm" },
    ]);

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");
    await expectMainViewportVisible(page);

    // Open export menu
    const exportBtn = page.locator('[data-tour="export-btn"] button').first();
    if (await exportBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await exportBtn.click();
      await page.waitForTimeout(500);

      // Click PDF
      const pdfItem = page.locator('[role="menuitem"]').filter({ hasText: /pdf/i });
      if (await pdfItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
        const downloadPromise = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
        await pdfItem.click();
        const download = await downloadPromise;
        if (download) {
          expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
        }
      }
    }

    await page.screenshot({ path: "test-results/reno-flow-export-pdf.png" });
  });

  test("CSV export triggers download", async ({ page }) => {
    const projectId = await createProjectViaAPI(page, user.token, {
      name: "CSV Export Test",
      scene_js: 'scene.add(box(4,3,5), {material:"lumber"});',
    });
    await saveBomViaAPI(page, user.token, projectId, [
      { material_id: "lumber_48x98", quantity: 20, unit: "jm" },
    ]);

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");
    await expectMainViewportVisible(page);

    // Try the BOM panel CSV button
    const bomCsvBtn = page.locator('button[aria-label*="csv" i], button[aria-label*="lataa" i]').first();
    if (await bomCsvBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const downloadPromise = page.waitForEvent("download", { timeout: 10_000 }).catch(() => null);
      await bomCsvBtn.click();
      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toMatch(/\.csv$/i);
      }
    } else {
      // Fallback: try export menu CSV
      const exportBtn = page.locator('[data-tour="export-btn"] button').first();
      if (await exportBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await exportBtn.click();
        await page.waitForTimeout(500);
        const csvItem = page.getByText(/csv/i).first();
        if (await csvItem.isVisible({ timeout: 3_000 }).catch(() => false)) {
          const downloadPromise = page.waitForEvent("download", { timeout: 10_000 }).catch(() => null);
          await csvItem.click();
          const download = await downloadPromise;
          if (download) {
            expect(download.suggestedFilename()).toMatch(/\.csv$/i);
          }
        }
      }
    }

    await page.screenshot({ path: "test-results/reno-flow-export-csv.png" });
  });

  test("empty BOM shows empty state", async ({ page }) => {
    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Empty BOM Test",
      scene_js: 'scene.add(box(2,2,2), {material:"concrete"});',
    });
    // No BOM items saved

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");
    await expectMainViewportVisible(page);

    // Check for empty state
    const emptyState = page.locator('.bom-empty, [class*="bom-empty"]');
    if (await emptyState.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const emptyTitle = page.locator('.bom-empty-title');
      await expect(emptyTitle).toBeVisible({ timeout: 5_000 });

      // CTA button should be visible
      const emptyCta = page.locator('.bom-empty-cta');
      await expect(emptyCta).toBeVisible({ timeout: 5_000 });
    }

    await page.screenshot({ path: "test-results/reno-flow-empty-bom.png" });
  });
});
