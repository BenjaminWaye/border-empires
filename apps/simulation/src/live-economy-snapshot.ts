import { OBSERVATORY_UPKEEP_PER_MIN } from "@border-empires/shared";
import { DOCK_INCOME_PER_MIN, PASSIVE_INCOME_MULT } from "@border-empires/game-domain";
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
