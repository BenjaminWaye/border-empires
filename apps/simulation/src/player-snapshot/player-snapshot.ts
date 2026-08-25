import {
  DEVELOPMENT_PROCESS_LIMIT,
  FRONTIER_STANDING_VISION_RADIUS,
  VISION_RADIUS,
  WORLD_HEIGHT,
  WORLD_WIDTH
} from "@border-empires/shared";
import type { PlayerRespawnNotice } from "@border-empires/shared";
import type { PlayerSubscriptionDock, PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { MANPOWER_BASE_CAP, MANPOWER_BASE_REGEN_PER_MINUTE, type DomainTileState } from "@border-empires/game-domain";

import type { SimulationRuntime } from "../runtime/runtime.js";
import { estimateIncomePerMinuteFromTiles, estimateStrategicProductionPerMinuteFromTiles } from "../player-runtime-summary.js";
import { buildLivePlayerEconomySnapshot, enrichSnapshotTilesForPlayer } from "../live-snapshot-view/live-snapshot-view.js";
import { buildDockLinksByDockTileKey, collectLinkedDockRevealKeysForOwners } from "../dock-network/dock-network.js";
import { buildWorldStatusSnapshot } from "../world-status-snapshot/world-status-snapshot.js";
import {
  additiveEffectForPlayer,
  buildModBreakdownForPlayer,
  recomputeMods
} from "../tech-domain-bridge/tech-domain-bridge.js";
import { weaponsFactoryCountsForPlayer } from "../tech-domain-bridge/weapons-factory-mod-breakdown.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
type RuntimeState = ReturnType<SimulationRuntime["exportState"]>;

type BuildOptions = {
  includeWorldStatus?: boolean;
  fullVisibility?: boolean;
  tilesAlreadyVisible?: boolean;
  sharedFullVisibilityTiles?: PlayerSubscriptionSnapshot["tiles"];
  worldStatusRuntimeState?: RuntimeState;
  seasonState?: PlayerSubscriptionSnapshot["season"];
  respawnNotice?: PlayerRespawnNotice;
  nonCompetitivePlayerIds?: ReadonlySet<string>;
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
            ...(tile.shardSite ? { shardSiteJson: JSON.stringify(tile.shardSite) } : {}),
            ...(tile.naturalWonder ? { naturalWonderJson: JSON.stringify(tile.naturalWonder) } : {}),
            ...(typeof tile.breachShockUntil === "number" ? { breachShockUntil: tile.breachShockUntil } : {})
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

  const EMPTY_KEY_SET: ReadonlySet<string> = new Set();
  const ownedTileKeysByPlayer = new Map<string, string[]>();
  const frontierTileKeySetByPlayer = new Map<string, Set<string>>();
  for (const tile of sourceTiles) {
    if (!tile.ownerId) continue;
    let keys = ownedTileKeysByPlayer.get(tile.ownerId);
    if (!keys) {
      keys = [];
      ownedTileKeysByPlayer.set(tile.ownerId, keys);
    }
    keys.push(keyFor(tile.x, tile.y));
    if (tile.ownershipState === "FRONTIER") {
      let frontierKeys = frontierTileKeySetByPlayer.get(tile.ownerId);
      if (!frontierKeys) {
        frontierKeys = new Set();
        frontierTileKeySetByPlayer.set(tile.ownerId, frontierKeys);
      }
      frontierKeys.add(keyFor(tile.x, tile.y));
    }
  }
  const ownedTileKeys = (pid: string): string[] => ownedTileKeysByPlayer.get(pid) ?? [];
  const frontierTileKeys = (pid: string): ReadonlySet<string> => frontierTileKeySetByPlayer.get(pid) ?? EMPTY_KEY_SET;

  const playersById = new Map(runtimeState.players.map((player) => [player.id, player] as const));
  // A FRONTIER claim holds only a flat FRONTIER_STANDING_VISION_RADIUS halo
  // (see the same rule enforced server-side in visibility-coverage-cache.ts's
  // tileOwnershipChanged), not the owner's full (tech-scaled) radius, gated
  // per-key via `frontierKeys` so SETTLED territory keeps the full radius.
  const addVision = (
    targetKeys: Set<string>,
    territoryTileKeys: Iterable<string>,
    vision: number,
    visionRadiusBonus: number,
    frontierKeys: ReadonlySet<string> = EMPTY_KEY_SET
  ): void => {
    const radius = Math.max(1, Math.floor(VISION_RADIUS * vision) + visionRadiusBonus);
    for (const tileKey of territoryTileKeys) {
      const coords = parseKey(tileKey);
      if (!coords) continue;
      const effectiveRadius = frontierKeys.has(tileKey) ? FRONTIER_STANDING_VISION_RADIUS : radius;
      for (let dy = -effectiveRadius; dy <= effectiveRadius; dy += 1) {
        for (let dx = -effectiveRadius; dx <= effectiveRadius; dx += 1) {
          targetKeys.add(keyFor(wrapX(coords.x + dx), wrapY(coords.y + dy)));
        }
      }
    }
  };
  const addVisionForPlayer = (targetKeys: Set<string>, nextPlayerId: string): void => {
    const nextPlayer = playersById.get(nextPlayerId);
    if (!nextPlayer) return;
    addVision(targetKeys, ownedTileKeys(nextPlayerId), nextPlayer.vision, nextPlayer.visionRadiusBonus, frontierTileKeys(nextPlayerId));
  };

  const tiles =
    options?.fullVisibility === true || options?.tilesAlreadyVisible === true
      ? sourceTiles
      : (() => {
          const visibleKeys = new Set<string>();
          const primaryPlayer = playersById.get(playerId);
          if (primaryPlayer) {
            addVision(visibleKeys, ownedTileKeys(playerId), primaryPlayer.vision, primaryPlayer.visionRadiusBonus, frontierTileKeys(playerId));
            for (const allyId of primaryPlayer.allies) addVisionForPlayer(visibleKeys, allyId);
          } else {
            const ownerTiles = sourceTiles.filter((tile) => tile.ownerId === playerId);
            addVision(
              visibleKeys,
              ownerTiles.map((tile) => keyFor(tile.x, tile.y)),
              1,
              0,
              new Set(ownerTiles.filter((tile) => tile.ownershipState === "FRONTIER").map((tile) => keyFor(tile.x, tile.y)))
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
  // Full (not visibility-filtered) sourceTiles, matching the empire-wide
  // scan buildTechUpdatePayload/emitPlayerStateUpdate use elsewhere so a
  // freshly-loaded snapshot's Active Bonuses panel already includes owned
  // Weapons Factories instead of waiting for the next TECH_UPDATE/PLAYER_UPDATE.
  const weaponsFactoryCounts = weaponsFactoryCountsForPlayer(
    playerId,
    sourceTiles
      .filter((tile) => tile.ownerId === playerId && tile.economicStructureJson)
      .map((tile) => ({
        ownerId: tile.ownerId,
        economicStructure: JSON.parse(tile.economicStructureJson!) as { type?: string; status?: string }
      }))
  );
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
            imperialWardCharges: livePlayer.imperialWardCharges ?? 0,
            wonderLastFreeRushBuyAt: livePlayer.wonderLastFreeRushBuyAt ?? 0,
            eventLog: livePlayer.eventLog ?? [],
            strategicResources: {
              FOOD: livePlayer.strategicResources.FOOD ?? 0,
              TITANIUM: livePlayer.strategicResources.TITANIUM ?? 0,
              CRYSTAL: livePlayer.strategicResources.CRYSTAL ?? 0,
              UMBRITE: livePlayer.strategicResources.UMBRITE ?? 0,
              SHARD: livePlayer.strategicResources.SHARD ?? 0
            },
            strategicProductionPerMinute: {
              FOOD: strategicProductionPerMinute.FOOD,
              TITANIUM: strategicProductionPerMinute.TITANIUM,
              CRYSTAL: strategicProductionPerMinute.CRYSTAL,
              UMBRITE: strategicProductionPerMinute.UMBRITE,
              SHARD: strategicProductionPerMinute.SHARD
            },
            resourceSlots: liveEconomy.resourceSlots,
            dormantStructures: liveEconomy.dormantStructures,
            economyBreakdown: liveEconomy.economyBreakdown,
            upkeepPerMinute: liveEconomy.upkeepPerMinute,
            upkeepLastTick: liveEconomy.upkeepLastTick,
            developmentProcessLimit:
              DEVELOPMENT_PROCESS_LIMIT +
              (liveProgressionPlayer
                ? additiveEffectForPlayer(liveProgressionPlayer, "developmentProcessCapacityAdd")
                : 0),
            activeDevelopmentProcessCount,
            pendingSettlements,
            autoSettlementQueue,
            // Server-durable dev/expand queue tail -- see runtime-dev-queue.ts /
            // runtime-waypoint-queue.ts. Seeds a fresh login/reconnect with
            // whatever survived while disconnected; the live PLAYER_UPDATE
            // stream (emitPlayerStateUpdate) keeps it current after that.
            // reservedManpower/reservedSlotRequirements are deliberately
            // stripped here: they are server-side refund bookkeeping (see
            // runtime-dev-queue-build-reservation.ts), not something the
            // client renders, so the wire shape stays lean.
            ...(livePlayer.devQueue?.length
              ? {
                  devQueue: livePlayer.devQueue.map((entry) => ({
                    tileKey: entry.tileKey,
                    x: entry.x,
                    y: entry.y,
                    kind: entry.kind,
                    ...(entry.structureType ? { structureType: entry.structureType } : {}),
                    queuedAt: entry.queuedAt
                  }))
                }
              : {}),
            ...(livePlayer.waypointQueue?.length ? { waypointQueue: livePlayer.waypointQueue } : {}),
            techIds: [...livePlayer.techIds],
            domainIds: [...livePlayer.domainIds],
            mods: liveProgressionPlayer ? recomputeMods(liveProgressionPlayer) : { attack: 1, defense: 1, income: 1, vision: 1 },
            modBreakdown: liveProgressionPlayer
              ? buildModBreakdownForPlayer(liveProgressionPlayer, weaponsFactoryCounts)
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
