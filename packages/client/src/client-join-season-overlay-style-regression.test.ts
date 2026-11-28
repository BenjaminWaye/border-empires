import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// Regression test for the join-season overlay not covering the full screen:
// #join-season-overlay was missing from the fixed-full-screen-overlay
// selector group in style.css, so it rendered as a normal in-flow block
// sized to its content instead of a full-viewport layer. Asserting on the
// compiled selector text isn't possible for CSS the way it is for JS/TS, so
// this reads the source stylesheet directly (same convention as
// client-app/client-entry-style-regression.test.ts).
describe("join-season overlay style regression", () => {
  it("puts #join-season-overlay in the fixed, full-viewport overlay selector group", () => {
    const source = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    const groupMatch = source.match(/\n#respawn-overlay,\n[\s\S]*?\{[\s\S]*?\}/);
    expect(groupMatch).toBeTruthy();
    const group = groupMatch![0];
    expect(group).toContain("#join-season-overlay");
    expect(group).toContain("position: fixed");
    expect(group).toContain("inset: 0");
  });

  it("opts #join-season-overlay back into pointer events under #hud (which is pointer-events: none by default)", () => {
    const source = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    const groupMatch = source.match(/#hud #mini-map-wrap,[\s\S]*?\{[\s\S]*?\}/);
    expect(groupMatch).toBeTruthy();
    expect(groupMatch![0]).toContain("#hud #join-season-overlay");
  });

  // First-15 playtest 2026-11-28 (pt-explorer, pt-spender, pt-worldbuilder): at 375px the Sector Open panel
  // lost its right border. Its width was calc(100vw - 32px): 8px wider than the overlay's 20px-padded content
  // box, and wider still when 100vw counts a scrollbar. Checked in a 375px browser: the panel now sits 12px
  // in from both edges.
  it("sizes the Sector Open panel by the overlay, not the viewport, and narrows the gutters on a phone", () => {
    const lobby = readFileSync(new URL("./client-season-lobby-style.css", import.meta.url), "utf8");
    const modal = lobby.match(/\n#join-season-overlay \.respawn-modal \{[\s\S]*?\}/)?.[0] ?? "";
    expect(modal).toContain("width: min(520px, 100%)");
    expect(modal).not.toContain("100vw");
    const phone = lobby.match(/@media \(max-width: 480px\) \{[\s\S]*$/)?.[0] ?? "";
    expect(phone).toMatch(/#join-season-overlay \{\s*padding: 12px;/);
    expect(phone).toMatch(/#join-season-overlay \.respawn-modal \{\s*padding-right: 18px;/);
  });
});
