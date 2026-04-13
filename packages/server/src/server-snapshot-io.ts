import fs from "node:fs";
import path from "node:path";

import type { Player, SeasonVictoryPathId, TileKey } from "@border-empires/shared";

import type {
  AbilityDefinition,
  SnapshotEconomySection,
  SnapshotMetaSection,
  SnapshotPlayersSection,
  SnapshotSectionIndex,
  SnapshotState,
  SnapshotSystemsSection,
  SnapshotTerritorySection
} from "./server-shared-types.js";

type SnapshotOwnershipStateEntry = NonNullable<SnapshotState["ownershipState"]>[number];
type SnapshotBarbarianAgent = NonNullable<SnapshotState["barbarianAgents"]>[number];
type SnapshotStrategicResourceStock = NonNullable<SnapshotState["strategicResources"]>[number][1];
type SnapshotStrategicResourceBuffer = NonNullable<SnapshotState["strategicResourceBuffer"]>[number][1];
type SnapshotTileYieldState = NonNullable<SnapshotState["tileYield"]>[number][1];
type SnapshotTileHistoryState = NonNullable<SnapshotState["tileHistory"]>[number][1];
type SnapshotTerrainShapeState = NonNullable<SnapshotState["terrainShapes"]>[number][1];
type SnapshotVictoryPressure = NonNullable<SnapshotState["seasonVictory"]>[number][1];
type SnapshotDynamicMissions = NonNullable<SnapshotState["dynamicMissions"]>[number][1];
type SnapshotTemporaryIncomeBuff = NonNullable<SnapshotState["temporaryIncomeBuff"]>[number][1];
type SnapshotAllianceRequest = NonNullable<SnapshotState["allianceRequests"]>[number];
type SnapshotFort = NonNullable<SnapshotState["forts"]>[number];
type SnapshotObservatory = NonNullable<SnapshotState["observatories"]>[number];
type SnapshotSiegeOutpost = NonNullable<SnapshotState["siegeOutposts"]>[number];
type SnapshotEconomicStructure = NonNullable<SnapshotState["economicStructures"]>[number];
type SnapshotSabotage = NonNullable<SnapshotState["sabotage"]>[number];
type SnapshotAetherWall = NonNullable<SnapshotState["aetherWalls"]>[number];
type SnapshotDock = NonNullable<SnapshotState["docks"]>[number];
type SnapshotTown = NonNullable<SnapshotState["towns"]>[number];
type SnapshotShardSite = NonNullable<SnapshotState["shardSites"]>[number];
type SnapshotCluster = NonNullable<SnapshotState["clusters"]>[number];
type SnapshotSeasonTechConfig = NonNullable<SnapshotState["seasonTechConfig"]>;

