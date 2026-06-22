import { OBSERVATORY_UPKEEP_PER_MIN } from "@border-empires/shared";
import type { DomainPlayer, DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";

import {
  AIRPORT_CRYSTAL_UPKEEP_PER_MIN,
  BANK_FOOD_UPKEEP,
  CAMP_GOLD_UPKEEP,
  CARAVANARY_FOOD_UPKEEP,
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  CUSTOMS_HOUSE_GOLD_UPKEEP,
  DOCK_INCOME_PER_MIN,
  FARMSTEAD_GOLD_UPKEEP,
  FOUNDRY_GOLD_UPKEEP,
  FUR_SYNTHESIZER_GOLD_UPKEEP,
  FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  GARRISON_HALL_GOLD_UPKEEP,
  GOVERNORS_OFFICE_GOLD_UPKEEP,
  GRANARY_GOLD_UPKEEP,
  IRONWORKS_GOLD_UPKEEP,
  IRONWORKS_IRON_PER_DAY,
  LIGHT_OUTPOST_GOLD_UPKEEP,
  MARKET_FOOD_UPKEEP,
  MINE_GOLD_UPKEEP,
  PASSIVE_INCOME_MULT,
  RADAR_SYSTEM_GOLD_UPKEEP,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TOWN_BASE_GOLD_PER_MIN,
  WOODEN_FORT_GOLD_UPKEEP
} from "@border-empires/game-domain";
import {
  buildConnectedTownNetworkForPlayer,
  dockBaseGoldPerMinuteForPlayer,
  enrichTownWithConnectedNetwork,
  firstThreeTownKeysForPlayer,
  firstThreeTownsGoldOutputMultiplierForPlayer,
  type DockEconomyContext,
  type EconomyPlayer
} from "../economy-network/economy-network.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import { chosenTrickleRateForPlayer, multiplicativeEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";

type StrategicResourceKey = DomainStrategicResourceKey;
type EconomyResourceKey = StrategicResourceKey | "GOLD";
type EconomyBucket = {
  label: string;
  amountPerMinute: number;
  count: number;
  resourceKey?: EconomyResourceKey;
  note?: string;
};

type EconomyBreakdown = Record<EconomyResourceKey, { sources: EconomyBucket[]; sinks: EconomyBucket[] }>;
type UpkeepPerMinute = { food: number; iron: number; supply: number; crystal: number; gold: number };
type UpkeepLastTick = {
  foodCoverage: number;
  gold: { contributors: EconomyBucket[] };
  food: { contributors: EconomyBucket[] };
  iron: { contributors: EconomyBucket[] };
  crystal: { contributors: EconomyBucket[] };
  supply: { contributors: EconomyBucket[] };
};

export type PlayerUpdateEconomySnapshot = {
  incomePerMinute: number;
  strategicProductionPerMinute: Record<StrategicResourceKey, number>;
  upkeepPerMinute: UpkeepPerMinute;
  upkeepLastTick: UpkeepLastTick;
  economyBreakdown: EconomyBreakdown;
};

const emptyStrategic = (): Record<StrategicResourceKey, number> => ({
  FOOD: 0,
  IRON: 0,
  CRYSTAL: 0,
  SUPPLY: 0,
  SHARD: 0
});

const addBucket = (
  buckets: Map<string, EconomyBucket>,
  label: string,
  amountPerMinute: number,
  options: { count?: number; resourceKey?: EconomyResourceKey; note?: string } = {}
): void => {
  if (!(amountPerMinute > 0)) return;
  const current = buckets.get(label);
  if (current) {
    current.amountPerMinute = Number((current.amountPerMinute + amountPerMinute).toFixed(4));
    current.count += options.count ?? 1;
    return;
  }
  buckets.set(label, {
    label,
    amountPerMinute: Number(amountPerMinute.toFixed(4)),
    count: options.count ?? 1,
    ...(options.resourceKey ? { resourceKey: options.resourceKey } : {}),
    ...(options.note ? { note: options.note } : {})
  });
};

const sortedBuckets = (buckets: Map<string, EconomyBucket>): EconomyBucket[] =>
  [...buckets.values()].sort((left, right) => (right.amountPerMinute - left.amountPerMinute) || left.label.localeCompare(right.label));

const strategicProductionPerMinuteForResource = (resource: DomainTileState["resource"] | undefined): number => {
  switch (resource) {
    case "FARM":
      return 72 / 1440;
    case "FISH":
      return 48 / 1440;
    case "IRON":
      return 60 / 1440;
    case "WOOD":
      return 60 / 1440;
    case "FUR":
      return 60 / 1440;
    case "GEMS":
      return 36 / 1440;
    default:
      return 0;
  }
};

const strategicResourceForTile = (resource: DomainTileState["resource"] | undefined): StrategicResourceKey | undefined => {
  switch (resource) {
    case "FARM":
    case "FISH":
      return "FOOD";
    case "IRON":
      return "IRON";
    case "GEMS":
      return "CRYSTAL";
    case "WOOD":
    case "FUR":
      return "SUPPLY";
    default:
      return undefined;
  }
};

const converterOutputPerMinute = (structureType: string): Partial<Record<StrategicResourceKey, number>> => {
  switch (structureType) {
    case "FUR_SYNTHESIZER":
    case "ADVANCED_FUR_SYNTHESIZER":
      return { SUPPLY: FUR_SYNTHESIZER_SUPPLY_PER_DAY / 1440 };
    case "IRONWORKS":
    case "ADVANCED_IRONWORKS":
      return { IRON: IRONWORKS_IRON_PER_DAY / 1440 };
    case "CRYSTAL_SYNTHESIZER":
    case "ADVANCED_CRYSTAL_SYNTHESIZER":
      return { CRYSTAL: CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY / 1440 };
    default:
      return {};
  }
};

const structureUpkeepPerMinute = (structureType: string): Partial<Record<EconomyResourceKey, number>> => {
  switch (structureType) {
    case "FARMSTEAD": return { GOLD: FARMSTEAD_GOLD_UPKEEP / 10 };
    case "CAMP": return { GOLD: CAMP_GOLD_UPKEEP / 10 };
    case "MINE": return { GOLD: MINE_GOLD_UPKEEP / 10 };
    case "MARKET": return { FOOD: MARKET_FOOD_UPKEEP / 10 };
    case "GRANARY": return { GOLD: GRANARY_GOLD_UPKEEP / 10 };
    case "BANK": return { FOOD: BANK_FOOD_UPKEEP / 10 };
    case "WOODEN_FORT": return { GOLD: WOODEN_FORT_GOLD_UPKEEP / 10 };
    case "LIGHT_OUTPOST": return { GOLD: LIGHT_OUTPOST_GOLD_UPKEEP / 10 };
    case "CARAVANARY": return { FOOD: CARAVANARY_FOOD_UPKEEP / 10 };
    case "FUR_SYNTHESIZER":
    case "ADVANCED_FUR_SYNTHESIZER": return { GOLD: FUR_SYNTHESIZER_GOLD_UPKEEP / 10 };
    case "IRONWORKS":
    case "ADVANCED_IRONWORKS": return { GOLD: IRONWORKS_GOLD_UPKEEP / 10 };
    case "CRYSTAL_SYNTHESIZER":
    case "ADVANCED_CRYSTAL_SYNTHESIZER": return { GOLD: CRYSTAL_SYNTHESIZER_GOLD_UPKEEP / 10 };
    case "FOUNDRY": return { GOLD: FOUNDRY_GOLD_UPKEEP / 10 };
    case "CUSTOMS_HOUSE": return { GOLD: CUSTOMS_HOUSE_GOLD_UPKEEP / 10 };
    case "GARRISON_HALL": return { GOLD: GARRISON_HALL_GOLD_UPKEEP / 10 };
    case "GOVERNORS_OFFICE": return { GOLD: GOVERNORS_OFFICE_GOLD_UPKEEP / 10 };
    case "RADAR_SYSTEM": return { GOLD: RADAR_SYSTEM_GOLD_UPKEEP / 10 };
    case "AIRPORT": return { CRYSTAL: AIRPORT_CRYSTAL_UPKEEP_PER_MIN };
    default: return {};
  }
};

export const townPopulationMultiplier = (populationTier: string | undefined): number => {
  switch (populationTier) {
    case "CITY":
      return 1.5;
    case "GREAT_CITY":
      return 2.5;
    case "METROPOLIS":
      return 3.2;
    default:
      return 1;
  }
};

export const townFoodUpkeepPerMinute = (populationTier: string | undefined): number => {
  if (populationTier === "SETTLEMENT" || !populationTier) return 0;
  switch (populationTier) {
    case "CITY":
      return 0.3;
    case "GREAT_CITY":
      return 0.6;
    case "METROPOLIS":
      return 1;
    default:
      return 0.1;
  }
};

export const supportSummaryForTown = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): { supportCurrent: number; supportMax: number } => {
  if (tile.ownershipState !== "SETTLED") return { supportCurrent: 0, supportMax: 0 };
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tiles.get(`${tile.x + dx},${tile.y + dy}`);
      if (!neighbor || neighbor.terrain !== "LAND") continue;
      if (!supportTileBelongsToTown(playerId, neighbor, tile, tiles)) continue;
      supportMax += 1;
      if (neighbor.ownerId === playerId && neighbor.ownershipState === "SETTLED") supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

const supportTileBelongsToTown = (
  playerId: string,
  supportTile: DomainTileState,
  townTile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): boolean => {
  let assignedTown: DomainTileState | undefined;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const candidate = tiles.get(`${supportTile.x + dx},${supportTile.y + dy}`);
      if (!candidate?.town || candidate.ownerId !== playerId || candidate.ownershipState !== "SETTLED") continue;
      if (candidate.town.populationTier === "SETTLEMENT") continue;
      if (!assignedTown || candidate.x < assignedTown.x || (candidate.x === assignedTown.x && candidate.y < assignedTown.y)) {
        assignedTown = candidate;
      }
    }
  }
  return assignedTown?.x === townTile.x && assignedTown.y === townTile.y;
};

