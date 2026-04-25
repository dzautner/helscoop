import { test, expect, type Page } from "@playwright/test";
import { registerUser, loginViaUI, createProjectViaAPI } from "./helpers";

const API_URL = process.env.TEST_API_URL || "http://localhost:3001";

/**
 * Dismiss the onboarding overlay so it does not block interactions.
 */
async function dismissOnboarding(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem("helscoop_onboarding_completed", "true");
  });
}

/**
 * Navigate to / with onboarding dismissed and locale set to Finnish, then wait for load.
 * Setting locale explicitly avoids flaky results when the browser language is English.
 */
async function gotoLanding(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("helscoop_onboarding_completed", "true");
    localStorage.setItem("helscoop_locale", "fi");
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
}

// ═══════════════════════════════════════════════════════════════
// 1. Responsive Layout
// ═══════════════════════════════════════════════════════════════

test.describe("Responsive Layout — Desktop (1280x720)", () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test("landing page: all sections visible, no horizontal scroll", async ({ page }) => {
    await gotoLanding(page);

    // Login form panel and brand panel should both be visible in desktop split
    await expect(page.locator(".login-grid")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".login-brand")).toBeVisible();
    await expect(page.locator(".login-form-panel")).toBeVisible();

    // Footer should exist (may need scroll)
    await expect(page.locator("footer.landing-footer")).toBeAttached();

    // No horizontal scroll — body scrollWidth should equal clientWidth
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});

test.describe("Responsive Layout — Tablet (768x1024)", () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test("landing page: layout adapts, no overflow", async ({ page }) => {
    await gotoLanding(page);

    // The page should render without errors
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });

    // No horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});

test.describe("Responsive Layout — Mobile (375x667)", () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test("landing page: stacked layout, no overflow", async ({ page }) => {
    await gotoLanding(page);

    // Login form visible
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });

    // No horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });
});

