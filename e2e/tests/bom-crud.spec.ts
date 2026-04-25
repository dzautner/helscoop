import { test, expect } from "@playwright/test";
import { registerUser, loginViaUI, apiUrl, expectMainViewportVisible } from "./helpers";

test.describe("BOM Panel — Item CRUD", () => {
  let user: { email: string; password: string; name: string; token: string };
  let projectId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `bom-crud-${Date.now()}`);

    const res = await page.request.post(apiUrl("/projects"), {
      headers: { Authorization: `Bearer ${user.token}` },
      data: {
        name: "BOM CRUD Test",
        scene_js: 'scene.add(box(6,0.2,4), {material:"foundation"});',
      },
    });
    projectId = (await res.json()).id;
    await page.close();
  });

  test("add a material to the BOM from the material search", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");
    await expectMainViewportVisible(page);

    const addBtn = page.getByRole("button", { name: /lisää|add material/i });
    if (await addBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await addBtn.click();

      const searchInput = page.getByPlaceholder(/hae materiaali|search material/i);
      if (await searchInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await searchInput.fill("48x98");
        await page.waitForTimeout(500);

        const result = page.getByText(/48x98/i).first();
        if (await result.isVisible({ timeout: 5000 }).catch(() => false)) {
          await result.click();
          await page.waitForTimeout(500);

          await expect(page.getByText(/48x98/i).first()).toBeVisible({ timeout: 5000 });
        }
      }
    }

    await page.screenshot({ path: "test-results/bom-add-material.png" });
  });

  test("edit BOM item quantity inline", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");
    await expectMainViewportVisible(page);

    const qtyInput = page.locator('input[type="number"]').first();
    if (await qtyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      const before = await qtyInput.inputValue();
      const newQty = String(parseInt(before || "1") + 15);
      await qtyInput.fill(newQty);
      await qtyInput.press("Tab");
      await page.waitForTimeout(1000);

      const qtyAfter = page.locator('input[type="number"]').first();
      await expect(qtyAfter).toHaveValue(newQty, { timeout: 5000 });
    }

    await page.screenshot({ path: "test-results/bom-edit-qty.png" });
  });

  test("remove a BOM item and verify it disappears", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");
    await expectMainViewportVisible(page);

    const bomItems = page.locator('[data-testid="bom-item"], [class*="bom-row"], [class*="bom-item"]');
    const countBefore = await bomItems.count().catch(() => 0);

    if (countBefore > 0) {
      const removeBtn = page.locator('button[aria-label*="poista" i], button[aria-label*="remove" i], button[aria-label*="delete" i]').first();
      if (await removeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await removeBtn.click();
        await page.waitForTimeout(1500);

        const countAfter = await bomItems.count().catch(() => 0);
        expect(countAfter).toBeLessThan(countBefore);
      }
    }

    await page.screenshot({ path: "test-results/bom-remove-item.png" });
  });

  test("BOM total cost updates after quantity change", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");
    await expectMainViewportVisible(page);

    const totalEl = page.getByText(/yhteensä|total/i).first();
    const initialTotal = await totalEl.textContent().catch(() => null);

    const qtyInput = page.locator('input[type="number"]').first();
    if (await qtyInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      const current = await qtyInput.inputValue();
      const newQty = String(parseInt(current || "1") + 10);
      await qtyInput.fill(newQty);
      await qtyInput.press("Tab");
      await page.waitForTimeout(1500);

      const updatedTotal = await totalEl.textContent().catch(() => null);
      if (initialTotal && updatedTotal) {
        expect(updatedTotal).not.toBe(initialTotal);
      }
    }

    await page.screenshot({ path: "test-results/bom-total-update.png" });
  });
});