export const hasSupportedStructure = (
  playerId: string,
  tile: DomainTileState,
  structureType: string,
  tiles: ReadonlyMap<string, DomainTileState>
): boolean => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tiles.get(`${tile.x + dx},${tile.y + dy}`);
      if (!neighbor || neighbor.ownerId !== playerId || neighbor.ownershipState !== "SETTLED") continue;
      if (!supportTileBelongsToTown(playerId, neighbor, tile, tiles)) continue;
      if (neighbor.economicStructure?.ownerId === playerId && neighbor.economicStructure.status === "active" && neighbor.economicStructure.type === structureType) return true;
    }
  }
  return false;
};

export const buildStrategicProductionForSettledTiles = (
  summary: PlayerRuntimeSummary,
  settledTiles: readonly DomainTileState[]
): Record<StrategicResourceKey, number> => {
  const strategicProductionPerMinute = {
    ...summary.strategicProductionPerMinute
  };

  for (const tile of settledTiles) {
    const structure = tile.economicStructure;
    if (!structure || structure.ownerId !== tile.ownerId || structure.status !== "active") continue;
    const output = converterOutputPerMinute(structure.type);
    for (const [resourceKey, amount] of Object.entries(output) as Array<[StrategicResourceKey, number]>) {
      strategicProductionPerMinute[resourceKey] += amount;
    }
  }

  return strategicProductionPerMinute;
};

