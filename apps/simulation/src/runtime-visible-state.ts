import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  VISION_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type Terrain
} from "@border-empires/shared";
import type { VisibilityAuditSample } from "./tile-delta-visibility-filter.js";
import { simulationTileKey } from "./seed-state/seed-state.js";
import type { DockRouteDefinition } from "./dock-network/dock-network.js";
import type { PlayerRuntimeSummary } from "./player-runtime-summary.js";
import { cloneStrategicProduction, type PendingSettlementRecord } from "./player-runtime-summary.js";
import { visionRadiusBonusForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import type {
  LockRecord,
  RuntimePlayer,
  RuntimeTileYieldEconomyContext,
  SimulationTileWireDelta,
  StrategicResourceKey
} from "./runtime-types.js";
import type { RuntimeExportState } from "./runtime-state-export.js";
import type { RuntimeVisibilityClassification } from "./runtime-visibility-classifier.js";

type VisibilityPlayerProjectionDeps = {
  players: ReadonlyMap<string, RuntimePlayer>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  applyManpowerRegen: (player: RuntimePlayer) => void;
  refreshManpowerOnly: (player: RuntimePlayer) => void;
  incomePerMinuteForPlayer: (playerId: string) => number;
  cachedEconomySnapshot: (player: RuntimePlayer) => { strategicProductionPerMinute: Record<StrategicResourceKey, number> };
};

type VisibleStateSharedDeps = VisibilityPlayerProjectionDeps & {
  tiles: ReadonlyMap<string, DomainTileState>;
  locksByCommandId: ReadonlyMap<string, LockRecord>;
  pendingSettlementsByTile: ReadonlyMap<string, PendingSettlementRecord>;
  docks: readonly DockRouteDefinition[];
  tileYieldCollectedAtByTile: ReadonlyMap<string, number>;
  playerYieldCollectionEpochByPlayer: ReadonlyMap<string, number>;
  terrainEpoch: number;
  classifyVisibilityForPlayer: (playerId: string) => RuntimeVisibilityClassification;
  emitVisibilityAudit: (
    playerId: string,
    tile: { x: number; y: number; ownerId?: string | undefined },
    tileKey: string,
    redacted: boolean,
    classification: RuntimeVisibilityClassification
  ) => void;
  /** Seed sparse-delta baseline for every visible tile so command/tick deltas
   *  do not emit spurious null fields on first emission. */
  seedLastEmitted?: (tileKey: string, tile: DomainTileState) => void;
};

export type BarbActivationVisibilityCache = {
  union: Set<string> | null;
  signature: string;
};

export function getBarbActivationVisionSignature(input: {
  players: ReadonlyMap<string, DomainPlayer>;
  tileCollectionVersionForPlayer: (playerId: string) => number;
}): string {
  const parts: string[] = [];
  for (const player of input.players.values()) {
    if (player.id.startsWith("barbarian-")) continue;
    const tcv = input.tileCollectionVersionForPlayer(player.id);
    const v = player.mods?.vision ?? 1;
    const vrb = visionRadiusBonusForPlayer(player);
    parts.push(`${player.id}:${tcv}:${v}:${vrb}`);
  }
  parts.sort();
  return parts.join("|");
}

// Barb activation eligibility ("is this barb-owned tile currently visible to
// some non-barb player?") only ever gets queried against barb-owned tile keys
// (see system-job-barbarian-planner.ts). The naive approach — dilating every
// non-barb player's entire territory by their vision radius and unioning the
// result — computes visibility for the whole map when only barb tiles (a tiny
// sparse set) are ever looked up. With ~25 large empires that dilation was
// O(total non-barb territory × radius²), observed at 5+ seconds synchronously
// per (near-constant, since any player's tileCollectionVersion bump changes
// the cache signature) recompute.
//
// Inverted here: build a cheap O(territory) map of owned-tile → owner's vision
// radius (no dilation), then for each of the few barb-owned tiles, scan only
// that tile's own Chebyshev neighborhood (bounded by the largest radius in
// play) for a non-barb-owned tile whose radius covers the distance. Same
// visibility predicate, evaluated from the sparse side.
export function exportBarbActivationVisibleUnion(input: {
  players: ReadonlyMap<string, DomainPlayer>;
  summaryForPlayer: (playerId: string) => PlayerRuntimeSummary;
  tileCollectionVersionForPlayer: (playerId: string) => number;
  cache: BarbActivationVisibilityCache;
}): { keys: string[]; signature: string } {
  const signature = getBarbActivationVisionSignature(input);
  if (input.cache.union && input.cache.signature === signature) {
    return { keys: [...input.cache.union], signature };
  }

  // Numeric keys (wy * WORLD_WIDTH + wx) instead of `${wx},${wy}` strings —
  // this is the hottest loop in the function (up to (2*maxRadius+1)^2 probes
  // per barb tile), and the string-template key was allocating hundreds of
  // thousands of short-lived strings per recompute under a large barbarian
  // territory (~1283 tiles observed on staging). Numeric keys are GC-free.
  const radiusByOwnedTileNumericKey = new Map<number, number>();
  const barbarianPlayers: DomainPlayer[] = [];
  let maxRadius = 0;
  for (const player of input.players.values()) {
    if (player.id.startsWith("barbarian-")) {
      barbarianPlayers.push(player);
      continue;
    }
    const radius = Math.max(
      1,
      Math.floor(VISION_RADIUS * (player.mods?.vision ?? 1)) + visionRadiusBonusForPlayer(player)
    );
    if (radius > maxRadius) maxRadius = radius;
    const summary = input.summaryForPlayer(player.id);
    for (const tileKey of summary.territoryTileKeys) {
      const [rawX, rawY] = tileKey.split(",");
      const x = Number(rawX);
      const y = Number(rawY);
      if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
      radiusByOwnedTileNumericKey.set(y * WORLD_WIDTH + x, radius);
    }
  }

  const union = new Set<string>();
  if (maxRadius > 0 && radiusByOwnedTileNumericKey.size > 0) {
    for (const barbPlayer of barbarianPlayers) {
      const barbSummary = input.summaryForPlayer(barbPlayer.id);
      for (const tileKey of barbSummary.territoryTileKeys) {
        const [rawX, rawY] = tileKey.split(",");
        const x = Number(rawX);
        const y = Number(rawY);
        if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
        let visible = false;
        for (let dy = -maxRadius; dy <= maxRadius && !visible; dy += 1) {
          const wy = ((y + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
          for (let dx = -maxRadius; dx <= maxRadius; dx += 1) {
            const wx = ((x + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
            const ownerRadius = radiusByOwnedTileNumericKey.get(wy * WORLD_WIDTH + wx);
            if (ownerRadius !== undefined && Math.max(Math.abs(dx), Math.abs(dy)) <= ownerRadius) {
              visible = true;
              break;
            }
          }
        }
        if (visible) union.add(tileKey);
      }
    }
  }

  input.cache.union = union;
  input.cache.signature = signature;
  return { keys: [...union], signature };
}

export function emitVisibilityAudit(input: {
  onVisibilityAudit: ((sample: VisibilityAuditSample) => void) | undefined;
  playerId: string;
  tile: { x: number; y: number; ownerId?: string | undefined };
  tileKey: string;
  redacted: boolean;
  classification: RuntimeVisibilityClassification;
}): void {
  const onVisibilityAudit = input.onVisibilityAudit;
  if (!onVisibilityAudit) return;
  if (!input.tile.ownerId || input.classification.allyAndSelfIds.has(input.tile.ownerId)) return;
  const reasons: string[] = [];
  if (input.classification.radiusSelfKeys.has(input.tileKey)) reasons.push("radius:self");
  for (const [allyId, set] of input.classification.radiusAllyKeys) {
    if (set.has(input.tileKey)) reasons.push(`radius:ally:${allyId}`);
  }
  if (input.classification.lockOriginKeys.has(input.tileKey)) reasons.push("lock-origin");
  if (input.classification.dockRevealKeys.has(input.tileKey)) reasons.push("dock-reveal");
  if (input.classification.lockTargetOnlyKeys.has(input.tileKey)) reasons.push("lock-target");
  onVisibilityAudit({
    playerId: input.playerId,
    tileKey: input.tileKey,
    x: input.tile.x,
    y: input.tile.y,
    ownerId: input.tile.ownerId,
    reasons,
    redacted: input.redacted
  });
}

export function exportVisibleStateForPlayer(
  input: VisibleStateSharedDeps & { playerId: string }
): RuntimeExportState {
  const classification = input.classifyVisibilityForPlayer(input.playerId);
  const { lockTargetOnlyKeys, visibleKeys, allyAndSelfIds } = classification;

  return {
    tiles: [...visibleKeys]
      .map((tileKey) => {
        const tile = input.tiles.get(tileKey);
        if (!tile) return null;
        input.seedLastEmitted?.(tileKey, tile);
        return visibleTileProjection(input, input.playerId, tile, lockTargetOnlyKeys, allyAndSelfIds, classification);
      })
      .filter((entry): entry is RuntimeExportState["tiles"][number] => entry !== null)
      .sort((left, right) => left.x - right.x || left.y - right.y),
    players: visiblePlayersProjection(input, input.playerId),
    ...visibleSharedState(input)
  };
}

export async function exportVisibleStateForPlayerAsync(
  input: VisibleStateSharedDeps & {
    playerId: string;
    yieldToEventLoop: () => Promise<void>;
  }
): Promise<RuntimeExportState> {
  // Yield before the vision expansion so that a login gRPC request can
  // complete its handshake before we enter the (potentially 100–500 ms)
  // classifyVisibilityForPlayer call.  The expansion is O(territory × r²) on
  // a cold cache miss (busted by every replaceTileState), so on an active game
  // the cache is almost always cold when a player logs in mid-tick.
  await input.yieldToEventLoop();
  const classification = input.classifyVisibilityForPlayer(input.playerId);
  // No yield here — the tile-chunk loop yields every TILE_CHUNK tiles anyway, so a
  // redundant setImmediate between classification and the loop only adds latency.
  const { lockTargetOnlyKeys, visibleKeys, allyAndSelfIds } = classification;

  const TILE_CHUNK = 2_000;
  const tiles: RuntimeExportState["tiles"] = [];
  let idx = 0;
  for (const tileKey of visibleKeys) {
    const tile = input.tiles.get(tileKey);
    if (tile) {
      input.seedLastEmitted?.(tileKey, tile);
      tiles.push(visibleTileProjection(input, input.playerId, tile, lockTargetOnlyKeys, allyAndSelfIds, classification));
    }
    idx += 1;
    if (idx % TILE_CHUNK === 0) await input.yieldToEventLoop();
  }
  tiles.sort((left, right) => left.x - right.x || left.y - right.y);
  await input.yieldToEventLoop();

  return {
    tiles,
    players: visiblePlayersProjection(input, input.playerId),
    ...visibleSharedState(input)
  };
}

export function exportTilesInAreaForPlayer(input: {
  playerId: string;
  centerX: number;
  centerY: number;
  radius: number;
  fullVisibility: boolean | undefined;
  tiles: ReadonlyMap<string, DomainTileState>;
  players: ReadonlyMap<string, RuntimePlayer>;
  tileDeltaFromState: (tile: DomainTileState, context?: RuntimeTileYieldEconomyContext) => SimulationTileWireDelta;
  tileYieldEconomyContextForPlayer: (player: RuntimePlayer) => RuntimeTileYieldEconomyContext;
  filterTileDeltasForPlayer: (tileDeltas: readonly SimulationTileWireDelta[], playerId: string) => SimulationTileWireDelta[];
}): SimulationTileWireDelta[] {
  const wrapX = (value: number): number => ((value % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
  const wrapY = (value: number): number => ((value % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
  const tileOwner = input.tiles.get(simulationTileKey(wrapX(input.centerX), wrapY(input.centerY)))?.ownerId;
  const ownerForContext = tileOwner ? input.players.get(tileOwner) : undefined;
  const tileYieldContext = ownerForContext ? input.tileYieldEconomyContextForPlayer(ownerForContext) : undefined;
  const collected: SimulationTileWireDelta[] = [];
  const seen = new Set<string>();
  const r = Math.max(0, Math.floor(input.radius));
  for (let dy = -r; dy <= r; dy += 1) {
    for (let dx = -r; dx <= r; dx += 1) {
      const x = wrapX(input.centerX + dx);
      const y = wrapY(input.centerY + dy);
      const tileKey = simulationTileKey(x, y);
      if (seen.has(tileKey)) continue;
      seen.add(tileKey);
      const tile = input.tiles.get(tileKey);
      if (!tile) continue;
      const delta = input.tileDeltaFromState(
        tile,
        tile.ownerId && ownerForContext && tile.ownerId === ownerForContext.id ? tileYieldContext : undefined
      );
      collected.push(delta);
    }
  }
  if (input.fullVisibility) return collected;
  return input.filterTileDeltasForPlayer(collected, input.playerId);
}

function visibleTileProjection(
  input: Pick<VisibleStateSharedDeps, "emitVisibilityAudit">,
  playerId: string,
  tile: DomainTileState,
  lockTargetOnlyKeys: ReadonlySet<string>,
  allyAndSelfIds: ReadonlySet<string>,
  classification: RuntimeVisibilityClassification
): RuntimeExportState["tiles"][number] {
  const tileKey = simulationTileKey(tile.x, tile.y);
  const isLockTargetOnly = lockTargetOnlyKeys.has(tileKey);
  const ownedByOther = Boolean(tile.ownerId) && !allyAndSelfIds.has(tile.ownerId as string);
  if (isLockTargetOnly && ownedByOther) {
    input.emitVisibilityAudit(playerId, tile, tileKey, true, classification);
    return { x: tile.x, y: tile.y, terrain: tile.terrain };
  }
  if (ownedByOther) input.emitVisibilityAudit(playerId, tile, tileKey, false, classification);
  return {
    x: tile.x,
    y: tile.y,
    terrain: tile.terrain,
    ...(tile.resource ? { resource: tile.resource } : {}),
    ...(tile.dockId ? { dockId: tile.dockId } : {}),
    ...(tile.shardSite ? { shardSiteJson: JSON.stringify(tile.shardSite) } : {}),
    ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
    ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
    ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
    ...(tile.frontierDecayKind ? { frontierDecayKind: tile.frontierDecayKind } : {}),
    ...(tile.town ? { townJson: JSON.stringify(tile.town) } : {}),
    ...(tile.town?.type ? { townType: tile.town.type } : {}),
    ...(tile.town?.name ? { townName: tile.town.name } : {}),
    ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {}),
    ...(tile.fort ? { fortJson: JSON.stringify(tile.fort) } : {}),
    ...(tile.observatory ? { observatoryJson: JSON.stringify(tile.observatory) } : {}),
    ...(tile.siegeOutpost ? { siegeOutpostJson: JSON.stringify(tile.siegeOutpost) } : {}),
    ...(tile.economicStructure ? { economicStructureJson: JSON.stringify(tile.economicStructure) } : {}),
    ...(tile.sabotage ? { sabotageJson: JSON.stringify(tile.sabotage) } : {})
  };
}

function visiblePlayersProjection(
  input: VisibilityPlayerProjectionDeps,
  visiblePlayerId: string
): RuntimeExportState["players"] {
  return [...input.players.values()]
    .map((player) => {
      // Full economy accrual (applyManpowerRegen) only for the requesting
      // player — everyone else gets the manpower-only refresh, matching the
      // self-only cachedEconomySnapshot() branch on strategicProductionPerMinute
      // below, and the same skip-for-others pattern already proven safe in
      // exportPlannerWorldView / exportPlannerPlayerViews / exportPlayerDebugSnapshot
      // (see refreshManpowerOnly's doc comment: this export recomputing full
      // accrual for every player, every call, is exactly what caused the prior
      // sync_players_export event-loop block — same shape as this one, just a
      // different export function no one had gotten to yet). The manpower
      // number itself stays fully correct either way; only OTHER players'
      // gold/resource accrual is deferred to their own next command or tick.
      if (player.id === visiblePlayerId) {
        input.applyManpowerRegen(player);
      } else {
        input.refreshManpowerOnly(player);
      }
      const summary = input.summaryForPlayer(player.id);
      return {
        id: player.id,
        ...(player.name ? { name: player.name } : {}),
        points: player.points,
        manpower: player.manpower,
        ...(typeof player.manpowerCapSnapshot === "number" ? { manpowerCapSnapshot: player.manpowerCapSnapshot } : {}),
        techIds: [...player.techIds].sort(),
        domainIds: [...(player.domainIds ?? [])].sort(),
        strategicResources: { ...(player.strategicResources ?? {}) },
        allies: [...player.allies].sort(),
        truces: [...(player.truces ?? [])].sort(),
        vision: player.mods?.vision ?? 1,
        visionRadiusBonus: visionRadiusBonusForPlayer(player),
        incomeMultiplier: player.mods?.income ?? 1,
        ownedTownTileKeys: [...summary.ownedTownTierByTile.keys()],
        settledTileCount: summary.settledTileCount,
        townCount: summary.townCount,
        incomePerMinute: input.incomePerMinuteForPlayer(player.id),
        strategicProductionPerMinute: player.id === visiblePlayerId
          ? input.cachedEconomySnapshot(player).strategicProductionPerMinute
          : cloneStrategicProduction(summary.strategicProductionPerMinute),
        activeDevelopmentProcessCount: summary.activeDevelopmentProcessCount
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

function visibleSharedState(input: Pick<
  VisibleStateSharedDeps,
  | "pendingSettlementsByTile"
  | "locksByCommandId"
  | "docks"
  | "tileYieldCollectedAtByTile"
  | "playerYieldCollectionEpochByPlayer"
  | "terrainEpoch"
>): Omit<RuntimeExportState, "tiles" | "players"> {
  return {
    pendingSettlements: [...input.pendingSettlementsByTile.values()]
      .map((settlement) => ({ ...settlement }))
      .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
    activeLocks: [...input.locksByCommandId.values()]
      .map((lock) => ({
        commandId: lock.commandId,
        playerId: lock.playerId,
        actionType: lock.actionType,
        originKey: lock.originKey,
        targetKey: lock.targetKey,
        resolvesAt: lock.resolvesAt,
        ...(lock.combatResolution ? { combatResolutionJson: JSON.stringify(lock.combatResolution) } : {})
      }))
      .sort((left, right) => left.commandId.localeCompare(right.commandId)),
    docks: input.docks.map((dock) => ({ ...dock, ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {}) })),
    tileYieldCollectedAtByTile: [...input.tileYieldCollectedAtByTile.entries()]
      .map(([tileKey, collectedAt]) => ({ tileKey, collectedAt }))
      .sort((left, right) => left.tileKey.localeCompare(right.tileKey)),
    playerYieldCollectionEpochByPlayer: [...input.playerYieldCollectionEpochByPlayer.entries()]
      .map(([playerId, collectedAt]) => ({ playerId, collectedAt }))
      .sort((left, right) => left.playerId.localeCompare(right.playerId)),
    terrainEpoch: input.terrainEpoch
  };
}
