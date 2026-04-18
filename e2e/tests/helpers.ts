import { type Page } from "@playwright/test";

const API_URL = "http://localhost:3051";

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

export async function setAuthToken(page: Page, token: string): Promise<void> {
  await page.goto("/");
  await page.evaluate((t) => {
    localStorage.setItem("helscoop_token", t);
    localStorage.setItem("helscoop_onboarding_completed", "true");
  }, token);
}

export async function dismissOnboarding(page: Page): Promise<void> {
  const skipBtn = page.getByText(/ohita|skip/i).first();
  if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await skipBtn.click();
    await page.waitForTimeout(300);
  }
}
