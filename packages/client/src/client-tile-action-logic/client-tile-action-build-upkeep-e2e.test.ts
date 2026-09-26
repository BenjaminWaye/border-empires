// End-to-end trace of the build-menu Upkeep segment through the real
// menuActionsForSingleTile pipeline, matching the exact cases called out in
// the "show building upkeep" task's own verification steps: Farmstead has no
// upkeep line, Titanium Works shows its TITANIUM slot + real gold/day drain,
// and a player's Nth Observatory shows its real progressive CRYSTAL cost
// instead of a flat 1.
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
  structureCostText: () => "0 gold",
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

const richState = (): ReturnType<typeof createInitialState> => {
  const state = createInitialState();
  state.me = "me";
  state.gold = 10_000;
  state.manpower = 10_000;
  state.techIds = ["agriculture", "mining", "alchemy", "crystal-lattices"];
  return state;
};

describe("build-menu Upkeep segment — end-to-end verification cases", () => {
  it("Farmstead shows no Upkeep segment at all", () => {
    const state = richState();
    const tile: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "FARM" } as Tile;
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const build = findAction(actions, "build_farmstead");
    expect(build?.cost).toBeDefined();
    expect(build?.cost).not.toContain("Upkeep");
  });

  it("Mine shows its real FOOD-slot upkeep", () => {
    const state = richState();
    const tile: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", resource: "TITANIUM" } as Tile;
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const build = findAction(actions, "build_mine");
    expect(build?.cost).toContain("Upkeep: 1 FOOD slot");
  });

  it("Titanium Works shows both its TITANIUM slot and its real gold/day drain", () => {
    const state = richState();
    const tile: Tile = {
      x: 3,
      y: 3,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: { name: "Capital", type: "FARMING", populationTier: "TOWN" }
    } as Tile;
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const build = findAction(actions, "build_titanium_works");
    expect(build?.cost).toContain("Upkeep: 1 TITANIUM slot · 30 gold/day");
  });

  it("Airport shows its real 3 CRYSTAL slots as Upkeep, not a fabricated crystal/day drain", () => {
    const state = richState();
    const tile: Tile = {
      x: 3,
      y: 3,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      town: { name: "Capital", type: "FARMING", populationTier: "TOWN" }
    } as Tile;
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const build = findAction(actions, "build_airport");
    expect(build?.cost).toContain("Upkeep: 3 CRYSTAL slots");
    expect(build?.cost).not.toContain("crystal/day");
  });

  it("a player's 3rd Observatory shows Upkeep: 3 CRYSTAL slots, not a flat 1", () => {
    const state = richState();
    // Two already-owned, active Observatories elsewhere in the empire.
    state.tiles.set(keyFor(0, 0), { x: 0, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", observatory: { ownerId: "me", status: "active" } } as Tile);
    state.tiles.set(keyFor(1, 0), { x: 1, y: 0, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", observatory: { ownerId: "me", status: "active" } } as Tile);
    const tile: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    state.tiles.set(keyFor(3, 3), tile);

    const actions = menuActionsForSingleTile(state, tile, baseDeps as never);
    const build = findAction(actions, "build_observatory");
    expect(build?.cost).toContain("Upkeep: 3 CRYSTAL slots");
  });

  it("Relay Beacon's first copy shows no Upkeep segment (server-side waiver), the 6th does", () => {
    const state = richState();
    const tile: Tile = { x: 3, y: 3, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
    state.tiles.set(keyFor(3, 3), tile);
    const firstActions = menuActionsForSingleTile(state, tile, baseDeps as never);
    expect(findAction(firstActions, "build_relay_beacon")?.cost).not.toContain("Upkeep");

    for (let i = 0; i < 5; i += 1) {
      state.tiles.set(keyFor(10 + i, 0), {
        x: 10 + i,
        y: 0,
        terrain: "LAND",
        ownerId: "me",
        ownershipState: "SETTLED",
        economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
      } as Tile);
    }
    const laterActions = menuActionsForSingleTile(state, tile, baseDeps as never);
    expect(findAction(laterActions, "build_relay_beacon")?.cost).toContain("Upkeep: 1 FOOD slot");
  });
});
