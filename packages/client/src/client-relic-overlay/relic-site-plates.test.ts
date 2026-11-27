import { describe, expect, it } from "vitest";
import type { RelicMapHint } from "@border-empires/shared";
import { openRelicSiteCardAt } from "./relic-site-plates.js";

const relicMapHints = new Map<string, RelicMapHint>([["440,165", { x: 440, y: 165, kind: "WAKE", ownerId: "rival" }]]);
const stateWith = (picking: { scout?: boolean; marchOrigin?: boolean; marchTarget?: boolean } = {}) => ({
  me: "me",
  relicMapHints,
  tiles: new Map(),
  scoutDronePicking: { active: Boolean(picking.scout) },
  marchOriginPicking: { active: Boolean(picking.marchOrigin) },
  musterMarchTargeting: { active: Boolean(picking.marchTarget) }
}) as unknown as Parameters<typeof openRelicSiteCardAt>[0];

// Regression (player report 2026-11-25): a tap on a rival's relic in unexplored ground opened a scout
// flight plan. The tap path (client-action-flow.ts) now asks openRelicSiteCardAt first.
describe("openRelicSiteCardAt", () => {
  it("claims a tap on a rival relic's tile for the relic card", () => {
    expect(openRelicSiteCardAt(stateWith(), 440, 165)).toBe(true);
  });
  it("leaves other fog taps to the scout plan", () => {
    expect(openRelicSiteCardAt(stateWith(), 441, 165)).toBe(false);
  });
  // Regression (player report 2026-11-25): placing the last scout waypoint on the relic kept opening the card.
  it("lets a tap on the relic through while a scout plan or march is being picked", () => {
    expect(openRelicSiteCardAt(stateWith({ scout: true }), 440, 165)).toBe(false);
    expect(openRelicSiteCardAt(stateWith({ marchOrigin: true }), 440, 165)).toBe(false);
    expect(openRelicSiteCardAt(stateWith({ marchTarget: true }), 440, 165)).toBe(false);
  });
});
