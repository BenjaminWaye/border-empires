import {
  ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  EXCHANGE_GOLD_PER_SLOT_PER_DAY,
  UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  POPULATION_MAX,
  townFoodUpkeepPerMinute,
  townPopulationMultiplier,
  UPKEEP_MINUTES_PER_DAY
} from "@border-empires/game-domain";
import type { Tile } from "@border-empires/shared";
import { SYNTHESIZER_FAMILY_RESOURCE, SYNTHESIZER_TYPE_SET, type BuildableStructureType } from "@border-empires/shared";
import {
  type RuntimeState,
  type StrategicResourceKey,
  type EconomyResourceKey,
  type EconomyBucket,
  keyFor,
  parseTown,
  parseStructure,
  strategicProductionByPlayerCache,
  fedTownKeysByPlayerCache,
  resourceSlotDormancyByPlayerCache
} from "./snapshot-tile-cache.js";
import { shouldYieldAt } from "./event-loop-yield.js";
import type { DomainTileState } from "@border-empires/game-domain";
import {
  emptyResourceSlotDormancy,
  resourceSlotDemandForPlayer,
  resourceSlotDormantContributorsForPlayer,
  resourceSlotSupplyForPlayer,
  type ResourceSlotDormancy
} from "./resource-slot-view/resource-slot-view.js";
import { radiusStructureKeysForSettledTiles } from "./tile-yield-view/tile-yield-view.js";
import { slotWaiversForPlayer } from "./tech-domain-bridge/slot-waivers.js";
import { domainGrantedResourceSlots } from "./tech-domain-bridge/tech-domain-bridge.js";
import { techGrantedFishFoodSlotBonus } from "./tech-domain-bridge/fish-food-slot-bonus.js";

export { townFoodUpkeepPerMinute };

export const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export const SYNTHETIC_SETTLEMENT_POPULATION = 800;

const isSyntheticSettlementIdentity = (name: string | undefined, populationTier: NonNullable<Tile["town"]>["populationTier"], x: number, y: number): boolean =>
  populationTier === "SETTLEMENT" && name === `Settlement ${x},${y}`;

export const resolvedTownPopulation = (
  town: Partial<NonNullable<Tile["town"]>>,
  x: number,
  y: number,
  populationTier: NonNullable<Tile["town"]>["populationTier"]
): { population: number; maxPopulation: number } | undefined => {
  if (typeof town.population === "number" && typeof town.maxPopulation === "number") {
    return { population: town.population, maxPopulation: town.maxPopulation };
  }
  if (isSyntheticSettlementIdentity(town.name, populationTier, x, y)) {
    return { population: typeof town.population === "number" ? town.population : SYNTHETIC_SETTLEMENT_POPULATION, maxPopulation: typeof town.maxPopulation === "number" ? town.maxPopulation : POPULATION_MAX };
  }
  if (populationTier === "SETTLEMENT") {
    return { population: typeof town.population === "number" ? town.population : SYNTHETIC_SETTLEMENT_POPULATION, maxPopulation: typeof town.maxPopulation === "number" ? town.maxPopulation : POPULATION_MAX };
  }
  return undefined;
};

export const isCompleteTownSummary = (town: Partial<NonNullable<Tile["town"]>> | undefined): town is NonNullable<Tile["town"]> =>
  Boolean(
    town &&
      (town.type === "MARKET" || town.type === "FARMING") &&
      (town.populationTier === "SETTLEMENT" ||
        town.populationTier === "TOWN" ||
        town.populationTier === "CITY" ||
        town.populationTier === "GREAT_CITY" ||
        town.populationTier === "METROPOLIS") &&
      isFiniteNumber(town.baseGoldPerMinute) &&
      isFiniteNumber(town.supportCurrent) &&
      isFiniteNumber(town.supportMax) &&
      isFiniteNumber(town.goldPerMinute) &&
      isFiniteNumber(town.cap) &&
      typeof town.isFed === "boolean" &&
      isFiniteNumber(town.population) &&
      isFiniteNumber(town.maxPopulation) &&
      isFiniteNumber(town.connectedTownCount) &&
      isFiniteNumber(town.connectedTownBonus) &&
      typeof town.hasMintworks === "boolean" &&
      typeof town.mintworksActive === "boolean" &&
      isFiniteNumber(town.mintworksCount) &&
      typeof town.hasGranary === "boolean" &&
      typeof town.granaryActive === "boolean"
  );

