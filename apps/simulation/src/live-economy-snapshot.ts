import { OBSERVATORY_UPKEEP_PER_MIN } from "@border-empires/shared";
import { DOCK_INCOME_PER_MIN, PASSIVE_INCOME_MULT } from "@border-empires/game-domain";
import { shouldYieldAt } from "./event-loop-yield.js";
import { buildDockLinksByDockTileKey } from "./dock-network.js";
import { buildConnectedTownNetworkForPlayer, dockBaseGoldPerMinuteForPlayer } from "./economy-network.js";
import { chosenTrickleRateForPlayer } from "./tech-domain-bridge.js";
import {
  type RuntimeState,
  type LivePlayerEconomySnapshot,
  keyFor,
  toDomainTile,
  parseStructure,
  snapshotEconomyPlayer,
  getDomainTilesByKey,
  getDomainTilesByKeyAsync,
  buildSettledDomainTilesByPlayerId,
  buildFirstThreeTownKeysByPlayer,
  townKeysWithNearbyWar,
  computeSeedGranaryBuffedTileKeys
} from "./snapshot-tile-cache.js";
import {
  type StrategicResourceKey,
  type EconomyBucket,
  emptyStrategic,
  addBucket,
  sortedBuckets,
  strategicProductionPerMinuteForResource,
  strategicResourceForTile,
  structureUpkeepPerMinute,
  converterOutputPerMinute,
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
  const oilSources = new Map<string, EconomyBucket>();
  const oilSinks = new Map<string, EconomyBucket>();
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
        resourceKey === "SUPPLY" ? supplySources :
        oilSources;
      addBucket(target, tile.resource === "FARM" ? "Grain" : tile.resource === "FISH" ? "Fish" : tile.resource === "IRON" ? "Iron" : tile.resource === "GEMS" ? "Crystal" : tile.resource === "OIL" ? "Oil" : "Supply", resourceRate, { count: 1, resourceKey });
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
      if (upkeep.OIL) addBucket(oilSinks, structure.type, upkeep.OIL, { count: 1 });
      const output = converterOutputPerMinute(structure.type);
      if (output.IRON) addBucket(ironSources, structure.type, output.IRON, { count: 1 });
      if (output.CRYSTAL) addBucket(crystalSources, structure.type, output.CRYSTAL, { count: 1 });
      if (output.SUPPLY) addBucket(supplySources, structure.type, output.SUPPLY, { count: 1 });
      if (output.OIL) addBucket(oilSources, structure.type, output.OIL, { count: 1 });
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
    strategicProductionPerMinute[trickle.resource as StrategicResourceKey] += trickle.ratePerMinute;
  }

  return buildEconomyResult({
    player, strategicProductionPerMinute,
    goldSources, goldSinks, foodSources, foodSinks,
    ironSources, ironSinks, crystalSources, crystalSinks,
    supplySources, supplySinks, shardSources, oilSources, oilSinks,
    fedTownKeys, fedTownKeysByPlayer
  });
};

