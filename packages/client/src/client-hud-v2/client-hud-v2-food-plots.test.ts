// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";
import type { HudV2ActionFlow } from "./client-hud-v2-context.js";
import { queueFarmPlots } from "./client-hud-v2-food-plots.js";

const mine = (x: number, y: number, extra: Record<string, unknown> = {}): Tile => ({ x, y, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", ...extra }) as unknown as Tile;

const setup = (taken: string[] = []) => {
  const state = createInitialState();
  state.me = "me";
  const tiles: Tile[] = [mine(10, 10, { town: { type: "MARKET", populationTier: "TOWN", name: "Bryn" } })];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    const key = `${10 + dx},${10 + dy}`;
    if (dx || dy) tiles.push(mine(10 + dx, 10 + dy, taken.includes(key) ? { economicStructure: { type: "MANUFACTORY", ownerId: "me", status: "active" } } : {}));
  }
  state.tiles = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
  // The real build path queues a support-ring order (handleGenericBuildAction); the stub does the same on the menu's tile.
  let menuTile: Tile | undefined;
  const handleTileAction = vi.fn((actionId: string) => {
    if (!menuTile || actionId !== "build_farm_plot") return;
    const tileKey = `${menuTile.x},${menuTile.y}`;
    state.developmentQueue.push({ kind: "BUILD", x: menuTile.x, y: menuTile.y, tileKey, label: "Build Farm Plot", optimisticKind: "FARM_PLOT", payload: { type: "BUILD_STRUCTURE", x: menuTile.x, y: menuTile.y, structureType: "FARM_PLOT" } } as (typeof state.developmentQueue)[number]);
  });
  const actionFlow = {
    openSingleTileActionMenu: vi.fn((tile: Tile) => { menuTile = tile; }),
    handleTileAction,
    hideTileActionMenu: vi.fn(),
    tileMenuViewForTile: () => ({ buildings: [{ id: "build_farm_plot", label: "Build Farm Plot", disabled: false }], actions: [] }) as unknown as TileMenuView
  } as unknown as HudV2ActionFlow;
  return { state, actionFlow, handleTileAction };
};

const centre = () => ({ x: 0, y: 0 });

describe("queue Farm Plots from the tracker", () => {
  it("queues as many as asked, each on its own open plot of the town", () => {
    const { state, actionFlow, handleTileAction } = setup(["9,9", "10,9"]);
    expect(queueFarmPlots({ state, actionFlow }, "10,10", 3, centre)).toBe(3);
    expect(handleTileAction).toHaveBeenCalledTimes(3);
    expect(new Set(state.developmentQueue.map((entry) => entry.tileKey)).size).toBe(3);
    expect(actionFlow.hideTileActionMenu).toHaveBeenCalled();
  });

  it("stops at the town's free plots", () => {
    const { state, actionFlow } = setup(["9,9", "10,9", "11,9", "9,10", "11,10", "9,11"]);
    expect(queueFarmPlots({ state, actionFlow }, "10,10", 5, centre)).toBe(2);
    expect(state.developmentQueue).toHaveLength(2);
  });

  it("stops rather than retry a plot the build path refused", () => {
    const { state, actionFlow, handleTileAction } = setup();
    handleTileAction.mockImplementation(() => undefined);
    expect(queueFarmPlots({ state, actionFlow }, "10,10", 4, centre)).toBe(0);
    expect(handleTileAction).toHaveBeenCalledTimes(1);
  });
});
