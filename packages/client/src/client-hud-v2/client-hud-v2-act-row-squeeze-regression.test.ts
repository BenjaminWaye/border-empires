import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Review of PR #2942: a tile's main action beside the fixed-width Aether and Details buttons was squeezed to a
// sliver with no label ("EXPA…", or a blank gold box on docks). The row must give it its own full-width line.
describe("HUD v2 action row: main action beside Aether and Details", () => {
  const css = readFileSync(new URL("./client-hud-v2.css", import.meta.url), "utf8");

  it("wraps the row and gives the main action a full line", () => {
    expect(css).toContain(".hud-v2-act-row:has(> .hud-v2-act-primary):has(> .hud-v2-act-aether):has(> .hud-v2-act-details) { flex-wrap: wrap; }");
    expect(css).toContain(".hud-v2-act-row:has(> .hud-v2-act-aether):has(> .hud-v2-act-details) > .hud-v2-act-primary { flex: 1 0 100%; }");
  });
});
