import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { setWorldSeed, terrainAt } from "@border-empires/shared";
import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import type {
  SnapshotSystemsSection,
  SnapshotEconomySection,
  SnapshotMetaSection,
  SnapshotPlayersSection,
  SnapshotTerritorySection,
  TownDefinition,
  StrategicResource,
  TileYieldBuffer,
  VictoryPressureTracker
} from "../../../packages/server/src/server-shared-types.js";
import type { SeasonVictoryPathId, SeasonWinnerView } from "@border-empires/shared";
import type { RecoveredSimulationState } from "./event-recovery.js";
import {
  buildLegacySnapshotPlayerEconomies,
  type LegacySnapshotPlayerEconomy
} from "./legacy-snapshot-economy.js";
import {
  PASSIVE_INCOME_MULT,
  POPULATION_GROWTH_BASE_RATE,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TOWN_BASE_GOLD_PER_MIN
} from "../../../packages/server/src/server-game-constants.js";

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
  strategicResources: Record<StrategicResource, number>;
  strategicProductionPerMinute: Record<StrategicResource, number>;
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

const parseTileKey = (tileKey: string): { x: number; y: number } | undefined => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return undefined;
  return { x, y };
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
  if ((strategic.IRON ?? 0) > 0) return "IRON";
  if ((strategic.CRYSTAL ?? 0) > 0) return "GEMS";
  if ((strategic.OIL ?? 0) > 0) return "OIL";
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

const emptyStrategic = (): Record<StrategicResource, number> => ({
  FOOD: 0,
  IRON: 0,
  CRYSTAL: 0,
  SUPPLY: 0,
  SHARD: 0,
  OIL: 0
});

const cloneStrategic = (value?: Partial<Record<StrategicResource, number>>): Record<StrategicResource, number> => ({
  FOOD: value?.FOOD ?? 0,
  IRON: value?.IRON ?? 0,
  CRYSTAL: value?.CRYSTAL ?? 0,
  SUPPLY: value?.SUPPLY ?? 0,
  SHARD: value?.SHARD ?? 0,
  OIL: value?.OIL ?? 0
});

const wrap = (value: number, size: number): number => ((value % size) + size) % size;

const townPopulationTierFromSnapshot = (town: TownDefinition): "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS" => {
  if (town.isSettlement && town.population < 1_000) return "SETTLEMENT";
  if (town.population >= 5_000_000) return "METROPOLIS";
  if (town.population >= 1_000_000) return "GREAT_CITY";
  if (town.population >= 100_000) return "CITY";
  if (town.population >= 1_000) return "TOWN";
  return "SETTLEMENT";
};

const townPopulationMultiplier = (town: TownDefinition): number => {
  const tier = townPopulationTierFromSnapshot(town);
  if (tier === "SETTLEMENT") return 0.6;
  if (tier === "CITY") return 1.5;
  if (tier === "GREAT_CITY") return 2.5;
  if (tier === "METROPOLIS") return 3.2;
  return 1;
};

const townFoodUpkeepPerMinute = (town: TownDefinition): number => {
  const tier = townPopulationTierFromSnapshot(town);
  if (tier === "SETTLEMENT") return 0;
  if (tier === "CITY") return 0.2;
  if (tier === "GREAT_CITY") return 0.4;
  if (tier === "METROPOLIS") return 0.8;
  return 0.1;
};

const townGrowthModifiersForSnapshot = (input: {
  now: number;
  town: TownDefinition;
  ownerId: string | undefined;
  isSettled: boolean;
  isFed: boolean;
  growthPerMinute: number;
  townCaptureShockUntilByTile: Map<string, number>;
  townGrowthShockUntilByTile: Map<string, number>;
}): Array<{ label: "Recently captured" | "Nearby war" | "Long time peace"; deltaPerMinute: number }> => {
  if (!input.ownerId || !input.isSettled || !input.isFed || input.growthPerMinute <= 0) return [];
  if ((input.townCaptureShockUntilByTile.get(input.town.tileKey) ?? 0) > input.now) {
    return [{ label: "Recently captured", deltaPerMinute: -input.growthPerMinute }];
  }
  if ((input.townGrowthShockUntilByTile.get(input.town.tileKey) ?? 0) > input.now) {
    return [{ label: "Nearby war", deltaPerMinute: -input.growthPerMinute }];
  }
  return [{ label: "Long time peace", deltaPerMinute: input.growthPerMinute }];
};

