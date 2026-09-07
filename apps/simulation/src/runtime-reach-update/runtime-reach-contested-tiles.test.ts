import { describe, expect, it } from "vitest";
import { createReachContestedDirtyState, markContestedReachTilesDirty } from "./runtime-reach-contested-tiles.js";

/**
 * Regression coverage for the contested-border TILE_DELTA_BATCH re-broadcast
 * gap documented on `applyUnsettleDowngrade` (runtime-reach-border-apply.ts):
 * pure reach-border movement only pushed a REACH_UPDATE tile-key list to the
 * ONE player whose own reach changed, leaving every other viewer's cached
 * `reachOwnerId` stale for tiles they can see. This module narrows the
 * re-broadcast to tiles actually touching a rival, per the confirmed scope
 * cut (interior reach flips deep inside one empire are never broadcast).
 */
describe("markContestedReachTilesDirty", () => {
  it("does NOT mark an interior reach flip with no rival nearby", () => {
    const state = createReachContestedDirtyState();
    // A tile deep inside player-1's empire is newly granted to player-1
    // (e.g. a second anchor now also covers it) -- every 8-directional
    // neighbor, and the tile's own actual ownership, already belong to
    // player-1 too, so there is no rival anywhere near this change.
    const oldBorder = new Map<string, string>(); // previously unclaimed border slot
    const newBorder = new Map([["10,10", "player-1"]]);
    const actualOwnerAt = (tileKey: string): string | undefined => {
      const neighborhood = new Set(["10,10", "9,9", "10,9", "11,9", "9,10", "11,10", "9,11", "10,11", "11,11"]);
      return neighborhood.has(tileKey) ? "player-1" : undefined;
    };

    markContestedReachTilesDirty(state, oldBorder, newBorder, actualOwnerAt);

    expect(state.dirtyContestedTileKeys.size).toBe(0);
  });

  it("DOES mark a reach flip adjacent to a rival-owned tile", () => {
    const state = createReachContestedDirtyState();
    const oldBorder = new Map([["10,10", "player-1"]]);
    const newBorder = new Map([["10,10", "player-2"]]);
    // A neighbor tile is actually owned by player-1 -- rival to the new reach owner.
    const actualOwnerAt = (tileKey: string): string | undefined => (tileKey === "9,10" ? "player-1" : undefined);

    markContestedReachTilesDirty(state, oldBorder, newBorder, actualOwnerAt);

    expect(state.dirtyContestedTileKeys.has("10,10")).toBe(true);
  });

  it("DOES mark a reach flip where the changed tile itself is rival-owned", () => {
    const state = createReachContestedDirtyState();
    const oldBorder = new Map([["10,10", "player-1"]]);
    const newBorder = new Map([["10,10", "player-2"]]);
    const actualOwnerAt = (tileKey: string): string | undefined => (tileKey === "10,10" ? "player-1" : undefined);

    markContestedReachTilesDirty(state, oldBorder, newBorder, actualOwnerAt);

    expect(state.dirtyContestedTileKeys.has("10,10")).toBe(true);
  });

  it("DOES mark a reach flip adjacent to a differently-owned NEW border tile even with no actual tile ownership yet", () => {
    const state = createReachContestedDirtyState();
    const oldBorder = new Map([
      ["10,10", "player-1"],
      ["9,10", "player-2"]
    ]);
    const newBorder = new Map([
      ["10,10", "player-1b"],
      ["9,10", "player-2"] // unchanged neighbor, still a different reach owner
    ]);
    const actualOwnerAt = (): string | undefined => undefined;

    markContestedReachTilesDirty(state, oldBorder, newBorder, actualOwnerAt);

    expect(state.dirtyContestedTileKeys.has("10,10")).toBe(true);
    // The unchanged neighbor itself never gets flagged -- only tiles whose OWN
    // owner actually changed are candidates in the first place.
    expect(state.dirtyContestedTileKeys.has("9,10")).toBe(false);
  });

  it("marks a vacated tile (removed from the new border) using its neighbors", () => {
    const state = createReachContestedDirtyState();
    const oldBorder = new Map([["10,10", "player-1"]]);
    const newBorder = new Map<string, string>(); // vacated entirely
    const actualOwnerAt = (tileKey: string): string | undefined => (tileKey === "9,10" ? "player-2" : undefined);

    markContestedReachTilesDirty(state, oldBorder, newBorder, actualOwnerAt);

    expect(state.dirtyContestedTileKeys.has("10,10")).toBe(true);
  });

  it("is a no-op when the border map reference is unchanged", () => {
    const state = createReachContestedDirtyState();
    const border = new Map([["10,10", "player-1"]]);
    markContestedReachTilesDirty(state, border, border, () => "player-2");
    expect(state.dirtyContestedTileKeys.size).toBe(0);
  });
});