export const buildFedTownKeys = (
  player: DomainPlayer,
  summary: PlayerRuntimeSummary,
  tiles: ReadonlyMap<string, DomainTileState>,
  strategicProductionPerMinute: Record<StrategicResourceKey, number>
): Set<string> => {
  const availableFood = (player.strategicResources?.FOOD ?? 0) + strategicProductionPerMinute.FOOD;
  let remainingFood = availableFood;
  const fedTownKeys = new Set<string>();
  // Use ownedTownTierByTile (already an index of just owned town tiles) instead
  // of spreading all territoryTileKeys and filtering. O(towns) vs O(territory).
  const ownedSettledTowns = [...summary.ownedTownTierByTile.keys()]
    .map((tileKey) => tiles.get(tileKey))
    .filter((tile): tile is DomainTileState => Boolean(tile?.town && tile.ownerId === player.id && tile.ownershipState === "SETTLED"))
    .sort((left, right) => (left.x - right.x) || (left.y - right.y));
  for (const tile of ownedSettledTowns) {
    const upkeep = townFoodUpkeepPerMinute(tile.town?.populationTier);
    if (upkeep <= 0) {
      fedTownKeys.add(`${tile.x},${tile.y}`);
      continue;
    }
    if (remainingFood + 1e-9 >= upkeep) {
      fedTownKeys.add(`${tile.x},${tile.y}`);
      remainingFood = Math.max(0, remainingFood - upkeep);
    }
  }
  return fedTownKeys;
};

