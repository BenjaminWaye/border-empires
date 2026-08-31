import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "../index.js";
import { applyPlayerMessageToSnapshot } from "./subscription-snapshot-merge.js";

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

// This module replaces two field-by-field-identical copies of the same merge
// (apps/simulation's subscription-snapshot-cache.ts and apps/realtime-
// gateway's subscription-snapshot-sync.ts) that had drifted at least twice
// before being unified -- see docs/player-wire-refactor-plan.md and its
// Phase 1+2 follow-up doc. These tests cover every regression either copy
// independently accumulated, now against the single merged implementation.
describe("applyPlayerMessageToSnapshot", () => {
  // §5 (resource slots, docs/manpower-economy-rewrite-plan.md): the client
  // build-affordability gate reads resourceSlots off ClientState, sourced
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
    // Regression (was missing from the sim's old copy): this cache is what a
    // fast bootstrap/reconnect subscribe serves, and it's reachable even
    // while a player is offline (applyNonTileEventToCache in simulation-
    // service.ts) -- so a waypoint or dev-queue entry pushed via
    // emitPlayerStateUpdate while the player had no live socket was silently
    // dropped on the next reconnect, even though the live in-memory summary
    // still had it. See PR #1633/#1634/#1637.
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
    // Regression: was merged by the gateway's old copy but dropped by the
    // sim's -- same drift class as devQueue/waypointQueue, opposite side.
    const updated = applyPlayerMessageToSnapshot(snapshot(), {
      type: "PLAYER_UPDATE",
      chosenTrickleResource: "TITANIUM"
    });

    expect(updated.player?.chosenTrickleResource).toBe("TITANIUM");
  });

  it("merges economyBreakdown, upkeepPerMinute, and upkeepLastTick from a PLAYER_UPDATE into the cached snapshot", () => {
    // Regression: merged by the sim's old copy but dropped by the gateway's.
    const updated = applyPlayerMessageToSnapshot(snapshot(), {
      type: "PLAYER_UPDATE",
      economyBreakdown: { base: 10 },
      upkeepPerMinute: { food: 1, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      upkeepLastTick: { food: 1 }
    });

    expect(updated.player?.economyBreakdown).toEqual({ base: 10 });
    expect(updated.player?.upkeepPerMinute).toEqual({ food: 1, titanium: 0, umbrite: 0, crystal: 0, gold: 0 });
    expect(updated.player?.upkeepLastTick).toEqual({ food: 1 });
  });

  it("merges eventLog and logisticsThroughputPerMinute from a PLAYER_UPDATE into the cached snapshot", () => {
    // Regression found while writing the exhaustive manifest: emitPlayerStateUpdate
    // (apps/simulation/src/runtime-player-state-update.ts) puts eventLog and
    // logisticsThroughputPerMinute on every PLAYER_UPDATE it sends, but
    // neither old copy of this merge ever handled either field -- same
    // silent-drop shape as devQueue/waypointQueue before it, just never
    // reported because nothing user-visible depended on eventLog surviving a
    // cache-served reconnect until now.
    const updated = applyPlayerMessageToSnapshot(snapshot(), {
      type: "PLAYER_UPDATE",
      eventLog: [{ id: "evt-1", type: "ATTACKED", text: "You were attacked", occurredAt: 1000 }],
      logisticsThroughputPerMinute: 42
    });

    expect(updated.player?.eventLog).toEqual([{ id: "evt-1", type: "ATTACKED", text: "You were attacked", occurredAt: 1000 }]);
    expect(updated.player?.logisticsThroughputPerMinute).toBe(42);
  });

  it("merges seasonWinner from a GLOBAL_STATUS_UPDATE into the cached snapshot", () => {
    const seasonWinner = {
      playerId: "player-1",
      playerName: "Player One",
      crownedAt: 1000,
      objectiveId: "ECONOMIC_HEGEMONY",
      objectiveName: "Economic Hegemony"
    };
    const updated = applyPlayerMessageToSnapshot(snapshot(), {
      type: "GLOBAL_STATUS_UPDATE",
      seasonWinner
    });

    expect(updated.worldStatus?.seasonWinner).toEqual(seasonWinner);
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

  it("does not merge a queue field pushed via TECH_UPDATE (out of scope for that event)", () => {
    // devQueue/waypointQueue only ever arrive on PLAYER_UPDATE; confirms the
    // TECH_UPDATE/DOMAIN_UPDATE branch's narrower field set doesn't
    // accidentally widen to cover everything PLAYER_UPDATE covers.
    const updated = applyPlayerMessageToSnapshot(snapshot(), {
      type: "TECH_UPDATE",
      devQueue: [{ tileKey: "9,9", x: 9, y: 9, kind: "SETTLE", queuedAt: 1 }]
    });

    expect(updated.player?.devQueue).toBeUndefined();
  });

  it("returns the snapshot unchanged for an unrecognized message type", () => {
    const original = snapshot();
    expect(applyPlayerMessageToSnapshot(original, { type: "SOMETHING_ELSE" })).toBe(original);
  });
});