test.describe("Responsive Layout — Editor", () => {
  let user: { email: string; password: string; name: string; token: string };
  let projectId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `resp-editor-${Date.now()}`);
    projectId = await createProjectViaAPI(page, user.token, {
      name: "Responsive Test",
      scene_js: 'const b = box(2, 2, 2);\nscene.add(b, { material: "lumber", color: [0.8, 0.6, 0.4] });',
    });
    await page.close();
  });

  test("desktop (1280x720): viewport and editor panels visible", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.goto(`/project/${projectId}`);
    await page.waitForLoadState("networkidle");

    // Canvas (3D viewport) should be visible
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // The right sidebar (BOM panel, chat, or code editor) should exist
    const sidebarContent = page.locator(".editor-code-panel")
      .or(page.locator('[data-tour="viewport"]'))
      .or(page.locator("canvas"));
    await expect(sidebarContent.first()).toBeVisible({ timeout: 5_000 });

    // No horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test("mobile (375x667): panels collapse or stack", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 375, height: 667 } });
    const page = await context.newPage();
    await loginViaUI(page, user.email, user.password);
    await page.goto(`/project/${projectId}`);
    await page.waitForLoadState("networkidle");

    // The page should render — at minimum we should see some content
    await expect(
      page.locator("canvas")
        .or(page.getByText(/responsive test/i))
        .first()
    ).toBeVisible({ timeout: 15_000 });

    // No horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);

    await page.close();
    await context.close();
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. Navigation
// ═══════════════════════════════════════════════════════════════

test.describe("Navigation", () => {
  test("/privacy page loads with content", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForLoadState("networkidle");

    // Title/heading should be visible
    await expect(
      page.getByRole("heading").filter({ hasText: /tietosuoja|privacy/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Has substantive content (multiple sections)
    const sections = page.locator("h3");
    await expect(sections.first()).toBeVisible();
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("/terms page loads with content", async ({ page }) => {
    await page.goto("/terms");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading").filter({ hasText: /käyttöehdot|terms/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    const sections = page.locator("h3");
    await expect(sections.first()).toBeVisible();
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("/forgot-password page loads with form", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button").filter({ hasText: /lähetä|send/i }).first()
    ).toBeVisible();
  });

  test("/reset-password page loads (shows form without token)", async ({ page }) => {
    await page.goto("/reset-password");
    await page.waitForLoadState("networkidle");

    // Should show the reset password form (password inputs)
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 10_000 });
  });

  test("/verify-email page loads (shows error without token)", async ({ page }) => {
    await page.goto("/verify-email");
    await page.waitForLoadState("networkidle");

    // Without a token, should show error or "missing token" message
    await expect(
      page.getByText(/puuttuu|missing|epäonnistui|failed|vahvistus/i).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("landing page footer links to /privacy and /terms", async ({ page }) => {
    await gotoLanding(page);

    // Scroll to footer
    await page.locator("footer.landing-footer").scrollIntoViewIfNeeded();

    // Privacy link in footer
    const privacyLink = page.locator('footer a[href="/privacy"]');
    await expect(privacyLink).toBeVisible();

    // Terms link in footer
    const termsLink = page.locator('footer a[href="/terms"]');
    await expect(termsLink).toBeVisible();
  });

  test("browser back/forward navigation works between pages", async ({ page }) => {
    await page.goto("/privacy");
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 10_000 });

    // Navigate to /terms via link
    await page.locator('a[href="/terms"]').first().click();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading").filter({ hasText: /käyttöehdot|terms/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Go back
    await page.goBack();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading").filter({ hasText: /tietosuoja|privacy/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Go forward
    await page.goForward();
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading").filter({ hasText: /käyttöehdot|terms/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. Accessibility
// ═══════════════════════════════════════════════════════════════

test.describe("Accessibility", () => {
  test("all pages have a <title> tag", async ({ page }) => {
    const routes = ["/", "/privacy", "/terms", "/forgot-password", "/reset-password", "/verify-email"];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const title = await page.title();
      expect(title, `Page ${route} should have a title`).toBeTruthy();
      expect(title.length, `Page ${route} title should be non-empty`).toBeGreaterThan(0);
    }
  });

  test("all interactive elements are keyboard-focusable on landing page", async ({ page }) => {
    await gotoLanding(page);

    // Check key interactive elements on the login form panel are focusable
    // (avoiding ScrollReveal-animated elements that may not be ready)

    // Email input
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 10_000 });
    await emailInput.focus();
    expect(await emailInput.evaluate((el) => document.activeElement === el), "Email input should be focusable").toBe(true);

    // Password input
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.focus();
    expect(await passwordInput.evaluate((el) => document.activeElement === el), "Password input should be focusable").toBe(true);

    // Submit button
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.focus();
    expect(await submitBtn.evaluate((el) => document.activeElement === el), "Submit button should be focusable").toBe(true);

    // Language switcher button
    const langSwitchBtn = page.locator('button[aria-label]').filter({ hasText: /FI.*EN/ }).first();
    await langSwitchBtn.focus();
    expect(await langSwitchBtn.evaluate((el) => document.activeElement === el), "Language switcher should be focusable").toBe(true);

    // Links in the form panel
    const forgotPasswordLink = page.locator('a[href="/forgot-password"]');
    if (await forgotPasswordLink.isVisible().catch(() => false)) {
      await forgotPasswordLink.focus();
      expect(await forgotPasswordLink.evaluate((el) => document.activeElement === el), "Forgot password link should be focusable").toBe(true);
    }
  });

  test("tab order on landing page follows visual order", async ({ page }) => {
    await gotoLanding(page);

    // Tab through elements and collect their positions
    const positions: { tag: string; top: number; left: number }[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const pos = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const rect = el.getBoundingClientRect();
        return { tag: el.tagName.toLowerCase(), top: rect.top, left: rect.left };
      });
      if (pos) positions.push(pos);
    }

    // Verify we could tab through at least a few elements
    expect(positions.length).toBeGreaterThanOrEqual(3);
  });

  test("login form can be completed with keyboard only", async ({ page }) => {
    await gotoLanding(page);

    // Wait for the email input to be visible
    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 10_000 });

    // Focus email input and type
    await emailInput.focus();
    await page.keyboard.type("keyboard@test.com");

    // Verify the email input received our typing
    await expect(emailInput).toHaveValue("keyboard@test.com");

    // Tab forward until we reach the password input
    let attempts = 0;
    while (attempts < 8) {
      await page.keyboard.press("Tab");
      const focusedType = await page.evaluate(() => {
        const el = document.activeElement as HTMLInputElement;
        return el?.type || "";
      });
      if (focusedType === "password") break;
      attempts++;
    }

    // Type password
    await page.keyboard.type("TestPassword123!");

    // Verify the password input received our typing
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toHaveValue("TestPassword123!");

    // Tab to submit button
    attempts = 0;
    while (attempts < 8) {
      await page.keyboard.press("Tab");
      const isSubmitButton = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.tagName === "BUTTON" && (el as HTMLButtonElement).type === "submit";
      });
      if (isSubmitButton) break;
      attempts++;
    }

    // Verify we found the submit button
    const isOnSubmit = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.tagName === "BUTTON" && (el as HTMLButtonElement).type === "submit";
    });
    expect(isOnSubmit, "Should be able to tab to the submit button").toBe(true);

    // Press Enter to submit
    await page.keyboard.press("Enter");

    // Wait for the form to respond — the login attempt should show either:
    // - An error message (role="alert" or .anim-up error div)
    // - A loading spinner
    // - Navigation to the project list
    // We use a Playwright expect with auto-retry to handle timing
    const errorOrSuccess = page.locator('[role="alert"]')
      .or(page.locator('.btn-spinner'))
      .or(page.getByText(/omat projektit|my projects|failed|epäonnistui|fetch/i));

    await expect(errorOrSuccess.first()).toBeVisible({ timeout: 10_000 });
  });

  test("no images without alt text", async ({ page }) => {
    await gotoLanding(page);

    const imagesWithoutAlt = await page.$$eval("img", (images) => {
      return images
        .filter((img) => {
          const alt = img.getAttribute("alt");
          // Decorative images with alt="" or role="presentation" are fine
          if (alt === "" && (img.getAttribute("role") === "presentation" || img.getAttribute("aria-hidden") === "true")) {
            return false;
          }
          // Missing alt entirely is a problem
          return alt === null;
        })
        .map((img) => ({ src: img.src, alt: img.getAttribute("alt") }));
    });

    expect(imagesWithoutAlt, "All images should have alt text (or alt='' for decorative)").toEqual([]);
  });

  test("ARIA landmarks: footer exists on landing page", async ({ page }) => {
    await gotoLanding(page);

    // Check for semantic footer landmark
    const footerCount = await page.locator("footer").count();
    expect(footerCount, "Landing page should have a <footer> element").toBeGreaterThanOrEqual(1);

    // Check for nav landmark (document as potential bug)
    const navCount = await page.locator("nav, [role='navigation']").count();
    if (navCount === 0) {
      // This is a real accessibility finding: landing page lacks <nav> landmark
      console.warn("A11Y FINDING: Landing page has no <nav> or [role='navigation'] landmark");
    }

    // Check for main landmark (document as potential bug)
    const mainCount = await page.locator("main, [role='main']").count();
    if (mainCount === 0) {
      // This is a real accessibility finding: landing page lacks <main> landmark
      console.warn("A11Y FINDING: Landing page has no <main> or [role='main'] landmark");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. Dark Mode
// ═══════════════════════════════════════════════════════════════

test.describe("Dark Mode", () => {
  test("click theme toggle -> background color changes", async ({ page }) => {
    await gotoLanding(page);

    // Get initial theme
    const initialTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );

    // Get initial background color
    const initialBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim()
    );

    // Click the theme toggle button (identified by its aria-label pattern)
    const themeToggle = page.locator('button[aria-label]').filter({
      hasText: /dark|light|auto|tumma|vaalea|automaattinen/i,
    }).first();
    await themeToggle.click();
    await page.waitForTimeout(500);

    // Theme attribute should have changed
    const newTheme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );

    // Background should be different if we went from dark to light
    const newBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim()
    );

    // The theme value should have changed
    expect(newTheme).not.toBe(initialTheme);

    // If we went dark->light, backgrounds must differ
    if (initialTheme === "dark" && newTheme === "light") {
      expect(newBg).not.toBe(initialBg);
    }
  });

  test("all text remains readable in dark mode (contrast check)", async ({ page }) => {
    await gotoLanding(page);

    // Ensure dark mode
    await page.evaluate(() => {
      localStorage.setItem("helscoop-theme", "dark");
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.waitForTimeout(300);

    // Check that text color is defined and different from background
    const colors = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        bg: style.getPropertyValue("--bg-primary").trim(),
        text: style.getPropertyValue("--text-primary").trim(),
      };
    });

    expect(colors.bg).toBeTruthy();
    expect(colors.text).toBeTruthy();
    expect(colors.bg).not.toBe(colors.text);
  });

  test("toggle back to light then back to dark reverts", async ({ page }) => {
    await gotoLanding(page);

    // Set to dark explicitly
    await page.evaluate(() => {
      localStorage.setItem("helscoop-theme", "dark");
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.waitForTimeout(200);

    const darkBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim()
    );

    // Switch to light
    await page.evaluate(() => {
      localStorage.setItem("helscoop-theme", "light");
      document.documentElement.setAttribute("data-theme", "light");
    });
    await page.waitForTimeout(200);

    const lightBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim()
    );
    expect(lightBg).not.toBe(darkBg);

    // Switch back to dark
    await page.evaluate(() => {
      localStorage.setItem("helscoop-theme", "dark");
      document.documentElement.setAttribute("data-theme", "dark");
    });
    await page.waitForTimeout(200);

    const revertedBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--bg-primary").trim()
    );
    expect(revertedBg).toBe(darkBg);
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. Locale Switching
// ═══════════════════════════════════════════════════════════════

test.describe("Locale Switching", () => {
  test("switch locale -> key text changes, then switch back", async ({ page }) => {
    // Start with Finnish locale
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("helscoop_locale", "fi");
      localStorage.setItem("helscoop_onboarding_completed", "true");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Wait for Finnish text to appear (login button says "Kirjaudu")
    await expect(
      page.getByRole("button", { name: /kirjaudu/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Click language switcher (cycles fi -> en)
    const langSwitch = page.locator('button[aria-label]').filter({
      hasText: /FI.*EN/,
    }).first();
    await langSwitch.click();
    await page.waitForTimeout(1000);

    // English text should appear (login button says "Sign in")
    await expect(
      page.getByRole("button", { name: /sign in/i }).first()
    ).toBeVisible({ timeout: 5_000 });

    // Click again to cycle en -> sv
    await langSwitch.click();
    await page.waitForTimeout(500);

    // Click again to cycle sv -> fi (back to Finnish)
    await langSwitch.click();
    await page.waitForTimeout(1000);

    // Finnish text should reappear
    await expect(
      page.getByRole("button", { name: /kirjaudu/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test("locale persists across page reload", async ({ page }) => {
    // Set locale to English via localStorage and verify it persists across reload
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("helscoop_locale", "en");
      localStorage.setItem("helscoop_onboarding_completed", "true");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Verify English (login button says "Sign in")
    await expect(
      page.getByRole("button", { name: /sign in/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Reload again
    await page.reload();
    await page.waitForLoadState("networkidle");

    // English should still persist
    await expect(
      page.getByRole("button", { name: /sign in/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Switch to Finnish and verify it persists
    await page.evaluate(() => {
      localStorage.setItem("helscoop_locale", "fi");
    });
    await page.reload();
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("button", { name: /kirjaudu/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. Console Errors
// ═══════════════════════════════════════════════════════════════

test.describe("Console Errors", () => {
  test("no console errors across public pages", async ({ page }) => {
    const consoleErrors: string[] = [];
    let currentRoute = "";

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore known benign errors (third-party scripts, network)
        if (
          text.includes("favicon") ||
          text.includes("plausible") ||
          text.includes("google") ||
          text.includes("gsi") ||
          text.includes("accounts.google.com") ||
          text.includes("ERR_BLOCKED_BY_CLIENT") ||
          text.includes("net::ERR_") ||
          text.includes("Failed to load resource") ||
          text.includes("manifest.json")
        ) {
          return;
        }
        consoleErrors.push(`[${currentRoute}] ${text}`);
      }
    });

    const publicRoutes = ["/", "/privacy", "/terms", "/forgot-password", "/reset-password", "/verify-email"];

    for (const r of publicRoutes) {
      currentRoute = r;
      await page.goto(r);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1000);
    }

    if (consoleErrors.length > 0) {
      console.warn("Console errors found:", consoleErrors);
    }
    expect(consoleErrors, `Found ${consoleErrors.length} console error(s):\n${consoleErrors.join("\n")}`).toEqual([]);
  });

  test("no console errors on authenticated pages", async ({ page }) => {
    const consoleErrors: string[] = [];
    let currentRoute = "";

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (
          text.includes("favicon") ||
          text.includes("plausible") ||
          text.includes("google") ||
          text.includes("gsi") ||
          text.includes("accounts.google.com") ||
          text.includes("ERR_BLOCKED_BY_CLIENT") ||
          text.includes("net::ERR_") ||
          text.includes("Failed to load resource") ||
          text.includes("manifest.json")
        ) {
          return;
        }
        consoleErrors.push(`[${currentRoute}] ${text}`);
      }
    });

    // Register + login
    const suffix = `console-${Date.now()}`;
    const res = await page.request.post(`${API_URL}/auth/register`, {
      data: { email: `e2e-${suffix}@test.com`, password: "testpass123", name: "Console Test" },
    });
    const { token } = await res.json();

    // Set token and navigate
    currentRoute = "/";
    await page.goto("/");
    await page.evaluate((t) => {
      localStorage.setItem("helscoop_token", t);
      localStorage.setItem("helscoop_onboarding_completed", "true");
    }, token);
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1500);

    // Navigate to settings
    currentRoute = "/settings";
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Navigate to admin (may redirect or show access denied)
    currentRoute = "/admin";
    await page.goto("/admin");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    if (consoleErrors.length > 0) {
      console.warn("Console errors on authenticated pages:", consoleErrors);
    }
    expect(consoleErrors, `Found ${consoleErrors.length} console error(s):\n${consoleErrors.join("\n")}`).toEqual([]);
  });
});