export const townGoldPerMinuteForPlayer = (
  player: EconomyPlayer,
  tile: DomainTileState,
  town: NonNullable<DomainTileState["town"]>,
  tiles: ReadonlyMap<string, DomainTileState>,
  fedTownKeys: ReadonlySet<string>,
  firstThreeTownKeys: ReadonlySet<string> = new Set<string>(),
  connectedTownKeys?: readonly string[]
): number => {
  const incomeMultiplier = player.mods?.income ?? 1;
  const tileKey = `${tile.x},${tile.y}`;
  const isSettlement = town.populationTier === "SETTLEMENT" || !town.populationTier;
  if (isSettlement) return SETTLEMENT_BASE_GOLD_PER_MIN * incomeMultiplier * PASSIVE_INCOME_MULT;
  if (!fedTownKeys.has(tileKey)) return 0;
  const support = supportSummaryForTown(player.id, tile, tiles);
  const supportRatio = support.supportMax <= 0 ? 1 : support.supportCurrent / support.supportMax;
  const hasMarket = hasSupportedStructure(player.id, tile, "MARKET", tiles);
  const hasBank = hasSupportedStructure(player.id, tile, "BANK", tiles);
  const hasCaravanary = hasSupportedStructure(player.id, tile, "CARAVANARY", tiles);
  const clearingHouseActive =
    hasSupportedStructure(player.id, tile, "CLEARING_HOUSE", tiles) ||
    (connectedTownKeys ?? []).some((key) => {
      const connectedTile = tiles.get(key);
      return connectedTile ? hasSupportedStructure(player.id, connectedTile, "CLEARING_HOUSE", tiles) : false;
    });
  const firstThreeTownMult = firstThreeTownKeys.has(tileKey)
    ? firstThreeTownsGoldOutputMultiplierForPlayer(player)
    : 1;
  return (
    TOWN_BASE_GOLD_PER_MIN *
    supportRatio *
    townPopulationMultiplier(town.populationTier) *
    (1 + (town.connectedTownBonus ?? 0) + (hasCaravanary ? 0.25 : 0)) *
    (hasMarket ? (clearingHouseActive ? 1.75 : 1.5) : 1) *
    (hasBank ? (clearingHouseActive ? 1.7 : 1.5) : 1) *
    firstThreeTownMult *
    incomeMultiplier *
    PASSIVE_INCOME_MULT
  ) + (hasBank ? (clearingHouseActive ? 1.5 : 1) : 0);
};

// Refresh `town.goldPerMinute` and `town.cap` on a town that was originally
// populated by buildTownSummary (i.e. carries the full snapshot shape — we
// detect that by checking the snapshot-only `supportMax` field). Between full
// snapshot rebuilds the connected-town bonus is re-enriched but goldPerMinute
// is not, so a tile delta emitted in that window can carry a stale Production
// row and gold cap while still claiming a fresh "+X% connected-town" modifier.
// Test fixtures pass partial town stubs without supportMax/supportCurrent and
// rely on their literal goldPerMinute being honored; the predicate keeps them
// untouched.
export const refreshTownEconomyFields = (
  town: NonNullable<DomainTileState["town"]>,
  tile: DomainTileState,
  player: EconomyPlayer,
  tiles: ReadonlyMap<string, DomainTileState>,
  fedTownKeys: ReadonlySet<string>,
  firstThreeTownKeys?: ReadonlySet<string>,
  connectedTownKeys?: readonly string[]
): NonNullable<DomainTileState["town"]> => {
  if (typeof town.supportMax !== "number" || typeof town.supportCurrent !== "number") return town;
  if (tile.ownerId !== player.id) return town;
  const isSettlement = town.populationTier === "SETTLEMENT" || !town.populationTier;
  const goldPerMinute = isSettlement
    ? SETTLEMENT_BASE_GOLD_PER_MIN * (player.mods?.income ?? 1) * PASSIVE_INCOME_MULT
    : townGoldPerMinuteForPlayer(player, tile, town, tiles, fedTownKeys, firstThreeTownKeys, connectedTownKeys);
  const hasMarket = !isSettlement && tile.ownerId
    ? hasSupportedStructure(tile.ownerId, tile, "MARKET", tiles)
    : false;
  const cap = isSettlement
    ? goldPerMinute * 60 * 8
    : goldPerMinute * 60 * 8 * (hasMarket ? 1.5 : 1);
  // Re-stamp isFed from the freshly-computed fed-key set so the wire payload's
  // townJson.isFed never contradicts the live fedTownKeys (and the derived
  // goldPerMinute/cap above). Settlements have no food upkeep so always fed.
  const isFed = isSettlement ? true : fedTownKeys.has(`${tile.x},${tile.y}`);
  if (town.goldPerMinute === goldPerMinute && town.cap === cap && town.isFed === isFed) return town;
  return { ...town, goldPerMinute, cap, isFed };
};

