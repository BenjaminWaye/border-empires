import type { Player, TileKey } from "@border-empires/shared";
import type { VisibilitySnapshot } from "./chunk/snapshots.js";

type RevealTargetState = {
  authVerifiedAt?: number;
  initSentAt?: number;
  firstSubscribeAt?: number;
  firstChunkSentAt?: number;
};

export interface CreateServerVisibilityStateRuntimeDeps {
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  DISABLE_FOG: boolean;
  players: Map<string, Player>;
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, string>;
  townsByTile: Map<TileKey, unknown>;
  cachedVisibilitySnapshotByPlayer: Map<string, VisibilitySnapshot>;
  chunkSnapshotGenerationByPlayer: Map<string, number>;
  revealedEmpireTargetsByPlayer: Map<string, Set<string>>;
  revealWatchersByTarget: Map<string, Set<string>>;
  forcedRevealTilesByPlayer: Map<string, Set<TileKey>>;
  fogDisabledByPlayer: Map<string, boolean>;
  parseKey: (tileKey: TileKey) => [number, number];
  wrapX: (value: number, mod: number) => number;
  wrapY: (value: number, mod: number) => number;
  activeSettlementTileKeyForPlayer: (playerId: string) => TileKey | undefined;
  effectiveVisionRadiusForPlayer: (player: Player) => number;
}

export interface ServerVisibilityStateRuntime {
  isValidCapitalTile: (player: Player, tileKey: TileKey | undefined) => tileKey is TileKey;
  chooseCapitalTileKey: (player: Player) => TileKey | undefined;
  markVisibilityDirty: (playerId: string) => void;
  markVisibilityDirtyForPlayers: (playerIds: Iterable<string>) => void;
  setRevealTargetsForPlayer: (playerId: string, targetPlayerIds: Iterable<string>) => Set<string>;
  visibilitySnapshotForPlayer: (player: Player) => VisibilitySnapshot;
  visibleInSnapshot: (snapshot: VisibilitySnapshot, x: number, y: number) => boolean;
  visible: (player: Player, x: number, y: number) => boolean;
}

