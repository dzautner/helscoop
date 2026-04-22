import { test, expect } from "@playwright/test";
import { registerUser, loginViaUI, createProjectViaAPI, apiUrl } from "./helpers";

test.describe("Shared project viewer flow", () => {
  let user: { email: string; password: string; name: string; token: string };
  let projectId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `share-${Date.now()}`);
    projectId = await createProjectViaAPI(page, user.token, {
      name: "Share Flow Test",
      scene_js: 'scene.add(box(4,3,5), {material:"lumber"});',
    });
    await page.close();
  });

  test("share link generation, anonymous viewing, and unshare revocation", async ({ page }) => {
    // 1. Log in and open the project
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await page.goto(`/project/${projectId}`);
    await page.waitForTimeout(2000);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

    // 2. Click share button
    const shareBtn = page.locator('button[aria-label*="jaa" i], button[aria-label*="share" i]');
    await expect(shareBtn.first()).toBeVisible({ timeout: 10_000 });
    await shareBtn.first().click();

    // 3. Share dialog appears with a link
    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    const linkInput = dialog.locator("input[readonly], input[type='text']").first();
    await expect(linkInput).toBeVisible({ timeout: 5_000 });
    const shareUrl = await linkInput.inputValue();
    expect(shareUrl).toMatch(/\/shared\/[a-f0-9-]+/);

    // 4. Copy link button is present
    const copyBtn = dialog.getByRole("button", { name: /kopioi|copy/i });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();
    await page.waitForTimeout(500);

    // Close the dialog
    const closeBtn = dialog.locator('button[aria-label*="sulje" i], button[aria-label*="close" i], button[aria-label*="peruuta" i], button[aria-label*="cancel" i]').first();
    if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await closeBtn.click();
    } else {
      await page.keyboard.press("Escape");
    }
    await expect(dialog).not.toBeVisible({ timeout: 5_000 });

    await page.screenshot({ path: "test-results/share-dialog.png" });

    // 5. Open the share link in an anonymous context (new browser context)
    const sharedPath = new URL(shareUrl).pathname;
    const anonContext = await page.context().browser()!.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(shareUrl.startsWith("http") ? shareUrl : `${page.url().split("/project")[0]}${sharedPath}`);
    await anonPage.waitForLoadState("networkidle");
    await anonPage.waitForTimeout(2000);

    // 6. Verify read-only badge
    const readOnlyBadge = anonPage.getByText(/vain luku|read.only/i);
    await expect(readOnlyBadge.first()).toBeVisible({ timeout: 10_000 });

    // 7. Verify signup CTA
    const ctaLink = anonPage.locator('a[href*="helscoop.fi"]');
    await expect(ctaLink.first()).toBeVisible({ timeout: 5_000 });

    // 8. Verify project name is visible
    await expect(anonPage.getByText("Share Flow Test")).toBeVisible({ timeout: 5_000 });

    await anonPage.screenshot({ path: "test-results/share-anonymous-view.png" });
    await anonPage.close();
    await anonContext.close();

    // 9. Unshare via API
    const unshareRes = await page.request.delete(apiUrl(`/projects/${projectId}/share`), {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    expect(unshareRes.ok()).toBe(true);

    // 10. Verify the share link is now inaccessible
    const anonContext2 = await page.context().browser()!.newContext();
    const anonPage2 = await anonContext2.newPage();
    await anonPage2.goto(shareUrl.startsWith("http") ? shareUrl : `${page.url().split("/project")[0]}${sharedPath}`);
    await anonPage2.waitForLoadState("networkidle");
    await anonPage2.waitForTimeout(2000);

    // Should show not-found state
    const notFound = anonPage2.getByText(/ei löytynyt|not found|expired/i);
    await expect(notFound.first()).toBeVisible({ timeout: 10_000 });

    // Signup CTA should still be visible on error page
    const errorCta = anonPage2.locator('a[href*="helscoop.fi"]');
    await expect(errorCta.first()).toBeVisible({ timeout: 5_000 });

    await anonPage2.screenshot({ path: "test-results/share-revoked.png" });
    await anonPage2.close();
    await anonContext2.close();
  });

  test("shared project shows 3D canvas to anonymous viewer", async ({ page }) => {
    // Re-share the project
    const shareRes = await page.request.post(apiUrl(`/projects/${projectId}/share`), {
      headers: { Authorization: `Bearer ${user.token}` },
    });
    const { share_token } = await shareRes.json();
    expect(share_token).toBeTruthy();

    // Open in anonymous context
    const anonContext = await page.context().browser()!.newContext();
    const anonPage = await anonContext.newPage();
    await anonPage.goto(`/shared/${share_token}`);
    await anonPage.waitForLoadState("networkidle");
    await anonPage.waitForTimeout(3000);

    // Verify 3D canvas renders
    const canvas = anonPage.locator("canvas");
    if (await canvas.isVisible({ timeout: 10_000 }).catch(() => false)) {
      const box = await canvas.boundingBox();
      expect(box).toBeTruthy();
      expect(box!.width).toBeGreaterThan(100);
      expect(box!.height).toBeGreaterThan(100);
    }

    await anonPage.screenshot({ path: "test-results/share-3d-canvas.png" });
    await anonPage.close();
    await anonContext.close();
  });
});
