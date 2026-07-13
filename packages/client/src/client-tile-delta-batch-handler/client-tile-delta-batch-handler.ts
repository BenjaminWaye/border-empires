import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { applyGatewayTileDeltaBatch } from "../client-gateway-sync/client-gateway-sync.js";
import { emitTownCaptureIfCaptured } from "../client-town-capture/client-town-capture-detect.js";

export type TileDeltaBatchUpdate = { x: number; y: number; ownerId?: string; ownershipState?: "FRONTIER" | "SETTLED" | "BARBARIAN" };

export type TileDeltaBatchHandlerDeps = {
  state: ClientState;
  keyFor: (x: number, y: number) => string;
  mergeIncomingTileDetail: (existing: Tile | undefined, incoming: Tile) => Tile;
  mergeServerTileWithOptimisticState: (tile: Tile) => Tile;
  clearRenderCaches: () => void;
  buildMiniMapBase: () => void;
  frontierQueueDebug: (event: string, payload?: Record<string, unknown>) => void;
  clearLateFrontierAck: (tileKey: string) => void;
  currentActionCanResolveFromFrontierOwnership: (targetKey: string) => boolean;
  currentActionCanResolveFromPostCombatTileSync: (targetKey: string) => boolean;
  resolveFrontierCapture: (source: "FRONTIER_RESULT" | "TILE_DELTA" | "TILE_DELTA_BATCH") => void;
  openSingleTileActionMenu: (tile: Tile, clientX: number, clientY: number, options?: { requestAttackPreview?: boolean; preserveTab?: boolean }) => void;
  renderHud: () => void;
  requestViewRefresh: () => void;
};

/** Handles a gateway TILE_DELTA_BATCH message: merges tiles, resolves any queued
 * frontier action the batch confirms, refreshes the open tile menu, and
 * announces a town-capture hero popup when a tracked capture lands. */
export const handleTileDeltaBatchMessage = (msg: Record<string, unknown>, deps: TileDeltaBatchHandlerDeps): void => {
  const { state, keyFor } = deps;
  const tileUpdates = msg.tiles as TileDeltaBatchUpdate[] | undefined;
  const batchTouchesFrontierQueue =
    Array.isArray(tileUpdates) &&
    tileUpdates.some((update) => {
      const updateKey = keyFor(update.x, update.y);
      if (updateKey === state.actionTargetKey) return true;
      if (state.queuedTargetKeys.has(updateKey)) return true;
      return state.actionQueue.some((entry) => keyFor(entry.x, entry.y) === updateKey);
    });
  if (batchTouchesFrontierQueue) {
    deps.frontierQueueDebug("tile_delta_batch_matches_frontier_target", {
      updates: tileUpdates?.map((update) => ({ key: keyFor(update.x, update.y), ownerId: update.ownerId, ownershipState: update.ownershipState }))
    });
  }
  const previousOwnerByKey = new Map<string, string | undefined>();
  if (Array.isArray(tileUpdates)) {
    for (const update of tileUpdates) previousOwnerByKey.set(keyFor(update.x, update.y), state.tiles.get(keyFor(update.x, update.y))?.ownerId);
  }
  applyGatewayTileDeltaBatch(
    { state, keyFor, mergeIncomingTileDetail: deps.mergeIncomingTileDetail, mergeServerTileWithOptimisticState: deps.mergeServerTileWithOptimisticState, clearRenderCaches: deps.clearRenderCaches, buildMiniMapBase: deps.buildMiniMapBase },
    tileUpdates
  );
  let resolvedQueuedFrontierCapture = false;
  if (Array.isArray(tileUpdates) && tileUpdates.length > 0) {
    for (const update of tileUpdates) {
      const updateKey = keyFor(update.x, update.y);
      const resolved = state.tiles.get(updateKey);
      if (resolved) state.tiles.set(updateKey, resolved);
      if (resolved?.ownerId === state.me && (resolved.ownershipState === "FRONTIER" || resolved.ownershipState === "SETTLED")) {
        state.frontierSyncWaitUntilByTarget.delete(updateKey);
        deps.clearLateFrontierAck(updateKey);
        state.actionQueue = state.actionQueue.filter((entry) => keyFor(entry.x, entry.y) !== updateKey);
        state.queuedTargetKeys.delete(updateKey);
      }
      if (
        !resolvedQueuedFrontierCapture &&
        updateKey === state.actionTargetKey &&
        ((deps.currentActionCanResolveFromFrontierOwnership(updateKey) && resolved?.ownerId === state.me && resolved.ownershipState === "FRONTIER") ||
          deps.currentActionCanResolveFromPostCombatTileSync(updateKey))
      ) {
        resolvedQueuedFrontierCapture = true;
      }
    }
  }
  if (state.firstChunkAt === 0 && Array.isArray(tileUpdates) && tileUpdates.length > 0) {
    state.firstChunkAt = Date.now();
    state.chunkFullCount = Math.max(state.chunkFullCount, 1);
    state.hasOwnedTileInCache = [...state.tiles.values()].some((tile) => tile.ownerId === state.me);
  }
  if (resolvedQueuedFrontierCapture) deps.resolveFrontierCapture("TILE_DELTA_BATCH");
  // Re-render the tile action menu if the delta touched the currently selected
  // own tile (e.g. SET_MUSTER returns a tile delta that changes muster state).
  if (state.tileActionMenu.visible && state.tileActionMenu.mode === "single" && state.tileActionMenu.currentTileKey && Array.isArray(tileUpdates)) {
    const touchedKeys = new Set<string>(tileUpdates.map((u) => keyFor(u.x, u.y)));
    if (touchedKeys.has(state.tileActionMenu.currentTileKey)) {
      const refreshedTile = state.tiles.get(state.tileActionMenu.currentTileKey);
      if (refreshedTile) deps.openSingleTileActionMenu(refreshedTile, state.tileActionMenu.x, state.tileActionMenu.y, { requestAttackPreview: false, preserveTab: true });
    }
  }
  const batchPlayerManpower = (msg as { playerManpower?: unknown }).playerManpower;
  if (typeof batchPlayerManpower === "number" && (msg as { playerId?: unknown }).playerId === state.me) state.manpower = batchPlayerManpower;
  if (Array.isArray(tileUpdates) && tileUpdates.length > 0) {
    emitTownCaptureIfCaptured({
      tileUpdates,
      previousOwnerByKey,
      tiles: state.tiles,
      me: state.me,
      meName: state.meName,
      keyFor,
      onJumpToTown: (x, y) => {
        state.camX = x;
        state.camY = y;
        state.selected = { x, y };
        deps.requestViewRefresh();
      }
    });
  }
  deps.renderHud();
};
