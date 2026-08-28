import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { applyPlayerMessageToSnapshot, applyTileDeltasToSnapshot } from "./subscription-snapshot-cache.js";

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

describe("applyPlayerMessageToSnapshot", () => {
  // §5 (resource slots, docs/manpower-economy-rewrite-plan.md): the client
  // build-affordability gate now reads resourceSlots off ClientState, sourced
  // from this cached PlayerSubscriptionSnapshot on reconnect -- a merge gap
  // here would serve stale slot data and reintroduce the exact bug the
  // resourceSlots wire field exists to fix.
  it("merges resourceSlots from a PLAYER_UPDATE into the cached snapshot", () => {
    const updated = applyPlayerMessageToSnapshot(snapshot(), {
      type: "PLAYER_UPDATE",
      resourceSlots: {
        supply: { FOOD: 3, TITANIUM: 1, CRYSTAL: 0, UMBRITE: 0 },
        demand: { FOOD: 2, TITANIUM: 1, CRYSTAL: 0, UMBRITE: 0 }
      }
    });

    expect(updated.player?.resourceSlots).toEqual({
      supply: { FOOD: 3, TITANIUM: 1, CRYSTAL: 0, UMBRITE: 0 },
      demand: { FOOD: 2, TITANIUM: 1, CRYSTAL: 0, UMBRITE: 0 }
    });
  });

  it("merges devQueue and waypointQueue from a PLAYER_UPDATE into the cached snapshot", () => {
    // Regression: this merge function is a separate copy of the gateway's
    // identically-named one (subscription-snapshot-sync.ts) and was missing
    // these two fields entirely. This cache is what a fast bootstrap/
    // reconnect subscribe serves, and it's reachable even while a player is
    // offline (applyNonTileEventToCache in simulation-service.ts) -- so a
    // waypoint or dev-queue entry pushed via emitPlayerStateUpdate while the
    // player had no live socket was silently dropped on the next reconnect,
    // even though the live in-memory summary still had it.
    const updated = applyPlayerMessageToSnapshot(snapshot(), {
      type: "PLAYER_UPDATE",
      devQueue: [{ tileKey: "1,1", x: 1, y: 1, kind: "BUILD", structureType: "FORT", queuedAt: 1000 }],
      waypointQueue: [
        {
          x: 5,
          y: 5,
          queuedAt: 1000,
          planId: "plan-1",
          plannedAt: 1000,
          cursor: 1,
          steps: [{ origin: { x: 0, y: 0 }, target: { x: 5, y: 5 }, action: "EXPAND" }]
        }
      ]
    });

    expect(updated.player?.devQueue).toEqual([{ tileKey: "1,1", x: 1, y: 1, kind: "BUILD", structureType: "FORT", queuedAt: 1000 }]);
    expect(updated.player?.waypointQueue).toEqual([
      {
        x: 5,
        y: 5,
        queuedAt: 1000,
        planId: "plan-1",
        plannedAt: 1000,
        cursor: 1,
        steps: [{ origin: { x: 0, y: 0 }, target: { x: 5, y: 5 }, action: "EXPAND" }]
      }
    ]);
  });

  it("merges chosenTrickleResource from a PLAYER_UPDATE into the cached snapshot", () => {
    // Regression: this field was merged in the gateway's copy
    // (subscription-snapshot-sync.ts) but dropped here, the reverse of the
    // devQueue/waypointQueue drift above -- same drift class, opposite side.
    const updated = applyPlayerMessageToSnapshot(snapshot(), {
      type: "PLAYER_UPDATE",
      chosenTrickleResource: "TITANIUM"
    });

    expect(updated.player?.chosenTrickleResource).toBe("TITANIUM");
  });

  it("keeps progression modifiers in cached snapshots after tech updates", () => {
    const updated = applyPlayerMessageToSnapshot(snapshot(), {
      type: "TECH_UPDATE",
      gold: 75,
      techIds: ["tribal-warfare"],
      mods: { attack: 1.05, defense: 1.05, income: 1, vision: 1 },
      modBreakdown: {
        attack: [{ label: "Base", mult: 1 }, { label: "Warbands", mult: 1.05 }],
        defense: [{ label: "Base", mult: 1 }, { label: "Warbands", mult: 1.05 }],
        income: [{ label: "Base", mult: 1 }],
        vision: [{ label: "Base", mult: 1 }]
      }
    });

    expect(updated.player?.gold).toBe(75);
    expect(updated.player?.techIds).toEqual(["tribal-warfare"]);
    expect(updated.player?.mods?.attack).toBe(1.05);
    expect(updated.player?.modBreakdown?.attack).toContainEqual({ label: "Warbands", mult: 1.05 });
  });
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