export interface CreateServerSnapshotIoDeps {
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  players: Map<string, Player>;
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, SnapshotOwnershipStateEntry[1]>;
  settledSinceByTile: Map<TileKey, number>;
  barbarianAgents: Map<string, SnapshotBarbarianAgent>;
  authIdentities: () => SnapshotState["authIdentities"];
  resourceCountsByPlayer: Map<string, SnapshotState["resources"][number][1]>;
  strategicResourceStockByPlayer: Map<string, SnapshotStrategicResourceStock>;
  strategicResourceBufferByPlayer: Map<string, SnapshotStrategicResourceBuffer>;
  tileYieldByTile: Map<TileKey, SnapshotTileYieldState>;
  tileHistoryByTile: Map<TileKey, SnapshotTileHistoryState>;
  terrainShapesByTile: Map<TileKey, SnapshotTerrainShapeState>;
  victoryPressureById: Map<SeasonVictoryPathId, SnapshotVictoryPressure>;
  frontierSettlementsByPlayer: Map<string, number[]>;
  dynamicMissionsByPlayer: Map<string, SnapshotDynamicMissions>;
  temporaryAttackBuffUntilByPlayer: Map<string, number>;
  temporaryIncomeBuffUntilByPlayer: Map<string, SnapshotTemporaryIncomeBuff>;
  forcedRevealTilesByPlayer: Map<string, Set<TileKey>>;
  revealedEmpireTargetsByPlayer: Map<string, Set<string>>;
  allianceRequests: Map<string, SnapshotAllianceRequest>;
  fortsByTile: Map<TileKey, SnapshotFort>;
  observatoriesByTile: Map<TileKey, SnapshotObservatory>;
  siegeOutpostsByTile: Map<TileKey, SnapshotSiegeOutpost>;
  economicStructuresByTile: Map<TileKey, SnapshotEconomicStructure>;
  siphonByTile: Map<TileKey, SnapshotSabotage>;
  abilityCooldownsByPlayer: Map<string, Map<string, number>>;
  activeAetherWallsById: Map<string, SnapshotAetherWall>;
  dockById: Map<string, SnapshotDock>;
  townsByTile: Map<TileKey, SnapshotTown>;
  shardSitesByTile: Map<TileKey, SnapshotShardSite>;
  firstSpecialSiteCaptureClaimed: Set<TileKey>;
  clustersById: Map<string, SnapshotCluster>;
  clusterByTile: Map<TileKey, string>;
  pendingSettlementsByTile: Map<TileKey, { tileKey: TileKey; ownerId: string; startedAt: number; resolvesAt: number; goldCost: number }>;
  townCaptureShockUntilByTile: Map<TileKey, number>;
  townGrowthShockUntilByTile: Map<TileKey, number>;
  activeSeason: () => SnapshotState["season"];
  seasonWinner: () => SnapshotState["seasonWinner"];
  seasonArchives: () => SnapshotState["seasonArchives"];
  activeSeasonTechConfig: () => SnapshotSeasonTechConfig;
  serializePlayer: (player: Player) => SnapshotState["players"][number];
  SNAPSHOT_DIR: string;
  SNAPSHOT_FILE: string;
  SNAPSHOT_INDEX_FILE: string;
  SNAPSHOT_SECTION_FILES: Record<keyof SnapshotSectionIndex["sections"], string>;
  snapshotSectionFile: (section: keyof SnapshotSectionIndex["sections"]) => string;
  runtimeMemoryStats: () => Record<string, number>;
  logSnapshotSerializationMemory: (phase: string, startedAt: number, stats: Record<string, number>, extra?: Record<string, number | string>) => void;
}

export interface ServerSnapshotIoRuntime {
  buildSnapshotState: () => SnapshotState;
  splitSnapshotState: (snapshot: SnapshotState) => {
    meta: SnapshotMetaSection;
    players: SnapshotPlayersSection;
    territory: SnapshotTerritorySection;
    economy: SnapshotEconomySection;
    systems: SnapshotSystemsSection;
  };
  saveSnapshot: () => Promise<void>;
  loadSectionedSnapshot: () => SnapshotState | undefined;
  loadLegacySnapshot: () => SnapshotState | undefined;
}

const writeSnapshotJsonAtomic = async (targetFile: string, serialized: string): Promise<void> => {
  const tmpFile = `${targetFile}.${process.pid}.tmp`;
  await fs.promises.writeFile(tmpFile, serialized);
  await fs.promises.rename(tmpFile, targetFile);
};

const readSnapshotJsonSync = <T>(file: string): { data: T; bytes: number; elapsedMs: number } => {
  const startedAt = Date.now();
  const text = fs.readFileSync(file, "utf8");
  return { data: JSON.parse(text) as T, bytes: Buffer.byteLength(text), elapsedMs: Date.now() - startedAt };
};