export const buildPlayerUpdateEconomySnapshot = (
  player: DomainPlayer,
  summary: PlayerRuntimeSummary,
  tiles: ReadonlyMap<string, DomainTileState>,
  dockContext?: Pick<DockEconomyContext, "dockLinksByDockTileKey">,
  integrityEconMult: number = 1
): PlayerUpdateEconomySnapshot => {
  const incomeMultiplier = player.mods?.income ?? 1;
  const fortGoldUpkeepMult = multiplicativeEffectForPlayer(player, "fortGoldUpkeepMult");
  const fortIronUpkeepMult = multiplicativeEffectForPlayer(player, "fortIronUpkeepMult");
  const outpostSupplyUpkeepMult = multiplicativeEffectForPlayer(player, "outpostSupplyUpkeepMult");
  // Iterate the Set directly rather than spreading it — avoids a 250k-element
  // intermediate array allocation at scale. Same result, O(territory) either way
  // but no GC pressure from the spread.
  const settledTiles: DomainTileState[] = [];
  for (const tileKey of summary.territoryTileKeys) {
    const tile = tiles.get(tileKey);
    if (tile && tile.ownerId === player.id && tile.ownershipState === "SETTLED") settledTiles.push(tile);
  }
  const orderedTownTiles = [...summary.ownedTownTierByTile.keys()]
    .map((tileKey) => tiles.get(tileKey))
    .filter((tile): tile is DomainTileState => Boolean(tile?.town && tile.ownerId === player.id && tile.ownershipState === "SETTLED"));
  const strategicProductionPerMinute = buildStrategicProductionForSettledTiles(summary, settledTiles);

  const fedTownKeys = buildFedTownKeys(player, summary, tiles, strategicProductionPerMinute);
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
  const dockEconomyContext = dockContext ? { tiles, dockLinksByDockTileKey: dockContext.dockLinksByDockTileKey } : undefined;
  const townNetwork = buildConnectedTownNetworkForPlayer(player, tiles, settledTiles, { maxConnectedTownNames: 0 });
  const firstThreeTownKeys = firstThreeTownKeysForPlayer(player.id, summary.ownedTownTierByTile.keys());

  for (const tile of settledTiles) {
    addBucket(goldSinks, "Settled land upkeep", 0.04, { count: 1, note: "1 settled tile" });
    const resourceKey = strategicResourceForTile(tile.resource);
    const resourceRate = strategicProductionPerMinuteForResource(tile.resource);
    if (resourceKey && resourceRate > 0) {
      const target =
        resourceKey === "FOOD" ? foodSources :
        resourceKey === "IRON" ? ironSources :
        resourceKey === "CRYSTAL" ? crystalSources :
        supplySources;
      addBucket(
        target,
        tile.resource === "FARM" ? "Grain" :
          tile.resource === "FISH" ? "Fish" :
          tile.resource === "IRON" ? "Iron" :
          tile.resource === "GEMS" ? "Crystal" :
          "Supply",
        resourceRate,
        { count: 1, resourceKey }
      );
    }
    if (tile.town) {
      const tileKey = `${tile.x},${tile.y}`;
      const town = enrichTownWithConnectedNetwork(tile, townNetwork) ?? tile.town;
      const connectedTownKeys = townNetwork.get(tileKey)?.connectedTownKeys;
      const goldPerMinute = townGoldPerMinuteForPlayer(player, tile, town, tiles, fedTownKeys, firstThreeTownKeys, connectedTownKeys);
      if (goldPerMinute > 0) addBucket(goldSources, "Towns", goldPerMinute, { count: 1 });
      addBucket(foodSinks, "Town", townFoodUpkeepPerMinute(town.populationTier), { count: 1 });
    }
    if (tile.dockId) {
      const dockGoldPerMinute = dockBaseGoldPerMinuteForPlayer(tile, player, dockEconomyContext) * incomeMultiplier * PASSIVE_INCOME_MULT;
      addBucket(goldSources, "Docks", dockGoldPerMinute > 0 ? dockGoldPerMinute : DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT, { count: 1 });
    }
    if (tile.fort?.ownerId === player.id && tile.fort.status === "active") {
      addBucket(goldSinks, "Fort", 1 * fortGoldUpkeepMult, { count: 1 });
      addBucket(ironSinks, "Fort", 0.025 * fortIronUpkeepMult, { count: 1 });
    }
    if (tile.siegeOutpost?.ownerId === player.id && tile.siegeOutpost.status === "active") {
      addBucket(goldSinks, "Siege outpost", 1, { count: 1 });
      addBucket(supplySinks, "Siege outpost", 0.025 * outpostSupplyUpkeepMult, { count: 1 });
    }
    if (tile.observatory?.ownerId === player.id && tile.observatory.status === "active") {
      addBucket(crystalSinks, "Observatory", OBSERVATORY_UPKEEP_PER_MIN, { count: 1 });
    }
    const structure = tile.economicStructure;
    if (structure?.ownerId === player.id && structure.status === "active") {
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

  // Clockwork Stipend (and any future pick-a-resource domain) credits a flat
  // trickle to the player each tick — fold it into the breakdown so the HUD
  // explains where the income is coming from, not just where it landed.
  const trickle = chosenTrickleRateForPlayer(player);
  if (trickle && trickle.ratePerMinute > 0) {
    const target =
      trickle.resource === "IRON" ? ironSources :
      trickle.resource === "SUPPLY" ? supplySources :
      crystalSources;
    addBucket(target, "Clockwork Stipend", trickle.ratePerMinute, { count: 1, resourceKey: trickle.resource });
    strategicProductionPerMinute[trickle.resource] += trickle.ratePerMinute;
  }

  const upkeepPerMinute = {
    food: Number([...foodSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    iron: Number([...ironSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    supply: Number([...supplySinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    crystal: Number([...crystalSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4)),
    gold: Number([...goldSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4))
  };
  const rawIncomePerMinute = Number([...goldSources.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(4));
  const foodCoverage =
    upkeepPerMinute.food <= 0
      ? 1
      : Math.max(0, Math.min(1, (((player.strategicResources?.FOOD ?? 0) + strategicProductionPerMinute.FOOD) / upkeepPerMinute.food)));

  // Apply integrity multiplier after the food-gate so intermediate food logic is undisturbed.
  const incomePerMinute = Number((rawIncomePerMinute * integrityEconMult).toFixed(4));

  return {
    incomePerMinute,
    strategicProductionPerMinute: {
      FOOD: Number((strategicProductionPerMinute.FOOD * integrityEconMult).toFixed(4)),
      IRON: Number((strategicProductionPerMinute.IRON * integrityEconMult).toFixed(4)),
      CRYSTAL: Number((strategicProductionPerMinute.CRYSTAL * integrityEconMult).toFixed(4)),
      SUPPLY: Number((strategicProductionPerMinute.SUPPLY * integrityEconMult).toFixed(4)),
      SHARD: Number((strategicProductionPerMinute.SHARD * integrityEconMult).toFixed(4))
    },
    upkeepPerMinute,
    upkeepLastTick: {
      foodCoverage: Number(foodCoverage.toFixed(4)),
      gold: { contributors: sortedBuckets(goldSinks) },
      food: { contributors: sortedBuckets(foodSinks) },
      iron: { contributors: sortedBuckets(ironSinks) },
      crystal: { contributors: sortedBuckets(crystalSinks) },
      supply: { contributors: sortedBuckets(supplySinks) }
    },
    economyBreakdown: {
      GOLD: { sources: sortedBuckets(goldSources), sinks: sortedBuckets(goldSinks) },
      FOOD: { sources: sortedBuckets(foodSources), sinks: sortedBuckets(foodSinks) },
      IRON: { sources: sortedBuckets(ironSources), sinks: sortedBuckets(ironSinks) },
      CRYSTAL: { sources: sortedBuckets(crystalSources), sinks: sortedBuckets(crystalSinks) },
      SUPPLY: { sources: sortedBuckets(supplySources), sinks: sortedBuckets(supplySinks) },
      SHARD: { sources: sortedBuckets(shardSources), sinks: [] }
    }
  };
};
