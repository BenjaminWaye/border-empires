import { describe, expect, it } from "vitest";
import { canPlaceAetherWallFromOrigin, menuActionsForSingleTile, validAetherWallDirectionsForTile } from "./client-tile-action-logic.js";
import { createInitialState } from "./client-state.js";
import type { Tile } from "./client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("aether wall targeting", () => {
  it("finds a single valid facing from a settled border tile and allows a 3-edge span", () => {
    const state = createInitialState();
    state.me = "me";
    const origin: Tile = { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };
    state.tiles.set(keyFor(10, 10), origin);
    state.tiles.set(keyFor(11, 10), { x: 11, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
    state.tiles.set(keyFor(12, 10), { x: 12, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" });
    state.tiles.set(keyFor(10, 9), { x: 10, y: 9, terrain: "LAND" });
    state.tiles.set(keyFor(11, 9), { x: 11, y: 9, terrain: "LAND" });
    state.tiles.set(keyFor(12, 9), { x: 12, y: 9, terrain: "LAND" });

    const deps = {
      wrapX: (x: number) => x,
      wrapY: (y: number) => y,
      keyFor,
      terrainAt: (_x: number, _y: number) => "LAND" as const,
      hasOwnedObservatoryInRange: () => true
    };

    expect(validAetherWallDirectionsForTile(state, origin, deps)).toEqual(["N"]);
    expect(canPlaceAetherWallFromOrigin(state, 10, 10, "N", 3, deps)).toBe(true);
    expect(canPlaceAetherWallFromOrigin(state, 10, 10, "S", 1, deps)).toBe(false);
  });

  it("shows aether wall on owned tiles when localhost override is active", () => {
    const state = createInitialState();
    state.me = "me";
    state.localhostDevAetherWall = true;
    const tile: Tile = { x: 20, y: 20, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };

    const actions = menuActionsForSingleTile(state, tile, {
      keyFor,
      wrapX: (x: number) => x,
      wrapY: (y: number) => y,
      terrainAt: (_x: number, _y: number) => "LAND" as const,
      pickOriginForTarget: () => undefined,
      tilePopulationTier: () => undefined,
      buildDetailTextForAction: () => undefined,
      developmentSlotSummary: () => ({ used: 0, limit: 3, available: 3, busy: 0 }),
      supportedOwnedTownsForTile: () => [],
      supportedOwnedDocksForTile: () => [],
      townHasSupportStructure: () => false,
      attackPreviewDetailForTarget: () => undefined,
      attackPreviewPendingForTarget: () => false,
      hostileObservatoryProtectingTile: () => undefined,
      hasOwnedObservatoryInRange: () => true,
      ownerSpawnShieldActive: () => false,
      isTileOwnedByAlly: () => false,
      structureGoldCost: () => 0,
      structureCostText: () => "",
      formatCooldownShort: () => "",
      abilityCooldownRemainingMs: () => 0,
      chebyshevDistanceClient: () => 0,
      activeTruceWithPlayer: () => undefined
    } as never);

    expect(actions.some((action) => action.id === "aether_wall")).toBe(true);
  });

  it("rejects aether wall targeting when no owned observatory can reach the tile", () => {
    const state = createInitialState();
    state.me = "me";
    const origin: Tile = { x: 10, y: 10, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" };

    const deps = {
      wrapX: (x: number) => x,
      wrapY: (y: number) => y,
      keyFor,
      terrainAt: (_x: number, _y: number) => "LAND" as const,
      hasOwnedObservatoryInRange: () => false
    };

    expect(validAetherWallDirectionsForTile(state, origin, deps)).toEqual([]);
  });
});
