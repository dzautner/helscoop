import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("accessibility foundation", () => {
  it("exposes a skip link and main-content targets on entry pages", () => {
    const layout = readSource("../app/layout.tsx");
    const home = readSource("../app/page.tsx");
    const editor = readSource("../app/project/[id]/page.tsx");

    expect(layout).toContain('className="skip-link"');
    expect(layout).toContain('href="#main-content"');
    expect(home).toContain('id="main-content"');
    expect(editor).toContain('id="main-content"');
    expect(editor).toContain('<main');
  });

  it("keeps keyboard focus visible and screen-reader-only text available", () => {
    const css = readSource("../app/globals.css");

    expect(css).toContain(".skip-link");
    expect(css).toContain(":focus-visible");
    expect(css).toContain(".sr-only");
    expect(css).toContain("clip: rect(0, 0, 0, 0)");
  });

  it("makes the 3D viewport keyboard-operable and described for assistive tech", () => {
    const viewport = readSource("../components/Viewport3D.tsx");

    expect(viewport).toContain('role="application"');
    expect(viewport).toContain("tabIndex={0}");
    expect(viewport).toContain("handleViewportKeyDown");
    expect(viewport).toContain("viewportA11yDescription");
    expect(viewport).toContain("prefers-reduced-motion: reduce");
    expect(viewport).toContain('setAttribute("aria-hidden", "true")');
  });

  it("keeps viewport measurement controls discoverable from keyboard and toolbar", () => {
    const viewport = readSource("../components/Viewport3D.tsx");
    const editor = readSource("../app/project/[id]/page.tsx");
    const css = readSource("../app/globals.css");

    expect(viewport).toContain('shortcutLabel("Cmd+M")');
    expect(viewport).toContain("pickDimensionOverlay");
    expect(viewport).toContain("viewport-scale-indicator");
    expect(editor).toContain("toggleViewportMeasurementMode");
    expect(editor).toContain("viewportMeasurementMode");
    expect(css).toContain(".viewport-dimension-label");
    expect(css).toContain(".viewport-scale-indicator");
  });

  it("announces new chat messages politely", () => {
    const chatPanel = readSource("../components/ChatPanel.tsx");

    expect(chatPanel).toContain('role="log"');
    expect(chatPanel).toContain('aria-live="polite"');
    expect(chatPanel).toContain('aria-relevant="additions text"');
  });

  it("announces scene modifications after viewport-affecting actions", () => {
    const editor = readSource("../app/project/[id]/page.tsx");

    expect(editor).toContain("sceneA11yAnnouncement");
    expect(editor).toContain("queueSceneAnnouncement");
    expect(editor).toContain("countSceneAddCalls");
    expect(editor).toContain('data-testid="scene-a11y-announcer"');
    expect(editor).toContain('role="status"');
    expect(editor).toContain('aria-live="polite"');
    expect(editor).toContain('aria-atomic="true"');
    expect(editor).toContain("editor.sceneChangeAnnouncement");
  });
});
