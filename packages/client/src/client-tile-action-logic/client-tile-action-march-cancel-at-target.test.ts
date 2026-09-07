/**
 * Regression test: a "March To…" order used to only expose a cancel action
 * on its origin muster tile's own menu -- the destination tile it was
 * marching toward showed nothing, unlike a waypoint's destination which
 * offers "cancel_waypoint". menuActionsForSingleTile now appends
 * "muster_march_cancel" to *any* tile that is the live target of one of the
 * player's own MARCH flags, mirroring that waypoint pattern.
 */
import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "./client-tile-action-logic.js";
import type { Tile, TileActionDef } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const baseDeps = {
  keyFor,
  parseKey: (k: string) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  },
  wrapX: (x: number) => x,
  wrapY: (y: number) => y,
  terrainAt: () => "LAND" as const,
  chebyshevDistanceClient: () => 0,
  isTileOwnedByAlly: () => false,
  hostileObservatoryProtectingTile: () => undefined,
  abilityCooldownRemainingMs: () => 0,
  formatCooldownShort: () => "",
  pushFeed: () => undefined,
  hideTileActionMenu: () => undefined,
  selectedTile: () => undefined,
  renderHud: () => undefined,
  requireAuthedSession: () => true,
  ws: { readyState: 1, send: () => undefined },
  attackPreviewDetailForTarget: () => undefined,
  attackPreviewPendingForTarget: () => false,
  attackPreviewManpowerCostForTarget: () => undefined,
  pickOriginForTarget: () => ({ x: 0, y: 0 }),
  buildDetailTextForAction: () => undefined,
  developmentSlotSummary: () => ({ used: 0, limit: 3, available: 3, busy: 0 }),
  developmentSlotReason: () => "",
  structureGoldCost: () => 0,
  structureCostText: () => "",
  supportedOwnedTownsForTile: () => [],
  supportedOwnedDocksForTile: () => [],
  townHasSupportStructure: () => false,
  activeTruceWithPlayer: () => undefined,
  pendingTruceWithPlayer: () => undefined,
  ownerSpawnShieldActive: () => false,
  connectedOwnedFrontierKeysFor: () => []
} as const;

const findAction = (actions: TileActionDef[], id: TileActionDef["id"]): TileActionDef | undefined =>
  actions.find((action) => action.id === id);

describe("March-To cancel at the destination tile", () => {
  it("offers muster_march_cancel on an enemy-owned target tile of an own MARCH flag", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set(keyFor(0, 0), {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      muster: { ownerId: "me", amount: 20, mode: "MARCH", targetX: 3, targetY: 3, updatedAt: 0 }
    } as Tile);
    const target: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "rival" };
    state.tiles.set(keyFor(3, 3), target);

    const actions = menuActionsForSingleTile(state, target, baseDeps as never);
    expect(findAction(actions, "muster_march_cancel")).toBeDefined();
  });

  it("does not add a duplicate when the selected tile is the origin flag itself", () => {
    const state = createInitialState();
    state.me = "me";
    const origin: Tile = {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      muster: { ownerId: "me", amount: 20, mode: "MARCH", targetX: 3, targetY: 3, updatedAt: 0 }
    };
    state.tiles.set(keyFor(0, 0), origin);

    const actions = menuActionsForSingleTile(state, origin, baseDeps as never);
    expect(actions.filter((a) => a.id === "muster_march_cancel")).toHaveLength(1);
  });

  it("adds nothing when no own march is targeting the tile", () => {
    const state = createInitialState();
    state.me = "me";
    const target: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "rival" };
    state.tiles.set(keyFor(3, 3), target);

    const actions = menuActionsForSingleTile(state, target, baseDeps as never);
    expect(findAction(actions, "muster_march_cancel")).toBeUndefined();
  });

  it("offers a separate Cancel March action for each flag when two share a destination", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set(keyFor(0, 0), {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      muster: { ownerId: "me", amount: 20, mode: "MARCH", targetX: 3, targetY: 3, updatedAt: 0 }
    } as Tile);
    state.tiles.set(keyFor(1, 1), {
      x: 1,
      y: 1,
      terrain: "LAND",
      ownerId: "me",
      muster: { ownerId: "me", amount: 20, mode: "MARCH", targetX: 3, targetY: 3, updatedAt: 0 }
    } as Tile);
    const target: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "rival" };
    state.tiles.set(keyFor(3, 3), target);

    const actions = menuActionsForSingleTile(state, target, baseDeps as never);
    const cancelActions = actions.filter((a) => a.id === "muster_march_cancel" || a.id === "muster_march_cancel_2");
    expect(cancelActions).toHaveLength(2);
    expect(cancelActions.map((a) => a.detail)).toEqual([
      "Marching here from (0, 0) · switch that flag back to HOLD.",
      "Marching here from (1, 1) · switch that flag back to HOLD."
    ]);
  });

  // Regression: a tile can simultaneously be one flag's origin (its own
  // outgoing march) and another flag's destination (an incoming march) --
  // e.g. (5,5)->(9,9) and (2,2)->(5,5). menuActionsForSingleTile must offer
  // a cancel action for *both*, not silently drop the incoming one because
  // its assigned slot collided with the outgoing march's own action.
  it("offers cancel actions for both an outgoing march and an incoming one sharing the same tile", () => {
    const state = createInitialState();
    state.me = "me";
    state.tiles.set(keyFor(2, 2), {
      x: 2,
      y: 2,
      terrain: "LAND",
      ownerId: "me",
      muster: { ownerId: "me", amount: 20, mode: "MARCH", targetX: 5, targetY: 5, updatedAt: 0 }
    } as Tile);
    const busyTile: Tile = {
      x: 5,
      y: 5,
      terrain: "LAND",
      ownerId: "me",
      muster: { ownerId: "me", amount: 20, mode: "MARCH", targetX: 9, targetY: 9, updatedAt: 0 }
    };
    state.tiles.set(keyFor(5, 5), busyTile);

    const actions = menuActionsForSingleTile(state, busyTile, baseDeps as never);
    // "muster_march_cancel" is (5,5)'s own outgoing march, added by
    // buildMusterActions (client-muster-tile-actions.ts) with its own
    // "Marching toward (target)" wording; "muster_march_cancel_2" is the
    // incoming march from (2,2), added by appendMarchCancelAction.
    expect(actions.find((a) => a.id === "muster_march_cancel")?.detail).toBe("Marching toward (9, 9). (20/15 staged) · switch back to HOLD.");
    expect(actions.find((a) => a.id === "muster_march_cancel_2")?.detail).toBe(
      "Marching here from (2, 2) · switch that flag back to HOLD."
    );
  });
});
