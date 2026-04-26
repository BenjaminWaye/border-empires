import { structureBuildDurationMs } from "@border-empires/shared";
import { shouldPreserveOptimisticExpand } from "./client-frontier-overlay.js";
import type { ClientState } from "./client-state.js";
import type { OptimisticStructureKind, Tile, TileVisibilityState } from "./client-types.js";
import { debugTileTimeline } from "./client-debug.js";

const OPTIMISTIC_CLIENT_STATE_ENABLED = false;

type OptimisticStateDeps = {
  state: ClientState;
  keyFor: (x: number, y: number) => string;
  terrainAt: (x: number, y: number) => Tile["terrain"];
  tileVisibilityStateAt: (x: number, y: number, tile?: Tile) => TileVisibilityState;
};

export const createClientOptimisticStateController = (deps: OptimisticStateDeps) => {
  const { state, keyFor, terrainAt, tileVisibilityStateAt } = deps;
  const hasLateFrontierAckPending = (tileKey: string): boolean => (state.frontierLateAckUntilByTarget.get(tileKey) ?? 0) > Date.now();
  const tileSyncDebugEnabled = (): boolean =>
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "0.0.0.0" ||
      window.localStorage.getItem("tile-sync-debug") === "1");

  const logTileSync = (event: string, payload: Record<string, unknown>): void => {
    if (!tileSyncDebugEnabled()) return;
    console.info(`[tile-sync] ${event}`, payload);
  };

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
    if (!OPTIMISTIC_CLIENT_STATE_ENABLED) return;
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
    debugTileTimeline("frontier-optimistic-applied", {
      x,
      y,
      before: current,
      after: next,
      state,
      keyFor,
      extra: {
        snapshotStored: state.optimisticTileSnapshots.has(tileKey)
      }
    });
  };

  const clearOptimisticTileState = (tileKey: string, revert = false): void => {
    if (!OPTIMISTIC_CLIENT_STATE_ENABLED) return;
    if (!state.optimisticTileSnapshots.has(tileKey)) return;
    const previous = state.optimisticTileSnapshots.get(tileKey);
    const current = state.tiles.get(tileKey);
    state.optimisticTileSnapshots.delete(tileKey);
    if (!revert) {
      if (current?.optimisticPending) {
        const next = { ...current };
        delete next.optimisticPending;
        state.tiles.set(tileKey, next);
        debugTileTimeline("frontier-optimistic-cleared", {
          x: next.x,
          y: next.y,
          before: current,
          after: next,
          state,
          keyFor,
          extra: { revert }
        });
      }
      return;
    }
    if (previous) {
      state.tiles.set(tileKey, previous);
      if (!previous.fogged) state.discoveredTiles.add(tileKey);
      else state.discoveredTiles.delete(tileKey);
      debugTileTimeline("frontier-optimistic-reverted", {
        x: previous.x,
        y: previous.y,
        before: current,
        after: previous,
        state,
        keyFor,
        extra: { revert }
      });
    } else {
      if (current) {
        debugTileTimeline("frontier-optimistic-reverted", {
          x: current.x,
          y: current.y,
          before: current,
          state,
          keyFor,
          extra: { revert, deletedTile: true }
        });
      }
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
    if (!OPTIMISTIC_CLIENT_STATE_ENABLED) return;
    const completesAt = Date.now() + structureBuildDurationMs(kind);
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

  const applyOptimisticStructureRemoval = (x: number, y: number): void => {
    if (!OPTIMISTIC_CLIENT_STATE_ENABLED) return;
    applyOptimisticTileState(x, y, (tile) => {
      tile.optimisticPending = "structure_remove";
      if (tile.fort) {
        tile.fort = { ...tile.fort, status: "removing", completesAt: Date.now() + structureBuildDurationMs("FORT") };
        return;
      }
      if (tile.observatory) {
        tile.observatory = { ...tile.observatory, status: "removing", completesAt: Date.now() + structureBuildDurationMs("OBSERVATORY") };
        return;
      }
      if (tile.siegeOutpost) {
        tile.siegeOutpost = { ...tile.siegeOutpost, status: "removing", completesAt: Date.now() + structureBuildDurationMs("SIEGE_OUTPOST") };
        return;
      }
      if (tile.economicStructure) {
        tile.economicStructure = {
          ...tile.economicStructure,
          status: "removing",
          completesAt: Date.now() + structureBuildDurationMs(tile.economicStructure.type)
        };
      }
    });
  };

  const applyOptimisticStructureCancel = (x: number, y: number): void => {
    if (!OPTIMISTIC_CLIENT_STATE_ENABLED) return;
    applyOptimisticTileState(x, y, (tile) => {
      tile.optimisticPending = "structure_cancel";
      delete tile.fort;
      delete tile.observatory;
      delete tile.siegeOutpost;
      delete tile.economicStructure;
    });
  };

  const shouldPreserveOptimisticExpandByKey = (tileKey: string): boolean => {
    if (!OPTIMISTIC_CLIENT_STATE_ENABLED) return false;
    const tile = tileKey ? state.tiles.get(tileKey) : undefined;
    if (shouldPreserveOptimisticExpand(tile, state.me)) return true;
    if (!tileKey) return false;
    if (hasLateFrontierAckPending(tileKey)) return true;
    return false;
  };

  const mergeServerTileWithOptimisticState = (incoming: Tile): Tile => {
    if (!OPTIMISTIC_CLIENT_STATE_ENABLED) return incoming;
    const tileKey = keyFor(incoming.x, incoming.y);
    const existing = state.tiles.get(tileKey);
    const settlementProgress = state.settleProgressByTile.get(tileKey);
    if (
      existing?.ownerId &&
      incoming.ownerId === existing.ownerId &&
      existing.ownershipState === "SETTLED" &&
      incoming.ownershipState === "FRONTIER"
    ) {
      debugTileTimeline("frontier-merge-ignore-downgrade", {
        x: incoming.x,
        y: incoming.y,
        before: existing,
        incoming,
        after: existing,
        state,
        keyFor
      });
      logTileSync("ignore_same_owner_frontier_downgrade", {
        tileKey,
        ownerId: existing.ownerId,
        existingOwnershipState: existing.ownershipState,
        incomingOwnershipState: incoming.ownershipState
      });
      return existing;
    }
    if (settlementProgress && (existing?.ownerId === state.me || incoming.ownerId === state.me)) {
      if (incoming.ownerId === state.me && incoming.ownershipState === "SETTLED") return incoming;
      const merged: Tile = {
        ...incoming,
        ownerId: state.me,
        ownershipState: settlementProgress.awaitingServerConfirm ? "SETTLED" : existing?.ownershipState === "SETTLED" ? "SETTLED" : "FRONTIER",
        fogged: false,
        optimisticPending: "settle"
      };
      debugTileTimeline("frontier-merge-settlement-progress", {
        x: incoming.x,
        y: incoming.y,
        before: existing,
        incoming,
        after: merged,
        state,
        keyFor,
        extra: { awaitingServerConfirm: settlementProgress.awaitingServerConfirm }
      });
      return merged;
    }
    if (!existing?.optimisticPending || existing.ownerId !== state.me) return incoming;
    if (existing.optimisticPending === "expand") {
      if (incoming.ownerId === state.me && incoming.ownershipState === "FRONTIER") return incoming;
      const awaitingActiveExpand = state.actionInFlight && state.actionTargetKey === tileKey;
      const awaitingLateAck = hasLateFrontierAckPending(tileKey);
      if (!awaitingActiveExpand && !awaitingLateAck) {
        debugTileTimeline("frontier-merge-authority-restored", {
          x: incoming.x,
          y: incoming.y,
          before: existing,
          incoming,
          after: incoming,
          state,
          keyFor
        });
        logTileSync("expand_authority_restored", {
          tileKey,
          existingOwnerId: existing.ownerId,
          existingOwnershipState: existing.ownershipState,
          incomingOwnerId: incoming.ownerId,
          incomingOwnershipState: incoming.ownershipState
        });
        return incoming;
      }
      const merged: Tile = {
        ...incoming,
        ownerId: existing.ownerId,
        fogged: false,
        optimisticPending: existing.optimisticPending
      };
      if (existing.ownershipState) merged.ownershipState = existing.ownershipState;
        debugTileTimeline("frontier-merge-preserve-inflight", {
          x: incoming.x,
          y: incoming.y,
          before: existing,
          incoming,
          after: merged,
          state,
          keyFor,
          extra: { awaitingActiveExpand, awaitingLateAck }
        });
      logTileSync("expand_preserved_while_inflight", {
        tileKey,
        existingOwnerId: existing.ownerId,
        existingOwnershipState: existing.ownershipState,
        incomingOwnerId: incoming.ownerId,
        incomingOwnershipState: incoming.ownershipState,
        awaitingLateAck
      });
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
    if (existing.optimisticPending === "structure_remove") {
      const optimisticKind =
        existing.fort?.status === "removing"
          ? "FORT"
          : existing.observatory?.status === "removing"
            ? "OBSERVATORY"
            : existing.siegeOutpost?.status === "removing"
              ? "SIEGE_OUTPOST"
              : existing.economicStructure?.status === "removing"
                ? existing.economicStructure.type
                : undefined;
      if (!optimisticKind) return incoming;
      const incomingRemoving =
        (optimisticKind === "FORT" && incoming.fort?.status === "removing") ||
        (optimisticKind === "OBSERVATORY" && incoming.observatory?.status === "removing") ||
        (optimisticKind === "SIEGE_OUTPOST" && incoming.siegeOutpost?.status === "removing") ||
        (optimisticKind !== "FORT" &&
          optimisticKind !== "OBSERVATORY" &&
          optimisticKind !== "SIEGE_OUTPOST" &&
          incoming.economicStructure?.type === optimisticKind &&
          incoming.economicStructure?.status === "removing");
      if (incomingRemoving || !tileHasStructureKind(incoming, optimisticKind)) return incoming;
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
    return incoming;
  };

  const mergeIncomingTileDetail = (existing: Tile | undefined, incoming: Tile): Tile => {
    if (!existing || incoming.detailLevel === "full") return incoming;
    const preservePriorDetail = existing.detailLevel === "full";
    const merged: Tile = {
      ...existing,
      ...incoming,
      ...(preservePriorDetail ? { detailLevel: "full" as const } : {})
    };
    if (!("shardSite" in incoming) && existing.shardSite) merged.shardSite = existing.shardSite;
    if (!preservePriorDetail) return merged;
    if (!("town" in incoming) && existing.town) merged.town = existing.town;
    if (!("dock" in incoming) && existing.dock) merged.dock = existing.dock;
    if (!("yield" in incoming) && existing.yield) merged.yield = existing.yield;
    if (!("yieldRate" in incoming) && existing.yieldRate) merged.yieldRate = existing.yieldRate;
    if (!("yieldCap" in incoming) && existing.yieldCap) merged.yieldCap = existing.yieldCap;
    if (!("upkeepEntries" in incoming) && existing.upkeepEntries) merged.upkeepEntries = existing.upkeepEntries;
    if (!("history" in incoming) && existing.history) merged.history = existing.history;
    debugTileTimeline("frontier-detail-merged", {
      x: incoming.x,
      y: incoming.y,
      before: existing,
      incoming,
      after: merged,
      state,
      keyFor
    });
    return merged;
  };

  return {
    selectedTile,
    applyOptimisticTileState,
    clearOptimisticTileState,
    applyOptimisticStructureBuild,
    applyOptimisticStructureRemoval,
    applyOptimisticStructureCancel,
    shouldPreserveOptimisticExpandByKey,
    mergeServerTileWithOptimisticState,
    mergeIncomingTileDetail
  };
};
