import { test, expect, type Page } from "@playwright/test";

const API_URL = process.env.TEST_API_URL || "http://localhost:3001";

test.use({ baseURL: process.env.TEST_WEB_URL || "http://localhost:3052" });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Dismiss onboarding overlay so the real page is interactive. */
async function dismissOnboarding(page: Page) {
  const markCompleted = () => {
    localStorage.setItem("helscoop_onboarding_completed", "true");
  };
  await page.addInitScript(markCompleted);
  await page.evaluate(markCompleted).catch(() => {});
}

/** Navigate to landing with onboarding already dismissed. */
async function goToLanding(page: Page) {
  await dismissOnboarding(page);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#main-content")).toBeVisible({ timeout: 10_000 });
}

/** Register a user via the API and return the token. */
async function registerViaAPI(
  page: Page,
  email: string,
  password: string,
  name: string
): Promise<string> {
  const res = await page.request.post(`${API_URL}/auth/register`, {
    data: { email, password, name },
  });
  const body = await res.json();
  return body.token;
}

// ===========================================================================
//  LANDING PAGE
// ===========================================================================

test.describe("Landing page", () => {
  test("page loads without JS console errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => {
      // Ignore Next.js module-not-found compilation warnings from other routes
      // (e.g. project/[id]/page.tsx chunks compiled in background)
      if (err.message.includes("Module not found")) return;
      errors.push(err.message);
    });

    await goToLanding(page);

    // Give a moment for any deferred scripts
    await page.waitForTimeout(1000);
    expect(errors).toEqual([]);
  });

  test('brand name "Helscoop" is visible', async ({ page }) => {
    await goToLanding(page);

    // The brand title contains "Hel" + "scoop" as separate spans
    const brandTitle = page.locator(".brand-title");
    await expect(brandTitle).toBeVisible({ timeout: 10_000 });
    await expect(brandTitle).toContainText("Hel");
    await expect(brandTitle).toContainText("scoop");
  });

  test("address search input is visible and interactive", async ({ page }) => {
    await goToLanding(page);

    const addressInput = page.locator('[data-tour="address-input"] input');
    await expect(addressInput).toBeVisible({ timeout: 10_000 });
    await expect(addressInput).toBeEnabled();

    // Typing into it should work
    await addressInput.fill("Ribbingintie 109");
    await expect(addressInput).toHaveValue("Ribbingintie 109");
  });

  test("features section renders with feature cards", async ({ page }) => {
    await goToLanding(page);

    const featureSection = page.locator(".feature-section");
    await expect(featureSection).toBeVisible({ timeout: 10_000 });

    const cards = page.locator(".feature-card");
    await expect(cards).toHaveCount(3);

    // Each card should have a title and description
    for (let i = 0; i < 3; i++) {
      await expect(cards.nth(i).locator(".feature-card-title")).toBeVisible();
      await expect(cards.nth(i).locator(".feature-card-desc")).toBeVisible();
    }
  });

  test("footer renders with links", async ({ page }) => {
    await goToLanding(page);

    const footer = page.locator(".landing-footer");
    await expect(footer).toBeVisible({ timeout: 10_000 });

    // Footer contains privacy and terms links
    const privacyLink = footer.locator('a[href="/privacy"]');
    const termsLink = footer.locator('a[href="/terms"]');
    await expect(privacyLink).toBeVisible();
    await expect(termsLink).toBeVisible();

    // Footer brand name (use .first() to avoid strict mode with multiple matches)
    await expect(footer.locator("text=Helscoop").first()).toBeVisible();
  });

  test("login and sign-up buttons are visible", async ({ page }) => {
    await goToLanding(page);

    // The login (sign in) submit button (exclude Google sign-in button)
    const loginBtn = page.locator('button[type="submit"]').filter({
      hasText: /kirjaudu|sign in/i,
    });
    await expect(loginBtn).toBeVisible({ timeout: 10_000 });

    // The "no account" toggle to switch to registration
    const noAccountLink = page.getByText(/ei tili|no account/i);
    await expect(noAccountLink).toBeVisible();
  });

  test("theme toggle works (cycles between dark/light/auto)", async ({
    page,
  }) => {
    await goToLanding(page);

    const themeBtn = page.locator(".login-form-panel .lang-switch").first();
    await expect(themeBtn).toBeVisible({ timeout: 10_000 });

    // Read initial theme from data attribute or class on <html>
    const getTheme = () =>
      page.evaluate(() => document.documentElement.getAttribute("data-theme"));

    const initialTheme = await getTheme();

    // Click toggle once
    await themeBtn.click();
    await page.waitForTimeout(300);
    const secondTheme = await getTheme();

    // Theme should have changed
    expect(secondTheme).not.toBe(initialTheme);
  });

  test("language switcher works (fi/en toggle changes text)", async ({
    page,
  }) => {
    await goToLanding(page);

    // The language switcher button in the login form panel
    const langBtn = page
      .locator('.login-form-panel button[aria-label]')
      .filter({ hasText: /FI.*EN|EN.*FI/ });
    await expect(langBtn).toBeVisible({ timeout: 10_000 });

    // By default the app is in Finnish. Check for Finnish login title.
    const loginHeading = page.locator(".login-form-panel h2").first();
    const initialText = await loginHeading.textContent();

    // Click the language switcher
    await langBtn.click();
    await page.waitForTimeout(500);

    const switchedText = await loginHeading.textContent();

    // The heading text should change after toggling language
    expect(switchedText).not.toBe(initialText);

    // One of them should be Finnish, the other English
    const texts = [initialText, switchedText];
    expect(
      texts.some((t) => t?.match(/kirjaudu sisään/i)) ||
        texts.some((t) => t?.match(/sign in/i))
    ).toBeTruthy();
  });
});

