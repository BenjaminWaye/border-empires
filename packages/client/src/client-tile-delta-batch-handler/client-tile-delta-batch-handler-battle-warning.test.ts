// Regression (playtest 2026-11): a new player lost 14 tiles in 7 minutes to
// Planetary Defense, 8 at once, with no in-game warning. A TILE_DELTA_BATCH
// that hands the viewer's tiles to another owner must raise the "Under
// attack" banner and flash those tiles.
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { activeBattleFlashes, battleWarnings, battleWarningView } from "../client-battle-warnings/client-battle-warnings.js";
import { handleTileDeltaBatchMessage, type TileDeltaBatchHandlerDeps } from "./client-tile-delta-batch-handler.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const makeDeps = (state: ReturnType<typeof createInitialState>): TileDeltaBatchHandlerDeps => ({
  state,
  keyFor,
  mergeIncomingTileDetail: (existing, incoming) => ({ ...existing, ...incoming }),
  mergeServerTileWithOptimisticState: (tile) => tile,
  clearRenderCaches: vi.fn(),
  buildMiniMapBase: vi.fn(),
  frontierQueueDebug: vi.fn(),
  clearLateFrontierAck: vi.fn(),
  currentActionCanResolveFromFrontierOwnership: () => false,
  currentActionCanResolveFromPostCombatTileSync: () => false,
  resolveFrontierCapture: vi.fn(),
  openSingleTileActionMenu: vi.fn(),
  renderHud: vi.fn(),
  requestViewRefresh: vi.fn(),
  pushFeed: vi.fn()
});

const ownTile = (x: number, y: number): Tile => ({ x, y, terrain: "LAND", ownerId: "p1", ownershipState: "FRONTIER" }) as unknown as Tile;

afterEach(() => {
  battleWarnings.me = undefined;
  battleWarnings.batch = undefined;
  battleWarnings.flashes.clear();
  battleWarnings.seenIncoming.clear();
});

describe("handleTileDeltaBatchMessage battle warning", () => {
  it("raises one batched alert and flashes every tile Planetary Defense took", () => {
    const state = createInitialState();
    state.me = "p1";
    for (let x = 0; x < 8; x += 1) state.tiles.set(keyFor(x, 3), ownTile(x, 3));
    const tiles = Array.from({ length: 8 }, (_, x) => ({ x, y: 3, ownerId: "barbarian-1", ownershipState: "FRONTIER" }));
    handleTileDeltaBatchMessage({ tiles }, makeDeps(state));
    const now = Date.now();
    expect(battleWarningView(battleWarnings, state, now)).toMatchObject({ title: "Under attack", detail: "Planetary Defense · 8 tiles lost" });
    expect(activeBattleFlashes(battleWarnings, now)).toHaveLength(8);
  });

  it("stays quiet for an ordinary delta on tiles we keep", () => {
    const state = createInitialState();
    state.me = "p1";
    state.tiles.set("1,1", ownTile(1, 1));
    handleTileDeltaBatchMessage({ tiles: [{ x: 1, y: 1, ownerId: "p1", ownershipState: "SETTLED" }] }, makeDeps(state));
    expect(battleWarningView(battleWarnings, state, Date.now())).toBeUndefined();
  });
});
