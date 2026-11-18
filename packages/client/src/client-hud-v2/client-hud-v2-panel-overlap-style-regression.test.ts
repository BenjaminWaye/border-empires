import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Playtest 2026-11-18: panels drawing over one another. Each was checked in a browser at 375x667 / 375x812 and
// desktop; these pin the rules that keep them apart.
const css = (file: string): string => readFileSync(new URL(`./${file}`, import.meta.url), "utf8");
const rule = (source: string, selector: string): string =>
  source.match(new RegExp(`${selector.replace(/[.#()>:-]/g, "\\$&")} \\{([^}]*)\\}`))?.[1] ?? "";

describe("HUD v2 panel overlap", () => {
  it("stops the folded tracker a gutter short of the 44vw season pill (it ran under Victory race)", () => {
    const tracker = rule(css("client-hud-v2-compact.css"), "body.hud-v2-compact .hud-v2-tracker");
    expect(tracker).toContain("box-sizing: border-box");
    expect(tracker).toContain("max-width: calc(56vw - var(--v2c-safe-left) - var(--v2c-safe-right) - 3 * var(--v2c-gutter))");
    expect(rule(css("client-hud-v2-compact.css"), "body.hud-v2-compact .hud-v2-right")).toContain("max-width: 44vw");
  });

  it("keeps the Manifest's pinned Commission button opaque, so scrolled text can't show through it", () => {
    const disabled = rule(css("client-hud-v2-compact-screens.css"), "  body.hud-v2-compact .v2m-detail > .v2s-btn:disabled");
    expect(disabled).toContain("opacity: 1");
    expect(disabled).toMatch(/background: rgb\(/);
  });

  it("draws a near-solid backdrop behind the screen headers, so map labels don't read through Diplomacy's title", () => {
    expect(rule(css("client-hud-v2-screens.css"), ".v2s-backdrop")).toContain("rgba(9, 8, 6, 0.95) 200px");
  });

  it("hides the map's Build sidebar under the town, frame and battle screens", () => {
    const screens = css("client-hud-v2-screens.css");
    for (const id of ["frame", "town", "battle"]) expect(screens).toContain(`body.hud-v2-screen-${id} .hud-v2-build-side,`);
  });
});
