import { test, expect } from "@playwright/test";
import { registerUser, setAuthToken } from "./helpers";

test.describe("Templates", () => {
  let token: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    const user = await registerUser(page, `tpl-${Date.now()}`);
    token = user.token;
    await page.close();
  });

  test("API returns all 4 templates with valid scene_js", async ({ page }) => {
    const res = await page.request.get("http://localhost:3051/templates");
    expect(res.status()).toBe(200);
    const templates = await res.json();
    expect(templates.length).toBe(4);

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
    await setAuthToken(page, token);

    // Get templates
    const res = await page.request.get("http://localhost:3051/templates");
    const templates = await res.json();

    for (const tpl of templates) {
      // Create project from template
      const projRes = await page.request.post(
        "http://localhost:3051/projects",
        {
          headers: { Authorization: `Bearer ${token}` },
          data: {
            name: `Template: ${tpl.name}`,
            scene_js: tpl.scene_js,
          },
        }
      );
      const project = await projRes.json();

      await page.goto(`/project/${project.id}`);
      const canvas = page.locator("canvas");
      await expect(canvas).toBeVisible({ timeout: 15_000 });

      // Verify objects rendered
      await expect(
        page.getByText(/\d+\s*(objects|objektia)/i)
      ).toBeVisible({ timeout: 10_000 });

      const countText = await page
        .getByText(/\d+\s*(objects|objektia)/i)
        .textContent();
      const count = parseInt(countText?.match(/(\d+)/)?.[1] || "0");
      expect(count).toBeGreaterThan(0);

      await page.screenshot({
        path: `test-results/template-${tpl.id}.png`,
      });
    }
  });
});
