import { test, expect, type Page } from "@playwright/test";
import {
  loginUser,
  setAuthToken,
  createProjectViaAPI,
  deleteProjectViaAPI,
  saveBomViaAPI,
  apiUrl,
} from "./helpers";

/**
 * BOM Panel interaction tests.
 *
 * These tests exercise the Bill of Materials panel within the project editor,
 * covering: visibility / toggling, empty state, catalog browsing, adding /
 * editing / removing materials, cost calculations, and export buttons.
 */

const TEST_EMAIL = "test@test.com";
const TEST_PASSWORD = "Test1234!";

/* ── Shared helpers ──────────────────────────────────────────── */

async function loginAndNavigateToProject(
  page: Page,
  projectId: string,
): Promise<void> {
  const token = await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
  await setAuthToken(page, token);
  await page.goto(`/project/${projectId}`);
  await page.waitForLoadState("networkidle");
  // Wait for the editor layout to be ready (canvas or BOM panel)
  await page
    .locator(".editor-bom-panel, canvas")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
  // Extra settle time for React hydration and material fetches
  await page.waitForTimeout(1500);
}

/** Ensure the BOM panel is visible — toggle it on if needed. */
async function ensureBomPanelVisible(page: Page): Promise<void> {
  const bomPanel = page.locator(".editor-bom-panel");
  const visible = await bomPanel.isVisible({ timeout: 3_000 }).catch(() => false);
  if (!visible) {
    // Toggle with Cmd+B / Ctrl+B
    await page.keyboard.press("Meta+b");
    await page.waitForTimeout(400);
  }
  await expect(bomPanel).toBeVisible({ timeout: 5_000 });
}

/** Click a material browse card in the catalog to select it, then confirm add. */
async function addMaterialFromCatalog(
  page: Page,
  materialName: RegExp | string,
  quantity = 1,
): Promise<void> {
  // Scroll to material browser section (bottom of BOM panel)
  const browseSectionLabel = page.getByText(
    /selaa materiaaleja|browse materials/i,
  );
  if (await browseSectionLabel.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await browseSectionLabel.scrollIntoViewIfNeeded();
  }

  // Click the material card — first click selects it and shows the quick-add row
  const materialCard = page
    .locator(".material-browse-card")
    .filter({
      hasText: materialName instanceof RegExp ? materialName : new RegExp(materialName, "i"),
    })
    .first();
  await materialCard.scrollIntoViewIfNeeded();
  await materialCard.click();

  // Set quantity if non-default
  if (quantity !== 1) {
    const qtyInput = materialCard.locator('input[type="number"]');
    await qtyInput.fill(String(quantity));
  }

  // Confirm the add (click the "Lisää" / "Add" button in the quick-add row)
  const addBtn = materialCard.locator("button", {
    hasText: /lisää|add/i,
  });
  await addBtn.click();
  await page.waitForTimeout(300);
}

/* ================================================================
 * Test Suite
 * ================================================================ */

