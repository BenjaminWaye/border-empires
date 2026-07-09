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

export interface VisibilityCoverageReader {
  isVisible(viewerId: string, tileKey: string): boolean;
}

export interface TileDeltaVisibilityFilterDeps {
  readonly players: ReadonlyMap<string, PlayerShape>;
  readonly tiles: ReadonlyMap<string, TileShape>;
  readonly locksByTile: ReadonlyMap<string, TileLockShape>;
  readonly docks: readonly DockRouteDefinition[];
  readonly dockLinksByDockTileKey: ReadonlyMap<string, readonly string[]>;
  readonly summaryForPlayer: (playerId: string) => PlayerSummaryShape;
  readonly onVisibilityAudit?: (sample: VisibilityAuditSample) => void;
  // Incrementally-maintained territory-dilation coverage (see
  // visibility-coverage-cache.ts). Kept correct by the caller on every tile
  // ownership change, alliance change, and vision-radius change, so the hot
  // path here is an O(1) lookup per delta instead of an O(territory × radius²)
  // rebuild. Falls back to the lazy per-tile scan (below) when omitted, which
  // callers should only do for tests/diagnostics.
  readonly visibilityCoverage?: VisibilityCoverageReader;
  // Astral Dock's Launch Satellite ability: while active, the player sees the
  // whole map regardless of territory/dock/observatory vision, so the normal
  // radius filtering is skipped entirely for them.
  readonly hasFullVision?: (playerId: string) => boolean;
}

// Used only by the audit path (no visibilityCoverage reader supplied, or
// audit is enabled), which emits per-reason strings the coverage cache can't
// reconstruct without per-source bookkeeping.
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

export interface TileDeltaVisibilityFilterOptions {
  // Lets a minimal ownership-clearing signal (x, y, ownerId: undefined,
  // ownershipState: undefined) through for tiles that are NOT currently
  // visible to the player, so stale ownership (e.g. barbarian ghosts left
  // behind after territory movement) gets cleaned up client-side even after
  // the tile leaves the player's fog-of-war radius. Off by default because
  // several callers (survey sweep's "is this tile already visible" check,
  // the bootstrap visible-state exporter) rely on an EMPTY result meaning
  // "not visible" -- only the live tile-delta broadcast path should set
  // this to true.
  includeOwnershipClears?: boolean;
}

export const filterTileDeltasForPlayer = <
  TDelta extends { x: number; y: number; terrain?: Terrain | undefined; ownerId?: string | undefined }
>(
  deps: TileDeltaVisibilityFilterDeps,
  tileDeltas: readonly TDelta[],
  playerId: string,
  options?: TileDeltaVisibilityFilterOptions
): TDelta[] => {
  if (tileDeltas.length === 0) return [];
  const primaryPlayer = deps.players.get(playerId);
  if (!primaryPlayer) return [];
  if (deps.hasFullVision?.(playerId)) return tileDeltas.slice();

  const auditEnabled = Boolean(deps.onVisibilityAudit);
  // The coverage cache is kept correct incrementally by the caller (see
  // visibility-coverage-cache.ts) — no invalidate/rebuild happens here, so
  // this branch is a pure O(1)-per-delta lookup. It is used whenever a
  // coverage cache is supplied, REGARDLESS of whether audit is enabled:
  // onVisibilityAudit is wired unconditionally in production (an always-on
  // anti-cheat "was this reveal attributed" signal, not a
  // tests/diagnostics-only flag), so gating this on `!auditEnabled` would
  // silently disable the fast path in production and fall through to the
  // O(territory) scan below on every delta. Audit still gets a valid
  // (coarse) attribution tag from the coverage-cache path — see reasons.push
  // below — it just can't reconstruct WHICH source (self vs which ally)
  // without per-source bookkeeping. The fully granular per-source lazy scan
  // is reserved for when no coverage cache is supplied at all (tests only).
  const useCoverageCache = Boolean(deps.visibilityCoverage);

  const playerSummary = deps.summaryForPlayer(playerId);
  let playerVisionRadius = 0;
  const allyVision: Array<{ allyId: string; territory: ReadonlySet<string>; radius: number }> = [];
  if (!useCoverageCache) {
    playerVisionRadius = Math.max(
      1,
      Math.floor(VISION_RADIUS * (primaryPlayer.mods?.vision ?? 1)) + visionRadiusBonusForPlayer(primaryPlayer)
    );
    for (const allyId of primaryPlayer.allies) {
      const ally = deps.players.get(allyId);
      if (!ally) continue;
      allyVision.push({
        allyId,
        territory: deps.summaryForPlayer(allyId).territoryTileKeys,
        radius: Math.max(1, Math.floor(VISION_RADIUS * (ally.mods?.vision ?? 1)) + visionRadiusBonusForPlayer(ally))
      });
    }
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

  const filtered: TDelta[] = [];
  for (const delta of tileDeltas) {
    const tileKey = simulationTileKey(delta.x, delta.y);
    let visible = false;
    let viaLockTargetOnly = false;
    const reasons: string[] = [];

    if (useCoverageCache) {
      if (deps.visibilityCoverage!.isVisible(playerId, tileKey)) {
        visible = true;
        // Coarse attribution: the coverage cache doesn't retain which
        // specific source (self vs which ally) contributed the cell, but
        // "coverage-cache" is enough to mark this as attributed rather than
        // the security-relevant "unattributed" case (empty reasons).
        if (auditEnabled) reasons.push("coverage-cache");
      }
      if ((auditEnabled || !visible) && lockOriginKeys.has(tileKey)) {
        visible = true;
        if (auditEnabled) reasons.push("lock-origin");
      }
      if ((auditEnabled || !visible) && dockRevealKeys.has(tileKey)) {
        visible = true;
        if (auditEnabled) reasons.push("dock-reveal");
      }
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
    if (!visible) {
      // Ownership-clearing deltas must always reach the client so stale
      // ownership (e.g. barbarian ghosts from territory movement) is cleaned
      // up even when the tile has fallen out of the player's visible area.
      // Gated on options.includeOwnershipClears: only the live broadcast
      // path opts into this -- other callers (survey sweep's visibility
      // check, the bootstrap visible-state exporter) rely on an empty
      // result meaning "not visible", and buildSparseDelta now ALWAYS
      // includes ownerId/ownershipState on every emitted delta (see
      // tile-delta-stringify-cache.ts), so an ungated check here would fire
      // for every non-visible tile currently without an owner, not just
      // genuine clear transitions. We also forward only the minimal
      // ownership-state fields, never the rest of the delta's substructure
      // (fort/muster/sabotage/yield/etc.), for a tile the player can't see.
      //
      // Fog-of-war interaction: a tile that just left this player's vision
      // this same tick (refcount already hit 0 by the time this filter
      // runs — see visibility-coverage-cache.ts) reaches this branch. If it
      // also happens to be a genuine ownership-clear, the minimal stub
      // pushed below is superseded downstream by stampVisibilityAndMergeFogDeltas
      // (tile-delta-visibility-stamp.ts), which replaces/merges it with a
      // full FOG-stamped delta built from current tile state — no double
      // delta for the same tile reaches the wire.
      if (!options?.includeOwnershipClears) continue;
      const ownerIdCleared = "ownerId" in delta && !delta.ownerId;
      if (!ownerIdCleared) continue;
      filtered.push({
        x: delta.x,
        y: delta.y,
        ownerId: undefined,
        ...("ownershipState" in delta ? { ownershipState: undefined } : {}),
        ownershipClearOnly: true
      } as unknown as TDelta);
      continue;
    }

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
