import { test, expect, type Page } from "@playwright/test";
import {
  apiUrl,
  createProjectViaAPI,
  dismissOnboarding,
  expectBomPanelVisible,
  loginViaUI,
  openProjectEditor,
  readObjectCount,
  registerUser,
  saveBomViaAPI,
} from "./helpers";

const BASIC_SCENE = 'scene.add(box(6,0.2,4), {material:"foundation"});';
const BOM_ITEMS = [{ material_id: "pine_48x98_c24", quantity: 50, unit: "jm" }];

function waitForBomSave(page: Page, projectId?: string) {
  return page.waitForResponse(
    (response) => {
      if (response.request().method() !== "PUT" || !response.ok()) return false;
      const url = new URL(response.url());
      if (projectId) return url.pathname === `/projects/${projectId}/bom`;
      return /^\/projects\/[^/]+\/bom$/.test(url.pathname);
    },
    { timeout: 15_000 },
  );
}

async function createSeededQuoteProject(
  page: Page,
  token: string,
  name: string,
  bomItems = BOM_ITEMS,
): Promise<string> {
  const projectId = await createProjectViaAPI(page, token, {
    name,
    scene_js: BASIC_SCENE,
  });
  await saveBomViaAPI(page, token, projectId, bomItems);
  return projectId;
}

async function openQuoteProject(page: Page, projectId: string) {
  await openProjectEditor(page, projectId);
  await expectBomPanelVisible(page);
}

function bomRow(page: Page, material: RegExp) {
  return page.locator(".bom-item-card").filter({ hasText: material }).first();
}

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
    await dismissOnboarding(page);

    const addressInput = page.locator('[data-tour="address-input"] input').first();
    const searchButton = page
      .locator('[data-tour="address-input"]')
      .first()
      .getByRole("button", { name: /hae|search/i });
    await expect(addressInput).toBeVisible({ timeout: 10_000 });
    await addressInput.fill("Ribbingintie 109-11, 00890 Helsinki");
    await expect(searchButton).toBeEnabled({ timeout: 5_000 });

    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "GET" &&
          response.url().includes("/building?") &&
          response.ok(),
        { timeout: 15_000 },
      ),
      searchButton.click(),
    ]);

    const resultCard = page
      .locator('.address-result-glow, [class*="address-result"]')
      .filter({ hasText: /Ribbingintie|omakotitalo|detached house/i })
      .first();
    await expect(resultCard).toBeVisible({ timeout: 15_000 });
    await expect(resultCard).toContainText(/omakotitalo|detached house|single-family home/i);

    const createBtn = resultCard.getByRole("button", { name: /luo projekti|create project|create from building|aloita/i });
    await expect(createBtn).toBeEnabled({ timeout: 5_000 });

    const createProjectResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname === "/projects" &&
        response.ok(),
      { timeout: 15_000 },
    );
    const saveBomResponse = waitForBomSave(page);

    await createBtn.click();
    const project = await (await createProjectResponse).json();
    await saveBomResponse;
    await page.waitForURL(new RegExp(`/project/${project.id}`), { timeout: 20_000 });

    await openProjectEditor(page, project.id);
    const objectCount = await readObjectCount(page, 15_000);
    expect(objectCount).toBeGreaterThanOrEqual(10);

    await expectBomPanelVisible(page);
    const bomItems = page.locator(".bom-item-card");
    await expect(bomItems.first()).toBeVisible({ timeout: 10_000 });
    expect(await bomItems.count()).toBeGreaterThan(0);

    await page.screenshot({ path: "test-results/reno-flow-project.png" });

    await page.screenshot({ path: "test-results/reno-flow-address.png" });
  });

  test("BOM editing updates cost totals", async ({ page }) => {
    const projectId = await createSeededQuoteProject(page, user.token, "BOM Edit Test");

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await openQuoteProject(page, projectId);

    const row = bomRow(page, /48\s*x?\s*98|runkopuu|framing timber/i);
    await expect(row).toBeVisible({ timeout: 10_000 });
    await row.scrollIntoViewIfNeeded();

    const qtyInput = row.locator(".bom-item-qty-input");
    await expect(qtyInput).toHaveValue("50");
    const totalBefore = await row.locator(".bom-item-total").textContent();

    const save = waitForBomSave(page, projectId);
    await qtyInput.fill("100");
    await qtyInput.blur();
    await save;

    await expect(qtyInput).toHaveValue("100", { timeout: 5_000 });
    await expect(row.locator(".bom-item-total")).not.toHaveText(totalBefore || "", { timeout: 5_000 });

    const projectResponse = await page.request.get(apiUrl(`/projects/${projectId}`), {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(projectResponse.status()).toBe(200);
    const project = await projectResponse.json();
    const savedItem = project.bom.find((item: { material_id: string }) => item.material_id === "pine_48x98_c24");
    expect(Number(savedItem?.quantity)).toBe(100);

    await page.screenshot({ path: "test-results/reno-flow-bom-edit.png" });
  });

  test("PDF export triggers download", async ({ page }) => {
    const projectId = await createSeededQuoteProject(page, user.token, "PDF Export Test");

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await openQuoteProject(page, projectId);

    const exportBtn = page.locator('[data-tour="export-btn"] button').first();
    await expect(exportBtn).toBeEnabled({ timeout: 15_000 });
    await exportBtn.click();

    const pdfItem = page.getByRole("menuitem", { name: /^PDF$/i });
    await expect(pdfItem).toBeVisible({ timeout: 5_000 });

    const pdfResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/projects/${projectId}/pdf`) &&
        response.status() === 200,
      { timeout: 15_000 },
    );
    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });

    await pdfItem.click();
    const [pdfResponse, download] = await Promise.all([pdfResponsePromise, downloadPromise]);
    expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    await page.screenshot({ path: "test-results/reno-flow-export-pdf.png" });
  });

  test("CSV export triggers download", async ({ page }) => {
    const projectId = await createSeededQuoteProject(page, user.token, "CSV Export Test");

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await openQuoteProject(page, projectId);

    const exportBtn = page.locator('[data-tour="export-btn"] button').first();
    await expect(exportBtn).toBeEnabled({ timeout: 15_000 });
    await exportBtn.click();

    const csvItem = page.getByRole("menuitem", { name: /^CSV$/i });
    await expect(csvItem).toBeVisible({ timeout: 5_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 10_000 });
    await csvItem.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/i);

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
    await openQuoteProject(page, projectId);

    const emptyState = page.locator(".bom-empty").first();
    await expect(emptyState).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".bom-item-card")).toHaveCount(0);
    await expect(page.locator(".bom-empty-title")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".bom-empty-cta")).toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: "test-results/reno-flow-empty-bom.png" });
  });
});