test.describe("BOM Panel Interactions", () => {
  test.describe.configure({ mode: "serial" });

  let token: string;
  let projectId: string;

  // Scene with a few material declarations so the BOM panel recognises them
  const SCENE_JS = `
const f = box(6, 0.2, 4);
scene.add(f, { material: "foundation", color: [0.7, 0.7, 0.7] });
const w1 = translate(box(6, 2.8, 0.15), 0, 1.5, -1.925);
scene.add(w1, { material: "lumber", color: [0.85, 0.75, 0.55] });
`;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    token = await loginUser(page, TEST_EMAIL, TEST_PASSWORD);
    projectId = await createProjectViaAPI(page, token, {
      name: "BOM Interactions E2E",
      scene_js: SCENE_JS,
    });
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await deleteProjectViaAPI(page, token, projectId).catch(() => {});
    await page.close();
  });

  /* ──────────────────────────────────────────────────────────────
   * BOM panel basics (tests 1-3)
   * ────────────────────────────────────────────────────────────── */

  test("1 — BOM panel is visible on project page", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    // Should contain the header text "Materiaalilista" / "Material list"
    await expect(
      page.getByText(/materiaalilista|material list/i).first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("2 — BOM is initially empty", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    // Empty-state text
    await expect(
      page.getByText(/ei materiaaleja|no materials/i).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Total should be 0
    const totalEl = page.locator(".editor-bom-panel").getByText(/arvioitu|estimated/i).first();
    await expect(totalEl).toBeVisible({ timeout: 5_000 });
    // The animated total should read "0"
    const totalContainer = page.locator(".editor-bom-panel").locator("span").filter({ hasText: /^0$/ }).first();
    await expect(totalContainer).toBeVisible({ timeout: 5_000 });
  });

  test("3 — material catalog browser is accessible", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    // "SELAA MATERIAALEJA" / "BROWSE MATERIALS" label (use label-mono class to disambiguate)
    await expect(
      page.locator(".label-mono").filter({ hasText: /selaa materiaaleja|browse materials/i }),
    ).toBeVisible({ timeout: 5_000 });

    // Material browse cards should be visible
    const materialCards = page.locator(".material-browse-card");
    await expect(materialCards.first()).toBeVisible({ timeout: 5_000 });

    // Should have multiple materials
    const count = await materialCards.count();
    expect(count).toBeGreaterThan(3);
  });

  /* ──────────────────────────────────────────────────────────────
   * Adding materials (tests 4-7)
   * ────────────────────────────────────────────────────────────── */

  test("4 — clicking a catalog material shows quick-add row", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    // Click first material card
    const firstCard = page.locator(".material-browse-card").first();
    await firstCard.scrollIntoViewIfNeeded();
    await firstCard.click();

    // Quick-add row should appear (quantity input + add button)
    const qtyInput = firstCard.locator('input[type="number"]');
    await expect(qtyInput).toBeVisible({ timeout: 3_000 });

    const addBtn = firstCard.locator("button", { hasText: /lisää|add/i });
    await expect(addBtn).toBeVisible({ timeout: 3_000 });
  });

  test("5 — adding a material makes it appear in the BOM list", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    // Add pine lumber (48x148)
    await addMaterialFromCatalog(page, /48x148/);

    // A bom-item-card should now be present
    const bomItems = page.locator(".bom-item-card");
    await expect(bomItems.first()).toBeVisible({ timeout: 5_000 });

    // The material name should appear in the BOM
    await expect(
      page.locator(".bom-item-card").filter({ hasText: /48x148/i }).first(),
    ).toBeVisible();
  });

  test("6 — BOM item shows name, quantity input, unit, and price", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    // Add a material if BOM is empty
    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/);
    }

    const firstBomItem = page.locator(".bom-item-card").first();

    // Name
    const nameEl = firstBomItem.locator(".bom-item-name");
    await expect(nameEl).toBeVisible();
    const nameText = await nameEl.textContent();
    expect(nameText).toBeTruthy();

    // Quantity input
    const qtyInput = firstBomItem.locator(".bom-item-qty-input");
    await expect(qtyInput).toBeVisible();

    // Unit and price (e.g. "m x 4.50")
    const unitEl = firstBomItem.locator(".bom-item-unit");
    await expect(unitEl).toBeVisible();

    // Total
    const totalEl = firstBomItem.locator(".bom-item-total");
    await expect(totalEl).toBeVisible();
  });

  test("7 — adding multiple materials → all appear in BOM", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    // Add two materials
    await addMaterialFromCatalog(page, /48x148/);
    await addMaterialFromCatalog(page, /48x98/);

    const bomItems = page.locator(".bom-item-card");
    const count = await bomItems.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  /* ──────────────────────────────────────────────────────────────
   * Editing quantities (tests 8-10)
   * ────────────────────────────────────────────────────────────── */

  test("8 — changing quantity updates the item total", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    // Ensure at least one material is present
    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 1);
    }

    const firstBomItem = page.locator(".bom-item-card").first();
    const qtyInput = firstBomItem.locator(".bom-item-qty-input");
    const totalEl = firstBomItem.locator(".bom-item-total");

    // Get initial total
    const initialTotal = await totalEl.textContent();

    // Change quantity to 10
    await qtyInput.click();
    await qtyInput.fill("10");
    await qtyInput.blur();
    await page.waitForTimeout(500);

    // Total should have changed
    const newTotal = await totalEl.textContent();
    expect(newTotal).not.toBe(initialTotal);
    // Total for qty=10 should be > 0
    const totalNum = parseFloat(newTotal?.replace(",", ".") || "0");
    expect(totalNum).toBeGreaterThan(0);
  });

  test("9 — quantity input has min constraint (no negative numbers)", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 1);
    }

    const firstBomItem = page.locator(".bom-item-card").first();
    const qtyInput = firstBomItem.locator(".bom-item-qty-input");

    // Check the min attribute — the input has min={0.01}
    const minAttr = await qtyInput.getAttribute("min");
    expect(parseFloat(minAttr || "0")).toBeGreaterThan(0);

    // Verify the input type is "number" (prevents arbitrary text entry natively)
    const inputType = await qtyInput.getAttribute("type");
    expect(inputType).toBe("number");
  });

  test("10 — quantity input is a number input (rejects non-numeric)", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 1);
    }

    const firstBomItem = page.locator(".bom-item-card").first();
    const qtyInput = firstBomItem.locator(".bom-item-qty-input");

    // Verify the input type is "number" — this natively rejects non-numeric text.
    // Playwright's fill() correctly refuses to put "abc" into a number input,
    // which confirms the input type is enforced. We verify the attribute directly.
    const inputType = await qtyInput.getAttribute("type");
    expect(inputType).toBe("number");

    // Also verify that typing letters via keyboard doesn't change the value
    const valueBefore = await qtyInput.inputValue();
    await qtyInput.click();
    await page.keyboard.type("abc");
    const valueAfter = await qtyInput.inputValue();
    // Number inputs ignore letter keys — value should be unchanged
    expect(valueAfter).toBe(valueBefore);
  });

  /* ──────────────────────────────────────────────────────────────
   * Material details (tests 11-13)
   * ────────────────────────────────────────────────────────────── */

  test("11 — clicking a BOM item opens price comparison details", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 5);
    }

    // Click the BOM item card (triggers onCompare → price comparison popup)
    const firstBomItem = page.locator(".bom-item-card").first();
    await firstBomItem.click();
    await page.waitForTimeout(1000);

    // The price comparison popup or detail view should appear
    // It renders supplier names, price data
    const popup = page.locator("[role='dialog'], .price-compare-popup, .bom-price-compare").first();
    const popupVisible = await popup.isVisible({ timeout: 5_000 }).catch(() => false);

    // Also acceptable: a text element mentioning the supplier or "Hintavertailu" / "Price comparison"
    const detailText = page.getByText(/hintavertailu|price comparison|toimittaja|supplier/i).first();
    const detailVisible = await detailText.isVisible({ timeout: 3_000 }).catch(() => false);

    expect(popupVisible || detailVisible).toBe(true);
  });

  test("12 — stock status badge is visible on BOM items", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 1);
    }

    // Each BOM item has a stock status dot (8x8 circle) with a title/aria-label
    // containing stock status text (Saatavilla/In stock/Loppu etc.)
    const firstBomItem = page.locator(".bom-item-card").first();
    const stockDot = firstBomItem.locator("[title]").filter({
      hasText: /./,
    });
    // Actually the stock dot has no inner text — look for elements with
    // title matching stock terms, or aria-label on the dot
    const stockIndicator = firstBomItem.locator(
      "[aria-label*='aatav'], [aria-label*='stock'], [aria-label*='Loppu'], [aria-label*='tuntematon'], [aria-label*='unknown']",
    ).first();
    const stockVisible = await stockIndicator
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    // Alternative: check title attribute on any element in the card
    if (!stockVisible) {
      const cardHtml = await firstBomItem.innerHTML();
      // There should be a stock-colored circle (8x8 borderRadius 50%)
      expect(cardHtml).toMatch(/border-radius.*50%|borderRadius.*50/);
    }
  });

  test("13 — supplier info is shown on BOM items", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 1);
    }

    // Supplier name appears in .bom-item-supplier
    const supplier = page.locator(".bom-item-supplier").first();
    const supplierVisible = await supplier.isVisible({ timeout: 3_000 }).catch(() => false);

    if (supplierVisible) {
      const supplierText = await supplier.textContent();
      expect(supplierText).toBeTruthy();
    } else {
      // Some materials may not have supplier data — check if the unit line
      // contains a price, which indirectly confirms pricing/supplier data exists
      const unitEl = page.locator(".bom-item-unit").first();
      const unitText = await unitEl.textContent();
      // Should contain "x" and a number (unit price)
      expect(unitText).toMatch(/x\s*\d/);
    }
  });

  /* ──────────────────────────────────────────────────────────────
   * Cost calculations (tests 14-16)
   * ────────────────────────────────────────────────────────────── */

  test("14 — quote summary shows materials, labour, waste, VAT, and grand total", async ({
    page,
  }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    // Ensure materials in BOM
    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 5);
    }

    // The QuoteSummary renders when bom.length > 0
    // It may be below the fold — scroll the BOM panel to find it
    // Label is "KUSTANNUSARVIO" (fi) or "QUOTE SUMMARY" (en)
    const quoteSection = page.getByText(/kustannusarvio|quote summary/i);
    await quoteSection.scrollIntoViewIfNeeded({ timeout: 8_000 });
    await expect(quoteSection).toBeVisible({ timeout: 5_000 });

    // Materials line (within the BOM panel to avoid matching other page elements)
    const bomPanel = page.locator(".editor-bom-panel");
    await expect(bomPanel.getByText(/materiaalit|^materials$/i).first()).toBeVisible();

    // Labour line
    await expect(bomPanel.getByText(/työ|labour/i).first()).toBeVisible();

    // Wastage line
    await expect(bomPanel.getByText(/hukka|wastage/i).first()).toBeVisible();

    // VAT line
    await expect(bomPanel.getByText(/alv|vat/i).first()).toBeVisible();

    // Grand total
    await expect(
      bomPanel.getByText(/kokonaishinta|grand total/i).first(),
    ).toBeVisible();
  });

  test("15 — changing quantity updates the estimated total in real-time", async ({
    page,
  }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 1);
    }

    // Read the main total display in the header (the big number)
    const totalDisplayContainer = page
      .locator(".editor-bom-panel")
      .getByText(/arvioitu|estimated/i)
      .locator("..");
    // Parent of the label should contain the total number
    const getDisplayedTotal = async (): Promise<string> => {
      // The large total number is a span with fontSize 24 / fontWeight 600
      // It sits right above the "€" symbol
      const totalSpan = page.locator(
        ".editor-bom-panel span[style*='font-size: 24'], .editor-bom-panel span[style*='fontSize: 24']",
      ).first();
      const v = await totalSpan.isVisible({ timeout: 2_000 }).catch(() => false);
      if (v) return (await totalSpan.textContent()) || "0";
      // Fallback: get any visible big number
      return "0";
    };

    const totalBefore = await getDisplayedTotal();

    // Change quantity of first BOM item to a large number
    const qtyInput = page.locator(".bom-item-card").first().locator(".bom-item-qty-input");
    await qtyInput.click();
    await qtyInput.fill("50");
    await qtyInput.blur();
    await page.waitForTimeout(800);

    const totalAfter = await getDisplayedTotal();

    // The total should have changed (increased) when we set a larger quantity
    expect(totalAfter).not.toBe(totalBefore);
  });

  test("16 — cost breakdown chart is visible when items exist", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 5);
    }

    // Cost breakdown section shows "Kustannuserittely" / "Cost breakdown" heading
    const breakdownLabel = page.getByText(
      /kustannuserittely|cost breakdown/i,
    );
    await expect(breakdownLabel).toBeVisible({ timeout: 5_000 });

    // Donut chart should be rendered (SVG or div with conic-gradient)
    const donutChart = page.locator("[role='img']").first();
    await expect(donutChart).toBeVisible({ timeout: 3_000 });
  });

  /* ──────────────────────────────────────────────────────────────
   * Export (tests 17-18)
   * ────────────────────────────────────────────────────────────── */

  test("17 — Export CSV button in BOM panel exists and is clickable", async ({
    page,
  }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 1);
    }

    // The BOM panel has its own CSV export button (aria-label matches bom.exportCsv)
    const csvBtn = page.locator(
      ".editor-bom-panel button",
    ).filter({ hasText: /csv/i }).first();
    await expect(csvBtn).toBeVisible({ timeout: 5_000 });
    await expect(csvBtn).toBeEnabled();

    // Intercept the download to prevent actual file dialog
    const downloadPromise = page.waitForEvent("download", { timeout: 5_000 }).catch(() => null);
    await csvBtn.click();
    const download = await downloadPromise;
    // If a download was triggered, verify filename pattern
    if (download) {
      expect(download.suggestedFilename()).toMatch(/helscoop-bom.*\.csv$/i);
    }
  });

  test("18 — Export dropdown in toolbar has PDF option", async ({ page }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 1);
    }

    // Dismiss any open popups/panels by pressing Escape first
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    // Click the export button in the toolbar header (data-tour="export-btn")
    // Use aria-label to find the exact button
    const exportBtn = page.locator("button[aria-label*='Export'], button[aria-label*='export']").first();
    await expect(exportBtn).toBeVisible({ timeout: 5_000 });
    // Use dispatchEvent to bypass any overlapping elements
    await exportBtn.dispatchEvent("click");
    await page.waitForTimeout(500);

    // The dropdown should show a PDF option
    const pdfOption = page.locator("button").filter({ hasText: /^PDF$/i }).first();
    const pdfVisible = await pdfOption.isVisible({ timeout: 3_000 }).catch(() => false);

    if (pdfVisible) {
      await expect(pdfOption).toBeEnabled();
    } else {
      // Fallback: try finding the dropdown by looking for a menu with export options
      const anyPdfText = page.getByText(/pdf/i).first();
      await expect(anyPdfText).toBeVisible({ timeout: 3_000 });
    }
  });

  /* ──────────────────────────────────────────────────────────────
   * Remove materials (tests 19-20)
   * ────────────────────────────────────────────────────────────── */

  test("19 — deleting a material from BOM removes it and updates total", async ({
    page,
  }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    // Ensure we have at least one material
    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 5);
    }

    const countBefore = await page.locator(".bom-item-card").count();
    expect(countBefore).toBeGreaterThanOrEqual(1);

    // Click the remove button (X icon) on the first BOM item
    const firstItem = page.locator(".bom-item-card").first();
    const removeBtn = firstItem.locator(".bom-remove-btn");
    await removeBtn.click();
    await page.waitForTimeout(300);

    // A confirmation dialog should appear
    const confirmDialog = page.locator("[role='dialog']");
    const dialogVisible = await confirmDialog
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    if (dialogVisible) {
      // Click the confirm/delete button
      const confirmBtn = confirmDialog.locator("button").filter({
        hasText: /poista|delete|vahvista|confirm/i,
      });
      await confirmBtn.click();
      await page.waitForTimeout(500);
    }

    // Count should have decreased
    const countAfter = await page.locator(".bom-item-card").count();
    expect(countAfter).toBeLessThan(countBefore);
  });

  test("20 — deleting all materials shows empty state with zero total", async ({
    page,
  }) => {
    await loginAndNavigateToProject(page, projectId);
    await ensureBomPanelVisible(page);

    // Add a material if BOM is empty to make the test meaningful
    const hasBomItems = await page
      .locator(".bom-item-card")
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (!hasBomItems) {
      await addMaterialFromCatalog(page, /48x148/, 1);
      await page.waitForTimeout(500);
    }

    // Remove all BOM items one by one
    let maxIterations = 20;
    while (maxIterations-- > 0) {
      const itemCount = await page.locator(".bom-item-card").count();
      if (itemCount === 0) break;

      const removeBtn = page.locator(".bom-item-card").first().locator(".bom-remove-btn");
      await removeBtn.click();
      await page.waitForTimeout(300);

      // Handle confirmation dialog if present
      const dialog = page.locator("[role='dialog']");
      const dialogVisible = await dialog.isVisible({ timeout: 1_500 }).catch(() => false);
      if (dialogVisible) {
        const confirmBtn = dialog.locator("button").filter({
          hasText: /poista|delete|vahvista|confirm/i,
        });
        await confirmBtn.click();
        await page.waitForTimeout(500);
      }
    }

    // BOM should now be empty
    const finalCount = await page.locator(".bom-item-card").count();
    expect(finalCount).toBe(0);

    // Empty state text should appear
    await expect(
      page.getByText(/ei materiaaleja|no materials/i).first(),
    ).toBeVisible({ timeout: 5_000 });

    // Total should read "0"
    const zeroTotal = page
      .locator(".editor-bom-panel")
      .locator("span")
      .filter({ hasText: /^0$/ })
      .first();
    await expect(zeroTotal).toBeVisible({ timeout: 5_000 });
  });
});
