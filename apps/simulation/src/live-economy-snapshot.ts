import { OBSERVATORY_UPKEEP_PER_MIN } from "@border-empires/shared";
import { DOCK_INCOME_PER_MIN, PASSIVE_INCOME_MULT } from "@border-empires/game-domain";
import { shouldYieldAt } from "./event-loop-yield.js";
import { buildDockLinksByDockTileKey } from "./dock-network/dock-network.js";
import { buildConnectedTownNetworkForPlayer, dockBaseGoldPerMinuteForPlayer } from "./economy-network/economy-network.js";
import { chosenTrickleRateForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import {
  type RuntimeState,
  type LivePlayerEconomySnapshot,
  type EconomyBucket,
  type StrategicResourceKey,
  keyFor,
  toDomainTile,
  parseTown,
  parseStructure,
  snapshotEconomyPlayer,
  getDomainTilesByKey,
  buildSettledDomainTilesByPlayerId,
  buildFirstThreeTownKeysByPlayer,
  townKeysWithNearbyWar,
  computeSeedGranaryBuffedTileKeys,
  domainTilesByKeyCache,
  settledDomainTilesByPlayerIdCache,
  strategicProductionByPlayerCache,
  fedTownKeysByPlayerCache
} from "./snapshot-tile-cache.js";
import {
  emptyStrategic,
  addBucket,
  sortedBuckets,
  strategicProductionPerMinuteForResource,
  strategicResourceForTile,
  structureUpkeepPerMinute,
  converterOutputPerMinute,
  townFoodUpkeepPerMinute,
  buildStrategicProductionByPlayer,
  buildFedTownKeysByPlayer
} from "./snapshot-economy-helpers.js";
import { buildTownSummary } from "./live-town-summary.js";

export const buildLivePlayerEconomySnapshot = (
  playerId: string,
  runtimeState: RuntimeState
): LivePlayerEconomySnapshot => {
  const tilesByKey = new Map(runtimeState.tiles.map((tile) => [keyFor(tile.x, tile.y), tile] as const));
  const player = runtimeState.players.find((entry) => entry.id === playerId);
  const economyPlayer = snapshotEconomyPlayer(player);
  const domainTilesByKey = getDomainTilesByKey(runtimeState);
  const settledDomainTilesByPlayerId = buildSettledDomainTilesByPlayerId(runtimeState, domainTilesByKey);
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
  const townNetwork = economyPlayer
    ? buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(playerId) ?? [], {
        maxConnectedTownNames: 16
      })
    : undefined;
  const firstThreeTownKeys = buildFirstThreeTownKeysByPlayer(runtimeState).get(playerId);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  const strategicProductionByPlayer = buildStrategicProductionByPlayer(runtimeState);
  const fedTownKeysByPlayer = buildFedTownKeysByPlayer(runtimeState, strategicProductionByPlayer);
  const fedTownKeys = fedTownKeysByPlayer.get(playerId) ?? new Set<string>();
  const seedGranaryBuffedTileKeys = computeSeedGranaryBuffedTileKeys(runtimeState);
  const goldSources = new Map<string, EconomyBucket>();
  const goldSinks = new Map<string, EconomyBucket>();
  const foodSources = new Map<string, EconomyBucket>();
  const foodSinks = new Map<string, EconomyBucket>();
  const ironSources = new Map<string, EconomyBucket>();
  const ironSinks = new Map<string, EconomyBucket>();
  const crystalSources = new Map<string, EconomyBucket>();
  const crystalSinks = new Map<string, EconomyBucket>();
  const supplySources = new Map<string, EconomyBucket>();
  const supplySinks = new Map<string, EconomyBucket>();
  const shardSources = new Map<string, EconomyBucket>();
  const strategicProductionPerMinute = strategicProductionByPlayer.get(playerId) ?? emptyStrategic();

  for (const tile of runtimeState.tiles) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    addBucket(goldSinks, "Settled land upkeep", 0.04, { count: 1, note: "1 settled tile" });
    const resourceKey = strategicResourceForTile(tile.resource);
    const resourceRate = strategicProductionPerMinuteForResource(tile.resource);
    if (resourceKey && resourceRate > 0) {
      const target =
        resourceKey === "FOOD" ? foodSources :
        resourceKey === "IRON" ? ironSources :
        resourceKey === "CRYSTAL" ? crystalSources :
        supplySources;
      addBucket(target, tile.resource === "FARM" ? "Grain" : tile.resource === "FISH" ? "Fish" : tile.resource === "IRON" ? "Iron" : tile.resource === "GEMS" ? "Crystal" : "Supply", resourceRate, { count: 1, resourceKey });
    }
    const town = buildTownSummary(tile, player, tilesByKey, fedTownKeys, true, townNetwork, firstThreeTownKeys, nearbyWarTownKeys, seedGranaryBuffedTileKeys);
    if (town && town.goldPerMinute > 0) addBucket(goldSources, "Towns", town.goldPerMinute, { count: 1 });
    if (town && (town.foodUpkeepPerMinute ?? 0) > 0) addBucket(foodSinks, "Town", town.foodUpkeepPerMinute ?? 0, { count: 1 });
    if (tile.dockId) {
      const dockGoldPerMinute = economyPlayer
        ? dockBaseGoldPerMinuteForPlayer(toDomainTile(tile), economyPlayer, { tiles: domainTilesByKey, dockLinksByDockTileKey }) *
          (player?.incomeMultiplier ?? 1) *
          PASSIVE_INCOME_MULT
        : DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT;
      addBucket(goldSources, "Docks", dockGoldPerMinute, { count: 1 });
    }
    const fort = parseStructure<{ status?: string }>(tile.fortJson);
    if (fort?.status === "active") {
      addBucket(goldSinks, "Fort", 1, { count: 1 });
      addBucket(ironSinks, "Fort", 0.025, { count: 1 });
    }
    const siegeOutpost = parseStructure<{ status?: string }>(tile.siegeOutpostJson);
    if (siegeOutpost?.status === "active") {
      addBucket(goldSinks, "Siege outpost", 1, { count: 1 });
      addBucket(supplySinks, "Siege outpost", 0.025, { count: 1 });
    }
    const observatory = parseStructure<{ status?: string }>(tile.observatoryJson);
    if (observatory?.status === "active") addBucket(crystalSinks, "Observatory", OBSERVATORY_UPKEEP_PER_MIN, { count: 1 });
    const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
    if (structure?.status === "active" && structure.type) {
      const upkeep = structureUpkeepPerMinute(structure.type);
      if (upkeep.GOLD) addBucket(goldSinks, structure.type, upkeep.GOLD, { count: 1 });
      if (upkeep.FOOD) addBucket(foodSinks, structure.type, upkeep.FOOD, { count: 1 });
      if (upkeep.CRYSTAL) addBucket(crystalSinks, structure.type, upkeep.CRYSTAL, { count: 1 });
      const output = converterOutputPerMinute(structure.type);
      if (output.IRON) addBucket(ironSources, structure.type, output.IRON, { count: 1 });
      if (output.CRYSTAL) addBucket(crystalSources, structure.type, output.CRYSTAL, { count: 1 });
      if (output.SUPPLY) addBucket(supplySources, structure.type, output.SUPPLY, { count: 1 });
    }
  }

  const trickle = player
    ? chosenTrickleRateForPlayer({ domainIds: new Set(player.domainIds), chosenTrickleResource: player.chosenTrickleResource })
    : undefined;
  if (trickle && trickle.ratePerMinute > 0) {
    const target =
      trickle.resource === "IRON" ? ironSources :
      trickle.resource === "SUPPLY" ? supplySources :
      crystalSources;
    addBucket(target, "Clockwork Stipend", trickle.ratePerMinute, { count: 1, resourceKey: trickle.resource });
    if (trickle.resource === "IRON") strategicProductionPerMinute.IRON += trickle.ratePerMinute;
    else if (trickle.resource === "SUPPLY") strategicProductionPerMinute.SUPPLY += trickle.ratePerMinute;
    else if (trickle.resource === "CRYSTAL") strategicProductionPerMinute.CRYSTAL += trickle.ratePerMinute;
  }

  return buildEconomyResult({
    player, strategicProductionPerMinute,
    goldSources, goldSinks, foodSources, foodSinks,
    ironSources, ironSinks, crystalSources, crystalSinks,
    supplySources, supplySinks, shardSources,
    fedTownKeys, fedTownKeysByPlayer
  });
};

