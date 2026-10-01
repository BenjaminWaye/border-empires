import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { DEFAULT_AUTO_SETTLE_PREFS, setWorldSeed, terrainAt } from "@border-empires/shared";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type {
  SnapshotSystemsSection,
  SnapshotEconomySection,
  SnapshotMetaSection,
  SnapshotPlayersSection,
  SnapshotTerritorySection,
  DomainStrategicResourceKey,
  TileYieldBuffer,
  VictoryPressureTracker
} from "@border-empires/game-domain";
import {
  mintworksGoldProductionMultiplier,
  PASSIVE_INCOME_MULT,
  POPULATION_GROWTH_BASE_RATE,
  granaryGrowthMultiplier,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TOWN_BASE_GOLD_PER_MIN
} from "@border-empires/game-domain";
import type { SeasonVictoryPathId, SeasonWinnerView } from "@border-empires/shared";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import {
  buildLegacySnapshotPlayerEconomies,
  type LegacySnapshotPlayerEconomy
} from "../legacy-snapshot-economy/legacy-snapshot-economy.js";
import {
  parseTileKey,
  townPopulationTierFromSnapshot,
  townPopulationMultiplier,
  townFoodUpkeepPerMinute,
  townGrowthModifiersForSnapshot,
  supportRatioForTown,
  supportedStructureAtTown,
  countedStructuresAtTown,
  activeEconomicStructuresByTile,
  fedTownKeysByPlayerFromSnapshot
} from "./legacy-snapshot-town-support.js";

export type LegacySnapshotAuthIdentity = {
  uid: string;
  playerId: string;
  name?: string;
  email?: string;
};

export type LegacySnapshotPlayerProfile = {
  id: string;
  name: string;
  points: number;
  manpower: number;
  incomePerMinute: number;
  strategicResources: Record<DomainStrategicResourceKey, number>;
  strategicProductionPerMinute: Record<DomainStrategicResourceKey, number>;
  upkeepPerMinute: LegacySnapshotPlayerEconomy["upkeepPerMinute"];
  upkeepLastTick: LegacySnapshotPlayerEconomy["upkeepLastTick"];
  economyBreakdown: LegacySnapshotPlayerEconomy["economyBreakdown"];
  techIds: string[];
  domainIds: string[];
  tileColor?: string;
  capitalTile?: { x: number; y: number };
  spawnOrigin?: { x: number; y: number };
  isAi: boolean;
};

export type LegacySnapshotBootstrap = {
  runtimeIdentity: {
    sourceType: "legacy-snapshot";
    seasonId: string;
    worldSeed: number;
    snapshotLabel: string;
    fingerprint: string;
    playerCount: number;
    seededTileCount: number;
  };
  season?: { seasonId: string; worldSeed: number };
  seasonVictory?: [SeasonVictoryPathId, VictoryPressureTracker][];
  seasonWinner?: SeasonWinnerView;
  players: Map<string, DomainPlayer & { manpowerUpdatedAt?: number; manpowerCapSnapshot?: number }>;
  playerProfiles: Map<string, LegacySnapshotPlayerProfile>;
  authIdentities: LegacySnapshotAuthIdentity[];
  docks: SnapshotTerritorySection["docks"];
  clusters: SnapshotTerritorySection["clusters"];
  seedTiles: Map<string, DomainTileState>;
  initialState: RecoveredSimulationState;
};

const addBaseTile = (tiles: Map<string, DomainTileState>, x: number, y: number): DomainTileState => {
  const key = `${x},${y}`;
  const existing = tiles.get(key);
  if (existing) return existing;
  const tile: DomainTileState = { x, y, terrain: terrainAt(x, y) };
  tiles.set(key, tile);
  return tile;
};

