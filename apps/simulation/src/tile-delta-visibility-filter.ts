import { VISION_RADIUS, WORLD_HEIGHT, WORLD_WIDTH, type Terrain } from "@border-empires/shared";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { collectLinkedDockRevealKeysForOwners, type DockRouteDefinition } from "./dock-network/dock-network.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import { visionRadiusBonusForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";

export type VisibilityAuditSample = {
  playerId: string;
  tileKey: string;
  x: number;
  y: number;
  ownerId: string;
  reasons: string[];
  redacted: boolean;
};

type TileLockShape = {
  playerId: string;
  originKey: string;
  targetKey: string;
};

type PlayerSummaryShape = {
  territoryTileKeys: ReadonlySet<string>;
};

type PlayerShape = Pick<DomainPlayer, "id" | "allies" | "techIds" | "domainIds"> & {
  mods?: DomainPlayer["mods"];
};

type TileShape = Pick<DomainTileState, "ownershipState" | "ownerId">;

export interface TileDeltaVisibilityFilterDeps {
  readonly players: ReadonlyMap<string, PlayerShape>;
  readonly tiles: ReadonlyMap<string, TileShape>;
  readonly locksByTile: ReadonlyMap<string, TileLockShape>;
  readonly docks: readonly DockRouteDefinition[];
  readonly dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  readonly summaryForPlayer: (playerId: string) => PlayerSummaryShape;
  readonly onVisibilityAudit?: (sample: VisibilityAuditSample) => void;
  // Optional cache: avoids rebuilding the O(territory × radius²) Minkowski
  // dilation on every TILE_DELTA_BATCH. Keyed by playerId, invalidated when
  // collectionVersion changes (bumped on any territory mutation).
  readonly eagerVisibilitySetCache?: Map<string, { collectionVersion: number; keys: Set<string> }>;
  readonly tileCollectionVersionForPlayer?: (playerId: string) => number;
  // Astral Dock's Launch Satellite ability: while active, the player sees the
  // whole map regardless of territory/dock/observatory vision, so the normal
  // radius filtering is skipped entirely for them.
  readonly hasFullVision?: (playerId: string) => boolean;
}

