import { DOCK_INCOME_PER_MIN, PASSIVE_INCOME_MULT, type DomainTileState } from "@border-empires/game-domain";
import { buildDockLinksByDockTileKey } from "./dock-network/dock-network.js";
import { buildConnectedTownNetworkForPlayer, dockBaseGoldPerMinuteForPlayer } from "./economy-network/economy-network.js";
import { chosenTrickleRateForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import { slotWaiversForPlayer } from "./tech-domain-bridge/slot-waivers.js";
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
  buildFedTownKeysByPlayer,
  buildResourceSlotDormancyByPlayer,
  dormantEconomicStructureKeysFromDormancy
} from "./snapshot-economy-helpers.js";
import { buildTownSummary } from "./live-town-summary.js";
import { radiusStructureKeysForSettledTiles } from "./tile-yield-view/tile-yield-view.js";
import {
  dormantStructureDetailsFromDormancy,
  emptyResourceSlotDormancy,
  resourceSlotDemandForPlayer,
  resourceSlotSupplyForPlayer,
  type DormantStructureDetail
} from "./resource-slot-view/resource-slot-view.js";

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
  const dormancyByPlayer = buildResourceSlotDormancyByPlayer(runtimeState);
  const dormantEconomicStructureKeys = dormantEconomicStructureKeysFromDormancy(dormancyByPlayer.get(playerId));
  const townNetwork = economyPlayer
    ? buildConnectedTownNetworkForPlayer(economyPlayer, domainTilesByKey, settledDomainTilesByPlayerId.get(playerId) ?? [], {
        maxConnectedTownNames: 16,
        dormantEconomicStructureKeys
      })
    : undefined;
  const firstThreeTownKeys = buildFirstThreeTownKeysByPlayer(runtimeState).get(playerId);
  const nearbyWarTownKeys = townKeysWithNearbyWar(runtimeState);
  const strategicProductionByPlayer = buildStrategicProductionByPlayer(runtimeState);
  const fedTownKeysByPlayer = buildFedTownKeysByPlayer(runtimeState, dormancyByPlayer);
  const fedTownKeys = fedTownKeysByPlayer.get(playerId) ?? new Set<string>();
  const seedGranaryBuffedTileKeys = computeSeedGranaryBuffedTileKeys(runtimeState);
  const resourceSlots = resourceSlotsForPlayer(playerId, runtimeState);
  // §14.2: reuses the dormancy already computed above for fedTownKeys/
  // dormantEconomicStructureKeys, so this can never disagree with them.
  const dormantStructures = dormantStructureDetailsFromDormancy(dormancyByPlayer.get(playerId) ?? emptyResourceSlotDormancy());
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
    const town = buildTownSummary(
      tile,
      player,
      tilesByKey,
      fedTownKeys,
      true,
      townNetwork,
      firstThreeTownKeys,
      nearbyWarTownKeys,
      seedGranaryBuffedTileKeys,
      dormantEconomicStructureKeys
    );
    if (town && town.goldPerMinute > 0) addBucket(goldSources, "Towns", town.goldPerMinute, { count: 1 });
    if (town && (town.foodUpkeepPerMinute ?? 0) > 0) addBucket(foodSinks, "Town", town.foodUpkeepPerMinute ?? 0, { count: 1 });
    if (tile.dockId) {
      const dockGoldPerMinute = economyPlayer
        ? dockBaseGoldPerMinuteForPlayer(toDomainTile(tile), economyPlayer, {
            tiles: domainTilesByKey,
            dockLinksByDockTileKey,
            dormantEconomicStructureKeys
          }) *
          (player?.incomeMultiplier ?? 1) *
          PASSIVE_INCOME_MULT
        : DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT;
      addBucket(goldSources, "Docks", dockGoldPerMinute, { count: 1 });
    }
    // §12.1/§5.1: Fort/Siege Outpost/Observatory no longer carry a
    // separate per-minute flow drain — the slot occupation itself is the
    // upkeep, so their fortJson/siegeOutpostJson/observatoryJson fields
    // aren't parsed here at all.
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
    player, strategicProductionPerMinute, resourceSlots, dormantStructures,
    goldSources, goldSinks, foodSources, foodSinks,
    ironSources, ironSinks, crystalSources, crystalSinks,
    supplySources, supplySinks, shardSources,
    fedTownKeys, fedTownKeysByPlayer
  });
};

