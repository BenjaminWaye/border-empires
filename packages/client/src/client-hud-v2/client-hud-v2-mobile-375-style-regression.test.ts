// Playtest 2026-11-12 at 375x667 (phone). happy-dom does not resolve the cascade, so guard the layout rules
// in the stylesheets, and the keyboard hints in the markup, that the phone fixes rely on.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const compact = read("./client-hud-v2-compact.css");
const screens = read("./client-hud-v2-compact-screens.css");
const steampunk = read("../client-steampunk-settings-style.css");

/** Declarations of every top-level-or-nested rule whose selector list is exactly `selector`. */
const rulesFor = (css: string, selector: string): string =>
  [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors!.split(",").map((s) => s.trim()).includes(selector))
    .map(([,, declarations]) => declarations!.trim())
    .join("\n");

describe("phone layout at 375x667", () => {
  it("lets the Towns table headers wrap instead of running into each other", () => {
    expect(rulesFor(screens, "body.hud-v2-compact .v2l-sort")).toContain("white-space: normal");
  });

  it("ends hosted panels (Manpower, Economy, …) at the tab bar so their last rows can scroll into view", () => {
    const rules = rulesFor(compact, "body.hud-v2-compact #side-panel");
    expect(rules).toContain("bottom: var(--v2c-bottom) !important");
    expect(rules).not.toMatch(/bottom:\s*0\s*!important/);
  });

  it("lifts the structure-info modal over the tab bar and orb", () => {
    expect(rulesFor(compact, "body.hud-v2-compact #structure-info-overlay")).toContain("z-index: 71");
  });

  it("keeps the structure-info modal's padding inside its phone width", () => {
    const phone = steampunk.slice(steampunk.indexOf("@media (max-width: 900px)"));
    expect(rulesFor(phone, ".structure-info-modal")).toContain("box-sizing: border-box");
  });

  it("opens the Chronicle to the ribbon on short phones so its list isn't two rows tall", () => {
    const short = screens.match(/@media \(orientation: portrait\) and \(max-height: 760px\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(rulesFor(short, "body.hud-v2-compact .v2c-drawer")).toMatch(/top:\s*var\(--v2c-top\);\s*height:\s*auto/);
    expect(rulesFor(short, "body.hud-v2-compact .v2c-chips")).toContain("repeat(4, minmax(0, 1fr))");
  });

  it("scrolls the town's build panel as one column with Place pinned, above a bar that fits its reserved height", () => {
    expect(rulesFor(screens, "body.hud-v2-compact #v2t-build")).toContain("overflow-y: auto");
    expect(rulesFor(screens, "body.hud-v2-compact #v2t-build > *")).toContain("flex-shrink: 0");
    const list = rulesFor(screens, "body.hud-v2-compact #v2t-build .v2t-build-list");
    expect(list).toContain("flex: none");
    expect(list).toContain("overflow: visible");
    expect(rulesFor(screens, "body.hud-v2-compact #v2t-build .v2t-place-docked")).toMatch(/position:\s*sticky;\s*bottom:\s*0/);
    expect(rulesFor(screens, "body.hud-v2-compact #v2t-bar.v2t-bar")).toContain("box-sizing: border-box");
  });

  it("gives the Build ▸ sheet's ✕ a full touch target", () => {
    expect(rulesFor(screens, "body.hud-v2-compact .v2t-build-close")).toContain("width: var(--v2c-touch)");
  });

  it("hides keyboard hints (Esc, right-click) on phones", () => {
    for (const selector of ["body.hud-v2-compact .v2-key-hint", "body.hud-v2-compact .tile-action-hint", "body.hud-v2-compact .v2s-back kbd"]) {
      expect(rulesFor(screens, selector)).toContain("display: none");
    }
  });

  it("puts every visible Esc label inside a hideable hint", () => {
    for (const file of ["./client-hud-v2-town.ts", "./client-hud-v2-battle.ts", "./client-hud-v2-chronicle.ts"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8")
        .replace(/<span class="v2-key-hint">[^<]*<\/span>/g, "")
        .replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, "");
      expect(src, file).not.toMatch(/>[^<>`]*\bEsc\b[^<>`]*</);
    }
  });
});
