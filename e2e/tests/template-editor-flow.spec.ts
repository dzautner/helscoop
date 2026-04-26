import { test, expect } from "@playwright/test";
import { registerUser, loginViaUI, createProjectViaAPI, readObjectCount, expectMainViewportVisible } from "./helpers";

test.describe("Template → Editor → Save → Reload", () => {
  let user: { email: string; password: string; name: string; token: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `tmpl-${Date.now()}`);
    await page.close();
  });

  test("create project from template, edit, save, and reload", async ({ page }) => {
    test.setTimeout(120_000);

    await loginViaUI(page, user.email, user.password);
    await expect(page.getByText(/omat projektit|my projects/i)).toBeVisible({ timeout: 15_000 });

    // Step 1: Create a project from a real template via API, then open it.
    const templatesRes = await page.request.get(`${process.env.TEST_API_URL || "http://localhost:3001"}/templates`);
    expect(templatesRes.ok()).toBe(true);
    const templates = await templatesRes.json();
    const template = templates.find((item: { scene_js?: string }) => Boolean(item.scene_js)) ?? templates[0];
    const projectId = await createProjectViaAPI(page, user.token, {
      name: `Template: ${template.name}`,
      scene_js: template.scene_js,
    });
    await page.goto(`/project/${projectId}`, { waitUntil: "domcontentloaded" });

    // Step 2: Verify 3D viewport renders
    await expectMainViewportVisible(page, 30_000);

    // Step 3: Verify objects rendered
    const objectCount = await readObjectCount(page, 30_000);
    expect(objectCount).toBeGreaterThanOrEqual(1);

    // Step 4: Verify BOM items populated from template
    const bomText = page.getByText(/materiaalilista|material list|arvioitu|estimated/i).first();
    await expect(bomText).toBeVisible({ timeout: 10_000 });

    // Step 5: Edit a stable project field and wait for auto-save.
    const editedName = `Edited ${template.name}`;
    const projectNameInput = page.getByLabel(/project name/i);
    await projectNameInput.fill(editedName);

    // Step 6: Wait for auto-save
    await expect(
      page.getByText(/saved|tallennettu/i).first()
    ).toBeVisible({ timeout: 15_000 });

    // Step 7: Capture URL for reload
    const projectUrl = page.url();

    // Step 8: Navigate away and come back
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.goto(projectUrl, { waitUntil: "domcontentloaded" });

    // Step 9: Verify the edit persisted — canvas still renders
    await expectMainViewportVisible(page, 30_000);
    await expect(projectNameInput).toHaveValue(editedName, { timeout: 10_000 });

    // Object count should still be present after reload.
    if (objectCount > 0) {
      const newCount = await readObjectCount(page, 30_000);
      expect(newCount).toBeGreaterThanOrEqual(objectCount);
    }
  });
});