export const createServerSnapshotIoRuntime = (
  deps: CreateServerSnapshotIoDeps
): ServerSnapshotIoRuntime => {
  let snapshotSavePromise: Promise<void> = Promise.resolve();

  const buildSnapshotState = (): SnapshotState => {
    const snapshot: SnapshotState = {
      world: { width: deps.WORLD_WIDTH, height: deps.WORLD_HEIGHT },
      townPlacementsNormalized: true,
      players: [...deps.players.values()].map(deps.serializePlayer),
      ownership: [...deps.ownership.entries()],
      ownershipState: [...deps.ownershipStateByTile.entries()],
      settledSince: [...deps.settledSinceByTile.entries()],
      barbarianAgents: [...deps.barbarianAgents.values()],
      resources: [...deps.resourceCountsByPlayer.entries()],
      strategicResources: [...deps.strategicResourceStockByPlayer.entries()],
      strategicResourceBuffer: [...deps.strategicResourceBufferByPlayer.entries()],
      tileYield: [...deps.tileYieldByTile.entries()],
      tileHistory: [...deps.tileHistoryByTile.entries()],
      terrainShapes: [...deps.terrainShapesByTile.entries()],
      seasonVictory: [...deps.victoryPressureById.entries()],
      frontierSettlements: [...deps.frontierSettlementsByPlayer.entries()],
      dynamicMissions: [...deps.dynamicMissionsByPlayer.entries()],
      temporaryAttackBuffUntil: [...deps.temporaryAttackBuffUntilByPlayer.entries()],
      temporaryIncomeBuff: [...deps.temporaryIncomeBuffUntilByPlayer.entries()],
      forcedReveal: [...deps.forcedRevealTilesByPlayer.entries()].map(([playerId, set]) => [playerId, [...set]]),
      revealedEmpireTargets: [...deps.revealedEmpireTargetsByPlayer.entries()].map(([playerId, set]) => [playerId, [...set]]),
      allianceRequests: [...deps.allianceRequests.values()],
      forts: [...deps.fortsByTile.values()],
      observatories: [...deps.observatoriesByTile.values()],
      siegeOutposts: [...deps.siegeOutpostsByTile.values()],
      economicStructures: [...deps.economicStructuresByTile.values()],
      sabotage: [...deps.siphonByTile.values()],
      abilityCooldowns: [...deps.abilityCooldownsByPlayer.entries()].map(([playerId, map]) => [
        playerId,
        [...map.entries()] as [AbilityDefinition["id"], number][]
      ]),
      aetherWalls: [...deps.activeAetherWallsById.values()],
      docks: [...deps.dockById.values()],
      towns: [...deps.townsByTile.values()],
      shardSites: [...deps.shardSitesByTile.values()],
      firstSpecialSiteCaptureClaimed: [...deps.firstSpecialSiteCaptureClaimed],
      clusters: [...deps.clustersById.values()],
      clusterTiles: [...deps.clusterByTile.entries()],
      pendingSettlements: [...deps.pendingSettlementsByTile.values()].map((settlement) => ({
        tileKey: settlement.tileKey,
        ownerId: settlement.ownerId,
        startedAt: settlement.startedAt,
        resolvesAt: settlement.resolvesAt,
        goldCost: settlement.goldCost
      })),
      townCaptureShock: [...deps.townCaptureShockUntilByTile.entries()],
      townGrowthShock: [...deps.townGrowthShockUntilByTile.entries()],
      seasonTechConfig: deps.activeSeasonTechConfig()
    };
    const activeSeason = deps.activeSeason();
    if (activeSeason) snapshot.season = activeSeason;
    const seasonArchives = deps.seasonArchives();
    if (seasonArchives) snapshot.seasonArchives = seasonArchives;
    const authIdentities = deps.authIdentities();
    if (authIdentities) snapshot.authIdentities = authIdentities;
    const winner = deps.seasonWinner();
    if (winner) snapshot.seasonWinner = winner;
    return snapshot;
  };

  const splitSnapshotState = (snapshot: SnapshotState) => ({
    meta: {
      world: snapshot.world,
      ...(snapshot.townPlacementsNormalized ? { townPlacementsNormalized: snapshot.townPlacementsNormalized } : {}),
      ...(snapshot.season ? { season: snapshot.season } : {}),
      ...(snapshot.seasonWinner ? { seasonWinner: snapshot.seasonWinner } : {}),
      ...(snapshot.seasonArchives ? { seasonArchives: snapshot.seasonArchives } : {}),
      ...(snapshot.seasonTechConfig ? { seasonTechConfig: snapshot.seasonTechConfig } : {})
    },
    players: {
      players: snapshot.players,
      ...(snapshot.authIdentities ? { authIdentities: snapshot.authIdentities } : {})
    },
    territory: {
      ownership: snapshot.ownership,
      ...(snapshot.ownershipState ? { ownershipState: snapshot.ownershipState } : {}),
      ...(snapshot.settledSince ? { settledSince: snapshot.settledSince } : {}),
      ...(snapshot.barbarianAgents ? { barbarianAgents: snapshot.barbarianAgents } : {}),
      ...(snapshot.tileHistory ? { tileHistory: snapshot.tileHistory } : {}),
      ...(snapshot.terrainShapes ? { terrainShapes: snapshot.terrainShapes } : {}),
      ...(snapshot.docks ? { docks: snapshot.docks } : {}),
      ...(snapshot.towns ? { towns: snapshot.towns } : {}),
      ...(snapshot.shardSites ? { shardSites: snapshot.shardSites } : {}),
      ...(snapshot.firstSpecialSiteCaptureClaimed ? { firstSpecialSiteCaptureClaimed: snapshot.firstSpecialSiteCaptureClaimed } : {}),
      ...(snapshot.clusters ? { clusters: snapshot.clusters } : {}),
      ...(snapshot.clusterTiles ? { clusterTiles: snapshot.clusterTiles } : {}),
      ...(snapshot.townCaptureShock ? { townCaptureShock: snapshot.townCaptureShock } : {}),
      ...(snapshot.townGrowthShock ? { townGrowthShock: snapshot.townGrowthShock } : {})
    },
    economy: {
      resources: snapshot.resources,
      ...(snapshot.strategicResources ? { strategicResources: snapshot.strategicResources } : {}),
      ...(snapshot.strategicResourceBuffer ? { strategicResourceBuffer: snapshot.strategicResourceBuffer } : {}),
      ...(snapshot.tileYield ? { tileYield: snapshot.tileYield } : {}),
      ...(snapshot.frontierSettlements ? { frontierSettlements: snapshot.frontierSettlements } : {}),
      ...(snapshot.dynamicMissions ? { dynamicMissions: snapshot.dynamicMissions } : {}),
      ...(snapshot.temporaryAttackBuffUntil ? { temporaryAttackBuffUntil: snapshot.temporaryAttackBuffUntil } : {}),
      ...(snapshot.temporaryIncomeBuff ? { temporaryIncomeBuff: snapshot.temporaryIncomeBuff } : {}),
      ...(snapshot.pendingSettlements ? { pendingSettlements: snapshot.pendingSettlements } : {})
    },
    systems: {
      ...(snapshot.seasonVictory ? { seasonVictory: snapshot.seasonVictory } : {}),
      ...(snapshot.forcedReveal ? { forcedReveal: snapshot.forcedReveal } : {}),
      ...(snapshot.revealedEmpireTargets ? { revealedEmpireTargets: snapshot.revealedEmpireTargets } : {}),
      ...(snapshot.allianceRequests ? { allianceRequests: snapshot.allianceRequests } : {}),
      ...(snapshot.forts ? { forts: snapshot.forts } : {}),
      ...(snapshot.observatories ? { observatories: snapshot.observatories } : {}),
      ...(snapshot.siegeOutposts ? { siegeOutposts: snapshot.siegeOutposts } : {}),
      ...(snapshot.economicStructures ? { economicStructures: snapshot.economicStructures } : {}),
      ...(snapshot.sabotage ? { sabotage: snapshot.sabotage } : {}),
      ...(snapshot.abilityCooldowns ? { abilityCooldowns: snapshot.abilityCooldowns } : {}),
      ...(snapshot.aetherWalls ? { aetherWalls: snapshot.aetherWalls } : {})
    }
  });

  const saveSnapshot = async (): Promise<void> => {
    const startedAt = Date.now();
    deps.logSnapshotSerializationMemory("before_build", startedAt, deps.runtimeMemoryStats());
    const snapshot = buildSnapshotState();
    deps.logSnapshotSerializationMemory("after_build", startedAt, deps.runtimeMemoryStats());
    const sections = splitSnapshotState(snapshot);
    deps.logSnapshotSerializationMemory("after_split", startedAt, deps.runtimeMemoryStats());
    const serializedSections = {
      meta: JSON.stringify(sections.meta),
      players: JSON.stringify(sections.players),
      territory: JSON.stringify(sections.territory),
      economy: JSON.stringify(sections.economy),
      systems: JSON.stringify(sections.systems)
    };
    const index: SnapshotSectionIndex = {
      formatVersion: 2,
      sections: {
        meta: deps.SNAPSHOT_SECTION_FILES.meta,
        players: deps.SNAPSHOT_SECTION_FILES.players,
        territory: deps.SNAPSHOT_SECTION_FILES.territory,
        economy: deps.SNAPSHOT_SECTION_FILES.economy,
        systems: deps.SNAPSHOT_SECTION_FILES.systems
      }
    };
    const serializedIndex = JSON.stringify(index);
    snapshotSavePromise = snapshotSavePromise.catch(() => undefined).then(async () => {
      await fs.promises.mkdir(deps.SNAPSHOT_DIR, { recursive: true });
      await Promise.all([
        writeSnapshotJsonAtomic(deps.snapshotSectionFile("meta"), serializedSections.meta),
        writeSnapshotJsonAtomic(deps.snapshotSectionFile("players"), serializedSections.players),
        writeSnapshotJsonAtomic(deps.snapshotSectionFile("territory"), serializedSections.territory),
        writeSnapshotJsonAtomic(deps.snapshotSectionFile("economy"), serializedSections.economy),
        writeSnapshotJsonAtomic(deps.snapshotSectionFile("systems"), serializedSections.systems)
      ]);
      await writeSnapshotJsonAtomic(deps.SNAPSHOT_INDEX_FILE, serializedIndex);
      deps.logSnapshotSerializationMemory("after_write", startedAt, deps.runtimeMemoryStats());
    });
    return snapshotSavePromise;
  };

  const loadSectionedSnapshot = (): SnapshotState | undefined => {
    if (!fs.existsSync(deps.SNAPSHOT_INDEX_FILE)) return undefined;
    const index = readSnapshotJsonSync<SnapshotSectionIndex>(deps.SNAPSHOT_INDEX_FILE);
    if (index.data.formatVersion !== 2) throw new Error(`unsupported snapshot index format ${index.data.formatVersion}`);
    const meta = readSnapshotJsonSync<SnapshotMetaSection>(path.join(deps.SNAPSHOT_DIR, index.data.sections.meta));
    const players = readSnapshotJsonSync<SnapshotPlayersSection>(path.join(deps.SNAPSHOT_DIR, index.data.sections.players));
    const territory = readSnapshotJsonSync<SnapshotTerritorySection>(path.join(deps.SNAPSHOT_DIR, index.data.sections.territory));
    const economy = readSnapshotJsonSync<SnapshotEconomySection>(path.join(deps.SNAPSHOT_DIR, index.data.sections.economy));
    const systems = readSnapshotJsonSync<SnapshotSystemsSection>(path.join(deps.SNAPSHOT_DIR, index.data.sections.systems));
    return {
      ...meta.data,
      townPlacementsNormalized: meta.data.townPlacementsNormalized ?? true,
      ...players.data,
      ...territory.data,
      ...economy.data,
      ...systems.data
    };
  };

  const loadLegacySnapshot = (): SnapshotState | undefined => {
    if (!fs.existsSync(deps.SNAPSHOT_FILE)) return undefined;
    return readSnapshotJsonSync<SnapshotState>(deps.SNAPSHOT_FILE).data;
  };

  return {
    buildSnapshotState,
    splitSnapshotState,
    saveSnapshot,
    loadSectionedSnapshot,
    loadLegacySnapshot
  };
};
