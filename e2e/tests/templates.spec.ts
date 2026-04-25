import { test, expect } from "@playwright/test";
import { registerUser, loginViaUI, mainViewportCanvas, readObjectCount } from "./helpers";

const API_URL = process.env.TEST_API_URL || "http://localhost:3001";

test.describe("Templates", () => {
  let user: { email: string; password: string; name: string; token: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `tpl-${Date.now()}`);
    await page.close();
  });

  test("API returns all templates with valid scene_js", async ({ page }) => {
    const res = await page.request.get(`${API_URL}/templates`);
    expect(res.status()).toBe(200);
    const templates = await res.json();
    expect(templates.length).toBeGreaterThanOrEqual(4);

    for (const t of templates) {
      expect(t.name).toBeTruthy();
      expect(t.scene_js).toContain("scene.add(");
      expect(t.scene_js).toContain("box(");
      expect(t.bom.length).toBeGreaterThan(0);
    }
  });

  test("each template scene renders correctly in viewport", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15000 });

    // Get templates
    const res = await page.request.get(`${API_URL}/templates`);
    const templates = await res.json();

    for (const tpl of templates) {
      // Create project from template
      const projRes = await page.request.post(
        `${API_URL}/projects`,
        {
          headers: { Authorization: `Bearer ${user.token}` },
          data: {
            name: `Template: ${tpl.name}`,
            scene_js: tpl.scene_js,
          },
        }
      );
      const project = await projRes.json();

      await page.goto(`/project/${project.id}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await page.waitForTimeout(2000);
      const canvas = mainViewportCanvas(page);
      await expect(canvas).toBeVisible({ timeout: 15_000 });

      // Verify objects rendered
      const count = await readObjectCount(page, 15_000);
      expect(count).toBeGreaterThan(0);

      await page.screenshot({
        path: `test-results/template-${tpl.id}.png`,
      });
    }
  });
});