export const buildLivePlayerEconomySnapshotAsync = async (
  playerId: string,
  runtimeState: RuntimeState,
  yieldToEventLoop: () => Promise<void>,
  // Optional pre-built map from the caller — skips an O(202k) scan when the
  // caller (buildPlayerSubscriptionSnapshotAsync) already built it.
  prebuiltTilesByKey?: Map<string, RuntimeState["tiles"][number]>
): Promise<LivePlayerEconomySnapshot> => {
  const tilesByKey = prebuiltTilesByKey ?? new Map(runtimeState.tiles.map((tile) => [keyFor(tile.x, tile.y), tile] as const));
  const player = runtimeState.players.find((entry) => entry.id === playerId);
  const economyPlayer = snapshotEconomyPlayer(player);

  // Single combined pass — replaces 4 separate O(202k) async scans
  // (getDomainTilesByKeyAsync, buildSettledDomainTilesByPlayerIdAsync,
  // buildStrategicProductionByPlayerAsync, buildFedTownKeysByPlayerAsync + a 5th
  // O(202k) economy loop). One pass yields every 10k tiles (≈5ms CPU per chunk),
  // then derives fedTownKeysByPlayer without a tile scan, then iterates only the
  // player's settled tiles for the economy breakdown.
  // Populates all WeakMap caches so the enrichment phase gets cache hits.
  const domainTilesByKey = new Map<string, ReturnType<typeof toDomainTile>>();
  const settledDomainTilesByPlayerId = new Map<string, ReturnType<typeof toDomainTile>[]>();
  const strategicProductionByPlayer = new Map<string, Record<StrategicResourceKey, number>>();
  const ownedSettledTownsByPlayerId = new Map<string, RuntimeState["tiles"]>();
  const playerSettledTiles: RuntimeState["tiles"] = [];

  for (const p of runtimeState.players) strategicProductionByPlayer.set(p.id, emptyStrategic());

  let idx = 0;
  for (const tile of runtimeState.tiles) {
    if (shouldYieldAt(idx++, 50_000)) await yieldToEventLoop();

    const tileKey = keyFor(tile.x, tile.y);
    const domainTile = toDomainTile(tile);
    domainTilesByKey.set(tileKey, domainTile);

    if (!tile.ownerId || tile.ownershipState !== "SETTLED") continue;

    const settledList = settledDomainTilesByPlayerId.get(tile.ownerId) ?? [];
    settledList.push(domainTile);
    settledDomainTilesByPlayerId.set(tile.ownerId, settledList);

    const production = strategicProductionByPlayer.get(tile.ownerId) ?? emptyStrategic();
    const resourceKey = strategicResourceForTile(tile.resource);
    if (resourceKey) production[resourceKey] += strategicProductionPerMinuteForResource(tile.resource);
    const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
    if (structure?.status === "active" && structure.type) {
      const output = converterOutputPerMinute(structure.type);
      for (const [resource, amount] of Object.entries(output) as Array<[StrategicResourceKey, number]>) production[resource] += amount;
    }
    strategicProductionByPlayer.set(tile.ownerId, production);

    if (tile.townJson || tile.townType) {
      const towns = ownedSettledTownsByPlayerId.get(tile.ownerId) ?? [];
      towns.push(tile);
      ownedSettledTownsByPlayerId.set(tile.ownerId, towns);
    }

    if (tile.ownerId === playerId) playerSettledTiles.push(tile);
  }

  // Derive fedTownKeysByPlayer from pre-computed data — no tile scan needed.
  const fedTownKeysByPlayer = new Map<string, Set<string>>();
  for (const p of runtimeState.players) {
    const availableFood = (p.strategicResources?.FOOD ?? 0) + (strategicProductionByPlayer.get(p.id)?.FOOD ?? 0);
    let remainingFood = availableFood;
    const fedTownKeys = new Set<string>();
    const towns = ownedSettledTownsByPlayerId.get(p.id) ?? [];
    towns.sort((left, right) => (left.x - right.x) || (left.y - right.y));
    for (const townTile of towns) {
      const town = parseTown(townTile);
      const upkeep = townFoodUpkeepPerMinute(town?.populationTier);
      if (upkeep <= 0) { fedTownKeys.add(keyFor(townTile.x, townTile.y)); continue; }
      if (remainingFood + 1e-9 >= upkeep) {
        fedTownKeys.add(keyFor(townTile.x, townTile.y));
        remainingFood = Math.max(0, remainingFood - upkeep);
      }
    }
    fedTownKeysByPlayer.set(p.id, fedTownKeys);
  }

  // Populate all WeakMap caches so the enrichment phase (buildEnrichmentContextAsync)
  // gets cache hits instead of repeating any of these scans.
  domainTilesByKeyCache.set(runtimeState, domainTilesByKey);
  settledDomainTilesByPlayerIdCache.set(runtimeState, settledDomainTilesByPlayerId);
  strategicProductionByPlayerCache.set(runtimeState, strategicProductionByPlayer);
  fedTownKeysByPlayerCache.set(runtimeState, fedTownKeysByPlayer);

  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
  const townNetwork = economyPlayer
    ? buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(playerId) ?? [], {
        maxConnectedTownNames: 16
      })
    : undefined;
  await yieldToEventLoop();
  const firstThreeTownKeys = buildFirstThreeTownKeysByPlayer(runtimeState).get(playerId);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  const fedTownKeys = fedTownKeysByPlayer.get(playerId) ?? new Set<string>();
  const seedGranaryBuffedTileKeys = computeSeedGranaryBuffedTileKeys(runtimeState);
  await yieldToEventLoop();

  const goldSources = new Map<string, EconomyBucket>();
  const goldSinks = new Map<string, EconomyBucket>();
  const foodSources = new Map<string, EconomyBucket>();
  const foodSinks = new Map<string, EconomyBucket>();
  const ironSources = new Map<string, EconomyBucket>();
  const ironSinks = new Map<string, EconomyBucket>();
  const crystalSources = new Map<string, EconomyBucket>();
  const crystalSinks = new Map<string, EconomyBucket>();
  const supplySources = new Map<string, EconomyBucket>();
  const supplySinks = new Map<string, EconomyBucket>();
  const shardSources = new Map<string, EconomyBucket>();
  const strategicProductionPerMinute = strategicProductionByPlayer.get(playerId) ?? emptyStrategic();

  // Economy breakdown iterates only this player's settled tiles — O(player_settled)
  // not O(202k). No yield needed: even a large empire's settled tiles are a small
  // fraction of the total tile count.
  for (const tile of playerSettledTiles) {
    addBucket(goldSinks, "Settled land upkeep", 0.04, { count: 1, note: "1 settled tile" });
    const resourceKey = strategicResourceForTile(tile.resource);
    const resourceRate = strategicProductionPerMinuteForResource(tile.resource);
    if (resourceKey && resourceRate > 0) {
      const target =
        resourceKey === "FOOD" ? foodSources :
        resourceKey === "IRON" ? ironSources :
        resourceKey === "CRYSTAL" ? crystalSources :
        supplySources;
      addBucket(target, tile.resource === "FARM" ? "Grain" : tile.resource === "FISH" ? "Fish" : tile.resource === "IRON" ? "Iron" : tile.resource === "GEMS" ? "Crystal" : "Supply", resourceRate, { count: 1, resourceKey });
    }
    const town = buildTownSummary(tile, player, tilesByKey, fedTownKeys, true, townNetwork, firstThreeTownKeys, nearbyWarTownKeys, seedGranaryBuffedTileKeys);
    if (town && town.goldPerMinute > 0) addBucket(goldSources, "Towns", town.goldPerMinute, { count: 1 });
    if (town && (town.foodUpkeepPerMinute ?? 0) > 0) addBucket(foodSinks, "Town", town.foodUpkeepPerMinute ?? 0, { count: 1 });
    if (tile.dockId) {
      const dockGoldPerMinute = economyPlayer
        ? dockBaseGoldPerMinuteForPlayer(toDomainTile(tile), economyPlayer, { tiles: domainTilesByKey, dockLinksByDockTileKey }) *
          (player?.incomeMultiplier ?? 1) *
          PASSIVE_INCOME_MULT
        : DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT;
      addBucket(goldSources, "Docks", dockGoldPerMinute, { count: 1 });
    }
    const fort = parseStructure<{ status?: string }>(tile.fortJson);
    if (fort?.status === "active") {
      addBucket(goldSinks, "Fort", 1, { count: 1 });
      addBucket(ironSinks, "Fort", 0.025, { count: 1 });
    }
    const siegeOutpost = parseStructure<{ status?: string }>(tile.siegeOutpostJson);
    if (siegeOutpost?.status === "active") {
      addBucket(goldSinks, "Siege outpost", 1, { count: 1 });
      addBucket(supplySinks, "Siege outpost", 0.025, { count: 1 });
    }
    const observatory = parseStructure<{ status?: string }>(tile.observatoryJson);
    if (observatory?.status === "active") addBucket(crystalSinks, "Observatory", OBSERVATORY_UPKEEP_PER_MIN, { count: 1 });
    const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
    if (structure?.status === "active" && structure.type) {
      const upkeep = structureUpkeepPerMinute(structure.type);
      if (upkeep.GOLD) addBucket(goldSinks, structure.type, upkeep.GOLD, { count: 1 });
      if (upkeep.FOOD) addBucket(foodSinks, structure.type, upkeep.FOOD, { count: 1 });
      if (upkeep.CRYSTAL) addBucket(crystalSinks, structure.type, upkeep.CRYSTAL, { count: 1 });
      const output = converterOutputPerMinute(structure.type);
      if (output.IRON) addBucket(ironSources, structure.type, output.IRON, { count: 1 });
      if (output.CRYSTAL) addBucket(crystalSources, structure.type, output.CRYSTAL, { count: 1 });
      if (output.SUPPLY) addBucket(supplySources, structure.type, output.SUPPLY, { count: 1 });
    }
  }

  const trickle = player
    ? chosenTrickleRateForPlayer({ domainIds: new Set(player.domainIds), chosenTrickleResource: player.chosenTrickleResource })
    : undefined;
  if (trickle && trickle.ratePerMinute > 0) {
    const target =
      trickle.resource === "IRON" ? ironSources :
      trickle.resource === "SUPPLY" ? supplySources :
      crystalSources;
    addBucket(target, "Clockwork Stipend", trickle.ratePerMinute, { count: 1, resourceKey: trickle.resource });
    if (trickle.resource === "IRON") strategicProductionPerMinute.IRON += trickle.ratePerMinute;
    else if (trickle.resource === "SUPPLY") strategicProductionPerMinute.SUPPLY += trickle.ratePerMinute;
    else if (trickle.resource === "CRYSTAL") strategicProductionPerMinute.CRYSTAL += trickle.ratePerMinute;
  }

  return buildEconomyResult({
    player, strategicProductionPerMinute,
    goldSources, goldSinks, foodSources, foodSinks,
    ironSources, ironSinks, crystalSources, crystalSinks,
    supplySources, supplySinks, shardSources,
    fedTownKeys, fedTownKeysByPlayer
  });
};