export const emptyStrategic = (): Record<StrategicResourceKey, number> => ({
  FOOD: 0,
  TITANIUM: 0,
  CRYSTAL: 0,
  UMBRITE: 0,
  SHARD: 0
});

export const addBucket = (
  target: Map<string, EconomyBucket>,
  label: string,
  amountPerMinute: number,
  options: { count?: number; resourceKey?: EconomyResourceKey; note?: string } = {}
): void => {
  if (!(amountPerMinute > 0.0001)) return;
  const existing = target.get(label);
  if (existing) {
    existing.amountPerMinute += amountPerMinute;
    existing.count += options.count ?? 1;
    if (options.note) existing.note = options.note;
    if (options.resourceKey) existing.resourceKey = options.resourceKey;
    return;
  }
  target.set(label, {
    label,
    amountPerMinute,
    count: options.count ?? 1,
    ...(options.note ? { note: options.note } : {}),
    ...(options.resourceKey ? { resourceKey: options.resourceKey } : {})
  });
};

export const sortedBuckets = (buckets: Map<string, EconomyBucket>): EconomyBucket[] =>
  [...buckets.values()]
    .map((bucket) => ({ ...bucket, amountPerMinute: Number(bucket.amountPerMinute.toFixed(4)) }))
    .sort((left, right) => right.amountPerMinute - left.amountPerMinute || left.label.localeCompare(right.label));

export { townPopulationMultiplier };

// FOOD joined TITANIUM/CRYSTAL/UMBRITE as slot-based, not produced (§5.4) — there's
// only one food mechanic now (slot dormancy). FARM/FISH still grant FOOD
// *slot supply* (structure-slots.ts), a separate, untouched mechanism.
export const strategicProductionPerMinuteForResource = (_resource: string | undefined): number => 0;

export const strategicResourceForTile = (resource: string | undefined): StrategicResourceKey | undefined => {
  switch (resource) {
    case "FARM":
    case "FISH": return "FOOD";
    default: return undefined;
  }
};

