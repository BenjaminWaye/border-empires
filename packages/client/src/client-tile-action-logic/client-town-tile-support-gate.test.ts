import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "./client-tile-action-logic.js";
import { TOWN_PLOT_NEEDS_GARRISON_REASON, TOWN_PLOTS_TAKEN_REASON } from "./client-town-tile-support-gate.js";
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
  pickOriginForTarget: () => undefined,
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
  ownerSpawnShieldActive: () => false
} as const;

const findAction = (actions: TileActionDef[], id: TileActionDef["id"]): TileActionDef | undefined =>
  actions.find((action) => action.id === id);

const keyOf = (t: Pick<Tile, "x" | "y">): string => keyFor(t.x, t.y);

const setup = (ringState: Tile["ownershipState"]) => {
  const state = createInitialState();
  state.me = "me";
  state.techIds = ["trade"];
  state.gold = 10_000;
  state.manpower = 1_000;
  state.resourceSlots = { supply: { FOOD: 10, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } } as typeof state.resourceSlots;
  const town = { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { populationTier: "TOWN" } as never } as Tile;
  state.tiles.set(keyOf(town), town);
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (dx === 0 && dy === 0) continue;
    const t = { x: 5 + dx, y: 5 + dy, terrain: "LAND", ownerId: "me", ownershipState: ringState } as Tile;
    state.tiles.set(keyOf(t), t);
  }
  return { state, town };
};

// Playtest day 1 (guide step "Build a Manufactory"): on a town whose ring was not garrisoned yet, the town
// screen listed Build Manufactory as available and showed Place, but Place had no plot to build on and did
// nothing (client-hud-v2-town-runtime.ts returns when townBuildTarget finds none). The row now says why.
describe("support buildings ordered from the town tile", () => {
  it("are disabled with a garrison hint while no support plot is garrisoned", () => {
    const { state, town } = setup("FRONTIER");
    const manufactory = findAction(menuActionsForSingleTile(state, town, baseDeps as never), "build_manufactory");
    expect(manufactory?.disabled).toBe(true);
    expect(manufactory?.disabledReason).toBe(TOWN_PLOT_NEEDS_GARRISON_REASON);
  });

  it("are disabled when every plot already has a building", () => {
    const { state, town } = setup("SETTLED");
    for (const [key, tile] of state.tiles) {
      if (key !== keyOf(town)) state.tiles.set(key, { ...tile, economicStructure: { ownerId: "me", type: "MANUFACTORY", status: "active" } as never });
    }
    const manufactory = findAction(menuActionsForSingleTile(state, town, baseDeps as never), "build_manufactory");
    expect(manufactory?.disabledReason).toBe(TOWN_PLOTS_TAKEN_REASON);
  });

  it("stay available once a support plot is open", () => {
    const { state, town } = setup("SETTLED");
    const manufactory = findAction(menuActionsForSingleTile(state, town, baseDeps as never), "build_manufactory");
    expect(manufactory?.disabled).not.toBe(true);
  });
});
