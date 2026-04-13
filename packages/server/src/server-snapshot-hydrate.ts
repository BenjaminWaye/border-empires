import fs from "node:fs";

import type { EconomicStructure, Player, Season, TileKey } from "@border-empires/shared";

import type {
  Observatory,
  SeasonalTechConfig,
  SnapshotState,
  TileHistoryState
} from "./server-shared-types.js";

type SnapshotOwnershipStateEntry = NonNullable<SnapshotState["ownershipState"]>[number];
type SnapshotAuthIdentity = NonNullable<SnapshotState["authIdentities"]>[number];
type SnapshotStrategicResourceStock = NonNullable<SnapshotState["strategicResources"]>[number][1];
type SnapshotStrategicResourceBuffer = NonNullable<SnapshotState["strategicResourceBuffer"]>[number][1];
type SnapshotTerrainShapeState = NonNullable<SnapshotState["terrainShapes"]>[number][1];
type SnapshotVictoryPressure = NonNullable<SnapshotState["seasonVictory"]>[number][1];
type SnapshotTileYieldState = NonNullable<SnapshotState["tileYield"]>[number][1];
type SnapshotDynamicMissions = NonNullable<SnapshotState["dynamicMissions"]>[number][1];
type SnapshotTemporaryIncomeBuff = NonNullable<SnapshotState["temporaryIncomeBuff"]>[number][1];
type SnapshotAllianceRequest = NonNullable<SnapshotState["allianceRequests"]>[number];
type SnapshotFort = NonNullable<SnapshotState["forts"]>[number];
type SnapshotSiegeOutpost = NonNullable<SnapshotState["siegeOutposts"]>[number];
type SnapshotSabotage = NonNullable<SnapshotState["sabotage"]>[number];
type SnapshotAetherWall = NonNullable<SnapshotState["aetherWalls"]>[number];
type SnapshotDock = NonNullable<SnapshotState["docks"]>[number];
type SnapshotTown = NonNullable<SnapshotState["towns"]>[number];
type SnapshotShardSite = NonNullable<SnapshotState["shardSites"]>[number];
type SnapshotCluster = NonNullable<SnapshotState["clusters"]>[number];

interface PendingSettlement {
  tileKey: TileKey;
  ownerId: string;
  startedAt: number;
  resolvesAt: number;
  goldCost: number;
  cancelled: boolean;
  timeout?: NodeJS.Timeout;
}

