import { describe, expect, it } from "vitest";

import type { Player, Season, TileKey } from "@border-empires/shared";

import { createServerSnapshotHydrateRuntime, type CreateServerSnapshotHydrateDeps } from "./server-snapshot-hydrate.js";
import type { SeasonalTechConfig, SnapshotState } from "./server-shared-types.js";

const baseSeason = (): Season => ({
  seasonId: "season-1",
  startAt: 0,
  endAt: 10_000,
  worldSeed: 123,
  techTreeConfigId: "config-1",
  status: "active"
});

const baseSeasonTechConfig = (): SeasonalTechConfig => ({
  configId: "config-1",
  rootNodeIds: ["root-1"],
  activeNodeIds: new Set(["root-1"]),
  balanceConstants: {}
});

const baseMissionStats = (): Player["missionStats"] => ({
  enemyCaptures: 0,
  neutralCaptures: 0,
  combatWins: 0,
  maxTilesHeld: 0,
  maxSettledTilesHeld: 0,
  maxFarmsHeld: 0,
  maxContinentsHeld: 0,
  maxTechPicks: 0
});

const snapshotPlayer = (
  overrides: Partial<SnapshotState["players"][number]> = {}
): SnapshotState["players"][number] => ({
  id: "player-1",
  name: "Rowan",
  points: 100,
  level: 0,
  techIds: [],
  domainIds: [],
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  powerups: {},
  missions: [],
  missionStats: baseMissionStats(),
  territoryTiles: [],
  T: 0,
  E: 0,
  Ts: 0,
  Es: 0,
  stamina: 5,
  staminaUpdatedAt: 0,
  manpower: 10,
  manpowerUpdatedAt: 0,
  manpowerCapSnapshot: 10,
  allies: [],
  spawnShieldUntil: 0,
  isEliminated: false,
  respawnPending: false,
  lastActiveAt: 0,
  lastEconomyWakeAt: 0,
  activityInbox: [],
  ...overrides
});

