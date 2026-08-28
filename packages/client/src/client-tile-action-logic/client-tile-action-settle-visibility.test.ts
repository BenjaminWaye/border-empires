/**
 * Regression test for Settle Land / Settle Connected always showing on an
 * owned FRONTIER tile.
 *
 * Previously these actions were hidden until the player had an established
 * economy (a settled town + a settled food tile). That gate hid Settle Land
 * during the exact early-game window players expect it, and was
 * inconsistent with "Expand To" / "Build Relay Beacon", which already show
 * unconditionally on a neutral tile. This asserts settle_land is present on
 * a FRONTIER tile from the very first tile owned, with no town or food tile
 * anywhere yet.
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

const frontierTile: Tile = { x: 1, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" } as Tile;

describe("Settle Land / Settle Connected visibility", () => {
  it("shows settle_land on an owned FRONTIER tile with no town or food tile settled anywhere", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    state.tiles.set(keyFor(1, 0), frontierTile);

    const actions = menuActionsForSingleTile(state, frontierTile, baseDeps as never);
    expect(findAction(actions, "settle_land")).toBeDefined();
  });

  it("shows settle_land at the bottom of the actions list once the economy is established", () => {
    const state = createInitialState();
    state.me = "me";
    state.gold = 10_000;
    state.manpower = 10_000;
    state.tiles.set(keyFor(0, 0), {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: { name: "Capital", type: "FARMING", populationTier: "SETTLEMENT" }
    } as Tile);
    state.tiles.set(keyFor(2, 0), { x: 2, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as Tile);
    state.tiles.set(keyFor(1, 0), frontierTile);

    const actions = menuActionsForSingleTile(state, frontierTile, baseDeps as never);
    const settleIndex = actions.findIndex((a) => a.id === "settle_land");
    expect(settleIndex).toBeGreaterThanOrEqual(0);
    // Settle Land is pushed after every other build/muster/ability action for
    // the tile -- only a handful of always-on trailing actions (retort recast,
    // crystal core, create-mountain, abandon-territory) come after it.
    expect(actions.length - settleIndex).toBeLessThanOrEqual(4);
  });
});
