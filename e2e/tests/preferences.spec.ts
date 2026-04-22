import { test, expect } from "@playwright/test";
import { registerUser, setAuthToken, createProjectViaAPI } from "./helpers";

test.describe("Theme toggle persistence", () => {
  test("theme persists across navigation and reload", async ({ page }) => {
    const user = await registerUser(page);
    await setAuthToken(page, user.token);

    const getTheme = () =>
      page.evaluate(() => document.documentElement.getAttribute("data-theme"));

    const initialTheme = await getTheme();
    expect(initialTheme).toBeTruthy();

    const themeButton = page.locator('[data-tour="theme-toggle"], button[aria-label*="theme" i], button[aria-label*="teema" i]').first();
    if (await themeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeButton.click();
      await page.waitForTimeout(300);
      const toggledTheme = await getTheme();
      expect(toggledTheme).not.toBe(initialTheme);

      const storedTheme = await page.evaluate(() =>
        localStorage.getItem("helscoop_theme")
      );
      expect(storedTheme).toBeTruthy();

      await page.reload();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      const afterReload = await getTheme();
      expect(afterReload).toBe(toggledTheme);
    }
  });

  test("theme persists when navigating to project", async ({ page }) => {
    const user = await registerUser(page);
    await setAuthToken(page, user.token);

    const getTheme = () =>
      page.evaluate(() => document.documentElement.getAttribute("data-theme"));

    const themeButton = page.locator('[data-tour="theme-toggle"], button[aria-label*="theme" i], button[aria-label*="teema" i]').first();
    if (await themeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeButton.click();
      await page.waitForTimeout(300);
      const toggledTheme = await getTheme();

      const projectId = await createProjectViaAPI(page, user.token, {
        name: "Theme Test Project",
        scene_js: "box(5,5,5)",
      });

      await page.goto(`/project/${projectId}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);

      const projectTheme = await getTheme();
      expect(projectTheme).toBe(toggledTheme);
    }
  });
});

test.describe("Language switcher persistence", () => {
  test("locale persists across reload", async ({ page }) => {
    const user = await registerUser(page);
    await setAuthToken(page, user.token);

    const getLocale = () =>
      page.evaluate(() => localStorage.getItem("helscoop_locale"));

    const initialLocale = await getLocale();

    const langButton = page.locator('button[aria-label*="language" i], button[aria-label*="kieli" i], [data-tour="language-switcher"]').first();
    if (await langButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await langButton.click();
      await page.waitForTimeout(500);

      const newLocale = await getLocale();
      expect(newLocale).not.toBe(initialLocale);

      const htmlLang = await page.evaluate(() =>
        document.documentElement.lang
      );
      expect(htmlLang).toBe(newLocale);

      await page.reload();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(500);

      const afterReload = await getLocale();
      expect(afterReload).toBe(newLocale);

      const htmlLangAfter = await page.evaluate(() =>
        document.documentElement.lang
      );
      expect(htmlLangAfter).toBe(newLocale);
    }
  });

  test("locale changes visible text", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("helscoop_onboarding_completed", "true");
      localStorage.setItem("helscoop_locale", "fi");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const finnishText = await page.getByText(/kirjaudu/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(finnishText).toBe(true);

    await page.evaluate(() => {
      localStorage.setItem("helscoop_locale", "en");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const englishText = await page.getByText(/sign in|log in/i).isVisible({ timeout: 3000 }).catch(() => false);
    expect(englishText).toBe(true);
  });
});

test.describe("Combined preferences", () => {
  test("theme and locale persist together across navigation", async ({ page }) => {
    const user = await registerUser(page);
    await setAuthToken(page, user.token);

    await page.evaluate(() => {
      localStorage.setItem("helscoop_locale", "en");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const themeButton = page.locator('[data-tour="theme-toggle"], button[aria-label*="theme" i], button[aria-label*="teema" i]').first();
    let toggledTheme: string | null = null;
    if (await themeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await themeButton.click();
      await page.waitForTimeout(300);
      toggledTheme = await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme")
      );
    }

    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Prefs Test",
      scene_js: "box(3,3,3)",
    });

    await page.goto(`/project/${projectId}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const locale = await page.evaluate(() =>
      localStorage.getItem("helscoop_locale")
    );
    expect(locale).toBe("en");

    if (toggledTheme) {
      const currentTheme = await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme")
      );
      expect(currentTheme).toBe(toggledTheme);
    }

    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);

    const localeBack = await page.evaluate(() =>
      localStorage.getItem("helscoop_locale")
    );
    expect(localeBack).toBe("en");
  });
});
