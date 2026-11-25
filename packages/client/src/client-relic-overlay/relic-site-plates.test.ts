import { describe, expect, it } from "vitest";
import type { RelicMapHint } from "@border-empires/shared";
import { openRelicSiteCardAt } from "./relic-site-plates.js";

// Regression (player report 2026-11-25): a tap on a rival's relic in unexplored ground opened a scout
// flight plan. The tap path (client-action-flow.ts) now asks openRelicSiteCardAt first.
describe("openRelicSiteCardAt", () => {
  const relicMapHints = new Map<string, RelicMapHint>([["440,165", { x: 440, y: 165, kind: "WAKE", ownerId: "rival" }]]);
  it("claims a tap on a rival relic's tile for the relic card", () => {
    expect(openRelicSiteCardAt({ me: "me", relicMapHints, tiles: new Map() }, 440, 165)).toBe(true);
  });
  it("leaves other fog taps to the scout plan", () => {
    expect(openRelicSiteCardAt({ me: "me", relicMapHints, tiles: new Map() }, 441, 165)).toBe(false);
  });
});
