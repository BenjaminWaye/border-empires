import { describe, expect, it } from "vitest";
import { createReachChangedTilesDirtyState, markChangedReachTilesDirty } from "./runtime-reach-contested-tiles.js";

/**
 * Regression coverage for the changed-reach-tile TILE_DELTA_BATCH
 * re-broadcast gap documented on `applyUnsettleDowngrade`
 * (runtime-reach-border-apply.ts): pure reach-border movement only pushed a
 * REACH_UPDATE tile-key list to the ONE player whose own reach changed,
 * leaving every other viewer's cached `reachOwnerId` stale for tiles they
 * can see. Per explicit product decision, ANY reach-owner diff between
 * client and server is treated as detrimental to gameplay, so every changed
 * tile is re-broadcast -- including interior flips with no rival nearby.
 * (An earlier version of this module narrowed the re-broadcast to
 * border-adjacent/contested tiles only; that filter has been removed.)
 */
describe("markChangedReachTilesDirty", () => {
  it("DOES mark an interior reach flip with no rival anywhere nearby", () => {
    const state = createReachChangedTilesDirtyState();
    // A tile deep inside player-1's empire is newly granted to player-1
    // (e.g. a second anchor now also covers it) -- no rival is anywhere near
    // this change, but the widened scope still broadcasts it.
    const oldBorder = new Map<string, string>(); // previously unclaimed border slot
    const newBorder = new Map([["10,10", "player-1"]]);

    markChangedReachTilesDirty(state, oldBorder, newBorder);

    expect(state.dirtyChangedTileKeys.has("10,10")).toBe(true);
  });

  it("DOES mark a reach flip adjacent to a rival-owned tile", () => {
    const state = createReachChangedTilesDirtyState();
    const oldBorder = new Map([["10,10", "player-1"]]);
    const newBorder = new Map([["10,10", "player-2"]]);

    markChangedReachTilesDirty(state, oldBorder, newBorder);

    expect(state.dirtyChangedTileKeys.has("10,10")).toBe(true);
  });

  it("marks only the tile whose own owner changed, not an unchanged neighbor", () => {
    const state = createReachChangedTilesDirtyState();
    const oldBorder = new Map([
      ["10,10", "player-1"],
      ["9,10", "player-2"]
    ]);
    const newBorder = new Map([
      ["10,10", "player-1b"],
      ["9,10", "player-2"] // unchanged neighbor
    ]);

    markChangedReachTilesDirty(state, oldBorder, newBorder);

    expect(state.dirtyChangedTileKeys.has("10,10")).toBe(true);
    expect(state.dirtyChangedTileKeys.has("9,10")).toBe(false);
  });

  it("marks a vacated tile (removed from the new border)", () => {
    const state = createReachChangedTilesDirtyState();
    const oldBorder = new Map([["10,10", "player-1"]]);
    const newBorder = new Map<string, string>(); // vacated entirely

    markChangedReachTilesDirty(state, oldBorder, newBorder);

    expect(state.dirtyChangedTileKeys.has("10,10")).toBe(true);
  });

  it("does not mark a tile whose owner is unchanged", () => {
    const state = createReachChangedTilesDirtyState();
    const oldBorder = new Map([["10,10", "player-1"]]);
    const newBorder = new Map([["10,10", "player-1"]]);

    markChangedReachTilesDirty(state, oldBorder, newBorder);

    expect(state.dirtyChangedTileKeys.size).toBe(0);
  });

  it("is a no-op when the border map reference is unchanged", () => {
    const state = createReachChangedTilesDirtyState();
    const border = new Map([["10,10", "player-1"]]);
    markChangedReachTilesDirty(state, border, border);
    expect(state.dirtyChangedTileKeys.size).toBe(0);
  });
});