const inferResource = (tileYieldEntry: unknown): DomainTileState["resource"] | undefined => {
  if (!tileYieldEntry || typeof tileYieldEntry !== "object") return undefined;
  const strategic = (tileYieldEntry as { strategic?: Record<string, number> }).strategic;
  if (!strategic || typeof strategic !== "object") return undefined;
  if ((strategic.FOOD ?? 0) > 0) return "FARM";
  if ((strategic.TITANIUM ?? 0) > 0) return "TITANIUM";
  if ((strategic.CRYSTAL ?? 0) > 0) return "GEMS";
  return undefined;
};

const isAiPlayer = (playerId: string, authIdentities: LegacySnapshotAuthIdentity[], playerName: string): boolean => {
  if (playerId === "barbarian" || playerId === "barbarian-1") return true;
  if (authIdentities.some((identity) => identity.playerId === playerId)) return false;
  return /^ai\b/i.test(playerName);
};

const readSnapshotJson = <T>(snapshotDir: string, filename: string): T => {
  const file = path.join(snapshotDir, filename);
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
};

const emptyStrategic = (): Record<DomainStrategicResourceKey, number> => ({
  FOOD: 0,
  TITANIUM: 0,
  CRYSTAL: 0,
  UMBRITE: 0,
  SHARD: 0
});

const cloneStrategic = (value?: Partial<Record<DomainStrategicResourceKey, number>>): Record<DomainStrategicResourceKey, number> => ({
  FOOD: value?.FOOD ?? 0,
  TITANIUM: value?.TITANIUM ?? 0,
  CRYSTAL: value?.CRYSTAL ?? 0,
  UMBRITE: value?.UMBRITE ?? 0,
  SHARD: value?.SHARD ?? 0
});