export const structureUpkeepPerMinute = (
  structureType: string,
  mode?: "SYNTHESIZE" | "EXCHANGE"
): Partial<Record<EconomyResourceKey, number>> => {
  // EXCHANGE-mode converters are a gold *source* — no gold upkeep.
  if (mode === "EXCHANGE" && SYNTHESIZER_TYPE_SET.has(structureType as BuildableStructureType)) return {};
  switch (structureType) {
    // Every structure except the synthesizer family (Umbrite/Titanium/Crystal +
    // Advanced tiers, §6.4) has zero ongoing upkeep: FOOD/TITANIUM/CRYSTAL/UMBRITE
    // are slot-based (structure-slots.ts), not a per-minute drain, and only
    // the synthesizers still have a real GOLD cost for their conversion.
    case "UMBRITE_SYNTHESIZER": return { GOLD: UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "ADVANCED_UMBRITE_SYNTHESIZER": return { GOLD: ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "TITANIUM_WORKS": return { GOLD: TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "ADVANCED_TITANIUM_WORKS": return { GOLD: ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "CRYSTAL_SYNTHESIZER": return { GOLD: CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "ADVANCED_CRYSTAL_SYNTHESIZER": return { GOLD: ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    default: return {};
  }
};

// EXCHANGE-mode converters pay out gold per slot consumed; SYNTHESIZE-mode
// converters (and all other structures) produce nothing on this path (§5.6 —
// TITANIUM_WORKS/UMBRITE_SYNTHESIZER/CRYSTAL_SYNTHESIZER no longer produce a
// stockpiled resource).
export const converterOutputPerMinute = (
  structureType: string,
  mode?: "SYNTHESIZE" | "EXCHANGE"
): Partial<Record<EconomyResourceKey, number>> => {
  if (mode === "EXCHANGE" && SYNTHESIZER_TYPE_SET.has(structureType as BuildableStructureType)) {
    const family = SYNTHESIZER_FAMILY_RESOURCE[structureType as keyof typeof SYNTHESIZER_FAMILY_RESOURCE];
    if (family) {
      const goldPerDay = EXCHANGE_GOLD_PER_SLOT_PER_DAY[structureType as keyof typeof EXCHANGE_GOLD_PER_SLOT_PER_DAY] ?? 0;
      return { GOLD: goldPerDay / UPKEEP_MINUTES_PER_DAY };
    }
  }
  return {};
};

// FOOD joined TITANIUM/CRYSTAL/UMBRITE as slot-based, not produced (§5.4) — a
// Farmstead's real effect now is boosting FOOD *slot supply*
// (structure-slots.ts), a separate mechanism this aggregate doesn't compute.
// Retired to a no-op rather than deleted, since both call sites below still
// pass the same farmsteadTiles/waterworksKeysByOwner bookkeeping.
const applyFarmsteadFoodToProduction = (
  _production: Map<string, Record<StrategicResourceKey, number>>,
  _waterworksKeysByOwner: Map<string, Set<string>>,
  _farmsteadTiles: Array<{ ownerId: string; x: number; y: number; resource?: string | undefined }>
): void => {};

export const buildStrategicProductionByPlayer = (runtimeState: RuntimeState): Map<string, Record<StrategicResourceKey, number>> => {
  const cached = strategicProductionByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const production = new Map<string, Record<StrategicResourceKey, number>>();
  for (const player of runtimeState.players) production.set(player.id, emptyStrategic());
  const waterworksKeysByOwner = new Map<string, Set<string>>();
  const farmsteadTiles: Array<{ ownerId: string; x: number; y: number; resource?: string | undefined }> = [];
  for (const tile of runtimeState.tiles) {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED") continue;
    const target = production.get(tile.ownerId) ?? emptyStrategic();
    const resourceKey = strategicResourceForTile(tile.resource);
    if (resourceKey) target[resourceKey] += strategicProductionPerMinuteForResource(tile.resource);
    const structure = parseStructure<{ type?: string; status?: string; converterMode?: "SYNTHESIZE" | "EXCHANGE" }>(tile.economicStructureJson);
    if (structure?.status === "active" && structure.type) {
      const output = converterOutputPerMinute(structure.type, structure.converterMode);
      for (const [resource, amount] of Object.entries(output) as Array<[EconomyResourceKey, number]>) {
        if (resource === "GOLD") continue;
        target[resource] += amount;
      }
      if (structure.type === "WATERWORKS") {
        (waterworksKeysByOwner.get(tile.ownerId) ?? waterworksKeysByOwner.set(tile.ownerId, new Set()).get(tile.ownerId)!).add(`${tile.x},${tile.y}`);
      } else if (structure.type === "FARMSTEAD") {
        farmsteadTiles.push({ ownerId: tile.ownerId, x: tile.x, y: tile.y, resource: tile.resource });
      }
    }
    production.set(tile.ownerId, target);
  }
  applyFarmsteadFoodToProduction(production, waterworksKeysByOwner, farmsteadTiles);
  strategicProductionByPlayerCache.set(runtimeState, production);
  return production;
};

export const buildStrategicProductionByPlayerAsync = async (
  runtimeState: RuntimeState,
  yieldToEventLoop: () => Promise<void>
): Promise<Map<string, Record<StrategicResourceKey, number>>> => {
  const cached = strategicProductionByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const production = new Map<string, Record<StrategicResourceKey, number>>();
  for (const player of runtimeState.players) production.set(player.id, emptyStrategic());
  const waterworksKeysByOwner = new Map<string, Set<string>>();
  const farmsteadTiles: Array<{ ownerId: string; x: number; y: number; resource?: string | undefined }> = [];
  let tileIndex = 0;
  for (const tile of runtimeState.tiles) {
    if (shouldYieldAt(tileIndex++, 2_000)) await yieldToEventLoop();
    if (!tile.ownerId || tile.ownershipState !== "SETTLED") continue;
    const target = production.get(tile.ownerId) ?? emptyStrategic();
    const resourceKey = strategicResourceForTile(tile.resource);
    if (resourceKey) target[resourceKey] += strategicProductionPerMinuteForResource(tile.resource);
    const structure = parseStructure<{ type?: string; status?: string; converterMode?: "SYNTHESIZE" | "EXCHANGE" }>(tile.economicStructureJson);
    if (structure?.status === "active" && structure.type) {
      const output = converterOutputPerMinute(structure.type, structure.converterMode);
      for (const [resource, amount] of Object.entries(output) as Array<[EconomyResourceKey, number]>) {
        if (resource === "GOLD") continue;
        target[resource] += amount;
      }
      if (structure.type === "WATERWORKS") {
        (waterworksKeysByOwner.get(tile.ownerId) ?? waterworksKeysByOwner.set(tile.ownerId, new Set()).get(tile.ownerId)!).add(`${tile.x},${tile.y}`);
      } else if (structure.type === "FARMSTEAD") {
        farmsteadTiles.push({ ownerId: tile.ownerId, x: tile.x, y: tile.y, resource: tile.resource });
      }
    }
    production.set(tile.ownerId, target);
  }
  applyFarmsteadFoodToProduction(production, waterworksKeysByOwner, farmsteadTiles);
  strategicProductionByPlayerCache.set(runtimeState, production);
  return production;
};

// Parsed, per-owner tile views shared by buildResourceSlotDormancyByPlayer's
// sync/async variants — the same shape resourceSlotSupplyForPlayer/
// resourceSlotDemandForPlayer/resourceSlotDormantContributorsForPlayer need,
// parsed once from the wire-shaped RuntimeState tiles (see
// live-economy-snapshot.ts's resourceSlotsForPlayer, which does the same
// parsing for a single player — this is the "all players in one pass"
// variant needed here since buildFedTownKeysByPlayer computes every
// player's fed set at once).
type SlotTileEconomicStructure = DomainTileState["economicStructure"];
type SettledSlotTile = Pick<DomainTileState, "x" | "y" | "resource"> & { economicStructure?: SlotTileEconomicStructure };
type OwnedSlotTile = Pick<DomainTileState, "x" | "y" | "fort" | "observatory" | "siegeOutpost" | "economicStructure" | "town" | "ownerId" | "ownershipState" | "naturalWonder">;

const parsedSlotTiles = (
  runtimeState: RuntimeState
): { settledByOwner: Map<string, SettledSlotTile[]>; ownedByOwner: Map<string, OwnedSlotTile[]> } => {
  const settledByOwner = new Map<string, SettledSlotTile[]>();
  const ownedByOwner = new Map<string, OwnedSlotTile[]>();
  for (const tile of runtimeState.tiles) {
    if (!tile.ownerId) continue;
    const economicStructure = parseStructure<SlotTileEconomicStructure>(tile.economicStructureJson);
    if (tile.ownershipState === "SETTLED") {
      const settled = settledByOwner.get(tile.ownerId) ?? [];
      settled.push({ x: tile.x, y: tile.y, resource: tile.resource as DomainTileState["resource"], economicStructure });
      settledByOwner.set(tile.ownerId, settled);
    }
    const owned = ownedByOwner.get(tile.ownerId) ?? [];
    owned.push({
      x: tile.x,
      y: tile.y,
      fort: parseStructure<DomainTileState["fort"]>(tile.fortJson),
      observatory: parseStructure<DomainTileState["observatory"]>(tile.observatoryJson),
      siegeOutpost: parseStructure<DomainTileState["siegeOutpost"]>(tile.siegeOutpostJson),
      naturalWonder: parseStructure<DomainTileState["naturalWonder"]>(tile.naturalWonderJson),
      economicStructure,
      town: parseTown(tile) as DomainTileState["town"],
      ownerId: tile.ownerId,
      ownershipState: tile.ownershipState as DomainTileState["ownershipState"]
    });
    ownedByOwner.set(tile.ownerId, owned);
  }
  return { settledByOwner, ownedByOwner };
};

// §5.4: per-player resource-slot dormancy for the reconnect/cold-snapshot
// path — the same pure resourceSlot*ForPlayer functions the live runtime
// uses for BUILD_STRUCTURE/UPGRADE_TOWN_TIER gating and dormancy, so the
// two paths can never disagree on who's dormant.
export const buildResourceSlotDormancyByPlayer = (runtimeState: RuntimeState): Map<string, ResourceSlotDormancy> => {
  const cached = resourceSlotDormancyByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const { settledByOwner, ownedByOwner } = parsedSlotTiles(runtimeState);
  const result = new Map<string, ResourceSlotDormancy>();
  for (const player of runtimeState.players) {
    const settledTiles = settledByOwner.get(player.id) ?? [];
    const ownedTiles = ownedByOwner.get(player.id) ?? [];
    if (ownedTiles.length === 0) {
      result.set(player.id, emptyResourceSlotDormancy());
      continue;
    }
    const { waterworksKeys, foundryKeys } = radiusStructureKeysForSettledTiles(settledTiles);
    const domainGranted = domainGrantedResourceSlots({ domainIds: new Set(player.domainIds), chosenTrickleResource: player.chosenTrickleResource });
    const supply = resourceSlotSupplyForPlayer(settledTiles, waterworksKeys, foundryKeys, domainGranted, techGrantedFishFoodSlotBonus(player));
    // §23.2: apply the same slot waivers the live runtime does, or a
    // reconnect could show a structure dormant that the live path considers
    // waived (Dwarf Kingdom/Fortress Realm/Supply State/Treasury State/
    // Enduring Realm).
    const waivers = slotWaiversForPlayer({ techIds: new Set(player.techIds), domainIds: new Set(player.domainIds) });
    result.set(player.id, resourceSlotDormantContributorsForPlayer(ownedTiles, player.id, supply, waivers));
  }
  resourceSlotDormancyByPlayerCache.set(runtimeState, result);
  return result;
};

// §5.4/§5.3: a town is "fed" iff its own FOOD slot demand isn't dormant —
// FOOD has no separate stockpile/upkeep gate anymore (there's only one food
// mechanic: slots), matching Runtime.foodDormantTownKeysForPlayer/
// buildFedTownKeys on the live path.
const foodDormantTownKeysFromDormancy = (dormancy: ResourceSlotDormancy | undefined): ReadonlySet<string> => {
  const result = new Set<string>();
  if (!dormancy) return result;
  for (const key of dormancy.FOOD) {
    if (key.endsWith(":town")) result.add(key.slice(0, -":town".length));
  }
  return result;
};

// §5.4: dormant economicStructure tile keys ("x,y") from a player's
// dormancy record — the reconnect-path equivalent of
// Runtime.dormantEconomicStructureKeysForPlayer, checked across all four
// resource sets since a structure can be dormant on any one of its required
// resources (e.g. GARRISON_HALL needs both FOOD and CRYSTAL).
export const dormantEconomicStructureKeysFromDormancy = (dormancy: ResourceSlotDormancy | undefined): ReadonlySet<string> => {
  const result = new Set<string>();
  if (!dormancy) return result;
  const suffix = ":economicStructure";
  for (const resourceSet of Object.values(dormancy)) {
    for (const key of resourceSet) {
      if (key.endsWith(suffix)) result.add(key.slice(0, -suffix.length));
    }
  }
  return result;
};

export const buildFedTownKeysByPlayer = (
  runtimeState: RuntimeState,
  dormancyByPlayer: ReadonlyMap<string, ResourceSlotDormancy>
): Map<string, Set<string>> => {
  const cached = fedTownKeysByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const result = new Map<string, Set<string>>();
  const ownedSettledTownsByPlayerId = new Map<string, RuntimeState["tiles"]>();
  for (const tile of runtimeState.tiles) {
    if (!tile.ownerId || tile.ownershipState !== "SETTLED" || !(tile.townJson || tile.townType)) continue;
    const ownedSettledTowns = ownedSettledTownsByPlayerId.get(tile.ownerId) ?? [];
    ownedSettledTowns.push(tile);
    ownedSettledTownsByPlayerId.set(tile.ownerId, ownedSettledTowns);
  }
  for (const player of runtimeState.players) {
    const foodDormantTownKeys = foodDormantTownKeysFromDormancy(dormancyByPlayer.get(player.id));
    const fedTownKeys = new Set<string>();
    const ownedSettledTowns = ownedSettledTownsByPlayerId.get(player.id) ?? [];
    for (const tile of ownedSettledTowns) {
      if (!foodDormantTownKeys.has(keyFor(tile.x, tile.y))) fedTownKeys.add(keyFor(tile.x, tile.y));
    }
    result.set(player.id, fedTownKeys);
  }
  fedTownKeysByPlayerCache.set(runtimeState, result);
  return result;
};

export const buildResourceSlotDormancyByPlayerAsync = async (
  runtimeState: RuntimeState,
  yieldToEventLoop: () => Promise<void>
): Promise<Map<string, ResourceSlotDormancy>> => {
  const cached = resourceSlotDormancyByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const { settledByOwner, ownedByOwner } = parsedSlotTiles(runtimeState);
  const result = new Map<string, ResourceSlotDormancy>();
  let playerIndex = 0;
  for (const player of runtimeState.players) {
    if (shouldYieldAt(playerIndex++, 500)) await yieldToEventLoop();
    const settledTiles = settledByOwner.get(player.id) ?? [];
    const ownedTiles = ownedByOwner.get(player.id) ?? [];
    if (ownedTiles.length === 0) {
      result.set(player.id, emptyResourceSlotDormancy());
      continue;
    }
    const { waterworksKeys, foundryKeys } = radiusStructureKeysForSettledTiles(settledTiles);
    const domainGranted = domainGrantedResourceSlots({ domainIds: new Set(player.domainIds), chosenTrickleResource: player.chosenTrickleResource });
    const supply = resourceSlotSupplyForPlayer(settledTiles, waterworksKeys, foundryKeys, domainGranted, techGrantedFishFoodSlotBonus(player));
    const waivers = slotWaiversForPlayer({ techIds: new Set(player.techIds), domainIds: new Set(player.domainIds) });
    result.set(player.id, resourceSlotDormantContributorsForPlayer(ownedTiles, player.id, supply, waivers));
  }
  resourceSlotDormancyByPlayerCache.set(runtimeState, result);
  return result;
};

export const buildFedTownKeysByPlayerAsync = async (
  runtimeState: RuntimeState,
  dormancyByPlayer: ReadonlyMap<string, ResourceSlotDormancy>,
  yieldToEventLoop: () => Promise<void>
): Promise<Map<string, Set<string>>> => {
  const cached = fedTownKeysByPlayerCache.get(runtimeState);
  if (cached) return cached;
  const result = new Map<string, Set<string>>();
  const ownedSettledTownsByPlayerId = new Map<string, RuntimeState["tiles"]>();
  let tileIndex = 0;
  for (const tile of runtimeState.tiles) {
    if (shouldYieldAt(tileIndex++, 2_000)) await yieldToEventLoop();
    if (!tile.ownerId || tile.ownershipState !== "SETTLED" || !(tile.townJson || tile.townType)) continue;
    const ownedSettledTowns = ownedSettledTownsByPlayerId.get(tile.ownerId) ?? [];
    ownedSettledTowns.push(tile);
    ownedSettledTownsByPlayerId.set(tile.ownerId, ownedSettledTowns);
  }
  for (const player of runtimeState.players) {
    const foodDormantTownKeys = foodDormantTownKeysFromDormancy(dormancyByPlayer.get(player.id));
    const fedTownKeys = new Set<string>();
    const ownedSettledTowns = ownedSettledTownsByPlayerId.get(player.id) ?? [];
    for (const tile of ownedSettledTowns) {
      if (!foodDormantTownKeys.has(keyFor(tile.x, tile.y))) fedTownKeys.add(keyFor(tile.x, tile.y));
    }
    result.set(player.id, fedTownKeys);
  }
  fedTownKeysByPlayerCache.set(runtimeState, result);
  return result;
};
