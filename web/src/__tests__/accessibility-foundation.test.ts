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

  it("announces new chat messages politely", () => {
    const chatPanel = readSource("../components/ChatPanel.tsx");

    expect(chatPanel).toContain('role="log"');
    expect(chatPanel).toContain('aria-live="polite"');
    expect(chatPanel).toContain('aria-relevant="additions text"');
  });
});