const supportRatioForTown = (
  townTileKey: string,
  ownerId: string,
  ownershipByTile: Map<string, string>,
  ownershipStateByTile: Map<string, string>,
  world: { width: number; height: number }
): { supportCurrent: number; supportMax: number } => {
  const coords = parseTileKey(townTileKey);
  if (!coords) return { supportCurrent: 0, supportMax: 0 };
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = wrap(coords.x + dx, world.width);
      const y = wrap(coords.y + dy, world.height);
      if (terrainAt(x, y) !== "LAND") continue;
      supportMax += 1;
      const tileKey = `${x},${y}`;
      if (ownershipByTile.get(tileKey) === ownerId && ownershipStateByTile.get(tileKey) === "SETTLED") supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

const supportedStructureAtTown = (
  townTileKey: string,
  ownerId: string,
  structureType: string,
  ownershipByTile: Map<string, string>,
  ownershipStateByTile: Map<string, string>,
  structuresByTile: Map<string, { ownerId: string; type: string; status: string }>,
  world: { width: number; height: number }
): boolean => {
  const coords = parseTileKey(townTileKey);
  if (!coords) return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const x = wrap(coords.x + dx, world.width);
      const y = wrap(coords.y + dy, world.height);
      if (terrainAt(x, y) !== "LAND") continue;
      const tileKey = `${x},${y}`;
      if (ownershipByTile.get(tileKey) !== ownerId || ownershipStateByTile.get(tileKey) !== "SETTLED") continue;
      const structure = structuresByTile.get(tileKey);
      if (!structure || structure.ownerId !== ownerId || structure.status !== "active") continue;
      if (structure.type === structureType) return true;
    }
  }
  return false;
};

const activeEconomicStructuresByTile = (
  systems: SnapshotSystemsSection
): Map<string, { ownerId: string; type: string; status: string }> => {
  const structures = new Map<string, { ownerId: string; type: string; status: string }>();
  for (const structure of systems.economicStructures ?? []) {
    structures.set(structure.tileKey, {
      ownerId: structure.ownerId,
      type: structure.type,
      status: structure.status
    });
  }
  return structures;
};

const fedTownKeysByPlayerFromSnapshot = (
  playersSection: SnapshotPlayersSection,
  territory: SnapshotTerritorySection,
  ownershipByTile: Map<string, string>,
  ownershipStateByTile: Map<string, string>,
  playerEconomies: Map<string, LegacySnapshotPlayerEconomy>
): Map<string, Set<string>> => {
  const result = new Map<string, Set<string>>();
  for (const player of playersSection.players ?? []) {
    const economy = playerEconomies.get(player.id);
    const availableFood = Math.max(
      0,
      (economy?.strategicResources.FOOD ?? 0) + (economy?.strategicProductionPerMinute.FOOD ?? 0)
    );
    let remainingFood = availableFood;
    const fedTownKeys = new Set<string>();
    const ownedTowns = (territory.towns ?? []).filter(
      (town) =>
        ownershipByTile.get(town.tileKey) === player.id &&
        ownershipStateByTile.get(town.tileKey) === "SETTLED"
    );
    for (const town of ownedTowns) {
      const need = townFoodUpkeepPerMinute(town);
      if (need <= 0) {
        fedTownKeys.add(town.tileKey);
        continue;
      }
      if (remainingFood + 1e-9 >= need) {
        fedTownKeys.add(town.tileKey);
        remainingFood = Math.max(0, remainingFood - need);
      }
    }
    result.set(player.id, fedTownKeys);
  }
  return result;
};

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
    const hasMarket =
      Boolean(ownerId) &&
      supportedStructureAtTown(
        town.tileKey,
        ownerId!,
        "MARKET",
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
    const hasBank =
      Boolean(ownerId) &&
      supportedStructureAtTown(
        town.tileKey,
        ownerId!,
        "BANK",
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
                  (hasMarket ? 1.5 : 1) *
                  (hasBank ? 1.5 : 1) *
                  incomeMod *
                  PASSIVE_INCOME_MULT
              ) + (hasBank ? 1 : 0);
    const populationGrowthPerMinute =
      !ownerId || !isSettled || !isFed
        ? 0
        : (() => {
            const logisticFactor = 1 - town.population / Math.max(1, town.maxPopulation);
            if (logisticFactor <= 0) return 0;
            const growthMult = (tier === "SETTLEMENT" ? 4 : 1) * (hasGranary ? 1.15 : 1);
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
        : goldPerMinute * 60 * 8 * (hasMarket ? 1.5 : 1);
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
      hasMarket,
      marketActive: hasMarket && isFed,
      hasGranary,
      granaryActive: hasGranary,
      hasBank,
      bankActive: hasBank,
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
      upkeepPerMinute: playerEconomy?.upkeepPerMinute ?? { food: 0, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0 },
      upkeepLastTick: playerEconomy?.upkeepLastTick ?? {
        foodCoverage: 1,
        gold: { contributors: [] },
        food: { contributors: [] },
        iron: { contributors: [] },
        crystal: { contributors: [] },
        supply: { contributors: [] },
        oil: { contributors: [] }
      },
      economyBreakdown: playerEconomy?.economyBreakdown ?? {
        GOLD: { sources: [], sinks: [] },
        FOOD: { sources: [], sinks: [] },
        IRON: { sources: [], sinks: [] },
        CRYSTAL: { sources: [], sinks: [] },
        SUPPLY: { sources: [], sinks: [] },
        SHARD: { sources: [], sinks: [] },
        OIL: { sources: [], sinks: [] }
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
      activeLocks: []
    }
  };
};
