import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceOf = (relativePath: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, relativePath), "utf8");
};

describe("development panel wiring regression guard", () => {
  it("exposes the development stat-chip as a clickable data-panel button", () => {
    const source = sourceOf("../client-hud/client-hud.ts");
    expect(source).toContain('data-panel="development"');
    expect(source).toContain("renderDevelopmentPanelHtml(deriveDevelopmentPanelData(");
    expect(source).toContain("dom.panelDevelopmentEl.innerHTML = dom.mobilePanelDevelopmentEl.innerHTML");
  });

  it("registers desktop and mobile development panel containers in the DOM shell", () => {
    const source = sourceOf("../client-dom.ts");
    expect(source).toContain('<section id="panel-development" class="panel-body"></section>');
    expect(source).toContain('<section id="mobile-panel-development" class="mobile-panel"></section>');
    expect(source).toContain("panelDevelopmentEl");
    expect(source).toContain("mobilePanelDevelopmentEl");
  });

  it("registers the development panel title and mobile sheet header", () => {
    const source = sourceOf("../client-panel-nav/client-panel-nav.js".replace(".js", ".ts"));
    expect(source).toContain('if (panel === "development") return "Development";');
    expect(source).toContain('else if (state.mobilePanel === "development") deps.mobileSheetHeadEl.textContent = "Development";');
    expect(source).toContain('[deps.mobilePanelDevelopmentEl, "development"]');
  });

  it("includes 'development' in the client state activePanel and mobilePanel unions", () => {
    const source = sourceOf("../client-state/client-state.ts");
    expect(source).toMatch(/mobilePanel: "core" as [^,]*"development"/);
    expect(source).toMatch(/activePanel: null as [^,]*"development"/);
  });
});
