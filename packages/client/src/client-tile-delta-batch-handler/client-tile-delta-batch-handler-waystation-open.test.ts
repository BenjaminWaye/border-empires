import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { handleTileDeltaBatchMessage, type TileDeltaBatchHandlerDeps } from "./client-tile-delta-batch-handler.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const makeDeps = (state: ReturnType<typeof createInitialState>): TileDeltaBatchHandlerDeps => ({
  state, keyFor,
  mergeIncomingTileDetail: (existing, incoming) => ({ ...existing, ...incoming }),
  mergeServerTileWithOptimisticState: (tile) => tile,
  clearRenderCaches: vi.fn(), buildMiniMapBase: vi.fn(), frontierQueueDebug: vi.fn(), clearLateFrontierAck: vi.fn(),
  currentActionCanResolveFromFrontierOwnership: () => false, currentActionCanResolveFromPostCombatTileSync: () => false,
  resolveFrontierCapture: vi.fn(), openSingleTileActionMenu: vi.fn(), renderHud: vi.fn(), requestViewRefresh: vi.fn(), pushFeed: vi.fn()
});
const site = (extra: Partial<Tile> = {}): Tile => ({ x: 3, y: 4, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER", waystation: { activated: false }, ...extra });
const collected = { x: 3, y: 4, ownerId: "p1", ownershipState: "FRONTIER" as const, waystationJson: JSON.stringify({ activated: true, activatedByPlayerId: "p1", grantedEffect: "GOLD", grantedGold: 50 }) };

describe("handleTileDeltaBatchMessage waystation opening", () => {
  it("starts the 10 s crate opening for both renderers when a visible rig is collected", () => {
    const state = createInitialState();
    state.me = "p1";
    state.tiles.set("3,4", site());
    handleTileDeltaBatchMessage({ tiles: [collected] }, makeDeps(state));
    expect(state.waystationOpenFxQueue).toEqual([expect.objectContaining({ x: 3, y: 4 })]);
    expect(state.waystationOpenFxByKey.get("3,4")).toMatchObject({ x: 3, y: 4 });
  });

  it("plays nothing for a site that was never on screen, was fogged, or is just a dormant refresh", () => {
    const state = createInitialState();
    state.me = "p1";
    handleTileDeltaBatchMessage({ tiles: [collected] }, makeDeps(state)); // first sighting of an old record
    state.tiles.set("3,4", site({ fogged: true }));
    handleTileDeltaBatchMessage({ tiles: [collected] }, makeDeps(state));
    state.tiles.set("3,4", site());
    handleTileDeltaBatchMessage({ tiles: [{ ...collected, waystationJson: JSON.stringify({ activated: false }) }] }, makeDeps(state));
    expect(state.waystationOpenFxQueue).toEqual([]);
    expect(state.waystationOpenFxByKey.size).toBe(0);
  });
});
