import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Playtest 2026-11-26 (phone, 375x667 and 375x580): HUD pieces drawing over one another. Each was checked in a
// browser at both sizes; these pin the rules that keep them apart.
const css = (file: string): string => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
const rule = (source: string, selector: string): string =>
  source.match(new RegExp(`${selector.replace(/[.#()>:-]/g, "\\$&")} \\{([^}]*)\\}`))?.[1] ?? "";

describe("HUD v2 playtest overlaps (2026-11-26)", () => {
  it("puts the tile sheet's status chip on its own line under the title, so 'Fogged — …' can't squeeze it", () => {
    const compact = css("client-hud-v2-compact.css");
    expect(rule(compact, "body.hud-v2-compact .hud-v2-tile-head")).toContain("display: grid");
    expect(rule(compact, "body.hud-v2-compact .hud-v2-tile-head")).toContain("grid-template-columns: minmax(0, 1fr) auto");
    const status = rule(compact, "body.hud-v2-compact .hud-v2-tile-status");
    expect(status).toContain("grid-column: 1 / -1");
    expect(status).toContain("grid-row: 2");
    expect(rule(compact, "body.hud-v2-compact .hud-v2-tile-close")).toContain("grid-row: 1");
  });

  it("hides the AFC offline chip while the tile sheet is open (it sat over the sheet's title)", () => {
    expect(css("client-hud-v2-compact.css")).toContain("body.hud-v2-compact:has(#hud-v2-tile:not([hidden])) .afc-recovery-status { display: none !important; }");
  });

  it("lets map taps through the Victory race pill, except its small title tap target", () => {
    const compact = css("client-hud-v2-compact.css");
    // By id, so it outranks style.css's `#hud button { pointer-events: auto }` (a class rule lost to it).
    expect(rule(compact, "body.hud-v2-compact #hud-v2-season")).toContain("pointer-events: none");
    const title = rule(compact, "body.hud-v2-compact .hud-v2-season-title");
    expect(title).toContain("pointer-events: auto");
    expect(title).toContain("min-height: 24px");
  });

  it("pins a previewed town focus's Confirm at the foot of the town panel, above the Build panel", () => {
    const pinned = rule(css("client-hud-v2-town-focus.css"), "body.hud-v2-compact .v2tf-phone-hint:has(.v2tf-confirm)");
    expect(pinned).toContain("position: sticky");
    expect(pinned).toContain("bottom: 0");
    expect(pinned).toMatch(/background: var\(--v2-well\)/);
  });
});
