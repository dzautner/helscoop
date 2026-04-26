import { test, expect } from "@playwright/test";
import { registerUser, loginViaUI, dismissOnboarding, expectMainViewportVisible, readObjectCount } from "./helpers";

test.describe("Building Lookup & Import", () => {
  let user: { email: string; password: string; name: string; token: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `building-${Date.now()}`);
    await page.close();
  });

  test("searches for a demo address and sees building info", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("helscoop_onboarding_completed", "true");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    const addressInput = page.locator('[data-tour="address-input"] input').first();
    await expect(addressInput).toBeVisible();
    await addressInput.fill("Ribbingintie 109-11, 00890 Helsinki");

    await page
      .getByRole("button", { name: /hae|search/i })
      .first()
      .click({ force: true });

    await expect(
      page.getByText(/omakotitalo|detached house/i)
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText(/tarkistettu|verified/i)
    ).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: "test-results/building-lookup-demo.png" });
  });

  test("searches generic address and gets estimated result", async ({
    page,
  }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("helscoop_onboarding_completed", "true");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    const addressInput = page.locator('[data-tour="address-input"] input').first();
    await addressInput.fill("Mannerheimintie 42, 00100 Helsinki");

    await page
      .getByRole("button", { name: /hae|search/i })
      .first()
      .click({ force: true });

    await expect(
      page.locator(".address-result-glow, [class*='address-result']").first()
    ).toContainText(/verified|tarkistettu|estimated|arvioitu/i, { timeout: 15_000 });

    await page.screenshot({ path: "test-results/building-lookup-generic.png" });
  });

  test("imports a building into a project and renders it", async ({
    page,
  }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15000 });
    await dismissOnboarding(page);

    const addressInput = page.locator('[data-tour="address-input"] input').first();
    await addressInput.fill("Ribbingintie 109-11, 00890 Helsinki");
    await page
      .getByRole("button", { name: /hae|search/i })
      .first()
      .click({ force: true });

    await expect(
      page.getByText(/omakotitalo|detached house/i)
    ).toBeVisible({ timeout: 15_000 });

    const importBtn = page.getByRole("button", {
      name: /luo projekti|create project/i,
    });
    await expect(importBtn).toBeVisible({ timeout: 5000 });
    await importBtn.click({ force: true });

    await page.waitForURL(/\/project\//, { timeout: 20_000 });

    await expectMainViewportVisible(page);

    const count = await readObjectCount(page, 15_000);
    expect(count).toBeGreaterThanOrEqual(10);

    await page.screenshot({ path: "test-results/building-imported-3d.png" });
  });
});
