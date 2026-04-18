import { test, expect } from "@playwright/test";

const API_URL = "http://localhost:3051";

test.describe("Full User Journey", () => {
  const email = `e2e-journey-${Date.now()}@test.com`;
  const password = "testpass123";

  test("register → create project → render 3D → BOM → PDF → delete", async ({
    page,
  }) => {
    // 1. Visit home page
    await page.goto("/");
    await expect(page).toHaveTitle(/helscoop/i);

    // 2. Register via API
    const regRes = await page.request.post(`${API_URL}/auth/register`, {
      data: { email, password, name: "Journey Test" },
    });
    const { token } = await regRes.json();
    expect(token).toBeTruthy();

    // 3. Set token, dismiss onboarding, reload
    await page.evaluate((t) => {
      localStorage.setItem("helscoop_token", t);
      localStorage.setItem("helscoop_onboarding_completed", "true");
    }, token);
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Should be logged in
    await expect(
      page.getByText(/omat projektit|my projects/i)
    ).toBeVisible({ timeout: 15_000 });

    // 4. Create project via API with scene
    const projRes = await page.request.post(`${API_URL}/projects`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        name: "Full Flow Test",
        description: "End-to-end journey",
        scene_js: `
const floor = box(6, 0.2, 4);
const wall1 = translate(box(6, 2.8, 0.15), 0, 1.5, -1.925);
const wall2 = translate(box(6, 2.8, 0.15), 0, 1.5, 1.925);
const wall3 = translate(box(0.15, 2.8, 4), -2.925, 1.5, 0);
const wall4 = translate(box(0.15, 2.8, 4), 2.925, 1.5, 0);
const roof = translate(rotate(box(7, 0.08, 5), 0.52, 0, 0), 0, 3.5, -1);
scene.add(floor, { material: "foundation", color: [0.7, 0.7, 0.7] });
scene.add(wall1, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall2, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall3, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(wall4, { material: "lumber", color: [0.85, 0.75, 0.55] });
scene.add(roof, { material: "roofing", color: [0.35, 0.32, 0.30] });
        `.trim(),
      },
    });
    const project = await projRes.json();

    // 5. Navigate to editor
    await page.goto(`/project/${project.id}`);
    await page.waitForLoadState("networkidle");

    // 6. Verify 3D viewport renders
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // 6 objects
    await expect(page.getByText(/6\s*(objects|objektia)/i)).toBeVisible({
      timeout: 10_000,
    });

    // 7. Verify name
    await expect(
      page.locator('input[value="Full Flow Test"]')
    ).toBeVisible({ timeout: 5000 });

    // 8. Save BOM via API
    await page.request.put(`${API_URL}/projects/${project.id}/bom`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        items: [
          { material_id: "pine_48x148_c24", quantity: 65, unit: "jm" },
          { material_id: "pine_48x98_c24", quantity: 45, unit: "jm" },
          { material_id: "concrete_c25", quantity: 2.4, unit: "m3" },
          { material_id: "metal_roof_ruukki", quantity: 28, unit: "m2" },
        ],
      },
    });

    // Reload to see BOM
    await page.reload();
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // 9. Verify BOM items visible
    await expect(
      page.getByText(/48x148/i).first()
    ).toBeVisible({ timeout: 10_000 });

    // 10. Export PDF via API
    const pdfRes = await page.request.get(
      `${API_URL}/projects/${project.id}/pdf?lang=fi`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()["content-type"]).toBe("application/pdf");

    // 11. Final screenshot
    await page.screenshot({
      path: "test-results/full-flow-final.png",
      fullPage: true,
    });

    // 12. Delete project
    const delRes = await page.request.delete(
      `${API_URL}/projects/${project.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(delRes.status()).toBe(200);

    // 13. Confirm deletion
    const getRes = await page.request.get(
      `${API_URL}/projects/${project.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    expect(getRes.status()).toBe(404);
  });
});
