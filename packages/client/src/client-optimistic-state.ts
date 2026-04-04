import { FORT_BUILD_MS, OBSERVATORY_BUILD_MS, SIEGE_OUTPOST_BUILD_MS } from "@border-empires/shared";
import { shouldPreserveOptimisticExpand } from "./client-frontier-overlay.js";
import { economicStructureBuildMs } from "./client-map-display.js";
import type { ClientState } from "./client-state.js";
import type { OptimisticStructureKind, Tile, TileVisibilityState } from "./client-types.js";

type OptimisticStateDeps = {
  state: ClientState;
  keyFor: (x: number, y: number) => string;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
};

export const createClientOptimisticStateController = (deps: OptimisticStateDeps) => {
  const { state, keyFor, terrainAt, tileVisibilityStateAt } = deps;

  const selectedTile = (): Tile | undefined => {
    if (!state.selected) return undefined;
    const existing = state.tiles.get(keyFor(state.selected.x, state.selected.y));
    if (existing) return existing;
    const visibility = tileVisibilityStateAt(state.selected.x, state.selected.y);
    if (visibility === "unexplored") return undefined;
    return {
      x: state.selected.x,
      y: state.selected.y,
      terrain: terrainAt(state.selected.x, state.selected.y),
      fogged: visibility !== "visible"
    };
  };

  const applyOptimisticTileState = (
    x: number,
    y: number,
    mutate: (tile: Tile) => void
  ): void => {
    const tileKey = keyFor(x, y);
    if (!state.optimisticTileSnapshots.has(tileKey)) {
      const existing = state.tiles.get(tileKey);
      state.optimisticTileSnapshots.set(tileKey, existing ? { ...existing } : undefined);
    }
    const current =
      state.tiles.get(tileKey) ??
      ({
        x,
        y,
        terrain: terrainAt(x, y),
        fogged: false
      } satisfies Tile);
    const next = { ...current };
    mutate(next);
    state.tiles.set(tileKey, next);
    if (!next.fogged) state.discoveredTiles.add(tileKey);
  };

  const clearOptimisticTileState = (tileKey: string, revert = false): void => {
    if (!state.optimisticTileSnapshots.has(tileKey)) return;
    const previous = state.optimisticTileSnapshots.get(tileKey);
    state.optimisticTileSnapshots.delete(tileKey);
    if (!revert) {
      const current = state.tiles.get(tileKey);
      if (current?.optimisticPending) {
        const next = { ...current };
        delete next.optimisticPending;
        state.tiles.set(tileKey, next);
      }
      return;
    }
    if (previous) {
      state.tiles.set(tileKey, previous);
      if (!previous.fogged) state.discoveredTiles.add(tileKey);
      else state.discoveredTiles.delete(tileKey);
    } else {
      state.tiles.delete(tileKey);
      state.discoveredTiles.delete(tileKey);
    }
  };

  const tileHasStructureKind = (tile: Tile, kind: OptimisticStructureKind): boolean => {
    if (kind === "FORT") return Boolean(tile.fort);
    if (kind === "OBSERVATORY") return Boolean(tile.observatory);
    if (kind === "SIEGE_OUTPOST") return Boolean(tile.siegeOutpost);
    return tile.economicStructure?.type === kind;
  };

  const tileHasUnderConstructionStructureKind = (tile: Tile, kind: OptimisticStructureKind): boolean => {
    if (kind === "FORT") return tile.fort?.status === "under_construction";
    if (kind === "OBSERVATORY") return tile.observatory?.status === "under_construction";
    if (kind === "SIEGE_OUTPOST") return tile.siegeOutpost?.status === "under_construction";
    return tile.economicStructure?.type === kind && tile.economicStructure?.status === "under_construction";
  };

  const applyOptimisticStructureBuild = (x: number, y: number, kind: OptimisticStructureKind): void => {
    const completesAt =
      Date.now() +
      (kind === "FORT"
        ? FORT_BUILD_MS
        : kind === "OBSERVATORY"
          ? OBSERVATORY_BUILD_MS
          : kind === "SIEGE_OUTPOST"
            ? SIEGE_OUTPOST_BUILD_MS
            : economicStructureBuildMs(kind));
    applyOptimisticTileState(x, y, (tile) => {
      tile.optimisticPending = "structure_build";
      if (kind === "FORT") {
        delete tile.economicStructure;
        tile.fort = { ownerId: state.me, status: "under_construction", completesAt };
        return;
      }
      if (kind === "OBSERVATORY") {
        tile.observatory = { ownerId: state.me, status: "under_construction", completesAt };
        return;
      }
      if (kind === "SIEGE_OUTPOST") {
        delete tile.economicStructure;
        tile.siegeOutpost = { ownerId: state.me, status: "under_construction", completesAt };
        return;
      }
      tile.economicStructure = { ownerId: state.me, type: kind, status: "under_construction", completesAt };
    });
  };

  const applyOptimisticStructureCancel = (x: number, y: number): void => {
    applyOptimisticTileState(x, y, (tile) => {
      tile.optimisticPending = "structure_cancel";
      delete tile.fort;
      delete tile.observatory;
      delete tile.siegeOutpost;
      delete tile.economicStructure;
    });
  };

  const shouldPreserveOptimisticExpandByKey = (tileKey: string): boolean =>
    shouldPreserveOptimisticExpand(tileKey ? state.tiles.get(tileKey) : undefined, state.me);

  const mergeServerTileWithOptimisticState = (incoming: Tile): Tile => {
    const tileKey = keyFor(incoming.x, incoming.y);
    const existing = state.tiles.get(tileKey);
    const settlementProgress = state.settleProgressByTile.get(tileKey);
    if (settlementProgress && (existing?.ownerId === state.me || incoming.ownerId === state.me)) {
      return {
        ...incoming,
        ownerId: state.me,
        ownershipState: settlementProgress.awaitingServerConfirm ? "SETTLED" : existing?.ownershipState === "SETTLED" ? "SETTLED" : "FRONTIER",
        fogged: false,
        optimisticPending: "settle"
      };
    }
    if (!existing?.optimisticPending || existing.ownerId !== state.me) return incoming;
    if (existing.optimisticPending === "expand") {
      if (incoming.ownerId === state.me && incoming.ownershipState === "FRONTIER") return incoming;
      const merged: Tile = {
        ...incoming,
        ownerId: existing.ownerId,
        fogged: false,
        optimisticPending: existing.optimisticPending
      };
      if (existing.ownershipState) merged.ownershipState = existing.ownershipState;
      return merged;
    }
    if (existing.optimisticPending === "settle") {
      if (incoming.ownerId === state.me && incoming.ownershipState === "SETTLED") return incoming;
      return {
        ...incoming,
        ownerId: existing.ownerId,
        ownershipState: "SETTLED",
        fogged: false,
        optimisticPending: existing.optimisticPending
      };
    }
    if (existing.optimisticPending === "structure_build") {
      const optimisticKind =
        existing.fort?.status === "under_construction"
          ? "FORT"
          : existing.observatory?.status === "under_construction"
            ? "OBSERVATORY"
            : existing.siegeOutpost?.status === "under_construction"
              ? "SIEGE_OUTPOST"
              : existing.economicStructure?.status === "under_construction"
                ? existing.economicStructure.type
                : undefined;
      if (!optimisticKind) return incoming;
      if (tileHasStructureKind(incoming, optimisticKind)) return incoming;
      const merged: Tile = {
        ...incoming,
        optimisticPending: existing.optimisticPending
      };
      if (existing.fort) merged.fort = existing.fort;
      if (existing.observatory) merged.observatory = existing.observatory;
      if (existing.siegeOutpost) merged.siegeOutpost = existing.siegeOutpost;
      if (existing.economicStructure) merged.economicStructure = existing.economicStructure;
      return merged;
    }
    if (existing.optimisticPending === "structure_cancel") {
      const previous = state.optimisticTileSnapshots.get(tileKey);
      const cancelledKind =
        previous?.fort?.status === "under_construction"
          ? "FORT"
          : previous?.observatory?.status === "under_construction"
            ? "OBSERVATORY"
            : previous?.siegeOutpost?.status === "under_construction"
              ? "SIEGE_OUTPOST"
              : previous?.economicStructure?.status === "under_construction"
                ? previous.economicStructure.type
                : undefined;
      if (!cancelledKind) return incoming;
      if (!tileHasUnderConstructionStructureKind(incoming, cancelledKind)) return incoming;
      const merged: Tile = {
        ...incoming,
        optimisticPending: existing.optimisticPending
      };
      delete merged.fort;
      delete merged.observatory;
      delete merged.siegeOutpost;
      delete merged.economicStructure;
      return merged;
    }
    return incoming;
  };

  const mergeIncomingTileDetail = (existing: Tile | undefined, incoming: Tile): Tile => {
    if (!existing || existing.detailLevel !== "full" || incoming.detailLevel === "full") return incoming;
    const merged: Tile = {
      ...existing,
      ...incoming,
      detailLevel: "full"
    };
    if (!("town" in incoming) && existing.town) merged.town = existing.town;
    if (!("yield" in incoming) && existing.yield) merged.yield = existing.yield;
    if (!("yieldRate" in incoming) && existing.yieldRate) merged.yieldRate = existing.yieldRate;
    if (!("yieldCap" in incoming) && existing.yieldCap) merged.yieldCap = existing.yieldCap;
    if (!("history" in incoming) && existing.history) merged.history = existing.history;
    return merged;
  };

  return {
    selectedTile,
    applyOptimisticTileState,
    clearOptimisticTileState,
    applyOptimisticStructureBuild,
    applyOptimisticStructureCancel,
    shouldPreserveOptimisticExpandByKey,
    mergeServerTileWithOptimisticState,
    mergeIncomingTileDetail
  };
};
