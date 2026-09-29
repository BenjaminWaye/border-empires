import { afterEach, describe, expect, it, vi } from "vitest";
import * as defensibilityHtml from "../client-defensibility-html/client-defensibility-html.js";
import { renderDefensibilityPanels, resetDefensibilityPanelCacheForTests } from "./client-hud-defensibility-panel.js";

// Regression: the Empire Integrity panel walked every settled tile through
// worldgen on every HUD render (1.3s for a large empire, inside the post-login
// INIT handler). It must only recompute when its inputs change.

const makeState = (tilesRevision: number) => ({
  tiles: new Map(),
  tilesRevision,
  me: "p1",
  defensibilityPct: 50,
  settledT: 10,
  settledE: 4,
  showWeakDefensibility: false
});

const dom = () => ({ panelDefensibilityEl: { innerHTML: "" } as HTMLElement, mobilePanelDefensibilityEl: { innerHTML: "" } as HTMLElement });
const deps = {
  keyFor: (x: number, y: number) => `${x},${y}`,
  wrapX: (x: number) => x,
  wrapY: (y: number) => y,
  terrainAt: () => "LAND" as const,
  safeValue: <T,>(_label: string, _fallback: T, render: () => T): T => render(),
  fallbackCard: (label: string) => `<p>${label} unavailable</p>`
};

describe("renderDefensibilityPanels", () => {
  afterEach(() => {
    resetDefensibilityPanelCacheForTests();
    vi.restoreAllMocks();
  });

  it("recomputes only when the tile revision (or another input) changes", () => {
    const spy = vi.spyOn(defensibilityHtml, "renderDefensibilityPanelHtml").mockReturnValue("<p>panel</p>");
    const target = dom();
    renderDefensibilityPanels(makeState(1), target, deps);
    renderDefensibilityPanels(makeState(1), target, deps);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(target.panelDefensibilityEl.innerHTML).toBe("<p>panel</p>");
    expect(target.mobilePanelDefensibilityEl.innerHTML).toBe("<p>panel</p>");
    renderDefensibilityPanels(makeState(2), target, deps);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("shows the fallback card and retries next time when rendering fails", () => {
    const spy = vi.spyOn(defensibilityHtml, "renderDefensibilityPanelHtml").mockReturnValue("");
    const target = dom();
    renderDefensibilityPanels(makeState(1), target, deps);
    renderDefensibilityPanels(makeState(1), target, deps);
    expect(target.panelDefensibilityEl.innerHTML).toBe("<p>Empire Integrity unavailable</p>");
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
