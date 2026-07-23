import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { refreshEconomyCachesForTileChange } from "./runtime-tile-index-maintenance.js";
import { createTownConnectivityState } from "./economy-network/town-connectivity-incremental.js";
import type { RuntimePlayer } from "./runtime-types.js";

/**
 * Transition table for the corridor union-find maintained by
 * refreshEconomyCachesForTileChange. Only CORRIDOR tiles (owned + SETTLED +
 * LAND, not a TOWN-tier-or-higher town) live in the structure — real towns are
 * connectivity barriers re-attached at read time. So gaining a corridor tile
 * is a cheap union, and losing one (captured, unsettled, OR built up into a
 * real town) must mark the structure dirty for a full rebuild.
 */

const buildInput = () => ({
  players: new Map<string, RuntimePlayer>(),
  economySnapshotCacheByPlayer: new Map(),
  tileYieldContextCacheByPlayer: new Map(),
  townNetworkCacheByPlayer: new Map(),
  townConnectivityStateByPlayer: new Map(),
  defensibilityMetricsCacheByPlayer: new Map(),
  upkeepAccrualCacheByPlayer: new Map()
});

const cleanStateFor = (input: ReturnType<typeof buildInput>, playerId: string, seededKeys: string[] = []) => {
  const state = createTownConnectivityState();
  state.dirty = false;
  for (const key of seededKeys) state.parent.set(key, key);
  input.townConnectivityStateByPlayer.set(playerId, state);
  return state;
};

const corridor = (ownerId: string): DomainTileState =>
  ({ x: 5, y: 5, terrain: "LAND", ownerId, ownershipState: "SETTLED" });

const settlement = (ownerId: string): DomainTileState => ({
  x: 5, y: 5, terrain: "LAND", ownerId, ownershipState: "SETTLED",
  town: { name: "Hamlet", type: "FARMING", populationTier: "SETTLEMENT" }
});

const realTown = (ownerId: string): DomainTileState => ({
  x: 5, y: 5, terrain: "LAND", ownerId, ownershipState: "SETTLED",
  town: { name: "Alpha", type: "FARMING", populationTier: "TOWN" }
});

describe("refreshEconomyCachesForTileChange — corridor connectivity maintenance", () => {
  it("incrementally adds a newly-settled corridor tile without dirtying", () => {
    const input = buildInput();
    const state = cleanStateFor(input, "player-1");

    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous: undefined, next: corridor("player-1"), ...input });

    expect(state.dirty).toBe(false);
    expect(state.parent.has("5,5")).toBe(true);
  });

  it("treats a SETTLEMENT-tier town as a corridor tile (added, not dirtied)", () => {
    const input = buildInput();
    const state = cleanStateFor(input, "player-1");

    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous: undefined, next: settlement("player-1"), ...input });

    expect(state.dirty).toBe(false);
    expect(state.parent.has("5,5")).toBe(true);
  });

  it("does NOT add a real town to the corridor structure", () => {
    const input = buildInput();
    const state = cleanStateFor(input, "player-1");

    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous: undefined, next: realTown("player-1"), ...input });

    expect(state.dirty).toBe(false);
    expect(state.parent.has("5,5")).toBe(false);
  });

  it("dirties when a corridor tile is captured away from its owner", () => {
    const input = buildInput();
    const state = cleanStateFor(input, "player-1", ["5,5"]);

    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous: corridor("player-1"), next: corridor("player-2"), ...input });

    expect(state.dirty).toBe(true);
  });

  it("dirties when a corridor tile becomes unsettled", () => {
    const input = buildInput();
    const state = cleanStateFor(input, "player-1", ["5,5"]);
    const next: DomainTileState = { x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" };

    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous: corridor("player-1"), next, ...input });

    expect(state.dirty).toBe(true);
  });

  it("dirties when a corridor tile is built up into a real town (leaves the corridor graph)", () => {
    const input = buildInput();
    const state = cleanStateFor(input, "player-1", ["5,5"]);

    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous: corridor("player-1"), next: realTown("player-1"), ...input });

    expect(state.dirty).toBe(true);
  });

  it("dirties when a settlement is upgraded to a real town", () => {
    const input = buildInput();
    const state = cleanStateFor(input, "player-1", ["5,5"]);

    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous: settlement("player-1"), next: realTown("player-1"), ...input });

    expect(state.dirty).toBe(true);
  });

  it("adds without dirtying when a real town is razed back down to plain corridor land", () => {
    const input = buildInput();
    const state = cleanStateFor(input, "player-1");

    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous: realTown("player-1"), next: corridor("player-1"), ...input });

    expect(state.dirty).toBe(false);
    expect(state.parent.has("5,5")).toBe(true);
  });

  it("leaves the structure untouched for a content-only update to an existing corridor tile", () => {
    const input = buildInput();
    const state = cleanStateFor(input, "player-1", ["5,5"]);
    const next: DomainTileState = { ...corridor("player-1"), resource: "FARM" };

    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous: corridor("player-1"), next, ...input });

    expect(state.dirty).toBe(false);
    expect(state.parent.get("5,5")).toBe("5,5");
  });
});
