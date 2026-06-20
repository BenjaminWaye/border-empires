import {
  DEVELOPMENT_PROCESS_LIMIT,
  VISION_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "@border-empires/shared";
import type { PlayerRespawnNotice } from "@border-empires/shared";
import type { PlayerSubscriptionDock, PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { MANPOWER_BASE_CAP, MANPOWER_BASE_REGEN_PER_MINUTE, type DomainTileState } from "@border-empires/game-domain";

import type { SimulationRuntime } from "../runtime/runtime.js";
import { estimateIncomePerMinuteFromTiles, estimateStrategicProductionPerMinuteFromTiles } from "../player-runtime-summary.js";
import { buildLivePlayerEconomySnapshot, buildLivePlayerEconomySnapshotAsync, enrichSnapshotTilesForPlayer, enrichSnapshotTilesForPlayerAsync } from "../live-snapshot-view/live-snapshot-view.js";
import { buildDockLinksByDockTileKey, collectLinkedDockRevealKeysForOwners } from "../dock-network/dock-network.js";
import { buildWorldStatusSnapshot } from "../world-status-snapshot/world-status-snapshot.js";
import { buildModBreakdownForPlayer, recomputeMods } from "../tech-domain-bridge/tech-domain-bridge.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
import { shouldYieldAt } from "../event-loop-yield.js";

type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;

type SnapshotMaterializeTimingPhase =
  | "source_tiles_async"
  | "owned_tile_index_async"
  | "visible_tiles_async"
  | "queue_state_async"
  | "live_economy_async"
  | "enrich_tiles_async"
  | "world_status_async";

type SnapshotMaterializeTimingDetails = {
  tileCount?: number;
  sourceTileCount?: number;
  visibleTileCount?: number;
  playerCount?: number;
  pendingSettlementCount?: number;
  autoSettlementQueueCount?: number;
  fullVisibility?: boolean;
  includeWorldStatus?: boolean;
};

type BuildOptions = {
  includeWorldStatus?: boolean;
  fullVisibility?: boolean;
  sharedFullVisibilityTiles?: PlayerSubscriptionSnapshot["tiles"];
  worldStatusRuntimeState?: RuntimeState;
  seasonState?: PlayerSubscriptionSnapshot["season"];
  respawnNotice?: PlayerRespawnNotice;
  nonCompetitivePlayerIds?: ReadonlySet<string>;
  onAsyncPhaseTiming?: (
    phase: SnapshotMaterializeTimingPhase,
    durationMs: number,
    details?: SnapshotMaterializeTimingDetails
  ) => void;
};

export const buildPlayerSubscriptionSnapshot = (
  playerId: string,
  runtimeState: RuntimeState,
  fallbackTiles?: Iterable<DomainTileState>,
  options?: BuildOptions
): PlayerSubscriptionSnapshot => {
  const sourceTiles =
    runtimeState.tiles.length > 0
      ? [...runtimeState.tiles]
      : fallbackTiles
        ? [...fallbackTiles].map((tile) => ({
            x: tile.x,
            y: tile.y,
            terrain: tile.terrain,
            ...(tile.resource ? { resource: tile.resource } : {}),
            ...(tile.dockId ? { dockId: tile.dockId } : {}),
            ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
            ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
            ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
            ...(tile.town ? { townJson: JSON.stringify(tile.town) } : {}),
            ...(tile.town?.type ? { townType: tile.town.type } : {}),
            ...(tile.town?.name ? { townName: tile.town.name } : {}),
            ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {}),
            ...(tile.fort ? { fortJson: JSON.stringify(tile.fort) } : {}),
            ...(tile.observatory ? { observatoryJson: JSON.stringify(tile.observatory) } : {}),
            ...(tile.siegeOutpost ? { siegeOutpostJson: JSON.stringify(tile.siegeOutpost) } : {}),
            ...(tile.economicStructure ? { economicStructureJson: JSON.stringify(tile.economicStructure) } : {}),
            ...(tile.sabotage ? { sabotageJson: JSON.stringify(tile.sabotage) } : {}),
            ...(tile.shardSite ? { shardSiteJson: JSON.stringify(tile.shardSite) } : {})
          }))
        : [];

  const keyFor = (x: number, y: number): string => `${x},${y}`;
  const wrapX = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
  const wrapY = (y: number): number => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
  const parseKey = (tileKey: string): { x: number; y: number } | undefined => {
    const [rawX, rawY] = tileKey.split(",");
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    return { x, y };
  };

  const ownedTileKeysByPlayer = new Map<string, string[]>();
  for (const tile of sourceTiles) {
    if (!tile.ownerId) continue;
    let keys = ownedTileKeysByPlayer.get(tile.ownerId);
    if (!keys) {
      keys = [];
      ownedTileKeysByPlayer.set(tile.ownerId, keys);
    }
    keys.push(keyFor(tile.x, tile.y));
  }
  const ownedTileKeys = (pid: string): string[] => ownedTileKeysByPlayer.get(pid) ?? [];

  const playersById = new Map(runtimeState.players.map((player) => [player.id, player] as const));
  const addVision = (
    targetKeys: Set<string>,
    territoryTileKeys: Iterable<string>,
    vision: number,
    visionRadiusBonus: number
  ): void => {
    const radius = Math.max(1, Math.floor(VISION_RADIUS * vision) + visionRadiusBonus);
    for (const tileKey of territoryTileKeys) {
      const coords = parseKey(tileKey);
      if (!coords) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          targetKeys.add(keyFor(wrapX(coords.x + dx), wrapY(coords.y + dy)));
        }
      }
    }
  };
  const addVisionForPlayer = (targetKeys: Set<string>, nextPlayerId: string): void => {
    const nextPlayer = playersById.get(nextPlayerId);
    if (!nextPlayer) return;
    addVision(targetKeys, ownedTileKeys(nextPlayerId), nextPlayer.vision, nextPlayer.visionRadiusBonus);
  };

  const tiles =
    options?.fullVisibility === true
      ? sourceTiles
      : (() => {
          const visibleKeys = new Set<string>();
          const primaryPlayer = playersById.get(playerId);
          if (primaryPlayer) {
            addVision(visibleKeys, ownedTileKeys(playerId), primaryPlayer.vision, primaryPlayer.visionRadiusBonus);
            for (const allyId of primaryPlayer.allies) addVisionForPlayer(visibleKeys, allyId);
          } else {
            addVision(
              visibleKeys,
              sourceTiles
                .filter((tile) => tile.ownerId === playerId)
                .map((tile) => keyFor(tile.x, tile.y)),
              1,
              0
            );
          }
          for (const lock of runtimeState.activeLocks) {
            if (lock.playerId !== playerId) continue;
            const origin = parseKey(lock.originKey);
            const target = parseKey(lock.targetKey);
            if (origin) visibleKeys.add(keyFor(origin.x, origin.y));
            if (target) visibleKeys.add(keyFor(target.x, target.y));
          }
          if (primaryPlayer && (runtimeState.docks?.length ?? 0) > 0) {
            const visibilityOwnerIds = new Set<string>([playerId, ...primaryPlayer.allies]);
            const settledOwnerByKey = new Map(
              sourceTiles
                .filter((tile) => tile.ownershipState === "SETTLED" && tile.ownerId)
                .map((tile) => [keyFor(tile.x, tile.y), tile.ownerId] as const)
            );
            const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
            for (const revealKey of collectLinkedDockRevealKeysForOwners(
              visibilityOwnerIds,
              runtimeState.docks ?? [],
              (tileKey) => settledOwnerByKey.get(tileKey),
              dockLinksByDockTileKey,
              WORLD_WIDTH,
              WORLD_HEIGHT
            )) {
              visibleKeys.add(revealKey);
            }
          }

          return sourceTiles
            .filter((tile) => visibleKeys.has(keyFor(tile.x, tile.y)))
            .sort((left, right) => (left.x - right.x) || (left.y - right.y));
        })();
  const pendingSettlements = runtimeState.pendingSettlements
    .filter((settlement) => settlement.ownerId === playerId)
    .map((settlement) => {
      const coords = parseKey(settlement.tileKey);
      return coords ? { x: coords.x, y: coords.y, startedAt: settlement.startedAt, resolvesAt: settlement.resolvesAt } : undefined;
    })
      .filter((settlement): settlement is NonNullable<typeof settlement> => Boolean(settlement))
      .sort((left, right) => (left.resolvesAt - right.resolvesAt) || (left.x - right.x) || (left.y - right.y));
  const tileByKey = new Map(sourceTiles.map((tile) => [keyFor(tile.x, tile.y), tile] as const));
  const livePlayer = playersById.get(playerId);
  const pendingSettlementTileKeys = new Set(
    runtimeState.pendingSettlements
      .filter((settlement) => settlement.ownerId === playerId)
      .map((settlement) => settlement.tileKey)
  );
  const activeLockTileKeys = new Set(runtimeState.activeLocks?.map((lock) => lock.targetKey) ?? []);
  const autoSettlementQueue = livePlayer
    ? ownedTileKeys(playerId)
        .map((tileKey) => {
          if (pendingSettlementTileKeys.has(tileKey) || activeLockTileKeys.has(tileKey)) return undefined;
          const tile = tileByKey.get(tileKey);
          if (!tile || tile.terrain !== "LAND" || tile.ownerId !== playerId || tile.ownershipState !== "FRONTIER") return undefined;
          let hasTownSupport = false;
          forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
            if (!hasTownSupport) {
              const neighbor = tileByKey.get(keyFor(nx, ny));
              if (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.townJson) hasTownSupport = true;
            }
          });
          if (!tile.resource && !tile.townJson && !tile.dockId && !hasTownSupport) return undefined;
          return { x: tile.x, y: tile.y };
        })
        .filter((tile): tile is { x: number; y: number } => Boolean(tile))
    : [];
  const hasLivePlayerState = livePlayer && typeof livePlayer.points === "number" && typeof livePlayer.manpower === "number";
  const liveEconomy = buildLivePlayerEconomySnapshot(playerId, runtimeState);
  const liveProgressionPlayer = livePlayer
    ? {
        techIds: new Set(livePlayer.techIds),
        domainIds: new Set(livePlayer.domainIds)
      }
    : undefined;
  const settledTileCount =
    typeof livePlayer?.settledTileCount === "number"
      ? livePlayer.settledTileCount
      : runtimeState.tiles.filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED").length;
  const strategicProductionPerMinute =
    livePlayer?.strategicProductionPerMinute ??
    liveEconomy.strategicProductionPerMinute ??
    estimateStrategicProductionPerMinuteFromTiles(playerId, runtimeState.tiles);
  const activeDevelopmentProcessCount =
    typeof livePlayer?.activeDevelopmentProcessCount === "number"
      ? livePlayer.activeDevelopmentProcessCount
      : pendingSettlements.length +
        runtimeState.tiles.filter((tile) => {
          if (tile.ownerId !== playerId) return false;
          return (
            tile.fortJson?.includes("\"under_construction\"") ||
            tile.fortJson?.includes("\"removing\"") ||
            tile.observatoryJson?.includes("\"under_construction\"") ||
            tile.observatoryJson?.includes("\"removing\"") ||
            tile.siegeOutpostJson?.includes("\"under_construction\"") ||
            tile.siegeOutpostJson?.includes("\"removing\"") ||
            tile.economicStructureJson?.includes("\"under_construction\"") ||
            tile.economicStructureJson?.includes("\"removing\"")
          );
        }).length;
  const incomePerMinute =
    typeof livePlayer?.incomePerMinute === "number"
      ? livePlayer.incomePerMinute
      : liveEconomy.incomePerMinute ?? estimateIncomePerMinuteFromTiles(playerId, runtimeState.tiles);
  const enrichedTiles =
    options?.fullVisibility === true && options?.sharedFullVisibilityTiles
      ? options.sharedFullVisibilityTiles
      : enrichSnapshotTilesForPlayer(playerId, runtimeState, tiles, liveEconomy);
  const docks: PlayerSubscriptionDock[] = (runtimeState.docks ?? []).map((dock) => ({
    dockId: dock.dockId,
    tileKey: dock.tileKey,
    pairedDockId: dock.pairedDockId,
    ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
  }));

  return {
    playerId,
    ...(hasLivePlayerState
      ? {
          player: {
            id: livePlayer.id,
            ...(livePlayer.name ? { name: livePlayer.name } : {}),
            gold: livePlayer.points,
            manpower: livePlayer.manpower,
            manpowerCap: livePlayer.manpowerCap ?? Math.max(livePlayer.manpowerCapSnapshot ?? 0, MANPOWER_BASE_CAP),
            manpowerRegenPerMinute: livePlayer.manpowerRegenPerMinute ?? MANPOWER_BASE_REGEN_PER_MINUTE,
            logisticsThroughputPerMinute: livePlayer.logisticsThroughputPerMinute ?? livePlayer.manpowerRegenPerMinute ?? MANPOWER_BASE_REGEN_PER_MINUTE,
            manpowerBreakdown: livePlayer.manpowerBreakdown ?? {
              cap: [{ label: "Base minimum", amount: MANPOWER_BASE_CAP }],
              regen: [{ label: "Base minimum", amount: MANPOWER_BASE_REGEN_PER_MINUTE }]
            },
            incomePerMinute,
            strategicResources: {
              FOOD: livePlayer.strategicResources.FOOD ?? 0,
              IRON: livePlayer.strategicResources.IRON ?? 0,
              CRYSTAL: livePlayer.strategicResources.CRYSTAL ?? 0,
              SUPPLY: livePlayer.strategicResources.SUPPLY ?? 0,
              SHARD: livePlayer.strategicResources.SHARD ?? 0
            },
            strategicProductionPerMinute,
            economyBreakdown: liveEconomy.economyBreakdown,
            upkeepPerMinute: liveEconomy.upkeepPerMinute,
            upkeepLastTick: liveEconomy.upkeepLastTick,
            developmentProcessLimit: DEVELOPMENT_PROCESS_LIMIT,
            activeDevelopmentProcessCount,
            pendingSettlements,
            autoSettlementQueue,
            techIds: [...livePlayer.techIds],
            domainIds: [...livePlayer.domainIds],
            mods: liveProgressionPlayer ? recomputeMods(liveProgressionPlayer) : { attack: 1, defense: 1, income: 1, vision: 1 },
            modBreakdown: liveProgressionPlayer
              ? buildModBreakdownForPlayer(liveProgressionPlayer)
              : {
                  attack: [{ label: "Base", mult: 1 }],
                  defense: [{ label: "Base", mult: 1 }],
                  income: [{ label: "Base", mult: 1 }],
                  vision: [{ label: "Base", mult: 1 }]
                }
          }
        }
      : {}),
    ...(options?.includeWorldStatus === false
      ? {}
      : {
          worldStatus: buildWorldStatusSnapshot(
            playerId,
            options?.worldStatusRuntimeState ?? runtimeState,
            fallbackTiles,
            options?.nonCompetitivePlayerIds ? { nonCompetitivePlayerIds: options.nonCompetitivePlayerIds } : undefined
          )
        }),
    ...(options?.seasonState ? { season: options.seasonState } : {}),
    ...(docks.length ? { docks } : {}),
    ...(options?.respawnNotice ? { respawnNotice: options.respawnNotice } : {}),
    tiles: enrichedTiles
  };
};

