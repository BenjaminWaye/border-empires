// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { handleTileDeltaBatchMessage, type TileDeltaBatchHandlerDeps } from "../client-tile-delta-batch-handler/client-tile-delta-batch-handler.js";
import { DISCOVERY_TIPS, dismissActiveDiscoveryTip } from "../client-discovery-tips/client-discovery-tips.js";
import { offerFirstDockTip, ownedDockInBatch, resetFirstDockTipOfferForTest } from "./client-first-dock-tip.js";

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

const dockTile = (ownerId?: string): Tile => ({ x: 6, y: 2, terrain: "LAND", dockId: "dock-3", ...(ownerId ? { ownerId, ownershipState: "FRONTIER" as const } : {}) }) as Tile;

beforeEach(() => {
  window.localStorage.clear();
  resetFirstDockTipOfferForTest();
});

afterEach(() => {
  document.getElementById("discovery-tip-overlay")?.remove();
});

describe("ownedDockInBatch", () => {
  it("finds a dock tile of ours in the batch, and ignores other docks and plain land", () => {
    const tiles = new Map<string, Tile>([
      ["1,1", { x: 1, y: 1, terrain: "LAND", ownerId: "p1" } as Tile],
      ["2,2", { x: 2, y: 2, terrain: "LAND", dockId: "dock-1", ownerId: "p2" } as Tile],
      ["3,3", { x: 3, y: 3, terrain: "LAND", dockId: "dock-2" } as Tile]
    ]);
    const all = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(ownedDockInBatch(all, tiles, "p1", keyFor)).toBeUndefined();
    tiles.set("3,3", { x: 3, y: 3, terrain: "LAND", dockId: "dock-2", ownerId: "p1" } as Tile);
    expect(ownedDockInBatch(all, tiles, "p1", keyFor)).toEqual({ x: 3, y: 3 });
  });
});

describe("offerFirstDockTip", () => {
  it("offers once per session", () => {
    const tiles = new Map([["6,2", dockTile("p1")]]);
    const announce = vi.fn();
    const input = { tileUpdates: [{ x: 6, y: 2 }], tiles, me: "p1", authEmail: "a@b.c", keyFor };
    expect(offerFirstDockTip(input, announce)).toBe(true);
    expect(offerFirstDockTip(input, announce)).toBe(false);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith({ x: 6, y: 2 });
  });
});

describe("FIRST_DOCK card on capture", () => {
  it("queues the card when a batch hands us a dock, and never again once dismissed", () => {
    const state = createInitialState();
    state.me = "p1";
    state.tiles.set("6,2", dockTile());
    handleTileDeltaBatchMessage({ tiles: [{ x: 6, y: 2, ownerId: "p1", ownershipState: "FRONTIER" }] }, makeDeps(state));
    expect(state.discoveryTipQueue).toContain("FIRST_DOCK");

    dismissActiveDiscoveryTip(state.discoveryTipQueue.filter((id) => id === "FIRST_DOCK"), state.authEmail);
    state.discoveryTipQueue.length = 0;
    resetFirstDockTipOfferForTest(); // a fresh session: only the persisted dismissal stops it
    state.tiles.set("6,2", dockTile());
    handleTileDeltaBatchMessage({ tiles: [{ x: 6, y: 2, ownerId: "p1", ownershipState: "FRONTIER" }] }, makeDeps(state));
    expect(state.discoveryTipQueue).not.toContain("FIRST_DOCK");
  });

  it("does not fire for a dock someone else takes", () => {
    const state = createInitialState();
    state.me = "p1";
    state.tiles.set("6,2", dockTile());
    handleTileDeltaBatchMessage({ tiles: [{ x: 6, y: 2, ownerId: "p2", ownershipState: "FRONTIER" }] }, makeDeps(state));
    expect(state.discoveryTipQueue).not.toContain("FIRST_DOCK");
  });

  it("explains the crossing in three short lines without pointing at another dock", () => {
    const body = DISCOVERY_TIPS.FIRST_DOCK.body;
    expect(body.split(". ").length).toBe(3);
    expect(body).toMatch(/sea lane/);
    expect(body).toMatch(/expand or attack/);
    expect(body).toMatch(/Select the dock/);
    expect(body).not.toMatch(/\(\d+, ?\d+\)/);
  });
});
