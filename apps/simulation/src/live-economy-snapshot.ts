import { DOCK_INCOME_PER_MIN, PASSIVE_INCOME_MULT, type DomainTileState } from "@border-empires/game-domain";
import { buildDockLinksByDockTileKey } from "./dock-network/dock-network.js";
import { buildConnectedTownNetworkForPlayer, dockBaseGoldPerMinuteForPlayer } from "./economy-network/economy-network.js";
import { domainGrantedResourceSlots } from "./tech-domain-bridge/tech-domain-bridge.js";
import { techGrantedFishFoodSlotBonus } from "./tech-domain-bridge/fish-food-slot-bonus.js";
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
  const titaniumSources = new Map<string, EconomyBucket>();
  const titaniumSinks = new Map<string, EconomyBucket>();
  const crystalSources = new Map<string, EconomyBucket>();
  const crystalSinks = new Map<string, EconomyBucket>();
  const umbriteSources = new Map<string, EconomyBucket>();
  const umbriteSinks = new Map<string, EconomyBucket>();
  const shardSources = new Map<string, EconomyBucket>();
  const strategicProductionPerMinute = strategicProductionByPlayer.get(playerId) ?? emptyStrategic();

  for (const tile of runtimeState.tiles) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") continue;
    const resourceKey = strategicResourceForTile(tile.resource);
    const resourceRate = strategicProductionPerMinuteForResource(tile.resource);
    if (resourceKey && resourceRate > 0) {
      const target =
        resourceKey === "FOOD" ? foodSources :
        resourceKey === "TITANIUM" ? titaniumSources :
        resourceKey === "CRYSTAL" ? crystalSources :
        umbriteSources;
      addBucket(target, tile.resource === "FARM" ? "Grain" : tile.resource === "FISH" ? "Fish" : tile.resource === "TITANIUM" ? "Titanium" : tile.resource === "GEMS" ? "Crystal" : "Umbrite", resourceRate, { count: 1, resourceKey });
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
    // Observatory still carries no separate per-minute flow drain — the
    // CRYSTAL slot occupation itself is its upkeep, so observatoryJson
    // isn't parsed here. Fort and Siege Outpost now DO carry a FOOD +
    // resource per-minute drain (structure-upkeep-rebalance) on top of
    // their slot occupation — see structureUpkeepPerMinute above.
    const structure = parseStructure<{ type?: string; status?: string; converterMode?: "SYNTHESIZE" | "EXCHANGE" }>(tile.economicStructureJson);
    if (structure?.status === "active" && structure.type) {
      const upkeep = structureUpkeepPerMinute(structure.type, structure.converterMode);
      if (upkeep.GOLD) addBucket(goldSinks, structure.type, upkeep.GOLD, { count: 1 });
      if (upkeep.FOOD) addBucket(foodSinks, structure.type, upkeep.FOOD, { count: 1 });
      if (upkeep.CRYSTAL) addBucket(crystalSinks, structure.type, upkeep.CRYSTAL, { count: 1 });
      const output = converterOutputPerMinute(structure.type, structure.converterMode);
      if (output.TITANIUM) addBucket(titaniumSources, structure.type, output.TITANIUM, { count: 1 });
      if (output.CRYSTAL) addBucket(crystalSources, structure.type, output.CRYSTAL, { count: 1 });
      if (output.UMBRITE) addBucket(umbriteSources, structure.type, output.UMBRITE, { count: 1 });
      if (output.GOLD) addBucket(goldSources, structure.type, output.GOLD, { count: 1 });
    }
    const fort = parseStructure<{ variant?: string; status?: string }>(tile.fortJson);
    if (fort?.status === "active" && fort.variant) {
      const upkeep = structureUpkeepPerMinute(fort.variant);
      if (upkeep.FOOD) addBucket(foodSinks, fort.variant, upkeep.FOOD, { count: 1 });
      if (upkeep.TITANIUM) addBucket(titaniumSinks, fort.variant, upkeep.TITANIUM, { count: 1 });
    }
    const siegeOutpost = parseStructure<{ variant?: string; status?: string }>(tile.siegeOutpostJson);
    if (siegeOutpost?.status === "active" && siegeOutpost.variant) {
      const upkeep = structureUpkeepPerMinute(siegeOutpost.variant);
      if (upkeep.FOOD) addBucket(foodSinks, siegeOutpost.variant, upkeep.FOOD, { count: 1 });
      if (upkeep.UMBRITE) addBucket(umbriteSinks, siegeOutpost.variant, upkeep.UMBRITE, { count: 1 });
    }
  }

  return buildEconomyResult({
    player, strategicProductionPerMinute, resourceSlots, dormantStructures,
    goldSources, goldSinks, foodSources, foodSinks,
    titaniumSources, titaniumSinks, crystalSources, crystalSinks,
    umbriteSources, umbriteSinks, shardSources,
    fedTownKeys, fedTownKeysByPlayer
  });
};