// Async variant of buildPlayerSubscriptionSnapshot. Identical output for the
// same inputs (parity test in player-snapshot.test.ts) but yields to the
// event loop every ENRICHMENT_YIELD_CHUNK tiles inside the per-tile
// enrichment loop. The 2026-05-20 outage was a contiguous ~28s block inside
// enrichSnapshotTilesForPlayer for a reconnecting player; this variant
// interleaves that work with grpc dispatch, metric ticker, and the gateway
// watchdog heartbeat so a long build no longer trips the 30s SIGKILL.
//
// The duplication vs the sync version is intentional: the sync version is
// called from delta/event paths where async control flow would ripple
// disruptively. Keep them lockstep — the parity test ensures the bodies
// produce identical snapshots.
export const buildPlayerSubscriptionSnapshotAsync = async (
  playerId: string,
  runtimeState: RuntimeState,
  fallbackTiles: Iterable<DomainTileState> | undefined,
  yieldToEventLoop: () => Promise<void>,
  options?: BuildOptions
): Promise<PlayerSubscriptionSnapshot> => {
  const recordPhaseTiming = (
    phase: SnapshotMaterializeTimingPhase,
    startedAt: number,
    details?: SnapshotMaterializeTimingDetails
  ): void => {
    options?.onAsyncPhaseTiming?.(phase, Date.now() - startedAt, details);
  };
  const sourceTilesStartedAt = Date.now();
  const sourceTiles =
    runtimeState.tiles.length > 0
      ? runtimeState.tiles
      : fallbackTiles
        ? [...fallbackTiles].map((tile) => ({
            x: tile.x,
            y: tile.y,
            terrain: tile.terrain,
            ...(tile.resource ? { resource: tile.resource } : {}),
            ...(tile.dockId ? { dockId: tile.dockId } : {}),
            ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
            ...(tile.ownershipState ? { ownershipState: tile.ownershipState } : {}),
            ...(typeof tile.frontierDecayAt === "number" ? { frontierDecayAt: tile.frontierDecayAt } : {}),
            ...(tile.town ? { townJson: JSON.stringify(tile.town) } : {}),
            ...(tile.town?.type ? { townType: tile.town.type } : {}),
            ...(tile.town?.name ? { townName: tile.town.name } : {}),
            ...(tile.town?.populationTier ? { townPopulationTier: tile.town.populationTier } : {}),
            ...(tile.fort ? { fortJson: JSON.stringify(tile.fort) } : {}),
            ...(tile.observatory ? { observatoryJson: JSON.stringify(tile.observatory) } : {}),
            ...(tile.siegeOutpost ? { siegeOutpostJson: JSON.stringify(tile.siegeOutpost) } : {}),
            ...(tile.economicStructure ? { economicStructureJson: JSON.stringify(tile.economicStructure) } : {}),
            ...(tile.sabotage ? { sabotageJson: JSON.stringify(tile.sabotage) } : {}),
            ...(tile.shardSite ? { shardSiteJson: JSON.stringify(tile.shardSite) } : {})
          }))
        : [];
  recordPhaseTiming("source_tiles_async", sourceTilesStartedAt, {
    sourceTileCount: sourceTiles.length,
    fullVisibility: options?.fullVisibility === true,
    includeWorldStatus: options?.includeWorldStatus === true
  });

  const keyFor = (x: number, y: number): string => `${x},${y}`;
  const wrapX = (x: number): number => ((x % WORLD_WIDTH) + WORLD_WIDTH) % WORLD_WIDTH;
  const wrapY = (y: number): number => ((y % WORLD_HEIGHT) + WORLD_HEIGHT) % WORLD_HEIGHT;
  const parseKey = (tileKey: string): { x: number; y: number } | undefined => {
    const [rawX, rawY] = tileKey.split(",");
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
    return { x, y };
  };

  // Single combined pass: builds ownedTileKeysByPlayer AND tileByKey together,
  // replacing what were previously two separate O(202k) scans.
  const ownedTileKeysByPlayer = new Map<string, string[]>();
  const tileByKey = new Map<string, RuntimeState["tiles"][number]>();
  const ownedTileIndexStartedAt = Date.now();
  let combinedScanIndex = 0;
  for (const tile of sourceTiles) {
    if (shouldYieldAt(combinedScanIndex++, 50_000)) await yieldToEventLoop();
    const tileKey = keyFor(tile.x, tile.y);
    tileByKey.set(tileKey, tile as RuntimeState["tiles"][number]);
    if (!tile.ownerId) continue;
    let keys = ownedTileKeysByPlayer.get(tile.ownerId);
    if (!keys) {
      keys = [];
      ownedTileKeysByPlayer.set(tile.ownerId, keys);
    }
    keys.push(tileKey);
  }
  recordPhaseTiming("owned_tile_index_async", ownedTileIndexStartedAt, {
    sourceTileCount: sourceTiles.length,
    playerCount: ownedTileKeysByPlayer.size
  });
  const ownedTileKeys = (pid: string): string[] => ownedTileKeysByPlayer.get(pid) ?? [];

  const playersById = new Map(runtimeState.players.map((player) => [player.id, player] as const));
  const addVision = (
    targetKeys: Set<string>,
    territoryTileKeys: Iterable<string>,
    vision: number,
    visionRadiusBonus: number
  ): void => {
    const radius = Math.max(1, Math.floor(VISION_RADIUS * vision) + visionRadiusBonus);
    for (const tileKey of territoryTileKeys) {
      const coords = parseKey(tileKey);
      if (!coords) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          targetKeys.add(keyFor(wrapX(coords.x + dx), wrapY(coords.y + dy)));
        }
      }
    }
  };
  const addVisionForPlayer = (targetKeys: Set<string>, nextPlayerId: string): void => {
    const nextPlayer = playersById.get(nextPlayerId);
    if (!nextPlayer) return;
    addVision(targetKeys, ownedTileKeys(nextPlayerId), nextPlayer.vision, nextPlayer.visionRadiusBonus);
  };

  const visibleTilesStartedAt = Date.now();
  const tiles =
    options?.fullVisibility === true
      ? sourceTiles
      : await (async () => {
          const visibleKeys = new Set<string>();
          const primaryPlayer = playersById.get(playerId);
          if (primaryPlayer) {
            addVision(visibleKeys, ownedTileKeys(playerId), primaryPlayer.vision, primaryPlayer.visionRadiusBonus);
            for (const allyId of primaryPlayer.allies) addVisionForPlayer(visibleKeys, allyId);
          } else {
            // primaryPlayer not found — use default vision=1. ownedTileKeys is
            // already indexed from the combined scan; no re-scan of sourceTiles needed.
            addVision(visibleKeys, ownedTileKeys(playerId), 1, 0);
          }
          for (const lock of runtimeState.activeLocks) {
            if (lock.playerId !== playerId) continue;
            const origin = parseKey(lock.originKey);
            const target = parseKey(lock.targetKey);
            if (origin) visibleKeys.add(keyFor(origin.x, origin.y));
            if (target) visibleKeys.add(keyFor(target.x, target.y));
          }
          if (primaryPlayer && (runtimeState.docks?.length ?? 0) > 0) {
            const visibilityOwnerIds = new Set<string>([playerId, ...primaryPlayer.allies]);
            // tileByKey is already built — no need for a separate O(202k) settled-owner scan.
            const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
            for (const revealKey of collectLinkedDockRevealKeysForOwners(
              visibilityOwnerIds,
              runtimeState.docks ?? [],
              (tk) => { const t = tileByKey.get(tk); return (t?.ownershipState === "SETTLED" && t.ownerId) ? t.ownerId : undefined; },
              dockLinksByDockTileKey,
              WORLD_WIDTH,
              WORLD_HEIGHT
            )) {
              visibleKeys.add(revealKey);
            }
          }

          // Iterate visibleKeys (O(territory × radius²)) and look up in tileByKey
          // instead of scanning all 202k source tiles — typically 10-20x fewer iterations.
          const visibleTiles: Array<(typeof sourceTiles)[number]> = [];
          let visibleLookupIndex = 0;
          for (const vKey of visibleKeys) {
            if (shouldYieldAt(visibleLookupIndex++, 2_000)) await yieldToEventLoop();
            const tile = tileByKey.get(vKey);
            if (tile) visibleTiles.push(tile);
          }
          return visibleTiles.sort((left, right) => (left.x - right.x) || (left.y - right.y));
        })();
  recordPhaseTiming("visible_tiles_async", visibleTilesStartedAt, {
    sourceTileCount: sourceTiles.length,
    visibleTileCount: tiles.length,
    fullVisibility: options?.fullVisibility === true
  });
  await yieldToEventLoop();
  const queueStateStartedAt = Date.now();
  const pendingSettlements = runtimeState.pendingSettlements
    .filter((settlement) => settlement.ownerId === playerId)
    .map((settlement) => {
      const coords = parseKey(settlement.tileKey);
      return coords ? { x: coords.x, y: coords.y, startedAt: settlement.startedAt, resolvesAt: settlement.resolvesAt } : undefined;
    })
      .filter((settlement): settlement is NonNullable<typeof settlement> => Boolean(settlement))
      .sort((left, right) => (left.resolvesAt - right.resolvesAt) || (left.x - right.x) || (left.y - right.y));
  const livePlayer = playersById.get(playerId);
  const pendingSettlementTileKeys = new Set(
    runtimeState.pendingSettlements
      .filter((settlement) => settlement.ownerId === playerId)
      .map((settlement) => settlement.tileKey)
  );
  const activeLockTileKeys = new Set(runtimeState.activeLocks?.map((lock) => lock.targetKey) ?? []);
  const autoSettlementQueue = livePlayer
    ? ownedTileKeys(playerId)
        .map((tileKey) => {
          if (pendingSettlementTileKeys.has(tileKey) || activeLockTileKeys.has(tileKey)) return undefined;
          const tile = tileByKey.get(tileKey);
          if (!tile || tile.terrain !== "LAND" || tile.ownerId !== playerId || tile.ownershipState !== "FRONTIER") return undefined;
          let hasTownSupport = false;
          forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
            if (!hasTownSupport) {
              const neighbor = tileByKey.get(keyFor(nx, ny));
              if (neighbor?.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.townJson) hasTownSupport = true;
            }
          });
          if (!tile.resource && !tile.townJson && !tile.dockId && !hasTownSupport) return undefined;
          return { x: tile.x, y: tile.y };
        })
        .filter((tile): tile is { x: number; y: number } => Boolean(tile))
    : [];
  recordPhaseTiming("queue_state_async", queueStateStartedAt, {
    pendingSettlementCount: pendingSettlements.length,
    autoSettlementQueueCount: autoSettlementQueue.length
  });
  const hasLivePlayerState = livePlayer && typeof livePlayer.points === "number" && typeof livePlayer.manpower === "number";
  const liveEconomyStartedAt = Date.now();
  const liveEconomy = await buildLivePlayerEconomySnapshotAsync(playerId, runtimeState, yieldToEventLoop, tileByKey);
  recordPhaseTiming("live_economy_async", liveEconomyStartedAt, {
    sourceTileCount: runtimeState.tiles.length,
    playerCount: runtimeState.players.length
  });
  const liveProgressionPlayer = livePlayer
    ? {
        techIds: new Set(livePlayer.techIds),
        domainIds: new Set(livePlayer.domainIds)
      }
    : undefined;
  const strategicProductionPerMinute =
    livePlayer?.strategicProductionPerMinute ??
    liveEconomy.strategicProductionPerMinute ??
    estimateStrategicProductionPerMinuteFromTiles(playerId, runtimeState.tiles);
  const activeDevelopmentProcessCount =
    typeof livePlayer?.activeDevelopmentProcessCount === "number"
      ? livePlayer.activeDevelopmentProcessCount
      : pendingSettlements.length +
        runtimeState.tiles.filter((tile) => {
          if (tile.ownerId !== playerId) return false;
          return (
            tile.fortJson?.includes("\"under_construction\"") ||
            tile.fortJson?.includes("\"removing\"") ||
            tile.observatoryJson?.includes("\"under_construction\"") ||
            tile.observatoryJson?.includes("\"removing\"") ||
            tile.siegeOutpostJson?.includes("\"under_construction\"") ||
            tile.siegeOutpostJson?.includes("\"removing\"") ||
            tile.economicStructureJson?.includes("\"under_construction\"") ||
            tile.economicStructureJson?.includes("\"removing\"")
          );
        }).length;
  const incomePerMinute =
    typeof livePlayer?.incomePerMinute === "number"
      ? livePlayer.incomePerMinute
      : liveEconomy.incomePerMinute ?? estimateIncomePerMinuteFromTiles(playerId, runtimeState.tiles);
  const enrichTilesStartedAt = Date.now();
  const enrichedTiles =
    options?.fullVisibility === true && options?.sharedFullVisibilityTiles
      ? options.sharedFullVisibilityTiles
      : await enrichSnapshotTilesForPlayerAsync(playerId, runtimeState, tiles, liveEconomy, yieldToEventLoop, tileByKey);
  recordPhaseTiming("enrich_tiles_async", enrichTilesStartedAt, {
    visibleTileCount: tiles.length,
    tileCount: enrichedTiles.length,
    fullVisibility: options?.fullVisibility === true
  });
  const docks: PlayerSubscriptionDock[] = (runtimeState.docks ?? []).map((dock) => ({
    dockId: dock.dockId,
    tileKey: dock.tileKey,
    pairedDockId: dock.pairedDockId,
    ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
  }));
  const worldStatusStartedAt = Date.now();
  const worldStatus =
    options?.includeWorldStatus === false
      ? undefined
      : buildWorldStatusSnapshot(
          playerId,
          options?.worldStatusRuntimeState ?? runtimeState,
          fallbackTiles,
          options?.nonCompetitivePlayerIds ? { nonCompetitivePlayerIds: options.nonCompetitivePlayerIds } : undefined
        );
  recordPhaseTiming("world_status_async", worldStatusStartedAt, {
    sourceTileCount: (options?.worldStatusRuntimeState ?? runtimeState).tiles.length,
    playerCount: (options?.worldStatusRuntimeState ?? runtimeState).players.length,
    includeWorldStatus: options?.includeWorldStatus === true
  });

  return {
    playerId,
    ...(hasLivePlayerState
      ? {
          player: {
            id: livePlayer.id,
            ...(livePlayer.name ? { name: livePlayer.name } : {}),
            gold: livePlayer.points,
            manpower: livePlayer.manpower,
            manpowerCap: livePlayer.manpowerCap ?? Math.max(livePlayer.manpowerCapSnapshot ?? 0, MANPOWER_BASE_CAP),
            manpowerRegenPerMinute: livePlayer.manpowerRegenPerMinute ?? MANPOWER_BASE_REGEN_PER_MINUTE,
            logisticsThroughputPerMinute: livePlayer.logisticsThroughputPerMinute ?? livePlayer.manpowerRegenPerMinute ?? MANPOWER_BASE_REGEN_PER_MINUTE,
            manpowerBreakdown: livePlayer.manpowerBreakdown ?? {
              cap: [{ label: "Base minimum", amount: MANPOWER_BASE_CAP }],
              regen: [{ label: "Base minimum", amount: MANPOWER_BASE_REGEN_PER_MINUTE }]
            },
            incomePerMinute,
            strategicResources: {
              FOOD: livePlayer.strategicResources.FOOD ?? 0,
              IRON: livePlayer.strategicResources.IRON ?? 0,
              CRYSTAL: livePlayer.strategicResources.CRYSTAL ?? 0,
              SUPPLY: livePlayer.strategicResources.SUPPLY ?? 0,
              SHARD: livePlayer.strategicResources.SHARD ?? 0
            },
            strategicProductionPerMinute,
            economyBreakdown: liveEconomy.economyBreakdown,
            upkeepPerMinute: liveEconomy.upkeepPerMinute,
            upkeepLastTick: liveEconomy.upkeepLastTick,
            developmentProcessLimit: DEVELOPMENT_PROCESS_LIMIT,
            activeDevelopmentProcessCount,
            pendingSettlements,
            autoSettlementQueue,
            techIds: [...livePlayer.techIds],
            domainIds: [...livePlayer.domainIds],
            mods: liveProgressionPlayer ? recomputeMods(liveProgressionPlayer) : { attack: 1, defense: 1, income: 1, vision: 1 },
            modBreakdown: liveProgressionPlayer
              ? buildModBreakdownForPlayer(liveProgressionPlayer)
              : {
                  attack: [{ label: "Base", mult: 1 }],
                  defense: [{ label: "Base", mult: 1 }],
                  income: [{ label: "Base", mult: 1 }],
                  vision: [{ label: "Base", mult: 1 }]
                }
          }
        }
      : {}),
    ...(options?.includeWorldStatus === false
      ? {}
      : { worldStatus: worldStatus! }),
    ...(options?.seasonState ? { season: options.seasonState } : {}),
    ...(docks.length ? { docks } : {}),
    ...(options?.respawnNotice ? { respawnNotice: options.respawnNotice } : {}),
    tiles: enrichedTiles
  };
};