// §5 (resource slots): the cold/reconnect snapshot path has no live
// DomainTileState territory index to reuse — runtimeState.tiles carries
// fort/observatory/siegeOutpost/economicStructure as JSON strings, and
// domainTilesByKey/settledDomainTilesByPlayerId (snapshot-tile-cache.ts)
// deliberately don't parse economicStructure (toDomainTile omits it), so
// they can't be reused here without silently under-counting synthesizer/
// Mine/Farmstead/Camp supply and structure demand. Parse a player-scoped
// view directly from the wire-shaped tiles instead, then hand it to the
// same pure resourceSlotSupplyForPlayer/resourceSlotDemandForPlayer the
// live runtime uses for the build-time gate, so the two paths can never
// compute different numbers for the same territory.
type SlotTileEconomicStructure = DomainTileState["economicStructure"];
type SettledSlotTile = Pick<DomainTileState, "x" | "y" | "resource"> & { economicStructure?: SlotTileEconomicStructure };
type OwnedSlotTile = Pick<DomainTileState, "x" | "y" | "fort" | "observatory" | "siegeOutpost" | "economicStructure" | "town" | "ownerId" | "ownershipState">;

const resourceSlotsForPlayer = (
  playerId: string,
  runtimeState: RuntimeState
): { supply: ReturnType<typeof resourceSlotSupplyForPlayer>; demand: ReturnType<typeof resourceSlotDemandForPlayer> } => {
  const settledSlotTiles: SettledSlotTile[] = [];
  const ownedSlotTiles: OwnedSlotTile[] = [];
  for (const tile of runtimeState.tiles) {
    if (tile.ownerId !== playerId) continue;
    const economicStructure = parseStructure<SlotTileEconomicStructure>(tile.economicStructureJson);
    if (tile.ownershipState === "SETTLED") {
      settledSlotTiles.push({ x: tile.x, y: tile.y, resource: tile.resource as DomainTileState["resource"], economicStructure });
    }
    ownedSlotTiles.push({
      x: tile.x,
      y: tile.y,
      fort: parseStructure<DomainTileState["fort"]>(tile.fortJson),
      observatory: parseStructure<DomainTileState["observatory"]>(tile.observatoryJson),
      siegeOutpost: parseStructure<DomainTileState["siegeOutpost"]>(tile.siegeOutpostJson),
      economicStructure,
      // resourceSlotDemandForPlayer only checks tile.town for truthiness (§5.3's
      // town-food-slot-demand rule) — it never reads a specific field, so the
      // wire-parsed Partial<...> from parseTown is safe here despite not
      // satisfying DomainTileState["town"]'s stricter required-field shape.
      town: parseTown(tile) as DomainTileState["town"],
      ownerId: tile.ownerId,
      ownershipState: tile.ownershipState as DomainTileState["ownershipState"]
    });
  }
  const { waterworksKeys, foundryKeys } = radiusStructureKeysForSettledTiles(settledSlotTiles);
  // §23.2: the cold/reconnect path must apply the same slot waivers
  // (fortIronSlotWaiverCount etc) as the live runtime, or a player with
  // Dwarf Kingdom/Supply State/Treasury State/Enduring Realm would see a
  // different (higher) demand total on reconnect than while connected.
  const player = runtimeState.players.find((entry) => entry.id === playerId);
  const waivers = player
    ? slotWaiversForPlayer({ techIds: new Set(player.techIds), domainIds: new Set(player.domainIds) })
    : undefined;
  return {
    supply: resourceSlotSupplyForPlayer(settledSlotTiles, waterworksKeys, foundryKeys),
    demand: resourceSlotDemandForPlayer(ownedSlotTiles, playerId, waivers)
  };
};

type EconomyResultArgs = {
  player: RuntimeState["players"][number] | undefined;
  strategicProductionPerMinute: { FOOD: number; IRON: number; CRYSTAL: number; SUPPLY: number; SHARD: number };
  resourceSlots: LivePlayerEconomySnapshot["resourceSlots"];
  dormantStructures: DormantStructureDetail[];
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
    resourceSlots: args.resourceSlots,
    dormantStructures: args.dormantStructures,
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
