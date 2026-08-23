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
    const groupMatch = source.match(/#changelog-overlay,\n#guide-overlay,[\s\S]*?\{[\s\S]*?\}/);
    expect(groupMatch).toBeTruthy();
    const group = groupMatch![0];
    expect(group).toContain("#join-season-overlay");
    expect(group).toContain("position: fixed");
    expect(group).toContain("inset: 0");
  });

  it("opts #join-season-overlay back into pointer events under #hud (which is pointer-events: none by default)", () => {
    const source = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    const groupMatch = source.match(/#hud #mobile-nav,[\s\S]*?\{[\s\S]*?\}/);
    expect(groupMatch).toBeTruthy();
    expect(groupMatch![0]).toContain("#hud #join-season-overlay");
  });
});
