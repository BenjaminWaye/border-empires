import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceOf = (relativePath: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, relativePath), "utf8");
};

describe("development panel wiring regression guard", () => {
  it("renders the development panel from the HUD", () => {
    const source = sourceOf("../client-hud/client-hud.ts");
    expect(source).toContain("renderDevelopmentPanelHtml(deriveDevelopmentPanelData(");
    expect(source).toContain("dom.panelDevelopmentEl.innerHTML = safeValue(\"developmentPanelHtml\"");
  });

  it("registers the development panel container in the DOM shell", () => {
    expect(sourceOf("../client-dom-markup/client-dom-markup.ts")).toContain('<section id="panel-development" class="panel-body"></section>');
    expect(sourceOf("../client-dom.ts")).toContain("panelDevelopmentEl");
  });

  it("registers the development panel title", () => {
    expect(sourceOf("../client-panel-nav/client-panel-nav.ts")).toContain('if (panel === "development") return "Development";');
  });

  it("includes 'development' in the client state activePanel union", () => {
    expect(sourceOf("../client-state/client-state.ts")).toMatch(/activePanel: null as [^,]*"development"/);
  });
});