export const createServerVisibilityStateRuntime = (
  deps: CreateServerVisibilityStateRuntimeDeps
): ServerVisibilityStateRuntime => {
  const tileIndex = (x: number, y: number): number => y * deps.WORLD_WIDTH + x;

  const isValidCapitalTile = (player: Player, tileKey: TileKey | undefined): tileKey is TileKey => {
    if (!tileKey) return false;
    return deps.ownership.get(tileKey) === player.id && deps.ownershipStateByTile.get(tileKey) === "SETTLED";
  };

  const chooseCapitalTileKey = (player: Player): TileKey | undefined => {
    const settlementTile = deps.activeSettlementTileKeyForPlayer(player.id);
    if (settlementTile) return settlementTile;
    if (isValidCapitalTile(player, player.spawnOrigin)) return player.spawnOrigin;
    const settledTowns = [...deps.townsByTile.keys()]
      .filter((tileKey) => deps.ownership.get(tileKey) === player.id && deps.ownershipStateByTile.get(tileKey) === "SETTLED")
      .sort();
    if (settledTowns.length > 0) return settledTowns[0];
    const settledTiles = [...player.territoryTiles].filter((tileKey) => deps.ownershipStateByTile.get(tileKey) === "SETTLED").sort();
    return settledTiles[0];
  };

  const markVisibilityDirty = (playerId: string): void => {
    deps.cachedVisibilitySnapshotByPlayer.delete(playerId);
    deps.chunkSnapshotGenerationByPlayer.delete(playerId);
  };

  const markVisibilityDirtyForPlayers = (playerIds: Iterable<string>): void => {
    for (const playerId of playerIds) markVisibilityDirty(playerId);
  };

  const addRevealWatcher = (targetPlayerId: string, watcherPlayerId: string): void => {
    let watchers = deps.revealWatchersByTarget.get(targetPlayerId);
    if (!watchers) {
      watchers = new Set<string>();
      deps.revealWatchersByTarget.set(targetPlayerId, watchers);
    }
    watchers.add(watcherPlayerId);
  };

  const removeRevealWatcher = (targetPlayerId: string, watcherPlayerId: string): void => {
    const watchers = deps.revealWatchersByTarget.get(targetPlayerId);
    if (!watchers) return;
    watchers.delete(watcherPlayerId);
    if (watchers.size === 0) deps.revealWatchersByTarget.delete(targetPlayerId);
  };

  const setRevealTargetsForPlayer = (playerId: string, targetPlayerIds: Iterable<string>): Set<string> => {
    const nextTargets = new Set<string>(targetPlayerIds);
    const currentTargets = deps.revealedEmpireTargetsByPlayer.get(playerId);
    if (currentTargets) {
      for (const targetPlayerId of currentTargets) removeRevealWatcher(targetPlayerId, playerId);
    }
    deps.revealedEmpireTargetsByPlayer.set(playerId, nextTargets);
    for (const targetPlayerId of nextTargets) addRevealWatcher(targetPlayerId, playerId);
    markVisibilityDirty(playerId);
    return nextTargets;
  };

  const buildVisibilitySnapshot = (player: Player): VisibilitySnapshot => {
    if (deps.DISABLE_FOG || deps.fogDisabledByPlayer.get(player.id) === true) {
      return { allVisible: true, visibleMask: new Uint8Array(0) };
    }

    const visibleMask = new Uint8Array(deps.WORLD_WIDTH * deps.WORLD_HEIGHT);
    const revealRadiusForPlayer = (nextPlayer: Player): void => {
      const radius = deps.effectiveVisionRadiusForPlayer(nextPlayer);
      for (const tileKey of nextPlayer.territoryTiles) {
        const [tx, ty] = deps.parseKey(tileKey);
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            const vx = deps.wrapX(tx + dx, deps.WORLD_WIDTH);
            const vy = deps.wrapY(ty + dy, deps.WORLD_HEIGHT);
            visibleMask[tileIndex(vx, vy)] = 1;
          }
        }
      }
    };

    const forced = deps.forcedRevealTilesByPlayer.get(player.id);
    if (forced) {
      for (const tileKey of forced) {
        const [fx, fy] = deps.parseKey(tileKey);
        visibleMask[tileIndex(fx, fy)] = 1;
      }
    }

    const revealTargets = deps.revealedEmpireTargetsByPlayer.get(player.id);
    if (revealTargets && revealTargets.size > 0) {
      for (const targetId of revealTargets) {
        const target = deps.players.get(targetId);
        if (!target) continue;
        for (const tileKey of target.territoryTiles) {
          const [rx, ry] = deps.parseKey(tileKey);
          visibleMask[tileIndex(rx, ry)] = 1;
        }
      }
    }

    revealRadiusForPlayer(player);
    for (const allyId of player.allies) {
      const ally = deps.players.get(allyId);
      if (!ally) continue;
      revealRadiusForPlayer(ally);
    }

    return { allVisible: false, visibleMask };
  };

  const visibilitySnapshotForPlayer = (player: Player): VisibilitySnapshot => {
    const cached = deps.cachedVisibilitySnapshotByPlayer.get(player.id);
    if (cached) return cached;
    const snapshot = buildVisibilitySnapshot(player);
    deps.cachedVisibilitySnapshotByPlayer.set(player.id, snapshot);
    return snapshot;
  };

  const visibleInSnapshot = (snapshot: VisibilitySnapshot, x: number, y: number): boolean => {
    if (snapshot.allVisible) return true;
    return snapshot.visibleMask[tileIndex(x, y)] === 1;
  };

  const visible = (player: Player, x: number, y: number): boolean =>
    visibleInSnapshot(
      visibilitySnapshotForPlayer(player),
      deps.wrapX(x, deps.WORLD_WIDTH),
      deps.wrapY(y, deps.WORLD_HEIGHT)
    );

  return {
    isValidCapitalTile,
    chooseCapitalTileKey,
    markVisibilityDirty,
    markVisibilityDirtyForPlayers,
    setRevealTargetsForPlayer,
    visibilitySnapshotForPlayer,
    visibleInSnapshot,
    visible
  };
};
