import { describe, expect, it } from "vitest";
import { parseRelicMapHints, RELIC_MAP_HINT_LIMIT } from "./relic-map-hints.js";
import { relicCastRadius, createRelicState } from "./relic-state.js";

describe("relic wire hints", () => {
  it("whitelists anonymous coordinates and strips ownership and machinery facts", () => {
    expect(parseRelicMapHints([{ x: 1, y: 2, kind: "RELIC", ownerId: "enemy", remainingUses: 3 }])).toEqual([{ x: 1, y: 2, kind: "RELIC" }]);
    expect(parseRelicMapHints([{ x: 1, y: 2, kind: "RESOURCE", resource: "FOOD" }, { x: Infinity, y: 1, kind: "RELIC" }, { x: 1.2, y: 1, kind: "RELIC" }])).toEqual([]);
  });
  it("bounds the payload and preserves only recognized survey resources", () => {
    expect(parseRelicMapHints(Array.from({ length: RELIC_MAP_HINT_LIMIT + 1 }, () => ({ x: 1, y: 1, kind: "RELIC" })))).toEqual([]);
    expect(parseRelicMapHints([{ x: 1, y: 2, kind: "RESOURCE", resource: "UMBRITE" }])).toEqual([{ x: 1, y: 2, kind: "RESOURCE", resource: "UMBRITE" }]);
  });
  it("keeps the Resonator's casting reach separate from ordinary tower ranges", () => {
    expect(relicCastRadius(createRelicState("WATCHTOWER_ENGINE"), 20)).toBe(50);
    expect(relicCastRadius({ type: "WATCHTOWER_ENGINE" }, 20)).toBe(20);
    expect(relicCastRadius(createRelicState("WARPRESS"), 20)).toBe(20);
  });
});
