// Playtest 2026-11-13/14 at 375x580 and 375x667. happy-dom does not resolve the cascade, so guard the
// stylesheet rules the short-phone fixes rely on; the camera's top cover is measured from the live DOM.
// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { coverFromTop } from "./client-hud-v2-compact-camera.js";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const compact = read("./client-hud-v2-compact.css");
const screens = read("./client-hud-v2-compact-screens.css");
const overlays = read("./client-hud-v2-compact-overlays.css");
const desktopScreens = read("./client-hud-v2-screens.css");

/** Declarations of every rule whose selector list includes exactly `selector`. */
const rulesFor = (css: string, selector: string): string =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors!.split(/,(?![^(]*\))/).map((s) => s.trim()).includes(selector))
    .map(([,, declarations]) => declarations!.trim())
    .join("\n");

describe("short phone layout", () => {
  it("opens Settings under the resource bar, so its heading and close button are not painted over", () => {
    expect(compact).not.toMatch(/settings-panel-active\s*\{[^}]*top:/);
    expect(rulesFor(compact, "body.hud-v2-compact #side-panel")).toContain("top: var(--v2c-top) !important");
  });

  it("puts the placement bar (Relay Beacon, AFC landing) in place of the tab bar", () => {
    const rules = rulesFor(overlays, "body.hud-v2-compact #placement-overlay");
    expect(rules).toMatch(/bottom:\s*0;/);
    expect(rules).toContain("calc(var(--v2c-safe-bottom) + 10px)");
    expect(overlays).toMatch(/:has\(#placement-overlay:not\(\[style\*="none"\]\)\) :is\(\.hud-v2-nav,/);
  });

  it("docks the guide above the tab bar over Manifest, Diplomacy and Manpower, and ends those above it", () => {
    expect(rulesFor(overlays, "body.hud-v2-compact #tutorial-guide-root.tg-raised")).toContain("bottom: calc(var(--v2c-bottom) + 4px) !important");
    expect(overlays).toMatch(/\.hud-v2-screen-manifest, \.hud-v2-screen-diplomacy\):has\([^)]*\)\) \.v2s-body \{\s*bottom: calc\(var\(--v2c-bottom\) \+ var\(--v2c-guide-dock\)/);
    expect(overlays).toMatch(/tg-over-manpower[^{]*#side-panel \{\s*bottom: calc\(var\(--v2c-bottom\) \+ var\(--v2c-guide-dock\)\) !important/);
  });

  it("keeps Abandon Territory and the other text links off the bottom row of the tile sheet and town bar", () => {
    expect(rulesFor(overlays, "body.hud-v2-compact .hud-v2-tile > .hud-v2-act-row")).toContain("order: 1");
    expect(rulesFor(overlays, "body.hud-v2-compact #v2t-bar .v2t-minor")).toContain("order: -1");
  });

  // Review of #2781: with the links on top, a 118px cap that also held the safe-area padding left ~24px
  // for Garrison/Raise flag on a home-indicator iPhone. The panels above already reserve town bar + safe area.
  it("sizes the town bar to its reserve plus the safe area, so the action buttons stay in view", () => {
    expect(rulesFor(screens, "body.hud-v2-compact #v2t-bar.v2t-bar")).toContain("max-height: calc(var(--v2c-town-bar, 118px) + var(--v2c-safe-bottom))");
  });

  // Review of #2781: in landscape the docked guide left Manifest and Diplomacy ~125px of body.
  it("docks the guide in portrait only", () => {
    const dock = overlays.indexOf("--v2c-guide-dock: 88px");
    const portrait = overlays.lastIndexOf("@media (orientation: portrait)", dock);
    expect(portrait).toBeGreaterThanOrEqual(0);
    expect(overlays.slice(portrait, dock)).not.toContain("}");
  });

  it("shows the town's stat cards two to a row so their labels and notes fit at 375px", () => {
    expect(rulesFor(screens, "body.hud-v2-compact .v2t-stats")).toContain("repeat(2, minmax(0, 1fr))");
    expect(rulesFor(screens, "body.hud-v2-compact .v2t-stat")).toContain("min-width: 0");
  });

  it("gives the Manifest tree more of a short screen than its detail card", () => {
    const short = screens.match(/@media \(orientation: portrait\) and \(max-height: 760px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(rulesFor(short, "body.hud-v2-compact .v2m-detail")).toContain("max-height: 30dvh");
    expect(rulesFor(short, "body.hud-v2-compact .v2m-scroll")).toContain("min-height: max(96px, 34%)");
    expect(rulesFor(short, "body.hud-v2-compact .v2m-detail > .v2s-btn")).toContain("position: sticky");
  });

  it("spans Diplomacy's empty note across the grid and wraps long empire names inside their card", () => {
    expect(rulesFor(desktopScreens, ".v2d-grid > .v2s-empty")).toContain("grid-column: 1 / -1");
    expect(rulesFor(desktopScreens, ".v2d-emp")).toContain("min-width: 0");
    expect(rulesFor(desktopScreens, ".v2d-emp-name")).toContain("overflow-wrap: anywhere");
  });
});

describe("compact camera top cover", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  const place = (className: string, top: number, height: number): void => {
    const el = document.createElement("div");
    el.className = className;
    el.getBoundingClientRect = () => ({ top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) });
    document.body.appendChild(el);
  };

  it("counts the folded tracker line and season pill under the bar, so a centred town is not hidden under them", () => {
    document.body.innerHTML = `<div class="hud-v2-top"></div>`;
    const bar = document.createElement("div");
    bar.className = "hud-v2-bar";
    bar.getBoundingClientRect = () => ({ top: 4, bottom: 50, height: 46, left: 0, right: 375, width: 375, x: 0, y: 4, toJSON: () => ({}) });
    document.querySelector(".hud-v2-top")!.appendChild(bar);
    place("hud-v2-tracker", 56, 36);
    place("hud-v2-right", 56, 40);
    expect(coverFromTop(document, 580)).toBe(96);
  });

  it("ignores an unfolded tracker reaching down the screen", () => {
    place("hud-v2-tracker", 56, 400);
    expect(coverFromTop(document, 580)).toBe(0);
  });
});
