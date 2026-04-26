import { expect, type Locator, type Page } from "@playwright/test";

const API_URL = process.env.TEST_API_URL || "http://localhost:3001";

export interface TestUser {
  email: string;
  password: string;
  name: string;
  token: string;
}

export async function registerUser(
  page: Page,
  suffix = Date.now().toString()
): Promise<TestUser> {
  const user = {
    email: `e2e-${suffix}@test.com`,
    password: "testpass123",
    name: "E2E Tester",
    token: "",
  };

  const res = await page.request.post(`${API_URL}/auth/register`, {
    data: { email: user.email, password: user.password, name: user.name },
  });
  const body = await res.json();
  user.token = body.token;
  return user;
}

export async function loginUser(
  page: Page,
  email: string,
  password: string
): Promise<string> {
  const res = await page.request.post(`${API_URL}/auth/login`, {
    data: { email, password },
  });
  const body = await res.json();
  return body.token;
}

export async function setAuthToken(page: Page, token: string): Promise<void> {
  const seedSession = (t: string) => {
    if (t) localStorage.setItem("helscoop_session_active", "true");
    localStorage.setItem("helscoop_onboarding_completed", "true");
  };
  await page.addInitScript(seedSession, token);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const isLoggedIn = await page
    .getByText(/omat projektit|my projects/i)
    .isVisible({ timeout: 5000 })
    .catch(() => false);

  if (!isLoggedIn) {
    const hasLoginForm = await page
      .locator('input[type="email"]')
      .isVisible({ timeout: 2000 })
      .catch(() => false);
    if (hasLoginForm) {
      await page.evaluate(seedSession, token);
      await page.goto("/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
    }
  }
}

export async function loginViaUI(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  const dismissOnboarding = () => {
    localStorage.setItem("helscoop_onboarding_completed", "true");
  };
  await page.addInitScript(dismissOnboarding);
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /kirjaudu|sign in/i }).click({ force: true });
  await expect(page.getByText(/omat projektit|my projects/i)).toBeVisible({ timeout: 15_000 });
}

export async function createProjectViaAPI(
  page: Page,
  token: string,
  data: { name: string; description?: string; scene_js?: string }
): Promise<string> {
  const res = await page.request.post(`${API_URL}/projects`, {
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
  const body = await res.json();
  return body.id;
}

export async function saveBomViaAPI(
  page: Page,
  token: string,
  projectId: string,
  items: { material_id: string; quantity: number; unit: string }[]
): Promise<void> {
  await page.request.put(`${API_URL}/projects/${projectId}/bom`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { items },
  });
}

export async function deleteProjectViaAPI(
  page: Page,
  token: string,
  projectId: string
): Promise<void> {
  await page.request.delete(`${API_URL}/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function apiUrl(path: string): string {
  return `${API_URL}${path}`;
}

export function mainViewportCanvas(page: Page): Locator {
  return page.locator('canvas[data-engine^="three.js"][aria-hidden="true"]');
}

export async function expectMainViewportVisible(page: Page, timeout = 30_000): Promise<void> {
  await expect(mainViewportCanvas(page)).toBeVisible({ timeout });
}

export function objectCountStatus(page: Page, pattern: RegExp = /[1-9]\d*\s*(objects|objektia)/i): Locator {
  return page.locator(".viewport-status, .editor-status-segment").filter({ hasText: pattern }).first();
}

export async function expectObjectCount(page: Page, count: number, timeout = 10_000): Promise<void> {
  await expect(objectCountStatus(page, new RegExp(`${count}\\s*(objects|objektia)`, "i"))).toBeVisible({ timeout });
}

export async function readObjectCount(page: Page, timeout = 10_000): Promise<number> {
  const status = objectCountStatus(page);
  await expect(status).toBeVisible({ timeout });
  const text = await status.textContent();
  return parseInt(text?.match(/(\d+)/)?.[1] || "0", 10);
}

export async function dismissOnboarding(page: Page): Promise<void> {
  const skipBtn = page.getByRole("button", { name: /ohita|skip/i }).first();
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(300);
  }
}