export interface CreateServerSnapshotHydrateDeps {
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, SnapshotOwnershipStateEntry[1]>;
  settledSinceByTile: Map<TileKey, number>;
  barbarianAgents: Map<string, { id: string; x: number; y: number }>;
  barbarianAgentByTileKey: Map<TileKey, string>;
  authIdentityByUid: Map<string, SnapshotAuthIdentity>;
  resourceCountsByPlayer: Map<string, SnapshotState["resources"][number][1]>;
  strategicResourceStockByPlayer: Map<string, SnapshotStrategicResourceStock>;
  strategicResourceBufferByPlayer: Map<string, SnapshotStrategicResourceBuffer>;
  tileHistoryByTile: Map<TileKey, TileHistoryState>;
  terrainShapesByTile: Map<TileKey, SnapshotTerrainShapeState>;
  victoryPressureById: Map<string, SnapshotVictoryPressure>;
  frontierSettlementsByPlayer: Map<string, number[]>;
  tileYieldByTile: Map<TileKey, SnapshotTileYieldState>;
  dynamicMissionsByPlayer: Map<string, SnapshotDynamicMissions>;
  temporaryAttackBuffUntilByPlayer: Map<string, number>;
  temporaryIncomeBuffUntilByPlayer: Map<string, SnapshotTemporaryIncomeBuff>;
  cachedVisibilitySnapshotByPlayer: Map<string, unknown>;
  cachedChunkSnapshotByPlayer: Map<string, unknown>;
  simulationChunkStateClear: () => void;
  chunkSnapshotGenerationByPlayer: Map<string, number>;
  revealWatchersByTarget: Map<string, Set<string>>;
  observatoryTileKeysByPlayer: Map<string, Set<TileKey>>;
  economicStructureTileKeysByPlayer: Map<string, Set<TileKey>>;
  forcedRevealTilesByPlayer: Map<string, Set<TileKey>>;
  revealedEmpireTargetsByPlayer: Map<string, Set<string>>;
  allianceRequests: Map<string, SnapshotAllianceRequest>;
  fortsByTile: Map<TileKey, SnapshotFort>;
  observatoriesByTile: Map<TileKey, Observatory>;
  siegeOutpostsByTile: Map<TileKey, SnapshotSiegeOutpost>;
  economicStructuresByTile: Map<TileKey, EconomicStructure>;
  siphonByTile: Map<TileKey, SnapshotSabotage>;
  abilityCooldownsByPlayer: Map<string, Map<string, number>>;
  activeAetherWallsById: Map<string, SnapshotAetherWall>;
  docksByTile: Map<TileKey, SnapshotDock>;
  dockById: Map<string, SnapshotDock>;
  dockLinkedTileKeysByDockTileKeyClear: () => void;
  townsByTile: Map<TileKey, SnapshotTown>;
  shardSitesByTile: Map<TileKey, SnapshotShardSite>;
  firstSpecialSiteCaptureClaimed: Set<TileKey>;
  clustersById: Map<string, SnapshotCluster>;
  clusterByTile: Map<TileKey, string>;
  townCaptureShockUntilByTile: Map<TileKey, number>;
  townGrowthShockUntilByTile: Map<TileKey, number>;
  players: Map<string, Player>;
  playerBaseMods: Map<string, { attack: number; defense: number; income: number; vision: number }>;
  pendingSettlementsByTile: Map<TileKey, PendingSettlement>;
  SNAPSHOT_INDEX_FILE: string;
  SNAPSHOT_FILE: string;
  logRuntimeError: (message: string, err: unknown) => void;
  loadSectionedSnapshot: () => SnapshotState | undefined;
  loadLegacySnapshot: () => SnapshotState | undefined;
  BARBARIAN_OWNER_ID: string;
  setRevealTargetsForPlayer: (playerId: string, targets: string[]) => void;
  trackOwnedTileKey: (map: Map<string, Set<TileKey>>, ownerId: string, tileKey: TileKey) => void;
  isConverterStructureType: (type: EconomicStructure["type"]) => boolean;
  registerAetherWallEdges: (wall: SnapshotAetherWall) => void;
  townPlacementsNeedNormalization: () => boolean;
  normalizeTownPlacements: () => void;
  assignMissingTownNamesForWorld: () => void;
  seasonTechConfigIsCompatible: (config: SeasonalTechConfig) => boolean;
  chooseSeasonalTechConfig: (worldSeed: number) => SeasonalTechConfig;
  activeSeason: () => Season;
  setActiveSeason: (season: NonNullable<SnapshotState["season"]>) => void;
  seasonWinner: () => SnapshotState["seasonWinner"];
  setSeasonWinner: (winner: NonNullable<SnapshotState["seasonWinner"]>) => void;
  seasonArchives: () => NonNullable<SnapshotState["seasonArchives"]>;
  activeSeasonTechConfig: () => SeasonalTechConfig;
  setActiveSeasonTechConfig: (config: SeasonalTechConfig) => void;
  ensureMissionDefaults: (player: Player) => void;
  normalizePlayerProgressionState: (player: Player) => void;
  recomputePlayerEffectsForPlayer: (player: Player) => void;
  defaultMissionStats: () => Player["missionStats"];
  ensureFallbackSettlementForPlayer: (playerId: string) => void;
  spawnBarbarianAgentAt: (x: number, y: number, delayMs: number) => void;
  parseKey: (tileKey: TileKey) => [number, number];
  playerTile: (x: number, y: number) => { terrain: string };
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
}

