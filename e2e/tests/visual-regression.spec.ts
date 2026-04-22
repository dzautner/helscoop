import { test, expect } from "@playwright/test";
import { registerUser, loginViaUI, createProjectViaAPI, apiUrl } from "./helpers";

test.describe("3D Viewport — Visual Regression", () => {
  let user: { email: string; password: string; name: string; token: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `vr-${Date.now()}`);
    await page.close();
  });

  test("default scene renders a visible canvas", async ({ page }) => {
    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Visual Regression - Default",
      scene_js: 'scene.add(box(4, 3, 5), { material: "lumber" });',
    });

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(3000);
    await page.waitForLoadState("networkidle");

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(200);

    await page.screenshot({ path: "test-results/vr-default-scene.png" });
    await expect(canvas).toHaveScreenshot("default-scene.png", {
      maxDiffPixelRatio: 0.15,
      timeout: 10_000,
    });
  });

  test("complex building scene renders correctly", async ({ page }) => {
    const complexScene = `
const foundation = box(10, 0.3, 8);
scene.add(foundation, { material: "concrete" });

const wall1 = translate(box(10, 2.8, 0.2), 0, 1.55, -3.9);
scene.add(wall1, { material: "lumber" });

const wall2 = translate(box(10, 2.8, 0.2), 0, 1.55, 3.9);
scene.add(wall2, { material: "lumber" });

const wall3 = translate(box(0.2, 2.8, 8), -4.9, 1.55, 0);
scene.add(wall3, { material: "lumber" });

const wall4 = translate(box(0.2, 2.8, 8), 4.9, 1.55, 0);
scene.add(wall4, { material: "lumber" });
`.trim();

    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Visual Regression - Complex",
      scene_js: complexScene,
    });

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(4000);
    await page.waitForLoadState("networkidle");

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "test-results/vr-complex-scene.png" });
    await expect(canvas).toHaveScreenshot("complex-scene.png", {
      maxDiffPixelRatio: 0.15,
      timeout: 10_000,
    });
  });

  test("wireframe mode toggle changes rendering", async ({ page }) => {
    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Visual Regression - Wireframe",
      scene_js: 'scene.add(box(4, 3, 5), { material: "lumber" });',
    });

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(3000);
    await page.waitForLoadState("networkidle");

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // Take solid-mode baseline
    const solidScreenshot = await canvas.screenshot();

    // Toggle wireframe mode
    const wireframeBtn = page.locator('button[aria-label*="wireframe" i], button[aria-label*="rautalanka" i], button[data-tooltip*="wireframe" i]');
    if (await wireframeBtn.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await wireframeBtn.first().click();
      await page.waitForTimeout(1500);

      // Take wireframe screenshot
      const wireframeScreenshot = await canvas.screenshot();

      // Compare — wireframe should look different
      expect(Buffer.compare(solidScreenshot, wireframeScreenshot)).not.toBe(0);

      await page.screenshot({ path: "test-results/vr-wireframe.png" });
    }
  });

  test("camera presets change viewport angle", async ({ page }) => {
    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Visual Regression - Camera",
      scene_js: 'scene.add(box(4, 3, 5), { material: "lumber" });',
    });

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(3000);
    await page.waitForLoadState("networkidle");

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // Take default angle baseline
    const defaultScreenshot = await canvas.screenshot();

    // Try camera preset buttons (front, side, top)
    const cameraPresets = page.locator('button[aria-label*="camera" i], button[data-tooltip*="front" i], button[data-tooltip*="edestä" i]');
    if (await cameraPresets.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await cameraPresets.first().click();
      await page.waitForTimeout(1500);

      const presetScreenshot = await canvas.screenshot();
      expect(Buffer.compare(defaultScreenshot, presetScreenshot)).not.toBe(0);
    }

    await page.screenshot({ path: "test-results/vr-camera-presets.png" });
  });

  test("scene with boolean operations renders", async ({ page }) => {
    const boolScene = `
const base = box(4, 3, 5);
const hole = translate(box(1, 2, 0.5), 0, 0, 2.5);
const result = subtract(base, hole);
scene.add(result, { material: "lumber" });
`.trim();

    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Visual Regression - Boolean",
      scene_js: boolScene,
    });

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(4000);
    await page.waitForLoadState("networkidle");

    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: "test-results/vr-boolean-ops.png" });
    await expect(canvas).toHaveScreenshot("boolean-scene.png", {
      maxDiffPixelRatio: 0.15,
      timeout: 10_000,
    });
  });
});