export const buildLivePlayerEconomySnapshotAsync = async (
  playerId: string,
  runtimeState: RuntimeState,
  yieldToEventLoop: () => Promise<void>
): Promise<LivePlayerEconomySnapshot> => {
  const tilesByKey = new Map(runtimeState.tiles.map((tile) => [keyFor(tile.x, tile.y), tile] as const));
  const player = runtimeState.players.find((entry) => entry.id === playerId);
  const economyPlayer = snapshotEconomyPlayer(player);
  const domainTilesByKey = await getDomainTilesByKeyAsync(runtimeState, yieldToEventLoop);
  const settledDomainTilesByPlayerId = buildSettledDomainTilesByPlayerId(runtimeState, domainTilesByKey);
  await yieldToEventLoop();
  const dockLinksByDockTileKey = buildDockLinksByDockTileKey(runtimeState.docks ?? []);
  const townNetwork = economyPlayer
    ? buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(playerId) ?? [], {
        maxConnectedTownNames: 16
      })
    : undefined;
  await yieldToEventLoop();
  const firstThreeTownKeys = buildFirstThreeTownKeysByPlayer(runtimeState).get(playerId);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  const strategicProductionByPlayer = buildStrategicProductionByPlayer(runtimeState);
  const fedTownKeysByPlayer = buildFedTownKeysByPlayer(runtimeState, strategicProductionByPlayer);
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
  const oilSources = new Map<string, EconomyBucket>();
  const oilSinks = new Map<string, EconomyBucket>();
  const strategicProductionPerMinute = strategicProductionByPlayer.get(playerId) ?? emptyStrategic();

  let tileIndex = 0;
  for (const tile of runtimeState.tiles) {
    if (shouldYieldAt(tileIndex++, 2_000)) await yieldToEventLoop();
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    addBucket(goldSinks, "Settled land upkeep", 0.04, { count: 1, note: "1 settled tile" });
    const resourceKey = strategicResourceForTile(tile.resource);
    const resourceRate = strategicProductionPerMinuteForResource(tile.resource);
    if (resourceKey && resourceRate > 0) {
      const target =
        resourceKey === "FOOD" ? foodSources :
        resourceKey === "IRON" ? ironSources :
        resourceKey === "CRYSTAL" ? crystalSources :
        resourceKey === "SUPPLY" ? supplySources :
        oilSources;
      addBucket(target, tile.resource === "FARM" ? "Grain" : tile.resource === "FISH" ? "Fish" : tile.resource === "IRON" ? "Iron" : tile.resource === "GEMS" ? "Crystal" : tile.resource === "OIL" ? "Oil" : "Supply", resourceRate, { count: 1, resourceKey });
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
      if (upkeep.OIL) addBucket(oilSinks, structure.type, upkeep.OIL, { count: 1 });
      const output = converterOutputPerMinute(structure.type);
      if (output.IRON) addBucket(ironSources, structure.type, output.IRON, { count: 1 });
      if (output.CRYSTAL) addBucket(crystalSources, structure.type, output.CRYSTAL, { count: 1 });
      if (output.SUPPLY) addBucket(supplySources, structure.type, output.SUPPLY, { count: 1 });
      if (output.OIL) addBucket(oilSources, structure.type, output.OIL, { count: 1 });
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
    strategicProductionPerMinute[trickle.resource as StrategicResourceKey] += trickle.ratePerMinute;
  }

  return buildEconomyResult({
    player, strategicProductionPerMinute,
    goldSources, goldSinks, foodSources, foodSinks,
    ironSources, ironSinks, crystalSources, crystalSinks,
    supplySources, supplySinks, shardSources, oilSources, oilSinks,
    fedTownKeys, fedTownKeysByPlayer
  });
};

type EconomyResultArgs = {
  player: RuntimeState["players"][number] | undefined;
  strategicProductionPerMinute: Record<StrategicResourceKey, number>;
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
  oilSources: Map<string, EconomyBucket>;
  oilSinks: Map<string, EconomyBucket>;
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
    oil: Number([...args.oilSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
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
      SHARD: Number(strategicProductionPerMinute.SHARD.toFixed(4)),
      OIL: Number(strategicProductionPerMinute.OIL.toFixed(4))
    },
    upkeepPerMinute,
    upkeepLastTick: {
      foodCoverage: Number(foodCoverage.toFixed(4)),
      gold: { contributors: sortedBuckets(args.goldSinks) },
      food: { contributors: sortedBuckets(args.foodSinks) },
      iron: { contributors: sortedBuckets(args.ironSinks) },
      crystal: { contributors: sortedBuckets(args.crystalSinks) },
      supply: { contributors: sortedBuckets(args.supplySinks) },
      oil: { contributors: sortedBuckets(args.oilSinks) }
    },
    economyBreakdown: {
      GOLD: { sources: sortedBuckets(args.goldSources), sinks: sortedBuckets(args.goldSinks) },
      FOOD: { sources: sortedBuckets(args.foodSources), sinks: sortedBuckets(args.foodSinks) },
      IRON: { sources: sortedBuckets(args.ironSources), sinks: sortedBuckets(args.ironSinks) },
      CRYSTAL: { sources: sortedBuckets(args.crystalSources), sinks: sortedBuckets(args.crystalSinks) },
      SUPPLY: { sources: sortedBuckets(args.supplySources), sinks: sortedBuckets(args.supplySinks) },
      SHARD: { sources: sortedBuckets(args.shardSources), sinks: [] },
      OIL: { sources: sortedBuckets(args.oilSources), sinks: sortedBuckets(args.oilSinks) }
    },
    fedTownKeys: args.fedTownKeys,
    fedTownKeysByPlayer: args.fedTownKeysByPlayer
  };
};
