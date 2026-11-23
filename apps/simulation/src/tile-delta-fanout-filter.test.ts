import { describe, expect, it } from "vitest";

import { createSubscriberTileDeltaFilter } from "./tile-delta-fanout-filter.js";

type Delta = { x: number; y: number; ownerId?: string; resource?: string; visibilityState?: "VISIBLE" | "FOG" | "UNSEEN" };

const NO_TRANSITIONS = { entered: new Map<string, ReadonlySet<string>>(), left: new Map<string, ReadonlySet<string>>() };

// Stand-in for the runtime's fog filter: a fogged viewer only sees x < 5, and
// never the hidden resource.
const harness = (spectators: string[]) => {
  const filterCalls: string[] = [];
  const filter = createSubscriberTileDeltaFilter<Delta>({
    isSpectator: (playerId) => spectators.includes(playerId),
    groupKeyFor: (deltas) => deltas.map((delta) => `${delta.x}:${delta.y}`).join("|"),
    filterTileDeltasForPlayer: (deltas, playerId) => {
      filterCalls.push(playerId);
      return deltas.filter((delta) => delta.x < 5).map(({ resource: _hidden, ...visible }) => visible);
    },
    wireDeltaForTileKey: (tileKey) => {
      const [x, y] = tileKey.split(",").map(Number);
      return { x: x!, y: y! };
    }
  });
  return { filter, filterCalls };
};

const batch: Delta[] = [
  { x: 1, y: 1, ownerId: "ai-1", resource: "IRON" },
  { x: 300, y: 200, ownerId: "ai-7" }
];

describe("subscriber tile-delta filter", () => {
  // Regression: a revealed admin only ever received deltas inside their own
  // territory's vision, so the gateway kept the rest of the map current by
  // re-exporting the whole world on every change (full-reveal-2026-11-23.md).
  it("gives a spectator every delta in the batch, unfiltered and stamped VISIBLE", () => {
    const { filter, filterCalls } = harness(["admin"]);

    expect(filter.filter(batch, "admin", NO_TRANSITIONS)).toEqual([
      { x: 1, y: 1, ownerId: "ai-1", resource: "IRON", visibilityState: "VISIBLE" },
      { x: 300, y: 200, ownerId: "ai-7", visibilityState: "VISIBLE" }
    ]);
    expect(filterCalls).toEqual([]);
  });

  it("still fog-filters everyone else", () => {
    const { filter } = harness(["admin"]);

    expect(filter.filter(batch, "player-2", NO_TRANSITIONS)).toEqual([{ x: 1, y: 1, ownerId: "ai-1", visibilityState: "VISIBLE" }]);
  });

  it("does not fog a spectator's tiles when their own territory loses sight of them", () => {
    const { filter } = harness(["admin"]);
    const left = { entered: new Map(), left: new Map([["admin", new Set(["2,2"])], ["player-2", new Set(["2,2"])]]) };

    expect(filter.filter([], "admin", left)).toEqual([]);
    expect(filter.filter([], "player-2", left)).toEqual([{ x: 2, y: 2, visibilityState: "FOG" }]);
  });

  it("never lets a spectator share a serialization group with a masked viewer", () => {
    const { filter } = harness(["admin"]);
    const visibleToBoth: Delta[] = [{ x: 1, y: 1, ownerId: "ai-1", resource: "IRON" }];
    const forAdmin = filter.filter(visibleToBoth, "admin", NO_TRANSITIONS);
    const forPlayer = filter.filter(visibleToBoth, "player-2", NO_TRANSITIONS);

    // Same coordinates, different payload: the admin's copy carries the resource.
    expect(forAdmin[0]).toHaveProperty("resource", "IRON");
    expect(forPlayer[0]).not.toHaveProperty("resource");
    expect(filter.groupKey("admin", forAdmin)).not.toBe(filter.groupKey("player-2", forPlayer));
    expect(filter.groupKey("player-2", forPlayer)).toBe(filter.groupKey("player-3", forPlayer));
  });
});
