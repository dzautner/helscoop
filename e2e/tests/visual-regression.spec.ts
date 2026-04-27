import { test, expect, type Locator, type Page } from "@playwright/test";
import { inflateSync } from "node:zlib";
import { registerUser, loginViaUI, createProjectViaAPI, mainViewportCanvas } from "./helpers";

type DecodedPng = {
  width: number;
  height: number;
  rgba: Uint8Array;
};

function paethPredictor(left: number, above: number, upperLeft: number) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(buffer: Buffer): DecodedPng {
  const signature = buffer.subarray(0, 8).toString("hex");
  expect(signature).toBe("89504e470d0a1a0a");

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      const interlace = data[12];
      expect(bitDepth).toBe(8);
      expect(interlace).toBe(0);
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }

  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
  expect(channels, `Unsupported PNG color type: ${colorType}`).toBeGreaterThan(0);

  const bytesPerPixel = channels;
  const rowLength = width * channels;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const raw = new Uint8Array(width * height * channels);

  let sourceOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const rowOffset = y * rowLength;

    for (let x = 0; x < rowLength; x += 1) {
      const value = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? raw[rowOffset + x - bytesPerPixel] : 0;
      const above = y > 0 ? raw[rowOffset + x - rowLength] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? raw[rowOffset + x - rowLength - bytesPerPixel] : 0;

      switch (filter) {
        case 0:
          raw[rowOffset + x] = value;
          break;
        case 1:
          raw[rowOffset + x] = (value + left) & 0xff;
          break;
        case 2:
          raw[rowOffset + x] = (value + above) & 0xff;
          break;
        case 3:
          raw[rowOffset + x] = (value + Math.floor((left + above) / 2)) & 0xff;
          break;
        case 4:
          raw[rowOffset + x] = (value + paethPredictor(left, above, upperLeft)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported PNG filter: ${filter}`);
      }
    }

    sourceOffset += rowLength;
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let source = 0, target = 0; source < raw.length; source += channels, target += 4) {
    if (colorType === 0) {
      rgba[target] = raw[source];
      rgba[target + 1] = raw[source];
      rgba[target + 2] = raw[source];
      rgba[target + 3] = 255;
    } else {
      rgba[target] = raw[source];
      rgba[target + 1] = raw[source + 1];
      rgba[target + 2] = raw[source + 2];
      rgba[target + 3] = colorType === 6 ? raw[source + 3] : 255;
    }
  }

  return { width, height, rgba };
}

async function expectCanvasToHaveRenderedContent(canvas: Locator) {
  const image = decodePng(await captureCanvasPng(canvas));
  const totalPixels = image.width * image.height;
  const stride = Math.max(1, Math.floor(totalPixels / 10_000));
  const quantizedColors = new Set<string>();
  let visiblePixels = 0;
  let minLuma = 255;
  let maxLuma = 0;

  for (let pixel = 0; pixel < totalPixels; pixel += stride) {
    const offset = pixel * 4;
    const alpha = image.rgba[offset + 3];
    if (alpha < 16) continue;

    const red = image.rgba[offset];
    const green = image.rgba[offset + 1];
    const blue = image.rgba[offset + 2];
    const luma = 0.2126 * red + 0.7152 * green + 0.0722 * blue;

    visiblePixels += 1;
    minLuma = Math.min(minLuma, luma);
    maxLuma = Math.max(maxLuma, luma);
    quantizedColors.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
  }

  expect(image.width).toBeGreaterThan(200);
  expect(image.height).toBeGreaterThan(200);
  expect(visiblePixels).toBeGreaterThan(100);
  expect(quantizedColors.size).toBeGreaterThan(4);
  expect(maxLuma - minLuma).toBeGreaterThan(10);
}

async function captureCanvasPng(canvas: Locator): Promise<Buffer> {
  const dataUrl = await canvas.evaluate(async (node) => {
    const target = node as HTMLCanvasElement;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    return target.toDataURL("image/png");
  });
  expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
}

async function openProjectViewport(page: Page, projectId: string, renderDelayMs = 1_000): Promise<Locator> {
  await page.goto(`/project/${projectId}`, { waitUntil: "domcontentloaded" });
  const canvas = mainViewportCanvas(page);
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(renderDelayMs);
  return canvas;
}

test.describe("3D Viewport — Visual Regression", () => {
  let user: { email: string; password: string; name: string; token: string };

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    user = await registerUser(page, `vr-${Date.now()}`);
    await page.close();
  });

  test("default scene renders a visible canvas", async ({ page }) => {
    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Visual Regression - Default",
      scene_js: 'scene.add(box(4, 3, 5), { material: "lumber" });',
    });

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    const canvas = await openProjectViewport(page, projectId, 1_500);

    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(200);
    expect(box!.height).toBeGreaterThan(200);

    await page.screenshot({ path: "test-results/vr-default-scene.png" });
    await expectCanvasToHaveRenderedContent(canvas);
  });

  test("complex building scene renders correctly", async ({ page }) => {
    const complexScene = `
const foundation = box(10, 0.3, 8);
scene.add(foundation, { material: "concrete" });

const wall1 = translate(box(10, 2.8, 0.2), 0, 1.55, -3.9);
scene.add(wall1, { material: "lumber" });

const wall2 = translate(box(10, 2.8, 0.2), 0, 1.55, 3.9);
scene.add(wall2, { material: "lumber" });

const wall3 = translate(box(0.2, 2.8, 8), -4.9, 1.55, 0);
scene.add(wall3, { material: "lumber" });

const wall4 = translate(box(0.2, 2.8, 8), 4.9, 1.55, 0);
scene.add(wall4, { material: "lumber" });
`.trim();

    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Visual Regression - Complex",
      scene_js: complexScene,
    });

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    const canvas = await openProjectViewport(page, projectId, 1_500);
    await page.screenshot({ path: "test-results/vr-complex-scene.png" });
    await expectCanvasToHaveRenderedContent(canvas);
  });

  test("wireframe mode toggle changes rendering", async ({ page }) => {
    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Visual Regression - Wireframe",
      scene_js: 'scene.add(box(4, 3, 5), { material: "lumber" });',
    });

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    const canvas = await openProjectViewport(page, projectId, 1_500);

    // Take solid-mode baseline
    const solidScreenshot = await captureCanvasPng(canvas);

    // Toggle wireframe mode
    const wireframeBtn = page.locator('button[aria-label*="wireframe" i], button[aria-label*="rautalanka" i], button[data-tooltip*="wireframe" i]');
    if (await wireframeBtn.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await wireframeBtn.first().click();
      await page.waitForTimeout(1500);

      // Take wireframe screenshot
      const wireframeScreenshot = await captureCanvasPng(canvas);

      // Compare — wireframe should look different
      expect(Buffer.compare(solidScreenshot, wireframeScreenshot)).not.toBe(0);

      await page.screenshot({ path: "test-results/vr-wireframe.png" });
    }
  });

  test("camera presets change viewport angle", async ({ page }) => {
    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Visual Regression - Camera",
      scene_js: 'scene.add(box(4, 3, 5), { material: "lumber" });',
    });

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    const canvas = await openProjectViewport(page, projectId, 1_500);

    // Take default angle baseline
    const defaultScreenshot = await captureCanvasPng(canvas);

    // Try camera preset buttons (front, side, top)
    const cameraPresets = page.locator('button[aria-label*="camera" i], button[data-tooltip*="front" i], button[data-tooltip*="edestä" i]');
    if (await cameraPresets.first().isVisible({ timeout: 5_000 }).catch(() => false)) {
      await cameraPresets.first().click();
      await page.waitForTimeout(1500);

      const presetScreenshot = await captureCanvasPng(canvas);
      expect(Buffer.compare(defaultScreenshot, presetScreenshot)).not.toBe(0);
    }

    await page.screenshot({ path: "test-results/vr-camera-presets.png" });
  });

  test("scene with boolean operations renders", async ({ page }) => {
    const boolScene = `
const base = box(4, 3, 5);
const hole = translate(box(1, 2, 0.5), 0, 0, 2.5);
const result = subtract(base, hole);
scene.add(result, { material: "lumber" });
`.trim();

    const projectId = await createProjectViaAPI(page, user.token, {
      name: "Visual Regression - Boolean",
      scene_js: boolScene,
    });

    await loginViaUI(page, user.email, user.password);
    await page.getByText(/omat projektit|my projects/i).waitFor({ state: "visible", timeout: 15_000 });
    const canvas = await openProjectViewport(page, projectId, 1_500);
    await page.screenshot({ path: "test-results/vr-boolean-ops.png" });
    await expectCanvasToHaveRenderedContent(canvas);
  });
});
