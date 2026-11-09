import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./client-season-end-overlay.css", import.meta.url), "utf8");
const styles = readFileSync(new URL("../client-styles.ts", import.meta.url), "utf8");

describe("season summary mobile layout", () => {
  it("loads the summary stylesheet above game controls while preserving authentication overlays", () => {
    expect(styles).toContain('import "./client-season-end-overlay/client-season-end-overlay.css";');
    const overlayRule = css.match(/#season-end-overlay\s*\{([^}]+)\}/)?.[1] ?? "";
    const layer = Number(overlayRule.match(/z-index:\s*(\d+)/)?.[1]);
    expect(layer).toBeGreaterThan(40);
    expect(layer).toBeLessThan(50);
  });

  it("hides hosted panels and expanded tile menus with the waiting HUD", () => {
    const hudCss = readFileSync(new URL("../client-hud-v2/client-hud-v2.css", import.meta.url), "utf8");
    expect(hudCss).toMatch(/body\.hud-v2\.hud-v2-waiting #hud-v2,\s*body\.hud-v2\.hud-v2-waiting #side-panel,\s*body\.hud-v2\.hud-v2-waiting #tile-action-menu\s*\{ display: none !important; \}/);
  });

  it("wraps every tab into two columns without clipping records", () => {
    const tabs = css.match(/\.se-tab-bar\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(tabs).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    const body = css.match(/\.se-scroll-body\s*\{([^}]+)\}/)?.[1] ?? "";
    expect(body).toContain("overflow-y: auto");
    expect(body).toContain("touch-action: pan-y");
  });
});