const makeDeps = (): CreateServerSnapshotHydrateDeps => {
  const activeSeason = baseSeason();
  let activeSeasonTechConfig = baseSeasonTechConfig();

  return {
    ownership: new Map<TileKey, string>(),
    ownershipStateByTile: new Map(),
    settledSinceByTile: new Map(),
    barbarianAgents: new Map(),
    barbarianAgentByTileKey: new Map(),
    authIdentityByUid: new Map(),
    resourceCountsByPlayer: new Map(),
    strategicResourceStockByPlayer: new Map(),
    strategicResourceBufferByPlayer: new Map(),
    tileHistoryByTile: new Map(),
    terrainShapesByTile: new Map(),
    resourceOverridesByTile: new Map(),
    victoryPressureById: new Map(),
    frontierSettlementsByPlayer: new Map(),
    tileYieldByTile: new Map(),
    dynamicMissionsByPlayer: new Map(),
    temporaryAttackBuffUntilByPlayer: new Map(),
    temporaryIncomeBuffUntilByPlayer: new Map(),
    cachedVisibilitySnapshotByPlayer: new Map(),
    cachedChunkSnapshotByPlayer: new Map(),
    simulationChunkStateClear: () => {},
    chunkSnapshotGenerationByPlayer: new Map(),
    revealWatchersByTarget: new Map(),
    observatoryTileKeysByPlayer: new Map(),
    economicStructureTileKeysByPlayer: new Map(),
    forcedRevealTilesByPlayer: new Map(),
    revealedEmpireTargetsByPlayer: new Map(),
    allianceRequests: new Map(),
    fortsByTile: new Map(),
    observatoriesByTile: new Map(),
    siegeOutpostsByTile: new Map(),
    economicStructuresByTile: new Map(),
    siphonByTile: new Map(),
    abilityCooldownsByPlayer: new Map(),
    activeAetherWallsById: new Map(),
    docksByTile: new Map(),
    dockById: new Map(),
    dockLinkedTileKeysByDockTileKeyClear: () => {},
    townsByTile: new Map(),
    shardSitesByTile: new Map(),
    firstSpecialSiteCaptureClaimed: new Set(),
    clustersById: new Map(),
    clusterByTile: new Map(),
    townCaptureShockUntilByTile: new Map(),
    townGrowthShockUntilByTile: new Map(),
    players: new Map(),
    playerBaseMods: new Map(),
    pendingSettlementsByTile: new Map(),
    SNAPSHOT_INDEX_FILE: "/tmp/snapshot-index.json",
    SNAPSHOT_FILE: "/tmp/snapshot.json",
    logRuntimeError: () => {},
    loadSectionedSnapshot: () => undefined,
    loadLegacySnapshot: () => undefined,
    BARBARIAN_OWNER_ID: "barbarians",
    setRevealTargetsForPlayer: () => {},
    trackOwnedTileKey: (map, ownerId, tileKey) => {
      const existing = map.get(ownerId) ?? new Set<TileKey>();
      existing.add(tileKey);
      map.set(ownerId, existing);
    },
    isConverterStructureType: () => false,
    registerAetherWallEdges: () => {},
    townPlacementsNeedNormalization: () => false,
    normalizeTownPlacements: () => {},
    assignMissingTownNamesForWorld: () => {},
    seasonTechConfigIsCompatible: () => true,
    chooseSeasonalTechConfig: () => baseSeasonTechConfig(),
    activeSeason: () => activeSeason,
    setActiveSeason: (season) => {
      activeSeason.seasonId = season.seasonId;
      activeSeason.startAt = season.startAt;
      activeSeason.endAt = season.endAt;
      activeSeason.worldSeed = season.worldSeed;
      activeSeason.techTreeConfigId = season.techTreeConfigId;
      activeSeason.status = season.status;
    },
    seasonWinner: () => undefined,
    setSeasonWinner: () => {},
    seasonArchives: () => [],
    activeSeasonTechConfig: () => activeSeasonTechConfig,
    setActiveSeasonTechConfig: (config) => {
      activeSeasonTechConfig = config;
    },
    ensureMissionDefaults: () => {},
    normalizePlayerProgressionState: () => {},
    recomputePlayerEffectsForPlayer: () => {},
    defaultMissionStats: () => baseMissionStats(),
    ensureFallbackSettlementForPlayer: () => false,
    spawnBarbarianAgentAt: () => {},
    parseKey: (tileKey) => {
      const [xRaw, yRaw] = tileKey.split(",");
      return [Number(xRaw), Number(yRaw)];
    },
    playerTile: () => ({ terrain: "LAND" }),
    runtimeLogInfo: () => {}
  };
};

describe("server snapshot hydrate regression", () => {
  it("marks legacy staging probe players as incomplete so bootstrap can discard them", () => {
    const deps = makeDeps();
    const runtime = createServerSnapshotHydrateRuntime(deps);

    runtime.hydrateSnapshotState({
      world: { width: 2, height: 2 },
      players: [
        snapshotPlayer({
          id: "probe-1",
          name: "staging-probe-1777477740581-12",
          profileComplete: true,
          territoryTiles: ["0,0"],
          T: 1
        })
      ],
      ownership: [["0,0", "probe-1"]],
      resources: []
    });

    expect(deps.players.get("probe-1")?.profileComplete).toBe(false);
  });

  it("recovers missing ownership entries from persisted player territory before bootstrap rebuilds state", () => {
    const deps = makeDeps();
    const runtime = createServerSnapshotHydrateRuntime(deps);

    runtime.hydrateSnapshotState({
      world: { width: 2, height: 2 },
      players: [
        snapshotPlayer({
          territoryTiles: ["1,1"],
          T: 1
        })
      ],
      ownership: [],
      resources: []
    });

    expect(deps.ownership.get("1,1")).toBe("player-1");
    expect(deps.ownershipStateByTile.get("1,1")).toBe("SETTLED");
    expect(deps.settledSinceByTile.get("1,1")).toBe(0);
  });
});