export interface ServerSnapshotHydrateRuntime {
  hydrateSnapshotState: (raw: SnapshotState) => void;
  loadSnapshot: () => boolean;
}

export const createServerSnapshotHydrateRuntime = (
  deps: CreateServerSnapshotHydrateDeps
): ServerSnapshotHydrateRuntime => {
  const hydrateSnapshotState = (raw: SnapshotState): void => {
    if (!raw.world) return;
    for (const [tileKey, ownerId] of raw.ownership) deps.ownership.set(tileKey, ownerId);
    if (raw.ownershipState?.length) for (const [tileKey, state] of raw.ownershipState) deps.ownershipStateByTile.set(tileKey, state);
    else {
      for (const [tileKey, ownerId] of raw.ownership) deps.ownershipStateByTile.set(tileKey, ownerId === deps.BARBARIAN_OWNER_ID ? "BARBARIAN" : "SETTLED");
    }
    for (const [tileKey, settledAt] of raw.settledSince ?? []) deps.settledSinceByTile.set(tileKey, settledAt);
    deps.barbarianAgents.clear();
    deps.barbarianAgentByTileKey.clear();
    for (const agent of raw.barbarianAgents ?? []) deps.barbarianAgents.set(agent.id, agent);
    for (const identity of raw.authIdentities ?? []) deps.authIdentityByUid.set(identity.uid, identity);
    for (const [playerId, resources] of raw.resources) deps.resourceCountsByPlayer.set(playerId, { ...resources });
    for (const [playerId, resources] of raw.strategicResources ?? []) deps.strategicResourceStockByPlayer.set(playerId, { ...resources });
    for (const [playerId, resources] of raw.strategicResourceBuffer ?? []) deps.strategicResourceBufferByPlayer.set(playerId, { ...resources });
    for (const [tileKey, history] of raw.tileHistory ?? []) deps.tileHistoryByTile.set(tileKey, { ...history, previousOwners: [...(history.previousOwners ?? [])].slice(-5), structureHistory: [...(history.structureHistory ?? [])].slice(-5) });
    for (const [tileKey, shape] of raw.terrainShapes ?? []) deps.terrainShapesByTile.set(tileKey, shape);
    for (const [objectiveId, tracker] of raw.seasonVictory ?? []) deps.victoryPressureById.set(objectiveId, { ...tracker });
    for (const [playerId, timestamps] of raw.frontierSettlements ?? []) deps.frontierSettlementsByPlayer.set(playerId, [...timestamps]);
    for (const [tileKey, yieldState] of raw.tileYield ?? []) deps.tileYieldByTile.set(tileKey, yieldState);
    for (const [playerId, missions] of raw.dynamicMissions ?? []) deps.dynamicMissionsByPlayer.set(playerId, missions);
    for (const [playerId, until] of raw.temporaryAttackBuffUntil ?? []) deps.temporaryAttackBuffUntilByPlayer.set(playerId, until);
    for (const [playerId, buff] of raw.temporaryIncomeBuff ?? []) deps.temporaryIncomeBuffUntilByPlayer.set(playerId, buff);
    deps.cachedVisibilitySnapshotByPlayer.clear();
    deps.cachedChunkSnapshotByPlayer.clear();
    deps.simulationChunkStateClear();
    deps.chunkSnapshotGenerationByPlayer.clear();
    deps.revealWatchersByTarget.clear();
    deps.observatoryTileKeysByPlayer.clear();
    deps.economicStructureTileKeysByPlayer.clear();
    for (const [playerId, tiles] of raw.forcedReveal ?? []) deps.forcedRevealTilesByPlayer.set(playerId, new Set<TileKey>(tiles));
    for (const [playerId, targets] of raw.revealedEmpireTargets ?? []) deps.setRevealTargetsForPlayer(playerId, targets);
    for (const request of raw.allianceRequests ?? []) deps.allianceRequests.set(request.id, request);
    for (const fort of raw.forts ?? []) deps.fortsByTile.set(fort.tileKey, fort);
    for (const observatory of raw.observatories ?? []) {
      const normalized: Observatory = {
        observatoryId: observatory.observatoryId,
        ownerId: observatory.ownerId,
        tileKey: observatory.tileKey,
        status: observatory.status ?? "active",
        ...(observatory.completesAt !== undefined ? { completesAt: observatory.completesAt } : {}),
        ...(observatory.cooldownUntil !== undefined ? { cooldownUntil: observatory.cooldownUntil } : {})
      };
      deps.observatoriesByTile.set(observatory.tileKey, normalized);
      deps.trackOwnedTileKey(deps.observatoryTileKeysByPlayer, observatory.ownerId, observatory.tileKey);
    }
    for (const outpost of raw.siegeOutposts ?? []) deps.siegeOutpostsByTile.set(outpost.tileKey, outpost);
    for (const structure of raw.economicStructures ?? []) {
      const normalized: EconomicStructure = {
        id: structure.id,
        type: structure.type,
        tileKey: structure.tileKey,
        ownerId: structure.ownerId,
        status: structure.status ?? "inactive",
        nextUpkeepAt: structure.nextUpkeepAt,
        ...(structure.completesAt !== undefined ? { completesAt: structure.completesAt } : {}),
        ...(structure.disabledUntil !== undefined ? { disabledUntil: structure.disabledUntil } : {}),
        ...(structure.inactiveReason !== undefined ? { inactiveReason: structure.inactiveReason } : {})
      };
      if (normalized.status === "inactive" && deps.isConverterStructureType(normalized.type) && normalized.disabledUntil === undefined && normalized.inactiveReason === undefined) {
        normalized.inactiveReason = "manual";
      }
      deps.economicStructuresByTile.set(structure.tileKey, normalized);
      deps.trackOwnedTileKey(deps.economicStructureTileKeysByPlayer, structure.ownerId, structure.tileKey);
    }
    for (const sabotage of raw.sabotage ?? []) deps.siphonByTile.set(sabotage.targetTileKey, sabotage);
    for (const [playerId, entries] of raw.abilityCooldowns ?? []) deps.abilityCooldownsByPlayer.set(playerId, new Map(entries));
    for (const wall of raw.aetherWalls ?? []) {
      deps.activeAetherWallsById.set(wall.wallId, wall);
      deps.registerAetherWallEdges(wall);
    }
    for (const dock of raw.docks ?? []) {
      deps.docksByTile.set(dock.tileKey, dock);
      deps.dockById.set(dock.dockId, dock);
    }
    deps.dockLinkedTileKeysByDockTileKeyClear();
    for (const town of raw.towns ?? []) deps.townsByTile.set(town.tileKey, town);
    for (const shardSite of raw.shardSites ?? []) deps.shardSitesByTile.set(shardSite.tileKey, shardSite);
    for (const tileKey of raw.firstSpecialSiteCaptureClaimed ?? []) deps.firstSpecialSiteCaptureClaimed.add(tileKey);
    for (const cluster of raw.clusters ?? []) deps.clustersById.set(cluster.clusterId, cluster);
    for (const [tileKey, clusterId] of raw.clusterTiles ?? []) deps.clusterByTile.set(tileKey, clusterId);
    for (const [tileKey, until] of raw.townCaptureShock ?? []) deps.townCaptureShockUntilByTile.set(tileKey, until);
    for (const [tileKey, until] of raw.townGrowthShock ?? []) deps.townGrowthShockUntilByTile.set(tileKey, until);
    if (raw.season) deps.setActiveSeason(raw.season);
    if (raw.seasonWinner) deps.setSeasonWinner(raw.seasonWinner);
    const seasonArchives = raw.seasonArchives;
    if (seasonArchives?.length) deps.seasonArchives().push(...seasonArchives);
    const rawSeasonTechConfig = raw.seasonTechConfig;
    if (rawSeasonTechConfig) {
      deps.setActiveSeasonTechConfig({ ...rawSeasonTechConfig, activeNodeIds: new Set(rawSeasonTechConfig.activeNodeIds) });
    }
    if (raw.townPlacementsNormalized !== true && deps.townPlacementsNeedNormalization()) deps.normalizeTownPlacements();
    deps.assignMissingTownNamesForWorld();
    const currentSeasonTechConfig = deps.activeSeasonTechConfig();
    if (!deps.seasonTechConfigIsCompatible(currentSeasonTechConfig)) {
      const nextConfig = deps.chooseSeasonalTechConfig(deps.activeSeason().worldSeed);
      deps.setActiveSeasonTechConfig(nextConfig);
      const activeSeason = deps.activeSeason();
      activeSeason.techTreeConfigId = nextConfig.configId;
    }
    for (const rawPlayer of raw.players) {
      const hydrated: Player = {
        ...rawPlayer,
        profileComplete: rawPlayer.profileComplete ?? true,
        Ts: rawPlayer.Ts ?? 0,
        Es: rawPlayer.Es ?? 0,
        lastEconomyWakeAt: rawPlayer.lastEconomyWakeAt ?? rawPlayer.lastActiveAt,
        techIds: new Set(rawPlayer.techIds),
        domainIds: new Set(rawPlayer.domainIds ?? []),
        territoryTiles: new Set(rawPlayer.territoryTiles),
        allies: new Set(rawPlayer.allies),
        missions: rawPlayer.missions ?? [],
        missionStats: rawPlayer.missionStats ?? deps.defaultMissionStats(),
        activityInbox: rawPlayer.activityInbox ?? []
      };
      deps.ensureMissionDefaults(hydrated);
      deps.normalizePlayerProgressionState(hydrated);
      deps.players.set(rawPlayer.id, hydrated);
      deps.playerBaseMods.set(hydrated.id, {
        attack: hydrated.mods.attack,
        defense: hydrated.mods.defense,
        income: hydrated.mods.income,
        vision: hydrated.mods.vision
      });
      deps.recomputePlayerEffectsForPlayer(hydrated);
    }
    for (const settlement of raw.pendingSettlements ?? []) {
      deps.pendingSettlementsByTile.set(settlement.tileKey, {
        tileKey: settlement.tileKey,
        ownerId: settlement.ownerId,
        startedAt: settlement.startedAt,
        resolvesAt: settlement.resolvesAt,
        goldCost: settlement.goldCost,
        cancelled: false
      });
    }
    for (const playerId of deps.players.keys()) deps.ensureFallbackSettlementForPlayer(playerId);
    if (deps.barbarianAgents.size === 0) {
      for (const [tileKey, ownerId] of deps.ownership.entries()) {
        if (ownerId !== deps.BARBARIAN_OWNER_ID) continue;
        const [x, y] = deps.parseKey(tileKey);
        deps.spawnBarbarianAgentAt(x, y, 0);
      }
    }
  };

  const loadSnapshot = (): boolean => {
    let raw: SnapshotState | undefined;
    try {
      raw = deps.loadSectionedSnapshot() ?? deps.loadLegacySnapshot();
    } catch (err) {
      deps.logRuntimeError("snapshot load failed", err);
      try {
        if (fs.existsSync(deps.SNAPSHOT_INDEX_FILE)) fs.renameSync(deps.SNAPSHOT_INDEX_FILE, `${deps.SNAPSHOT_INDEX_FILE}.corrupt-${Date.now()}`);
        else if (fs.existsSync(deps.SNAPSHOT_FILE)) fs.renameSync(deps.SNAPSHOT_FILE, `${deps.SNAPSHOT_FILE}.corrupt-${Date.now()}`);
      } catch (renameErr) {
        deps.logRuntimeError("failed to quarantine corrupt snapshot", renameErr);
      }
      return false;
    }
    if (!raw) return false;
    hydrateSnapshotState(raw);
    deps.runtimeLogInfo({ players: deps.players.size, ownershipTiles: deps.ownership.size }, "snapshot hydrated");
    return true;
  };

  return {
    hydrateSnapshotState,
    loadSnapshot
  };
};
