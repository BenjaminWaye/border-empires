import { describe, expect, it } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { menuActionsForSingleTile } from "./client-tile-action-logic.js";
import { computeCrystalTargets } from "./client-crystal-targeting.js";
import type { Tile, TileActionDef } from "../client-types.js";

// Regression coverage for the Aether Bridge coastal-land check reading real
// synced tile terrain instead of the procedural terrainAt() guess.
// terrainAt() recomputes terrain purely from the world seed, with no
// knowledge of server-side overrides (dock/channel carving, player-made
// mountains, connectivity fixes) -- exactly the kind of edit that clusters
// around coastlines. A tile whose neighbor is only "coastal" because of such
// an override must still be recognized, even though terrainAt() alone would
// say every neighbor is LAND.

const keyFor = (x: number, y: number): string => `${x},${y}`;

const baseDeps = {
  keyFor,
  parseKey: (k: string) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  },
  wrapX: (x: number) => x,
  wrapY: (y: number) => y,
  terrainAt: () => "LAND" as const, // procedural guess always disagrees with the carved channel below
  chebyshevDistanceClient: (ax: number, ay: number, bx: number, by: number) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)),
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

const findAction = (actions: TileActionDef[], id: TileActionDef["id"]): TileActionDef | undefined => actions.find((action) => action.id === id);

const stateWithNavigation = (): ReturnType<typeof createInitialState> => {
  const state = createInitialState();
  state.me = "me";
  state.techIds = ["navigation"];
  return state;
};

describe("Aether Bridge coastal check uses real synced tile terrain", () => {
  it("enables casting on a tile whose only sea neighbor is a synced override the procedural terrainAt() doesn't know about", () => {
    const state = stateWithNavigation();
    const obsTile: Tile = {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(0, 0), obsTile);
    const targetTile: Tile = { x: 5, y: 5, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(5, 5), targetTile);
    // A dock/channel-carved SEA tile diagonally adjacent -- terrainAt() (the
    // procedural fallback in baseDeps above) says "LAND" for every
    // coordinate, so only reading the real synced tile catches this.
    state.tiles.set(keyFor(6, 6), { x: 6, y: 6, terrain: "SEA" } as Tile);

    const actions = menuActionsForSingleTile(state, targetTile, baseDeps as never);
    const bridge = findAction(actions, "aether_bridge");
    expect(bridge).toBeDefined();
    expect(bridge?.disabled).not.toBe(true);

    const { validTargets } = computeCrystalTargets(state, "aether_bridge", { ...baseDeps, selectedTile: () => undefined });
    expect(validTargets.has(keyFor(5, 5))).toBe(true);
  });

  it("keeps casting disabled when no real neighbor tile is sea, even though it's otherwise a plausible target", () => {
    const state = stateWithNavigation();
    const obsTile: Tile = {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(0, 0), obsTile);
    const targetTile: Tile = { x: 5, y: 5, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(5, 5), targetTile);

    const actions = menuActionsForSingleTile(state, targetTile, baseDeps as never);
    const bridge = findAction(actions, "aether_bridge");
    expect(bridge).toMatchObject({ disabled: true, disabledReason: "Target must be coastal land" });
  });

  it("wraps neighbor coordinates before the synced-tile lookup, so a target on the world seam still finds its wrapped-around sea neighbor", () => {
    const WORLD_WIDTH = 10;
    const wrappedDeps = { ...baseDeps, wrapX: (x: number) => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH };
    const state = stateWithNavigation();
    const obsTile: Tile = {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      observatory: { ownerId: "me", status: "active" }
    } as Tile;
    state.tiles.set(keyFor(0, 0), obsTile);
    // Target sits at the world's east edge (x = WORLD_WIDTH - 1); its
    // diagonal neighbor at unwrapped x = WORLD_WIDTH wraps to x = 0.
    const targetTile: Tile = { x: WORLD_WIDTH - 1, y: 5, terrain: "LAND" } as Tile;
    state.tiles.set(keyFor(WORLD_WIDTH - 1, 5), targetTile);
    state.tiles.set(keyFor(0, 6), { x: 0, y: 6, terrain: "SEA" } as Tile);

    const actions = menuActionsForSingleTile(state, targetTile, wrappedDeps as never);
    const bridge = findAction(actions, "aether_bridge");
    expect(bridge?.disabled).not.toBe(true);
  });
});
