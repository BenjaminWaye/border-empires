import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";

import { refreshEconomyCachesForTileChange } from "./runtime-tile-index-maintenance.js";
import { createTownConnectivityState } from "./economy-network/town-connectivity-incremental.js";
import type { RuntimePlayer } from "./runtime-types.js";

const buildInput = () => ({
  players: new Map<string, RuntimePlayer>(),
  economySnapshotCacheByPlayer: new Map(),
  tileYieldContextCacheByPlayer: new Map(),
  townNetworkCacheByPlayer: new Map(),
  townConnectivityStateByPlayer: new Map(),
  defensibilityMetricsCacheByPlayer: new Map(),
  upkeepAccrualCacheByPlayer: new Map()
});

describe("refreshEconomyCachesForTileChange — town connectivity incremental wiring", () => {
  it("incrementally adds a newly-settled owned LAND tile without marking the structure dirty", () => {
    const input = buildInput();
    const state = createTownConnectivityState();
    state.dirty = false;
    input.townConnectivityStateByPlayer.set("player-1", state);

    const next: DomainTileState = { x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" };
    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous: undefined, next, ...input });

    expect(state.dirty).toBe(false);
    expect(state.parent.has("5,5")).toBe(true);
  });

  it("marks the structure dirty when a tracked tile is captured away from its owner", () => {
    const input = buildInput();
    const state = createTownConnectivityState();
    state.dirty = false;
    state.parent.set("5,5", "5,5");
    input.townConnectivityStateByPlayer.set("player-1", state);

    const previous: DomainTileState = { x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" };
    const next: DomainTileState = { x: 5, y: 5, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" };
    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous, next, ...input });

    expect(state.dirty).toBe(true);
  });

  it("marks the structure dirty when a tracked tile becomes unsettled (abandoned)", () => {
    const input = buildInput();
    const state = createTownConnectivityState();
    state.dirty = false;
    state.parent.set("5,5", "5,5");
    input.townConnectivityStateByPlayer.set("player-1", state);

    const previous: DomainTileState = { x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" };
    const next: DomainTileState = { x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" };
    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous, next, ...input });

    expect(state.dirty).toBe(true);
  });

  it("does not touch connectivity state for a content-only update to an already-tracked tile", () => {
    const input = buildInput();
    const state = createTownConnectivityState();
    state.dirty = false;
    state.parent.set("5,5", "5,5");
    input.townConnectivityStateByPlayer.set("player-1", state);

    const previous: DomainTileState = { x: 5, y: 5, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" };
    const next: DomainTileState = {
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      town: { name: "Alpha", type: "FARMING", populationTier: "TOWN" }
    };
    refreshEconomyCachesForTileChange({ tileKey: "5,5", previous, next, ...input });

    expect(state.dirty).toBe(false);
    expect(state.parent.get("5,5")).toBe("5,5");
  });
});
