import { describe, it, expect } from "vitest";
import { createTilesFromInitialState } from "./runtime-hydration.js";
import type { RecoveredSimulationState } from "./event-recovery/event-recovery.js";

const baseTile = {
  x: 1,
  y: 2,
  terrain: "LAND" as const
};

const minimalState = (tiles: RecoveredSimulationState["tiles"]): RecoveredSimulationState => ({
  tiles,
  activeLocks: []
});

describe("createTilesFromInitialState", () => {
  it("hydrates legacy 4-field snapshot shape correctly", () => {
    const fort = { ownerId: "p1", status: "active" as const, variant: "FORT" as const };
    const state = minimalState([{ ...baseTile, ownerId: "p1", ownershipState: "SETTLED" as const, fort }]);
    const result = createTilesFromInitialState(state, new Map(), false);
    const tile = result.get("1,2");
    expect(tile?.fort).toEqual(fort);
    expect(tile?.observatory).toBeUndefined();
    expect(tile?.siegeOutpost).toBeUndefined();
    expect(tile?.economicStructure).toBeUndefined();
  });

  it("hydrates observatory from legacy shape", () => {
    const observatory = { ownerId: "p1", status: "active" as const, cooldownUntil: 0 };
    const state = minimalState([{ ...baseTile, ownerId: "p1", ownershipState: "SETTLED" as const, observatory }]);
    const result = createTilesFromInitialState(state, new Map(), false);
    const tile = result.get("1,2");
    expect(tile?.observatory).toEqual(observatory);
    expect(tile?.fort).toBeUndefined();
  });

  it("hydrates siegeOutpost from legacy shape", () => {
    const siegeOutpost = {
      ownerId: "p1",
      status: "active" as const,
      variant: "SIEGE_OUTPOST" as const
    };
    const state = minimalState([{ ...baseTile, ownerId: "p1", ownershipState: "SETTLED" as const, siegeOutpost }]);
    const result = createTilesFromInitialState(state, new Map(), false);
    const tile = result.get("1,2");
    expect(tile?.siegeOutpost).toEqual(siegeOutpost);
  });

  it("hydrates economicStructure from legacy shape", () => {
    const economicStructure = {
      ownerId: "p1",
      status: "active" as const,
      type: "FARM" as const,
      powered: true
    };
    const state = minimalState([{ ...baseTile, ownerId: "p1", ownershipState: "SETTLED" as const, economicStructure }]);
    const result = createTilesFromInitialState(state, new Map(), false);
    const tile = result.get("1,2");
    expect(tile?.economicStructure).toEqual(economicStructure);
  });

  it("ignores unknown structure field (Phase 3 dormant — Phase 4 unified shape)", () => {
    // A snapshot written by a Phase-4 binary will carry tile.structure in place of
    // the four legacy fields. When loaded here, the legacy fields are still
    // populated (if present) and structure is ignored. This test verifies that a
    // snapshot with BOTH the legacy fields AND a future structure field doesn't
    // crash and that legacy fields take precedence.
    const fort = { ownerId: "p1", status: "active" as const, variant: "FORT" as const };
    const futureTile = {
      ...baseTile,
      ownerId: "p1",
      ownershipState: "SETTLED" as const,
      fort,
      // Simulates Phase 4's unified field — typed as unknown in RecoveredTileState.
      structure: { type: "FORT", kind: "FORT", variant: "FORT", ownerId: "p1", status: "active" }
    };
    const state = minimalState([futureTile]);
    const result = createTilesFromInitialState(state, new Map(), false);
    const tile = result.get("1,2");
    expect(tile?.fort).toEqual(fort);
  });

  it("handles a snapshot with only a structure field (pure Phase 4 snapshot) without crashing", () => {
    // A pure Phase-4 snapshot omits the four legacy fields entirely. In Phase 3,
    // this tile simply has no structure data — acceptable because Phase 3 never
    // ran against prod Phase-4 snapshots (Phase 4 hasn't shipped). This test
    // documents the behaviour so Phase 4 activation is clearly a net-add, not a
    // regression fix.
    const futureTile = {
      ...baseTile,
      ownerId: "p1",
      ownershipState: "SETTLED" as const,
      structure: { type: "FORT", kind: "FORT", variant: "FORT", ownerId: "p1", status: "active" }
    };
    const state = minimalState([futureTile]);
    expect(() => createTilesFromInitialState(state, new Map(), false)).not.toThrow();
    const tile = createTilesFromInitialState(state, new Map(), false).get("1,2");
    expect(tile?.fort).toBeUndefined();
  });

  it("returns seed tiles when no initial state provided", () => {
    const seedTile = { x: 3, y: 4, terrain: "WATER" as const };
    const seedTiles = new Map([["3,4", seedTile]]);
    const result = createTilesFromInitialState(undefined, seedTiles, false);
    expect(result.get("3,4")).toEqual(seedTile);
  });
});