type EconomyResultArgs = {
  player: RuntimeState["players"][number] | undefined;
  strategicProductionPerMinute: { FOOD: number; IRON: number; CRYSTAL: number; SUPPLY: number; SHARD: number };
  goldSources: Map<string, EconomyBucket>;
  goldSinks: Map<string, EconomyBucket>;
  foodSources: Map<string, EconomyBucket>;
  foodSinks: Map<string, EconomyBucket>;
  ironSources: Map<string, EconomyBucket>;
  ironSinks: Map<string, EconomyBucket>;
  crystalSources: Map<string, EconomyBucket>;
  crystalSinks: Map<string, EconomyBucket>;
  supplySources: Map<string, EconomyBucket>;
  supplySinks: Map<string, EconomyBucket>;
  shardSources: Map<string, EconomyBucket>;
  fedTownKeys: Set<string>;
  fedTownKeysByPlayer: Map<string, Set<string>>;
};

const buildEconomyResult = (args: EconomyResultArgs): LivePlayerEconomySnapshot => {
  const { player, strategicProductionPerMinute } = args;
  const upkeepPerMinute = {
    food: Number([...args.foodSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    iron: Number([...args.ironSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    supply: Number([...args.supplySinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    crystal: Number([...args.crystalSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    gold: Number([...args.goldSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4))
  };
  const incomePerMinute = Number([...args.goldSources.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4));
  const foodCoverage =
    upkeepPerMinute.food <= 0
      ? 1
      : Math.max(
          0,
          Math.min(
            1,
            (((player?.strategicResources.FOOD ?? 0) + strategicProductionPerMinute.FOOD) / upkeepPerMinute.food)
          )
        );
  return {
    incomePerMinute,
    strategicProductionPerMinute: {
      FOOD: Number(strategicProductionPerMinute.FOOD.toFixed(4)),
      IRON: Number(strategicProductionPerMinute.IRON.toFixed(4)),
      CRYSTAL: Number(strategicProductionPerMinute.CRYSTAL.toFixed(4)),
      SUPPLY: Number(strategicProductionPerMinute.SUPPLY.toFixed(4)),
      SHARD: Number(strategicProductionPerMinute.SHARD.toFixed(4))
    },
    upkeepPerMinute,
    upkeepLastTick: {
      foodCoverage: Number(foodCoverage.toFixed(4)),
      gold: { contributors: sortedBuckets(args.goldSinks) },
      food: { contributors: sortedBuckets(args.foodSinks) },
      iron: { contributors: sortedBuckets(args.ironSinks) },
      crystal: { contributors: sortedBuckets(args.crystalSinks) },
      supply: { contributors: sortedBuckets(args.supplySinks) }
    },
    economyBreakdown: {
      GOLD: { sources: sortedBuckets(args.goldSources), sinks: sortedBuckets(args.goldSinks) },
      FOOD: { sources: sortedBuckets(args.foodSources), sinks: sortedBuckets(args.foodSinks) },
      IRON: { sources: sortedBuckets(args.ironSources), sinks: sortedBuckets(args.ironSinks) },
      CRYSTAL: { sources: sortedBuckets(args.crystalSources), sinks: sortedBuckets(args.crystalSinks) },
      SUPPLY: { sources: sortedBuckets(args.supplySources), sinks: sortedBuckets(args.supplySinks) },
      SHARD: { sources: sortedBuckets(args.shardSources), sinks: [] }
    },
    fedTownKeys: args.fedTownKeys,
    fedTownKeysByPlayer: args.fedTownKeysByPlayer
  };
};
