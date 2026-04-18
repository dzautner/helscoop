import { test, expect } from "@playwright/test";
import { registerUser, setAuthToken, dismissOnboarding } from "./helpers";

test.describe("Building Lookup & Import", () => {
  let token: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    const user = await registerUser(page, `building-${Date.now()}`);
    token = user.token;
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

    const addressInput = page.locator('[data-tour="address-input"] input');
    await expect(addressInput).toBeVisible();
    await addressInput.fill("Ribbingintie 109-11, 00890 Helsinki");

    await page
      .getByRole("button", { name: /hae|search/i })
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

    const addressInput = page.locator('[data-tour="address-input"] input');
    await addressInput.fill("Mannerheimintie 42, 00100 Helsinki");

    await page
      .getByRole("button", { name: /hae|search/i })
      .click({ force: true });

    await expect(
      page.getByText(/arvioitu|estimated/i)
    ).toBeVisible({ timeout: 15_000 });

    await page.screenshot({ path: "test-results/building-lookup-generic.png" });
  });

  test("imports a building into a project and renders it", async ({
    page,
  }) => {
    await setAuthToken(page, token);
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await dismissOnboarding(page);

    const addressInput = page.locator('[data-tour="address-input"] input');
    await addressInput.fill("Ribbingintie 109-11, 00890 Helsinki");
    await page
      .getByRole("button", { name: /hae|search/i })
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

    await expect(page.locator("canvas")).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByText(/[1-9]\d*\s*(objects|objektia)/i)
    ).toBeVisible({ timeout: 15_000 });
    const countText = await page
      .getByText(/[1-9]\d*\s*(objects|objektia)/i)
      .textContent();
    const count = parseInt(countText?.match(/(\d+)/)?.[1] || "0");
    expect(count).toBeGreaterThanOrEqual(10);

    await page.screenshot({ path: "test-results/building-imported-3d.png" });
  });
});