// §5 (resource slots): the cold/reconnect snapshot path has no live
// DomainTileState territory index to reuse — runtimeState.tiles carries
// fort/observatory/siegeOutpost/economicStructure as JSON strings, and
// domainTilesByKey/settledDomainTilesByPlayerId (snapshot-tile-cache.ts)
// deliberately don't parse economicStructure (toDomainTile omits it), so
// they can't be reused here without silently under-counting synthesizer/
// Mine/Farmstead/Umbrite Rig supply and structure demand. Parse a player-scoped
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
  // (fortTitaniumSlotWaiverCount etc) as the live runtime, or a player with
  // Dwarf Kingdom/Supply State/Treasury State/Enduring Realm would see a
  // different (higher) demand total on reconnect than while connected.
  const player = runtimeState.players.find((entry) => entry.id === playerId);
  const waivers = player
    ? slotWaiversForPlayer({ techIds: new Set(player.techIds), domainIds: new Set(player.domainIds) })
    : undefined;
  const domainGranted = player ? domainGrantedResourceSlots({ domainIds: new Set(player.domainIds), chosenTrickleResource: player.chosenTrickleResource }) : undefined;
  const fishBonus = player ? techGrantedFishFoodSlotBonus(player) : 0;
  return {
    supply: resourceSlotSupplyForPlayer(settledSlotTiles, waterworksKeys, foundryKeys, domainGranted, fishBonus),
    demand: resourceSlotDemandForPlayer(ownedSlotTiles, playerId, waivers)
  };
};

type EconomyResultArgs = {
  player: RuntimeState["players"][number] | undefined;
  strategicProductionPerMinute: { FOOD: number; TITANIUM: number; CRYSTAL: number; UMBRITE: number; SHARD: number };
  resourceSlots: LivePlayerEconomySnapshot["resourceSlots"];
  dormantStructures: DormantStructureDetail[];
  goldSources: Map<string, EconomyBucket>;
  goldSinks: Map<string, EconomyBucket>;
  foodSources: Map<string, EconomyBucket>;
  foodSinks: Map<string, EconomyBucket>;
  titaniumSources: Map<string, EconomyBucket>;
  titaniumSinks: Map<string, EconomyBucket>;
  crystalSources: Map<string, EconomyBucket>;
  crystalSinks: Map<string, EconomyBucket>;
  umbriteSources: Map<string, EconomyBucket>;
  umbriteSinks: Map<string, EconomyBucket>;
  shardSources: Map<string, EconomyBucket>;
  fedTownKeys: Set<string>;
  fedTownKeysByPlayer: Map<string, Set<string>>;
};

const buildEconomyResult = (args: EconomyResultArgs): LivePlayerEconomySnapshot => {
  const { player, strategicProductionPerMinute } = args;
  const upkeepPerMinute = {
    food: Number([...args.foodSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    titanium: Number([...args.titaniumSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    umbrite: Number([...args.umbriteSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
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
      TITANIUM: Number(strategicProductionPerMinute.TITANIUM.toFixed(4)),
      CRYSTAL: Number(strategicProductionPerMinute.CRYSTAL.toFixed(4)),
      UMBRITE: Number(strategicProductionPerMinute.UMBRITE.toFixed(4)),
      SHARD: Number(strategicProductionPerMinute.SHARD.toFixed(4))
    },
    resourceSlots: args.resourceSlots,
    dormantStructures: args.dormantStructures,
    upkeepPerMinute,
    upkeepLastTick: {
      foodCoverage: Number(foodCoverage.toFixed(4)),
      gold: { contributors: sortedBuckets(args.goldSinks) },
      food: { contributors: sortedBuckets(args.foodSinks) },
      titanium: { contributors: sortedBuckets(args.titaniumSinks) },
      crystal: { contributors: sortedBuckets(args.crystalSinks) },
      umbrite: { contributors: sortedBuckets(args.umbriteSinks) }
    },
    economyBreakdown: {
      GOLD: { sources: sortedBuckets(args.goldSources), sinks: sortedBuckets(args.goldSinks) },
      FOOD: { sources: sortedBuckets(args.foodSources), sinks: sortedBuckets(args.foodSinks) },
      TITANIUM: { sources: sortedBuckets(args.titaniumSources), sinks: sortedBuckets(args.titaniumSinks) },
      CRYSTAL: { sources: sortedBuckets(args.crystalSources), sinks: sortedBuckets(args.crystalSinks) },
      UMBRITE: { sources: sortedBuckets(args.umbriteSources), sinks: sortedBuckets(args.umbriteSinks) },
      SHARD: { sources: sortedBuckets(args.shardSources), sinks: [] }
    },
    fedTownKeys: args.fedTownKeys,
    fedTownKeysByPlayer: args.fedTownKeysByPlayer
  };
};
