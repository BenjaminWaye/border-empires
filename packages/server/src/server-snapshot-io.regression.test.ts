import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import type { Player, ResourceType, TileKey } from "@border-empires/shared";

import { createServerSnapshotIoRuntime, type CreateServerSnapshotIoDeps } from "./server-snapshot-io.js";

const tempDirs: string[] = [];

const createPlayer = (): Player => ({
  id: "player-1",
  name: "Aster",
  points: 100,
  level: 1,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  powerups: {},
  missions: [],
  missionStats: {
    enemyCaptures: 0,
    neutralCaptures: 0,
    combatWins: 0,
    maxTilesHeld: 0,
    maxSettledTilesHeld: 0,
    maxFarmsHeld: 0,
    maxContinentsHeld: 0,
    maxTechPicks: 0
  },
  territoryTiles: new Set<TileKey>(["0,0"]),
  T: 1,
  E: 0,
  Ts: 0,
  Es: 0,
  stamina: 5,
  staminaUpdatedAt: 0,
  manpower: 10,
  manpowerUpdatedAt: 0,
  manpowerCapSnapshot: 10,
  allies: new Set<string>(),
  spawnShieldUntil: 0,
  isEliminated: false,
  respawnPending: false,
  lastActiveAt: 0,
  lastEconomyWakeAt: 0,
  activityInbox: [],
  tileColor: "#ffffff"
});

const makeDeps = (snapshotDir: string): CreateServerSnapshotIoDeps => {
  const snapshotIndexFile = path.join(snapshotDir, "state.index.json");
  const snapshotSectionFiles = {
    meta: "state.meta.json",
    players: "state.players.json",
    territory: "state.territory.json",
    economy: "state.economy.json",
    systems: "state.systems.json"
  } as const;
  const snapshotSectionFile = (section: keyof typeof snapshotSectionFiles) => path.join(snapshotDir, snapshotSectionFiles[section]);
  const player = createPlayer();

  return {
    WORLD_WIDTH: 2,
    WORLD_HEIGHT: 2,
    players: new Map([[player.id, player]]),
    ownership: new Map<TileKey, string>([["0,0", player.id]]),
    ownershipStateByTile: new Map([["0,0", "SETTLED"]]),
    settledSinceByTile: new Map([["0,0", 0]]),
    barbarianAgents: new Map(),
    authIdentities: () => [],
    resourceCountsByPlayer: new Map([
      [
        player.id,
        {
          FARM: 0,
          WOOD: 0,
          IRON: 0,
          GEMS: 0,
          FISH: 0,
          FUR: 0,
          OIL: 0
        } satisfies Record<ResourceType, number>
      ]
    ]),
    strategicResourceStockByPlayer: new Map(),
    strategicResourceBufferByPlayer: new Map(),
    tileYieldByTile: new Map(),
    tileHistoryByTile: new Map(),
    terrainShapesByTile: new Map(),
    resourceOverridesByTile: new Map(),
    victoryPressureById: new Map(),
    frontierSettlementsByPlayer: new Map(),
    dynamicMissionsByPlayer: new Map(),
    temporaryAttackBuffUntilByPlayer: new Map(),
    temporaryIncomeBuffUntilByPlayer: new Map(),
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
    dockById: new Map(),
    townsByTile: new Map(),
    shardSitesByTile: new Map(),
    firstSpecialSiteCaptureClaimed: new Set(),
    clustersById: new Map(),
    clusterByTile: new Map(),
    pendingSettlementsByTile: new Map(),
    townCaptureShockUntilByTile: new Map(),
    townGrowthShockUntilByTile: new Map(),
    activeSeason: () => undefined,
    seasonWinner: () => undefined,
    seasonArchives: () => undefined,
    activeSeasonTechConfig: () => ({ configId: "base", rootNodeIds: [], activeNodeIds: [], balanceConstants: {} }),
    serializePlayer: (input) => ({
      id: input.id,
      name: input.name,
      points: input.points,
      level: input.level,
      techIds: [...input.techIds],
      domainIds: [...input.domainIds],
      mods: input.mods,
      powerups: input.powerups,
      missions: input.missions,
      missionStats: input.missionStats,
      territoryTiles: [...input.territoryTiles],
      T: input.T,
      E: input.E,
      Ts: input.Ts,
      Es: input.Es,
      stamina: input.stamina,
      staminaUpdatedAt: input.staminaUpdatedAt,
      manpower: input.manpower,
      manpowerUpdatedAt: input.manpowerUpdatedAt,
      manpowerCapSnapshot: input.manpowerCapSnapshot ?? 0,
      allies: [...input.allies],
      spawnShieldUntil: input.spawnShieldUntil,
      isEliminated: input.isEliminated,
      respawnPending: input.respawnPending,
      lastActiveAt: input.lastActiveAt,
      lastEconomyWakeAt: input.lastEconomyWakeAt ?? 0,
      activityInbox: input.activityInbox,
      tileColor: input.tileColor ?? "#ffffff"
    }),
    SNAPSHOT_DIR: snapshotDir,
    SNAPSHOT_FILE: path.join(snapshotDir, "state.json"),
    SNAPSHOT_INDEX_FILE: snapshotIndexFile,
    SNAPSHOT_SECTION_FILES: snapshotSectionFiles,
    snapshotSectionFile,
    runtimeMemoryStats: () => ({ rssMb: 0, heapUsedMb: 0, heapTotalMb: 0, externalMb: 0, arrayBuffersMb: 0 }),
    logSnapshotSerializationMemory: () => {}
  };
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("server snapshot io regression", () => {
  it("saves sectioned snapshots without leaving tmp files behind", async () => {
    const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), "be-snapshot-io-"));
    tempDirs.push(snapshotDir);
    const runtime = createServerSnapshotIoRuntime(makeDeps(snapshotDir));

    await runtime.saveSnapshot();

    expect(fs.existsSync(path.join(snapshotDir, "state.index.json"))).toBe(true);
    expect(fs.existsSync(path.join(snapshotDir, "state.territory.json"))).toBe(true);
    expect(fs.readdirSync(snapshotDir).some((entry) => entry.endsWith(".tmp"))).toBe(false);
  });

  it("keeps snapshot section persistence on a dedicated worker path", () => {
    const source = fs.readFileSync(fileURLToPath(new URL("./server-snapshot-io.ts", import.meta.url)), "utf8");
    expect(source).toContain('new Worker(resolveWorkerEntryUrl("./server-snapshot-save-worker.js", import.meta.url))');
  });
});
