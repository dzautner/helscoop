import { test, expect, type Page } from "@playwright/test";
import {
  createProjectViaAPI,
  expectBomPanelVisible,
  loginViaUI,
  openProjectEditor,
  registerUser,
  saveBomViaAPI,
} from "./helpers";

const SCENE_JS = 'scene.add(box(6,0.2,4), {material:"foundation"});';

async function createProject(page: Page, token: string, name: string): Promise<string> {
  return createProjectViaAPI(page, token, { name, scene_js: SCENE_JS });
}

function bomSave(page: Page, projectId: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().includes(`/projects/${projectId}/bom`) &&
      response.ok(),
    { timeout: 15_000 },
  );
}

function bomRow(page: Page, material: RegExp) {
  return page.locator(".bom-item-card").filter({ hasText: material }).first();
}

async function openBomProject(page: Page, projectId: string) {
  await openProjectEditor(page, projectId);
  await expectBomPanelVisible(page);
}

test.describe("BOM Panel — Item CRUD", () => {
  let user: { email: string; password: string; name: string; token: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `bom-crud-${Date.now()}`);
    await page.close();
  });

  test("adds a material to the BOM from the material catalog", async ({ page }) => {
    const projectId = await createProject(page, user.token, "BOM Add Test");
    await loginViaUI(page, user.email, user.password);
    await openBomProject(page, projectId);

    const materialCard = page.locator(".material-browse-card").filter({ hasText: /48x148/i }).first();
    await materialCard.scrollIntoViewIfNeeded();
    await expect(materialCard).toBeVisible({ timeout: 10_000 });
    await materialCard.click();

    const quantityInput = materialCard.locator('input[type="number"]');
    await expect(quantityInput).toBeVisible({ timeout: 5_000 });
    await quantityInput.fill("3");

    const save = bomSave(page, projectId);
    await materialCard.locator("button", { hasText: /lisää|add/i }).click();
    await save;

    const row = bomRow(page, /48x148/i);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await expect(row.locator(".bom-item-qty-input")).toHaveValue("3");
  });

  test("edits BOM item quantity inline and persists the change", async ({ page }) => {
    const projectId = await createProject(page, user.token, "BOM Quantity Test");
    await saveBomViaAPI(page, user.token, projectId, [
      { material_id: "pine_48x98_c24", quantity: 10, unit: "jm" },
    ]);

    await loginViaUI(page, user.email, user.password);
    await openBomProject(page, projectId);

    const row = bomRow(page, /48\s*x?\s*98|runkopuu|framing timber/i);
    await expect(row).toBeVisible({ timeout: 10_000 });
    const quantityInput = row.locator(".bom-item-qty-input");
    const totalBefore = await row.locator(".bom-item-total").textContent();

    const save = bomSave(page, projectId);
    await quantityInput.fill("25");
    await quantityInput.blur();
    await save;

    await expect(quantityInput).toHaveValue("25");
    await expect(row.locator(".bom-item-total")).not.toHaveText(totalBefore || "", { timeout: 5_000 });
  });

  test("removes a BOM item and leaves the remaining items intact", async ({ page }) => {
    const projectId = await createProject(page, user.token, "BOM Remove Test");
    await saveBomViaAPI(page, user.token, projectId, [
      { material_id: "pine_48x98_c24", quantity: 10, unit: "jm" },
      { material_id: "osb_9mm", quantity: 5, unit: "m2" },
    ]);

    await loginViaUI(page, user.email, user.password);
    await openBomProject(page, projectId);

    const framingRow = bomRow(page, /48\s*x?\s*98|runkopuu|framing timber/i);
    const osbRow = bomRow(page, /osb/i);
    await expect(framingRow).toBeVisible({ timeout: 10_000 });
    await expect(osbRow).toBeVisible({ timeout: 10_000 });

    await framingRow.scrollIntoViewIfNeeded();
    await framingRow.hover();
    const removeButton = framingRow.locator(".bom-remove-btn");
    await expect(removeButton).toBeVisible({ timeout: 5_000 });
    const save = bomSave(page, projectId);
    await removeButton.click();
    const confirmButton = page.locator("button").filter({
      hasText: /delete|poista|remove|radera|kyllä|yes|vahvista|confirm/i,
    });
    if (await confirmButton.first().isVisible({ timeout: 1_500 }).catch(() => false)) {
      await confirmButton.first().click();
    }
    await expect(framingRow).not.toBeVisible({ timeout: 5_000 });
    await expect(osbRow).toBeVisible({ timeout: 5_000 });
    await save;

    await openBomProject(page, projectId);
    await expect(bomRow(page, /48\s*x?\s*98|runkopuu|framing timber/i)).not.toBeVisible({ timeout: 5_000 });
    await expect(bomRow(page, /osb/i)).toBeVisible({ timeout: 5_000 });
  });

  test("updates visible item and panel totals after quantity change", async ({ page }) => {
    const projectId = await createProject(page, user.token, "BOM Total Test");
    await saveBomViaAPI(page, user.token, projectId, [
      { material_id: "pine_48x148_c24", quantity: 2, unit: "jm" },
    ]);

    await loginViaUI(page, user.email, user.password);
    await openBomProject(page, projectId);

    const row = bomRow(page, /48\s*x?\s*148/i);
    await expect(row).toBeVisible({ timeout: 10_000 });

    const itemTotal = row.locator(".bom-item-total");
    const itemTotalBefore = await itemTotal.textContent();
    const panelTextBefore = await page.locator(".editor-bom-panel").textContent();

    const save = bomSave(page, projectId);
    await row.locator(".bom-item-qty-input").fill("20");
    await row.locator(".bom-item-qty-input").blur();
    await save;

    await expect(itemTotal).not.toHaveText(itemTotalBefore || "", { timeout: 5_000 });
    const panelTextAfter = await page.locator(".editor-bom-panel").textContent();
    expect(panelTextAfter).not.toBe(panelTextBefore);
  });
});
