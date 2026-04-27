import { test, expect } from "@playwright/test";
import { apiUrl, createProjectViaAPI, loginViaUI, openProjectEditor, registerUser, saveBomViaAPI } from "./helpers";

test.describe("PDF Export", () => {
  let user: { email: string; password: string; name: string; token: string };
  let projectId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `pdf-${Date.now()}`);

    projectId = await createProjectViaAPI(page, user.token, {
      name: "PDF Export Test",
      description: "Testing PDF generation",
      scene_js:
        'const f = box(6,0.2,4);\nscene.add(f, {material: "foundation", color: [0.7,0.7,0.7]});',
    });

    await saveBomViaAPI(page, user.token, projectId, [
      { material_id: "pine_48x148_c24", quantity: 42, unit: "jm" },
      { material_id: "concrete_c25", quantity: 1.2, unit: "m3" },
    ]);
    await page.close();
  });

  test("API returns valid PDF", async ({ page }) => {
    const res = await page.request.get(
      apiUrl(`/projects/${projectId}/pdf?lang=fi`),
      {
        headers: { Authorization: `Bearer ${user.token}` },
      }
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("application/pdf");

    const buf = await res.body();
    expect(buf.length).toBeGreaterThan(1000);

    // PDF starts with %PDF-
    const header = buf.slice(0, 5).toString();
    expect(header).toBe("%PDF-");
  });

  test("PDF export button triggers download in editor", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15000 });
    await openProjectEditor(page, projectId);

    const exportTrigger = page.locator('[data-tour="export-btn"] button').first();
    await expect(exportTrigger).toBeEnabled({ timeout: 15_000 });
    await exportTrigger.click();

    const pdfBtn = page.getByRole("menuitem", { name: /^PDF$/i });
    await expect(pdfBtn).toBeVisible({ timeout: 5_000 });

    const pdfResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes(`/projects/${projectId}/pdf`) &&
        response.status() === 200,
      { timeout: 15_000 }
    );
    const downloadPromise = page.waitForEvent("download", { timeout: 15_000 });

    await pdfBtn.click();

    const [pdfResponse, download] = await Promise.all([pdfResponsePromise, downloadPromise]);
    expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
    expect(download.suggestedFilename()).toContain(".pdf");
  });
});