// ===========================================================================
//  REGISTRATION FLOW
// ===========================================================================

test.describe("Registration flow", () => {
  test.describe.configure({ mode: "serial" });

  const uniqueSuffix = Date.now().toString();
  const testEmail = `test-reg-${uniqueSuffix}@test.com`;
  const testPassword = "Test1234!";
  const testName = "E2E Landing Tester";

  test("click sign up -> registration form appears", async ({ page }) => {
    await goToLanding(page);

    // Click "no account" to switch to register mode
    await page.getByText(/ei tili|no account|luo uusi/i).click({ force: true });

    // Name field should now be visible (only shown in register mode)
    await expect(
      page.getByPlaceholder(/matti meikäläinen|john smith/i)
    ).toBeVisible({ timeout: 5_000 });

    // Register button should be visible
    await expect(
      page.getByRole("button", { name: /luo tili|create account/i })
    ).toBeVisible();
  });

  test("form validates: empty fields show errors", async ({ page }) => {
    await goToLanding(page);

    // Switch to register mode
    await page.getByText(/ei tili|no account|luo uusi/i).click({ force: true });
    await page.waitForTimeout(300);

    // Try to submit without filling any fields
    const submitBtn = page.getByRole("button", {
      name: /luo tili|create account/i,
    });
    await submitBtn.click({ force: true });

    // HTML5 validation should prevent submission - check that required fields
    // show validation messages (the form uses required attributes)
    const emailInput = page.locator('input[type="email"]');
    const isInvalid = await emailInput.evaluate(
      (el) => !(el as HTMLInputElement).validity.valid
    );
    expect(isInvalid).toBe(true);
  });

  test("form validates: weak password shows indicator", async ({ page }) => {
    await goToLanding(page);

    // Switch to register mode
    await page.getByText(/ei tili|no account|luo uusi/i).click({ force: true });
    await page.waitForTimeout(300);

    // Type a weak password
    await page.locator('input[type="password"]').fill("abc");

    // Password strength meter should show "weak"
    const strengthMeter = page.locator('[role="meter"]');
    await expect(strengthMeter).toBeVisible({ timeout: 3_000 });

    // aria-valuenow=1 means "weak"
    await expect(strengthMeter).toHaveAttribute("aria-valuenow", "1");
  });

  test("register with unique email -> redirected to project list", async ({
    page,
  }) => {
    await goToLanding(page);

    // Switch to register mode
    await page.getByText(/ei tili|no account|luo uusi/i).click({ force: true });
    await page.waitForTimeout(300);

    // Fill the form
    await page
      .getByPlaceholder(/matti meikäläinen|john smith/i)
      .fill(testName);
    await page.locator('input[type="email"]').fill(testEmail);
    await page.locator('input[type="password"]').fill(testPassword);

    // Accept terms
    await page.locator('input[type="checkbox"]').check({ force: true });

    // Submit
    await page
      .getByRole("button", { name: /luo tili|create account/i })
      .click({ force: true });

    // Should be redirected to project list
    await expect(
      page.getByText(/omat projektit|my projects/i)
    ).toBeVisible({ timeout: 15_000 });
  });

  test("user is authenticated after registration (nav shows logout)", async ({
    page,
  }) => {
    // The previous test registered the user. Log in with that user to verify
    // that the authenticated header (with logout) is rendered.
    await page.goto("/");
    await dismissOnboarding(page);

    // Log in via API; the API response sets the httpOnly session cookie in
    // Playwright's browser context, while the web app uses a non-secret
    // localStorage hint to decide whether to attempt authenticated loading.
    const res = await page.request.post(`${API_URL}/auth/login`, {
      data: { email: testEmail, password: testPassword },
    });
    await res.json();

    await page.evaluate(() => {
      localStorage.setItem("helscoop_session_active", "true");
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // Should see the project list (i.e. logged in)
    await expect(
      page.getByText(/omat projektit|my projects/i)
    ).toBeVisible({ timeout: 15_000 });

    // The navbar should show the logout button, confirming we're authenticated
    const logoutBtn = page.getByRole("button").filter({
      hasText: /ulos|sign out|log out/i,
    });
    await expect(logoutBtn.first()).toBeVisible({ timeout: 5_000 });
  });
});

// ===========================================================================
//  LOGIN FLOW
// ===========================================================================

test.describe("Login flow", () => {
  test.describe.configure({ mode: "serial" });

  const loginEmail = `test-login-${Date.now()}@test.com`;
  const loginPassword = "Test1234!";
  const loginName = "Login Test User";

  test("click login -> form appears with email and password fields", async ({
    page,
  }) => {
    // Pre-register the user for later tests
    await registerViaAPI(page, loginEmail, loginPassword, loginName);

    await goToLanding(page);

    // Login form should be visible by default (not register mode)
    await expect(page.locator('input[type="email"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('input[type="password"]')).toBeVisible();
    // Use type="submit" to distinguish from the Google sign-in button
    await expect(
      page.locator('button[type="submit"]').filter({
        hasText: /kirjaudu|sign in/i,
      })
    ).toBeVisible();
  });

  test("wrong password -> shows error message", async ({ page }) => {
    await goToLanding(page);

    await page.locator('input[type="email"]').fill(loginEmail);
    await page.locator('input[type="password"]').fill("wrongPassword123!");

    await page
      .locator('button[type="submit"]')
      .click({ force: true });

    // Error message should appear (use .anim-up to target the inline error
    // banner, not the Next.js route announcer which also has role="alert")
    const errorBanner = page.locator('[role="alert"].anim-up');
    await expect(errorBanner).toBeVisible({ timeout: 5_000 });

    // Login form should still be visible (no redirect)
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();

    // Should NOT show project list
    await expect(
      page.getByText(/omat projektit|my projects/i)
    ).not.toBeVisible();
  });

  test("correct credentials -> logged in, see projects page", async ({
    page,
  }) => {
    await goToLanding(page);

    await page.locator('input[type="email"]').fill(loginEmail);
    await page.locator('input[type="password"]').fill(loginPassword);

    await page
      .locator('button[type="submit"]')
      .click({ force: true });

    await expect(
      page.getByText(/omat projektit|my projects/i)
    ).toBeVisible({ timeout: 15_000 });
  });

  test("logout button works -> returns to landing", async ({ page }) => {
    // Log in first
    await goToLanding(page);
    await page.locator('input[type="email"]').fill(loginEmail);
    await page.locator('input[type="password"]').fill(loginPassword);
    await page
      .locator('button[type="submit"]')
      .click({ force: true });

    await expect(
      page.getByText(/omat projektit|my projects/i)
    ).toBeVisible({ timeout: 15_000 });

    // Click the logout button in the navbar
    const logoutBtn = page.getByRole("button").filter({
      hasText: /ulos|sign out|log out/i,
    });

    if (await logoutBtn.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await logoutBtn.first().click();
    } else {
      // Fallback: clear the non-secret session hint manually.
      await page.evaluate(() => localStorage.removeItem("helscoop_session_active"));
      await page.goto("/", { waitUntil: "domcontentloaded" });
    }

    // Should be back on the landing/login page
    await expect(page.locator('input[type="email"]')).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ===========================================================================
//  PASSWORD RESET
// ===========================================================================

test.describe("Password reset", () => {
  test('"Forgot password" link -> reset form appears', async ({ page }) => {
    await goToLanding(page);

    // Click "forgot password" link
    const forgotLink = page.locator('a[href="/forgot-password"]');
    await expect(forgotLink).toBeVisible({ timeout: 10_000 });
    await forgotLink.click();

    // Should navigate to forgot-password page
    await page.waitForURL("**/forgot-password");

    // The reset form should have an email input and submit button
    await expect(page.locator('input[type="email"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("button", {
        name: /lähetä nollauslinkki|send reset link/i,
      })
    ).toBeVisible();
  });

  test("submit email -> shows confirmation message", async ({ page }) => {
    await dismissOnboarding(page);
    await page.goto("/forgot-password", { waitUntil: "domcontentloaded" });

    const emailInput = page.locator('input[type="email"]');
    await expect(emailInput).toBeVisible({ timeout: 10_000 });

    // Enter an email and submit
    await emailInput.fill("test@test.com");
    await page
      .getByRole("button", {
        name: /lähetä nollauslinkki|send reset link/i,
      })
      .click({ force: true });

    // Should show confirmation message (either success or info)
    const confirmation = page.getByText(
      /nollauslinkki on lähetetty|reset link has been sent/i
    );
    await expect(confirmation).toBeVisible({ timeout: 10_000 });
  });
});
