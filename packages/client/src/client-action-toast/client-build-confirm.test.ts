// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { sendDevelopmentBuild } from "../client-queue-logic/client-development-dispatch.js";
import { handleTileDeltaBatchMessage, type TileDeltaBatchHandlerDeps } from "../client-tile-delta-batch-handler/client-tile-delta-batch-handler.js";
import { BUILD_CONFIRM_WAIT_MS, confirmBuildsFromTiles, expectBuildConfirmation, resetBuildConfirmations } from "./client-build-confirm.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;
const toastText = (): string | null | undefined => document.getElementById("action-toast")?.textContent;
const ownTile = (extra: Partial<Tile> = {}): Tile => ({ x: 4, y: 5, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", ...extra }) as Tile;
const batchDeps = (state: ReturnType<typeof createInitialState>): TileDeltaBatchHandlerDeps => ({
  state, keyFor,
  mergeIncomingTileDetail: (existing, incoming) => ({ ...existing, ...incoming }),
  mergeServerTileWithOptimisticState: (tile) => tile,
  clearRenderCaches: vi.fn(), buildMiniMapBase: vi.fn(), frontierQueueDebug: vi.fn(), clearLateFrontierAck: vi.fn(),
  currentActionCanResolveFromFrontierOwnership: () => false, currentActionCanResolveFromPostCombatTileSync: () => false,
  resolveFrontierCapture: vi.fn(), openSingleTileActionMenu: vi.fn(), renderHud: vi.fn(), requestViewRefresh: vi.fn(), pushFeed: vi.fn()
});
const dispatchDeps = () => ({
  keyFor, queueDevelopmentAction: vi.fn(() => true), developmentSlotSummary: () => ({ busy: 0, limit: 3, available: 3 }),
  developmentSlotReason: () => "full", pushFeed: vi.fn(), showCaptureAlert: vi.fn(), renderHud: vi.fn(), sendGameMessage: vi.fn(() => true)
});

afterEach(() => {
  resetBuildConfirmations();
  document.getElementById("action-toast")?.remove();
});

// Regression (first-15 playtest r1, pt-worldbuilder): "Build Hydrogarden… closed with no confirmation."
describe("build confirmation", () => {
  it("says the build started when the server's tile update shows it, not when it is sent", () => {
    const state = createInitialState();
    state.me = "p1";
    state.tiles.set("4,5", ownTile());
    sendDevelopmentBuild(state, { type: "BUILD_STRUCTURE", x: 4, y: 5, structureType: "HYDROGARDEN" }, vi.fn(),
      { x: 4, y: 5, label: "Hydrogarden at (4, 5)", optimisticKind: "HYDROGARDEN" as never }, dispatchDeps());
    expect(toastText()).toBeUndefined();
    const economicStructureJson = JSON.stringify({ type: "HYDROGARDEN", status: "under_construction", ownerId: "p1", completesAt: Date.now() + 52_000 });
    handleTileDeltaBatchMessage({ tiles: [{ x: 4, y: 5, ownerId: "p1", ownershipState: "SETTLED", economicStructureJson }] }, batchDeps(state));
    expect(toastText()).toBe("Hydrogarden started");
  });

  it("stays quiet for a tile update without the structure (a rejected build)", () => {
    expectBuildConfirmation("4,5", "HYDROGARDEN", "Hydrogarden at (4, 5)", ownTile());
    confirmBuildsFromTiles(["4,5"], () => ownTile(), "p1");
    expect(toastText()).toBeUndefined();
  });

  it("waits for the new fort on an upgrade, and forgets builds the server never confirmed", () => {
    const now = 1_000;
    const oldFort = ownTile({ fort: { status: "active", ownerId: "p1" } as Tile["fort"] });
    expectBuildConfirmation("4,5", "FORT", "Stone Fort at (4, 5)", oldFort, now);
    confirmBuildsFromTiles(["4,5"], () => oldFort, "p1", now);
    expect(toastText()).toBeUndefined();
    const building = ownTile({ fort: { status: "under_construction", ownerId: "p1" } as Tile["fort"] });
    confirmBuildsFromTiles(["4,5"], () => building, "p1", now + 1);
    expect(toastText()).toBe("Stone Fort started");
    document.getElementById("action-toast")?.remove();
    expectBuildConfirmation("9,9", "OBSERVATORY", "Observatory at (9, 9)", undefined, now);
    confirmBuildsFromTiles(["9,9"], () => ownTile({ observatory: { status: "under_construction" } as Tile["observatory"] }), "p1", now + BUILD_CONFIRM_WAIT_MS + 1);
    expect(toastText()).toBeUndefined();
  });
});
