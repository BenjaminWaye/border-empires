import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import type { DockRouteDefinition } from "./dock-network/dock-network.js";
import { collectLinkedDockRevealKeysForOwners } from "./dock-network/dock-network.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { visionRadiusBonusForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import type { LockRecord, RuntimePlayer } from "./runtime-types.js";
import type { DomainTileState } from "@border-empires/game-domain";
import type { VisionExpansionCache } from "./vision-expansion-cache.js";

export type RuntimeVisibilityClassification = {
  radiusSelfKeys: ReadonlySet<string>;
  radiusAllyKeys: Map<string, ReadonlySet<string>>;
  lockOriginKeys: Set<string>;
  dockRevealKeys: Set<string>;
  lockTargetOnlyKeys: Set<string>;
  fullVisionKeys: Set<string>;
  visibleKeys: Set<string>;
  allyAndSelfIds: Set<string>;
};

export const classifyVisibilityForPlayer = (input: {
  playerId: string;
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  locksByTile: ReadonlyMap<string, LockRecord>;
  docks: readonly DockRouteDefinition[];
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  applyManpowerRegen: (player: RuntimePlayer) => void;
  // Per-player territorial vision expansion cache. radiusSelfKeys and the values
  // of radiusAllyKeys come from here — each expansion is recomputed only when the
  // player's (tileCollectionVersion, vision, visionRadiusBonus) signature changes,
  // so large empires pay O(territory×r²) at most once between tile mutations.
  visionExpansionCache: VisionExpansionCache;
  tileCollectionVersionForPlayer: (playerId: string) => number;
}): RuntimeVisibilityClassification => {
  const radiusAllyKeys = new Map<string, ReadonlySet<string>>();
  const lockOriginKeys = new Set<string>();
  const dockRevealKeys = new Set<string>();
  const fullVisionKeys = new Set<string>();

  let radiusSelfKeys: ReadonlySet<string> = new Set<string>();

  const primaryPlayer = input.players.get(input.playerId);
  if (primaryPlayer) {
    input.applyManpowerRegen(primaryPlayer);
    const primarySummary = input.summaryForPlayer(input.playerId);
    radiusSelfKeys = input.visionExpansionCache.getOrCompute(
      input.playerId,
      primarySummary.territoryTileKeys,
      primaryPlayer.mods?.vision ?? 1,
      visionRadiusBonusForPlayer(primaryPlayer),
      input.tileCollectionVersionForPlayer(input.playerId)
    );
    for (const key of radiusSelfKeys) fullVisionKeys.add(key);
    for (const allyId of primaryPlayer.allies) {
      const ally = input.players.get(allyId);
      if (!ally) continue;
      input.applyManpowerRegen(ally);
      const allyKeys = input.visionExpansionCache.getOrCompute(
        allyId,
        input.summaryForPlayer(allyId).territoryTileKeys,
        ally.mods?.vision ?? 1,
        visionRadiusBonusForPlayer(ally),
        input.tileCollectionVersionForPlayer(allyId)
      );
      radiusAllyKeys.set(allyId, allyKeys);
      for (const key of allyKeys) fullVisionKeys.add(key);
    }
  } else {
    // Fallback for sessions whose Firebase UID has no live player row in
    // input.players (the fog admin auth lands here when the admin hasn't joined
    // as a normal player). Use default vision=1 and visionRadiusBonus=0 since we
    // have no live mods. This path is cold and correctness > speed.
    const territoryTileKeys: string[] = [];
    for (const [tileKey, tile] of input.tiles) {
      if (tile.ownerId === input.playerId) territoryTileKeys.push(tileKey);
    }
    if (territoryTileKeys.length > 0) {
      radiusSelfKeys = input.visionExpansionCache.getOrCompute(
        input.playerId,
        territoryTileKeys,
        1,
        0,
        input.tileCollectionVersionForPlayer(input.playerId)
      );
      for (const key of radiusSelfKeys) fullVisionKeys.add(key);
    }
  }
  for (const lock of input.locksByTile.values()) {
    if (lock.playerId !== input.playerId) continue;
    lockOriginKeys.add(lock.originKey);
    fullVisionKeys.add(lock.originKey);
  }
  if (primaryPlayer) {
    const visibilityOwnerIds = new Set<string>([input.playerId, ...primaryPlayer.allies]);
    for (const revealKey of collectLinkedDockRevealKeysForOwners(
      visibilityOwnerIds,
      input.docks,
      (tileKey) => {
        const tile = input.tiles.get(tileKey);
        return tile?.ownershipState === "SETTLED" ? tile.ownerId : undefined;
      },
      input.dockLinksByDockTileKey,
      WORLD_WIDTH,
      WORLD_HEIGHT
    )) {
      dockRevealKeys.add(revealKey);
      fullVisionKeys.add(revealKey);
    }
  }

  const lockTargetOnlyKeys = new Set<string>();
  for (const lock of input.locksByTile.values()) {
    if (lock.playerId !== input.playerId) continue;
    if (fullVisionKeys.has(lock.targetKey)) continue;
    lockTargetOnlyKeys.add(lock.targetKey);
  }

  const allyAndSelfIds = new Set<string>([input.playerId, ...(primaryPlayer?.allies ?? [])]);
  const visibleKeys = new Set<string>([...fullVisionKeys, ...lockTargetOnlyKeys]);

  return {
    radiusSelfKeys,
    radiusAllyKeys,
    lockOriginKeys,
    dockRevealKeys,
    lockTargetOnlyKeys,
    fullVisionKeys,
    visibleKeys,
    allyAndSelfIds
  };
};