const dilateTerritoryIntoSet = (
  target: Set<string>,
  territoryTileKeys: Iterable<string>,
  radius: number
): void => {
  for (const tileKey of territoryTileKeys) {
    const separator = tileKey.indexOf(",");
    if (separator < 0) continue;
    const tx = Number(tileKey.slice(0, separator));
    const ty = Number(tileKey.slice(separator + 1));
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) continue;
    for (let dx = -radius; dx <= radius; dx += 1) {
      const nx = ((tx + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const ny = ((ty + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
        target.add(simulationTileKey(nx, ny));
      }
    }
  }
};

// Used only by the audit path (useEagerVisibilitySet=false), which emits
// per-reason strings the eager Set can't reconstruct.
const isTileWithinTerritoryRadius = (
  x: number,
  y: number,
  territoryTileKeys: Iterable<string>,
  radius: number
): boolean => {
  for (const tileKey of territoryTileKeys) {
    const separator = tileKey.indexOf(",");
    if (separator < 0) continue;
    const tx = Number(tileKey.slice(0, separator));
    const ty = Number(tileKey.slice(separator + 1));
    if (!Number.isInteger(tx) || !Number.isInteger(ty)) continue;
    const dxRaw = Math.abs(x - tx);
    const dyRaw = Math.abs(y - ty);
    const dx = Math.min(dxRaw, WORLD_WIDTH - dxRaw);
    if (dx > radius) continue;
    const dy = Math.min(dyRaw, WORLD_HEIGHT - dyRaw);
    if (dy > radius) continue;
    return true;
  }
  return false;
};

export const filterTileDeltasForPlayer = <
  TDelta extends { x: number; y: number; terrain?: Terrain | undefined; ownerId?: string | undefined }
>(
  deps: TileDeltaVisibilityFilterDeps,
  tileDeltas: readonly TDelta[],
  playerId: string
): TDelta[] => {
  if (tileDeltas.length === 0) return [];
  const primaryPlayer = deps.players.get(playerId);
  if (!primaryPlayer) return [];
  if (deps.hasFullVision?.(playerId)) return tileDeltas.slice();

  const playerSummary = deps.summaryForPlayer(playerId);
  const playerVisionRadius = Math.max(
    1,
    Math.floor(VISION_RADIUS * (primaryPlayer.mods?.vision ?? 1)) + visionRadiusBonusForPlayer(primaryPlayer)
  );
  const allyVision: Array<{ allyId: string; territory: ReadonlySet<string>; radius: number }> = [];
  for (const allyId of primaryPlayer.allies) {
    const ally = deps.players.get(allyId);
    if (!ally) continue;
    allyVision.push({
      allyId,
      territory: deps.summaryForPlayer(allyId).territoryTileKeys,
      radius: Math.max(1, Math.floor(VISION_RADIUS * (ally.mods?.vision ?? 1)) + visionRadiusBonusForPlayer(ally))
    });
  }
  const allyAndSelfIds = new Set<string>([playerId, ...primaryPlayer.allies]);
  const lockOriginKeys = new Set<string>();
  const lockTargetKeys = new Set<string>();
  for (const lock of deps.locksByTile.values()) {
    if (lock.playerId !== playerId) continue;
    lockOriginKeys.add(lock.originKey);
    lockTargetKeys.add(lock.targetKey);
  }
  const visibilityOwnerIds = new Set<string>([playerId, ...primaryPlayer.allies]);
  const dockRevealKeys = collectLinkedDockRevealKeysForOwners(
    visibilityOwnerIds,
    deps.docks,
    (tileKey) => {
      const tile = deps.tiles.get(tileKey);
      return tile?.ownershipState === "SETTLED" ? tile.ownerId : undefined;
    },
    deps.dockLinksByDockTileKey,
    WORLD_WIDTH,
    WORLD_HEIGHT
  );
  const auditEnabled = Boolean(deps.onVisibilityAudit);

  // Audit mode keeps the lazy path: it emits per-reason strings the eager Set
  // can't reconstruct without per-source bookkeeping. Audit is only enabled
  // for tests/diagnostics, so the perf trade-off is in the right place.
  // The epoch cache (visibilityEpoch) amortises the Set build across the whole
  // tick, so the eager path is always cheaper than the O(territory) lazy path.
  const useEagerVisibilitySet = !auditEnabled;
  let eagerVisibleKeys: Set<string> | undefined;
  if (useEagerVisibilitySet) {
    const collectionVersion = deps.tileCollectionVersionForPlayer?.(playerId) ?? -1;
    const cached = deps.eagerVisibilitySetCache?.get(playerId);
    if (cached && cached.collectionVersion === collectionVersion && collectionVersion >= 0) {
      eagerVisibleKeys = cached.keys;
    } else {
      eagerVisibleKeys = new Set<string>();
      dilateTerritoryIntoSet(eagerVisibleKeys, playerSummary.territoryTileKeys, playerVisionRadius);
      for (const { territory, radius } of allyVision) {
        dilateTerritoryIntoSet(eagerVisibleKeys, territory, radius);
      }
      for (const key of lockOriginKeys) eagerVisibleKeys.add(key);
      for (const key of dockRevealKeys) eagerVisibleKeys.add(key);
      if (deps.eagerVisibilitySetCache && collectionVersion >= 0) {
        deps.eagerVisibilitySetCache.set(playerId, { collectionVersion, keys: eagerVisibleKeys });
      }
    }
  }

  const filtered: TDelta[] = [];
  for (const delta of tileDeltas) {
    const tileKey = simulationTileKey(delta.x, delta.y);
    let visible = false;
    let viaLockTargetOnly = false;
    const reasons: string[] = [];

    if (useEagerVisibilitySet && eagerVisibleKeys) {
      if (eagerVisibleKeys.has(tileKey)) visible = true;
    } else {
      if (isTileWithinTerritoryRadius(delta.x, delta.y, playerSummary.territoryTileKeys, playerVisionRadius)) {
        visible = true;
        if (auditEnabled) reasons.push("radius:self");
      }
      if (auditEnabled || !visible) {
        for (const { allyId, territory, radius } of allyVision) {
          if (isTileWithinTerritoryRadius(delta.x, delta.y, territory, radius)) {
            visible = true;
            if (auditEnabled) reasons.push(`radius:ally:${allyId}`);
            else break;
          }
        }
      }
      if ((auditEnabled || !visible) && lockOriginKeys.has(tileKey)) {
        visible = true;
        if (auditEnabled) reasons.push("lock-origin");
      }
      if ((auditEnabled || !visible) && dockRevealKeys.has(tileKey)) {
        visible = true;
        if (auditEnabled) reasons.push("dock-reveal");
      }
    }
    if (lockTargetKeys.has(tileKey)) {
      if (!visible) {
        visible = true;
        viaLockTargetOnly = true;
        if (auditEnabled) reasons.push("lock-target");
      }
    }
    if (!visible) continue;

    const ownedByOther = Boolean(delta.ownerId) && !allyAndSelfIds.has(delta.ownerId as string);
    if (viaLockTargetOnly && ownedByOther) {
      if (auditEnabled && deps.onVisibilityAudit) {
        deps.onVisibilityAudit({
          playerId,
          tileKey,
          x: delta.x,
          y: delta.y,
          ownerId: delta.ownerId as string,
          reasons,
          redacted: true
        });
      }
      filtered.push({ x: delta.x, y: delta.y, ...(delta.terrain ? { terrain: delta.terrain } : {}) } as TDelta);
      continue;
    }
    if (ownedByOther && auditEnabled && deps.onVisibilityAudit) {
      deps.onVisibilityAudit({
        playerId,
        tileKey,
        x: delta.x,
        y: delta.y,
        ownerId: delta.ownerId as string,
        reasons,
        redacted: false
      });
    }
    filtered.push(delta);
  }
  return filtered;
};
