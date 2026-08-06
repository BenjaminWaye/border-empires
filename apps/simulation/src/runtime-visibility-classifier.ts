import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import type { DockRouteDefinition } from "./dock-network/dock-network.js";
import { collectLinkedDockRevealKeysForOwners } from "./dock-network/dock-network.js";
import type { LockRecord, RuntimePlayer } from "./runtime-types.js";
import type { DomainTileState } from "@border-empires/game-domain";

export interface VisibilityCoverageReader {
  forEachVisibleKey(viewerId: string, cb: (key: string) => void): void;
  reasonsForTile(viewerId: string, tileKey: string): ReadonlySet<string>;
}

export type RuntimeVisibilityClassification = {
  lockOriginKeys: Set<string>;
  dockRevealKeys: Set<string>;
  lockTargetOnlyKeys: Set<string>;
  fullVisionKeys: Set<string>;
  visibleKeys: Set<string>;
  allyAndSelfIds: Set<string>;
  // Explains why `tileKey` is visible to this classification's player (e.g.
  // "radius:self", "radius:ally:<id>", "light-outpost", "temporary-reveal")
  // — reads straight from the incrementally-maintained coverage cache, no
  // recomputation. Used by the security/anti-cheat visibility audit
  // (runtime-visible-state.ts) to flag unattributed visibility.
  coverageReasonsForTile: (tileKey: string) => ReadonlySet<string>;
};

export const classifyVisibilityForPlayer = (input: {
  playerId: string;
  players: ReadonlyMap<string, RuntimePlayer>;
  tiles: ReadonlyMap<string, DomainTileState>;
  locksByTile: ReadonlyMap<string, LockRecord>;
  docks: readonly DockRouteDefinition[];
  dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  applyManpowerRegen: (player: RuntimePlayer) => void;
  // Single source of truth for territory, ally, town-ring, and structure-bonus
  // (e.g. light outpost) vision — incrementally maintained by the runtime on
  // every ownership/alliance/radius/structure change (see
  // visibility-coverage-cache.ts), so reading it here is O(territory) at
  // worst (one entry per already-covered tile) instead of the O(territory×r²)
  // recompute the old per-player vision-expansion cache paid on every
  // territory/vision-mod change. This also guarantees the full-export
  // snapshot (login/reconnect/refresh) always matches what streaming
  // tile-deltas already show a connected client — the two code paths used to
  // read from two independently-maintained caches, which is how a
  // structure-only vision source (light outposts) could show up live but
  // vanish on refresh.
  visibilityCoverage: VisibilityCoverageReader;
}): RuntimeVisibilityClassification => {
  const lockOriginKeys = new Set<string>();
  const dockRevealKeys = new Set<string>();
  const fullVisionKeys = new Set<string>();

  const primaryPlayer = input.players.get(input.playerId);
  if (primaryPlayer) {
    input.applyManpowerRegen(primaryPlayer);
    for (const allyId of primaryPlayer.allies) {
      const ally = input.players.get(allyId);
      if (ally) input.applyManpowerRegen(ally);
    }
  }
  // Covers self territory, each ally's territory, town +1 rings (self and
  // ally), and structure-based bonuses (light outposts) in one pass — the
  // coverage cache already tracks all of these per viewer. Also covers the
  // "fog admin" case (a session whose UID has no live row in input.players
  // but owns tiles via seed data): tileOwnershipChanged is invoked for every
  // tile at boot/mutation regardless of whether the owner has a player row,
  // defaulting to vision=1/no-allies for such ids, so it needs no special
  // fallback here.
  input.visibilityCoverage.forEachVisibleKey(input.playerId, (key) => fullVisionKeys.add(key));

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
    lockOriginKeys,
    dockRevealKeys,
    lockTargetOnlyKeys,
    fullVisionKeys,
    visibleKeys,
    allyAndSelfIds,
    coverageReasonsForTile: (tileKey: string) => input.visibilityCoverage.reasonsForTile(input.playerId, tileKey)
  };
};
