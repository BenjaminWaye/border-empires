import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { applyTileDeltasToSnapshot } from "./subscription-snapshot-cache.js";

// applyPlayerMessageToSnapshot's tests moved to @border-empires/sim-protocol's
// subscription-snapshot-merge module (see docs/player-wire-refactor-plan.md's
// Phase 1+2 follow-up) -- this file now covers only this app's own
// applyTileDeltasToSnapshot implementation (binary search over a sorted
// array; apps/realtime-gateway's copy uses a WeakMap-indexed lookup instead
// -- same behavior, different perf tradeoff, deliberately left as two
// implementations).
const snapshot = (): PlayerSubscriptionSnapshot => ({
  playerId: "player-1",
  player: {
    id: "player-1",
    gold: 100,
    manpower: 10,
    manpowerCap: 100,
    incomePerMinute: 1,
    strategicResources: { FOOD: 0, TITANIUM: 25, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
    strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
    developmentProcessLimit: 2,
    activeDevelopmentProcessCount: 0,
    pendingSettlements: [],
    techIds: [],
    domainIds: [],
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    modBreakdown: {
      attack: [{ label: "Base", mult: 1 }],
      defense: [{ label: "Base", mult: 1 }],
      income: [{ label: "Base", mult: 1 }],
      vision: [{ label: "Base", mult: 1 }]
    }
  },
  tiles: []
});

describe("applyTileDeltasToSnapshot ownership-clear handling", () => {
  it("does NOT insert a phantom tile for a clear-only delta the snapshot has never seen", () => {
    // Regression: broadcast-only ghost-ownership clears are sent to every
    // player regardless of visibility. Inserting them into the cached snapshot
    // accumulated phantom neutral tiles that leaked fog-of-war on reconnect.
    const updated = applyTileDeltasToSnapshot(snapshot(), [
      { x: 49, y: 288, ownerId: undefined, ownershipState: undefined, ownershipClearOnly: true }
    ]);

    expect(updated.tiles).toHaveLength(0);
  });

  it("still applies a clear-only delta to a tile already in the snapshot", () => {
    const base: PlayerSubscriptionSnapshot = {
      ...snapshot(),
      tiles: [{ x: 5, y: 5, terrain: "LAND", ownerId: "barbarian-1", ownershipState: "SETTLED" }]
    };

    const updated = applyTileDeltasToSnapshot(base, [
      { x: 5, y: 5, ownerId: undefined, ownershipState: undefined, ownershipClearOnly: true }
    ]);

    expect(updated.tiles).toHaveLength(1);
    expect(updated.tiles[0]?.ownerId).toBeUndefined();
    expect(updated.tiles[0]?.ownershipState).toBeUndefined();
    expect(updated.tiles[0]?.terrain).toBe("LAND");
  });

  it("still inserts a normal (non-clear-only) delta for a newly visible tile", () => {
    const updated = applyTileDeltasToSnapshot(snapshot(), [
      { x: 7, y: 7, terrain: "LAND", ownerId: "rival-1", ownershipState: "SETTLED" }
    ]);

    expect(updated.tiles).toHaveLength(1);
    expect(updated.tiles[0]?.ownerId).toBe("rival-1");
  });
});
