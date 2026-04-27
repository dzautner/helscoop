import { test, expect } from "@playwright/test";
import { registerUser, loginViaUI, createProjectViaAPI, expectObjectCount, openProjectEditor } from "./helpers";

test.describe("AI Chat — message, response, and apply flow", () => {
  let user: { email: string; password: string; name: string; token: string };
  let projectId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `ai-chat-${Date.now()}`);
    projectId = await createProjectViaAPI(page, user.token, {
      name: "AI Chat Test",
      scene_js: 'scene.add(box(4,3,0.2), {material:"lumber"});',
    });
    await page.close();
  });

  test("send message, receive response with code, apply to scene", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await openProjectEditor(page, projectId);
    await expectObjectCount(page, 1);

    // 1. Verify chat input is visible
    const chatInput = page.locator(".chat-input, textarea[aria-label]").last();
    await expect(chatInput).toBeVisible({ timeout: 10_000 });

    // 2. Type and send a message (use "roof" keyword to hit local fallback)
    await chatInput.fill("Add a pitched roof to the building");
    const sendBtn = page.locator('.chat-send-btn, button[aria-label*="lähetä" i], button[aria-label*="send" i]').last();
    await sendBtn.click();

    // 3. Verify user message appears in chat
    await expect(page.getByText("Add a pitched roof to the building")).toBeVisible({ timeout: 5_000 });

    // 4. Verify AI response with code and apply it.
    const aiResponse = page.locator(".chat-msg-ai .chat-msg-content").last();
    await expect(aiResponse).toBeVisible({ timeout: 30_000 });
    await expect(aiResponse).toContainText(/roof|katto|scene\.add/i, { timeout: 30_000 });

    const applyBtn = page.locator(".chat-apply-btn").first();
    await expect(applyBtn).toBeVisible({ timeout: 10_000 });
    await applyBtn.click();

    const confirmDialog = page.locator('[role="dialog"]');
    if (await confirmDialog.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmDialog.getByRole("button", { name: /apply|aseta|käytä|tillämpa/i }).click();
    }

    await expectObjectCount(page, 3, 20_000);
    await page.screenshot({ path: "test-results/ai-chat-response.png" });
  });

  test("suggestion chips populate chat input", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await openProjectEditor(page, projectId);

    // Find suggestion chips
    const chips = page.locator(".chat-suggestion-chip");
    await expect(chips.first()).toBeVisible({ timeout: 10_000 });

    const chipText = await chips.first().textContent();
    expect(chipText).toBeTruthy();

    // Click the chip
    await chips.first().click();

    // Verify input is populated
    const chatInput = page.locator(".chat-input, textarea[aria-label]").last();
    const inputValue = await chatInput.inputValue();
    expect(inputValue).toBe(chipText);

    // Input should be focused
    await expect(chatInput).toBeFocused();

    await page.screenshot({ path: "test-results/ai-chat-chips.png" });
  });

  test("chat error shows error message", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await openProjectEditor(page, projectId);

    // Intercept the chat API to simulate failure
    await page.route("**/chat", (route) => {
      route.fulfill({ status: 500, body: JSON.stringify({ error: "Internal error" }) });
    });

    const chatInput = page.locator(".chat-input, textarea[aria-label]").last();
    await chatInput.fill("This should fail");
    const sendBtn = page.locator('.chat-send-btn, button[aria-label*="lähetä" i], button[aria-label*="send" i]').last();
    await sendBtn.click();

    // Check for error toast or error message in chat
    const errorIndicator = page.locator('[role="alert"], .chat-msg-ai .chat-msg-content, [class*="toast"]').last();
    await expect(errorIndicator).toBeVisible({ timeout: 10_000 });
    await expect(errorIndicator).toContainText(/wrong|error|virhe|pieleen|failed/i);

    await page.screenshot({ path: "test-results/ai-chat-error.png" });
  });

  test("chat message history persists across page navigation", async ({ page }) => {
    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    await openProjectEditor(page, projectId);

    // Send a message
    const chatInput = page.locator(".chat-input, textarea[aria-label]").last();
    await chatInput.fill("Add a window to the wall");
    const sendBtn = page.locator('.chat-send-btn, button[aria-label*="lähetä" i], button[aria-label*="send" i]').last();
    await sendBtn.click();
    await expect(page.getByText("Add a window to the wall")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator(".chat-msg-ai .chat-msg-content").last()).toBeVisible({ timeout: 30_000 });

    // Navigate away and back
    await page.goto("/");
    await openProjectEditor(page, projectId);

    // Verify previous messages are still visible
    await expect(page.getByText("Add a window to the wall")).toBeVisible({ timeout: 10_000 });

    await page.screenshot({ path: "test-results/ai-chat-persistence.png" });
  });
});
