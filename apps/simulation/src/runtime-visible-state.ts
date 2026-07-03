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
  const union = new Set<string>();
  for (const player of input.players.values()) {
    if (player.id.startsWith("barbarian-")) continue;
    const summary = input.summaryForPlayer(player.id);
    const radius = Math.max(
      1,
      Math.floor(VISION_RADIUS * (player.mods?.vision ?? 1)) + visionRadiusBonusForPlayer(player)
    );
    for (const tileKey of summary.territoryTileKeys) {
      const [rawX, rawY] = tileKey.split(",");
      const x = Number(rawX);
      const y = Number(rawY);
      if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const wx = ((x + dx) % WORLD_WIDTH + WORLD_WIDTH) % WORLD_WIDTH;
          const wy = ((y + dy) % WORLD_HEIGHT + WORLD_HEIGHT) % WORLD_HEIGHT;
          union.add(`${wx},${wy}`);
        }
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
      input.applyManpowerRegen(player);
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