export const loadLegacySnapshotBootstrap = (snapshotDir: string): LegacySnapshotBootstrap => {
  const meta = readSnapshotJson<SnapshotMetaSection>(snapshotDir, "state.meta.json");
  const playersSection = readSnapshotJson<SnapshotPlayersSection>(snapshotDir, "state.players.json");
  const territory = readSnapshotJson<SnapshotTerritorySection>(snapshotDir, "state.territory.json");
  const economy = readSnapshotJson<SnapshotEconomySection>(snapshotDir, "state.economy.json");
  const systems = readSnapshotJson<SnapshotSystemsSection>(snapshotDir, "state.systems.json");
  const authIdentities = (playersSection.authIdentities ?? []).map((identity) => ({
    uid: identity.uid,
    playerId: identity.playerId,
    ...(identity.name ? { name: identity.name } : {}),
    ...(identity.email ? { email: identity.email } : {})
  }));

  if (meta.season?.worldSeed) {
    setWorldSeed(meta.season.worldSeed);
  }

  const seedTiles = new Map<string, DomainTileState>();
  for (let x = 0; x < meta.world.width; x += 1) {
    for (let y = 0; y < meta.world.height; y += 1) {
      addBaseTile(seedTiles, x, y);
    }
  }
  for (const dock of territory.docks ?? []) {
    const coords = parseTileKey(dock.tileKey);
    if (!coords) continue;
    addBaseTile(seedTiles, coords.x, coords.y).dockId = dock.dockId;
  }

  const ownershipByTile = new Map<string, string>(territory.ownership ?? []);
  const ownershipStateByTile = new Map<string, string>(territory.ownershipState ?? []);
  const tileYieldByTile = new Map<string, TileYieldBuffer>(economy.tileYield ?? []);
  const townCaptureShockUntilByTile = new Map<string, number>(territory.townCaptureShock ?? []);
  const townGrowthShockUntilByTile = new Map<string, number>(territory.townGrowthShock ?? []);
  const playerEconomies = buildLegacySnapshotPlayerEconomies({
    world: meta.world,
    playersSection,
    territory,
    economy,
    systems
  });
  const incomeModsByPlayer = new Map<string, number>(
    (playersSection.players ?? []).map((player) => [player.id, typeof player.mods?.income === "number" ? player.mods.income : 1])
  );
  const structuresByTile = activeEconomicStructuresByTile(systems);
  const nowMs = Date.now();
  const fedTownKeysByPlayer = fedTownKeysByPlayerFromSnapshot(
    playersSection,
    territory,
    ownershipByTile,
    ownershipStateByTile,
    playerEconomies
  );

  const tiles = new Map<string, DomainTileState>();
  for (const [tileKey, ownerId] of territory.ownership ?? []) {
    const coords = parseTileKey(tileKey);
    if (!coords) continue;
    const tile = addBaseTile(tiles, coords.x, coords.y);
    tile.ownerId = ownerId;
  }
  for (const [tileKey, ownershipState] of territory.ownershipState ?? []) {
    const coords = parseTileKey(tileKey);
    if (!coords) continue;
    const tile = addBaseTile(tiles, coords.x, coords.y);
    tile.ownershipState = ownershipState;
  }
  for (const town of territory.towns ?? []) {
    const coords = parseTileKey(town.tileKey);
    if (!coords) continue;
    const tile = addBaseTile(tiles, coords.x, coords.y);
    const ownerId = ownershipByTile.get(town.tileKey);
    const isSettled = ownerId ? ownershipStateByTile.get(town.tileKey) === "SETTLED" : false;
    const tier = townPopulationTierFromSnapshot(town);
    const support =
      ownerId && isSettled && tier !== "SETTLEMENT"
        ? supportRatioForTown(town.tileKey, ownerId, ownershipByTile, ownershipStateByTile, meta.world)
        : { supportCurrent: 0, supportMax: 0 };
    const supportRatio = support.supportMax <= 0 ? 1 : support.supportCurrent / support.supportMax;
    const fedTownKeys = ownerId ? fedTownKeysByPlayer.get(ownerId) : undefined;
    const isFed = Boolean(ownerId && fedTownKeys?.has(town.tileKey));
    const mintworksCount = ownerId
      ? countedStructuresAtTown(
          town.tileKey,
          ownerId,
          "MINTWORKS",
          ownershipByTile,
          ownershipStateByTile,
          structuresByTile,
          meta.world
        )
      : 0;
    const hasMintworks = mintworksCount > 0;
    // No town-level Clearing House signal exists on this legacy reconnect
    // path (pre-existing gap — Clearing House was never wired into this
    // formula even before mintworks-stacking). Detected here the same way
    // Mintworks itself is, via the local support-ring scan, rather than
    // leaving it permanently false.
    const clearingHouseActive =
      Boolean(ownerId) &&
      supportedStructureAtTown(
        town.tileKey,
        ownerId!,
        "CLEARING_HOUSE",
        ownershipByTile,
        ownershipStateByTile,
        structuresByTile,
        meta.world
      );
    const hasGranary =
      Boolean(ownerId) &&
      supportedStructureAtTown(
        town.tileKey,
        ownerId!,
        "GRANARY",
        ownershipByTile,
        ownershipStateByTile,
        structuresByTile,
        meta.world
      );
    const incomeMod = ownerId ? incomeModsByPlayer.get(ownerId) ?? 1 : 1;
    const baseGoldPerMinute = tier === "SETTLEMENT" ? SETTLEMENT_BASE_GOLD_PER_MIN : TOWN_BASE_GOLD_PER_MIN;
    const goldPerMinute =
      !ownerId || !isSettled
        ? 0
        : tier === "SETTLEMENT"
          ? baseGoldPerMinute * incomeMod * PASSIVE_INCOME_MULT
          : !isFed
            ? 0
            : (
                TOWN_BASE_GOLD_PER_MIN *
                  supportRatio *
                  townPopulationMultiplier(town) *
                  (1 + town.connectedTownBonus) *
                  mintworksGoldProductionMultiplier(mintworksCount, clearingHouseActive) *
                  incomeMod *
                  PASSIVE_INCOME_MULT
              );
    const populationGrowthPerMinute =
      !ownerId || !isSettled || !isFed
        ? 0
        : (() => {
            const logisticFactor = 1 - town.population / Math.max(1, town.maxPopulation);
            if (logisticFactor <= 0) return 0;
            const growthMult = (tier === "SETTLEMENT" ? 4 : 1) * granaryGrowthMultiplier(hasGranary);
            return town.population * POPULATION_GROWTH_BASE_RATE * growthMult * logisticFactor;
          })();
    const growthModifiers = townGrowthModifiersForSnapshot({
      now: nowMs,
      town,
      ownerId,
      isSettled,
      isFed,
      growthPerMinute: populationGrowthPerMinute,
      townCaptureShockUntilByTile,
      townGrowthShockUntilByTile
    });
    const cap =
      tier === "SETTLEMENT"
        ? goldPerMinute * 60 * 8
        : goldPerMinute * 60 * 8 * mintworksGoldProductionMultiplier(mintworksCount, clearingHouseActive);
    tile.town = {
      ...(town.name ? { name: town.name } : {}),
      type: town.type,
      populationTier: tier,
      baseGoldPerMinute,
      supportCurrent: support.supportCurrent,
      supportMax: support.supportMax,
      goldPerMinute: Number(goldPerMinute.toFixed(4)),
      cap: Number(cap.toFixed(4)),
      isFed,
      population: town.population,
      maxPopulation: town.maxPopulation,
      populationGrowthPerMinute: Number(populationGrowthPerMinute.toFixed(4)),
      connectedTownCount: town.connectedTownCount,
      connectedTownBonus: town.connectedTownBonus,
      hasMintworks,
      mintworksActive: hasMintworks && isFed,
      mintworksCount,
      hasGranary,
      granaryActive: hasGranary,
      foodUpkeepPerMinute: townFoodUpkeepPerMinute(town),
      ...(growthModifiers.length > 0 ? { growthModifiers } : {})
    };
  }
  for (const dock of territory.docks ?? []) {
    const coords = parseTileKey(dock.tileKey);
    if (!coords) continue;
    addBaseTile(tiles, coords.x, coords.y).dockId = dock.dockId;
  }
  for (const [tileKey, tileYield] of economy.tileYield ?? []) {
    const coords = parseTileKey(tileKey);
    if (!coords) continue;
    const tile = addBaseTile(tiles, coords.x, coords.y);
    const resource = inferResource(tileYield);
    if (resource) tile.resource = resource;
  }

  const playerProfiles = new Map<string, LegacySnapshotPlayerProfile>();
  const domainPlayers = new Map<string, DomainPlayer>();
  for (const player of playersSection.players ?? []) {
    const capitalTile = typeof player.capitalTileKey === "string" ? parseTileKey(player.capitalTileKey) : undefined;
    const spawnOrigin = typeof player.spawnOrigin === "string" ? parseTileKey(player.spawnOrigin) : undefined;
    const isAi = isAiPlayer(player.id, authIdentities, player.name);
    const techIds = [...player.techIds];
    const domainIds = [...(player.domainIds ?? [])];
    const playerEconomy = playerEconomies.get(player.id);
    playerProfiles.set(player.id, {
      id: player.id,
      name: player.name,
      points: typeof player.points === "number" ? player.points : 0,
      manpower: typeof player.manpower === "number" ? player.manpower : 100,
      incomePerMinute: playerEconomy?.incomePerMinute ?? 0,
      strategicResources: playerEconomy?.strategicResources ?? emptyStrategic(),
      strategicProductionPerMinute: playerEconomy?.strategicProductionPerMinute ?? emptyStrategic(),
      upkeepPerMinute: playerEconomy?.upkeepPerMinute ?? { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
      upkeepLastTick: playerEconomy?.upkeepLastTick ?? {
        foodCoverage: 1,
        gold: { contributors: [] },
        food: { contributors: [] },
        titanium: { contributors: [] },
        crystal: { contributors: [] },
        umbrite: { contributors: [] }
      },
      economyBreakdown: playerEconomy?.economyBreakdown ?? {
        GOLD: { sources: [], sinks: [] },
        FOOD: { sources: [], sinks: [] },
        TITANIUM: { sources: [], sinks: [] },
        CRYSTAL: { sources: [], sinks: [] },
        UMBRITE: { sources: [], sinks: [] },
        SHARD: { sources: [], sinks: [] }
      },
      techIds,
      domainIds,
      ...(typeof player.tileColor === "string" ? { tileColor: player.tileColor } : {}),
      ...(capitalTile ? { capitalTile } : {}),
      ...(spawnOrigin ? { spawnOrigin } : {}),
      isAi
    });
    domainPlayers.set(player.id, {
      id: player.id,
      isAi,
      name: player.name,
      points: typeof player.points === "number" ? player.points : 0,
      manpower: typeof player.manpower === "number" ? player.manpower : 100,
      ...(typeof player.manpowerUpdatedAt === "number" ? { manpowerUpdatedAt: player.manpowerUpdatedAt } : {}),
      ...(typeof player.manpowerCapSnapshot === "number" ? { manpowerCapSnapshot: player.manpowerCapSnapshot } : {}),
      techIds: new Set(techIds),
      domainIds: new Set(domainIds),
      mods: {
        attack: typeof player.mods?.attack === "number" ? player.mods.attack : 1,
        defense: typeof player.mods?.defense === "number" ? player.mods.defense : 1,
        income: typeof player.mods?.income === "number" ? player.mods.income : 1,
        vision: typeof player.mods?.vision === "number" ? player.mods.vision : 1
      },
      techRootId: "rewrite-local",
      autoSettle: { ...DEFAULT_AUTO_SETTLE_PREFS },
      ...(typeof player.tileColor === "string" ? { tileColor: player.tileColor } : {}),
      allies: new Set(player.allies ?? []),
      strategicResources: cloneStrategic(playerEconomy?.strategicResources),
      strategicProductionPerMinute: cloneStrategic(playerEconomy?.strategicProductionPerMinute)
    });
  }

  const seasonId = meta.season?.seasonId ?? "unknown-season";
  const worldSeed = meta.season?.worldSeed ?? 0;
  const snapshotLabel = path.basename(snapshotDir);
  const fingerprint = crypto
    .createHash("sha1")
    .update(
      JSON.stringify({
        sourceType: "legacy-snapshot",
        seasonId,
        worldSeed,
        snapshotLabel,
        playerCount: domainPlayers.size,
        seededTileCount: seedTiles.size
      })
    )
    .digest("hex")
    .slice(0, 12);

  return {
    runtimeIdentity: {
      sourceType: "legacy-snapshot",
      seasonId,
      worldSeed,
      snapshotLabel,
      fingerprint,
      playerCount: domainPlayers.size,
      seededTileCount: seedTiles.size
    },
    ...(meta.season ? { season: { seasonId: meta.season.seasonId, worldSeed: meta.season.worldSeed } } : {}),
    ...(systems.seasonVictory ? { seasonVictory: systems.seasonVictory } : {}),
    ...(meta.seasonWinner ? { seasonWinner: meta.seasonWinner } : {}),
    players: domainPlayers,
    playerProfiles,
    authIdentities,
    docks: territory.docks ?? [],
    clusters: territory.clusters ?? [],
    seedTiles,
    initialState: {
      tiles: [...tiles.values()].sort((left, right) => (left.x - right.x) || (left.y - right.y)),
      docks: (territory.docks ?? []).map((dock) => ({
        dockId: dock.dockId,
        tileKey: dock.tileKey,
        pairedDockId: dock.pairedDockId,
        ...(dock.connectedDockIds?.length ? { connectedDockIds: [...dock.connectedDockIds] } : {})
      })),
      activeLocks: []
    }
  };
};
