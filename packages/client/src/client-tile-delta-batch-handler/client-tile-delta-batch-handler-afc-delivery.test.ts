import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
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

const ownedAfc = (modules: string[]): Tile =>
  ({ x: 4, y: 5, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", afc: { ownerId: "p1", status: "active", modules } }) as Tile;

// Regression: the previous-modules snapshot must be taken BEFORE the batch is
// merged into state.tiles, otherwise "previous" already contains the new module
// and no delivery is ever detected.
describe("handleTileDeltaBatchMessage AFC module delivery", () => {
  it("queues a delivery for the 3D drain and stamps the 2D pulse when a module docks on the viewer's AFC", () => {
    const state = createInitialState();
    state.me = "p1";
    state.tiles.set("4,5", ownedAfc(["masonry"]));
    handleTileDeltaBatchMessage({ tiles: [{ x: 4, y: 5, afcJson: JSON.stringify({ ownerId: "p1", status: "active", modules: ["masonry", "alchemy"] }) }] }, makeDeps(state));
    expect(state.afcModuleDeliveryFxQueue.map((d) => d.techId)).toEqual(["alchemy"]);
    expect(state.afcModuleDeliveryLandedAt.has("4,5")).toBe(true);
  });

  it("does not fire for a tile the client had never seen", () => {
    const state = createInitialState();
    state.me = "p1";
    handleTileDeltaBatchMessage({ tiles: [{ x: 4, y: 5, ownerId: "p1", ownershipState: "SETTLED", afcJson: JSON.stringify({ ownerId: "p1", status: "active", modules: ["masonry"] }) }] }, makeDeps(state));
    expect(state.afcModuleDeliveryFxQueue).toEqual([]);
    expect(state.afcModuleDeliveryLandedAt.size).toBe(0);
  });
});
