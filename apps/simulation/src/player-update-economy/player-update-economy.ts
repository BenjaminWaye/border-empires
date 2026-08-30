import type { DomainPlayer, DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";

import {
  DOCK_INCOME_PER_MIN,
  MINTWORKS_FLAT_GOLD_BONUS_PER_MIN,
  mintworksGoldProductionMultiplier,
  PASSIVE_INCOME_MULT,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TOWN_BASE_GOLD_PER_MIN,
  townFoodUpkeepPerMinute,
  townPopulationMultiplier
} from "@border-empires/game-domain";
import { converterModeOf } from "@border-empires/shared";
import { converterOutputPerMinute, structureUpkeepPerMinute } from "./player-update-economy-converters.js";
import {
  buildConnectedTownNetworkForPlayer,
  buildFedTownKeys,
  dockBaseGoldPerMinuteForPlayer,
  enrichTownWithConnectedNetwork,
  firstThreeTownKeysForPlayer,
  firstThreeTownsGoldOutputMultiplierForPlayer,
  countSupportedStructures,
  hasSupportedStructure,
  supportTileBelongsToTown,
  type ConnectedTownNetworkEntry,
  type DockEconomyContext,
  type EconomyPlayer
} from "../economy-network/economy-network.js";
import { supportedConverterGoldPerMinuteForTown } from "../economy-network/economy-network-converter-support.js";
import type { PlayerRuntimeSummary } from "../player-runtime-summary.js";
import { multiplicativeEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";
import { radiusStructureKeysForSettledTiles } from "../tile-yield-view/tile-yield-view.js";

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
type UpkeepPerMinute = { food: number; titanium: number; umbrite: number; crystal: number; gold: number };
type UpkeepLastTick = {
  foodCoverage: number;
  gold: { contributors: EconomyBucket[] };
  food: { contributors: EconomyBucket[] };
  titanium: { contributors: EconomyBucket[] };
  crystal: { contributors: EconomyBucket[] };
  umbrite: { contributors: EconomyBucket[] };
};

export type PlayerUpdateEconomySnapshot = {
  incomePerMinute: number;
  goldCapIncomePerMinute: number;
  strategicProductionPerMinute: Record<StrategicResourceKey, number>;
  upkeepPerMinute: UpkeepPerMinute;
  upkeepLastTick: UpkeepLastTick;
  economyBreakdown: EconomyBreakdown;
};

const emptyStrategic = (): Record<StrategicResourceKey, number> => ({
  FOOD: 0,
  TITANIUM: 0,
  CRYSTAL: 0,
  UMBRITE: 0,
  SHARD: 0
});

// Rounding precision here (and on every other .toFixed(...) in this file)
// was bumped from 4 to 6 decimal places for the gold rescope (docs/
// manpower-economy-rewrite-plan.md §6.1): gold amounts are now ~288x
// smaller, and 4dp rounding on intermediate bucket sums was coarse enough
// relative to the new magnitudes that two independently-accumulated chains
// (e.g. incomePerMinute vs goldCapIncomePerMinute with no cap multiplier
// active) could round to different 4th-decimal values despite being
// mathematically identical. 6dp restores that invariant at the new scale.
const addBucket = (
  buckets: Map<string, EconomyBucket>,
  label: string,
  amountPerMinute: number,
  options: { count?: number; resourceKey?: EconomyResourceKey; note?: string } = {}
): void => {
  if (!(amountPerMinute > 0)) return;
  const current = buckets.get(label);
  if (current) {
    current.amountPerMinute = Number((current.amountPerMinute + amountPerMinute).toFixed(6));
    current.count += options.count ?? 1;
    return;
  }
  buckets.set(label, {
    label,
    amountPerMinute: Number(amountPerMinute.toFixed(6)),
    count: options.count ?? 1,
    ...(options.resourceKey ? { resourceKey: options.resourceKey } : {}),
    ...(options.note ? { note: options.note } : {})
  });
};

const sortedBuckets = (buckets: Map<string, EconomyBucket>): EconomyBucket[] =>
  [...buckets.values()].sort((left, right) => (right.amountPerMinute - left.amountPerMinute) || left.label.localeCompare(right.label));

// FOOD joined TITANIUM/CRYSTAL/UMBRITE as slot-based, not produced (docs/manpower-
// economy-rewrite-plan.md §5.4) — there's only one food mechanic now (slot
// dormancy). FARM/FISH still grant FOOD *slot supply* (structure-slots.ts),
// a separate, untouched mechanism.
const strategicProductionPerMinuteForResource = (_resource: DomainTileState["resource"] | undefined): number => 0;

const strategicResourceForTile = (resource: DomainTileState["resource"] | undefined): StrategicResourceKey | undefined => {
  switch (resource) {
    case "FARM":
    case "FISH":
      return "FOOD";
    default:
      return undefined;
  }
};

export { townFoodUpkeepPerMinute, townPopulationMultiplier };
export { converterOutputPerMinute, structureUpkeepPerMinute } from "./player-update-economy-converters.js";
export { buildFedTownKeys, hasSupportedStructure } from "../economy-network/economy-network.js";

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

export const buildStrategicProductionForSettledTiles = (
  summary: PlayerRuntimeSummary,
  settledTiles: readonly DomainTileState[],
  waterworksKeys: ReadonlySet<string> = radiusStructureKeysForSettledTiles(settledTiles).waterworksKeys
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

export const townGoldPerMinuteForPlayer = (
  player: EconomyPlayer,
  tile: DomainTileState,
  town: NonNullable<DomainTileState["town"]>,
  tiles: ReadonlyMap<string, DomainTileState>,
  fedTownKeys: ReadonlySet<string>,
  firstThreeTownKeys: ReadonlySet<string> = new Set<string>(),
  connectedClearingHouseKeys?: readonly string[],
  // §5.4: dormant economicStructure tile keys ("x,y") for this player — a
  // dormant Mintworks/Caravanary/Clearing House stops granting its gold
  // bonus, same as hasSupportedStructure's matching param.
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set(),
  // Mintworks-style attribution: gold/minute from active EXCHANGE-mode
  // converters (Aether Condenser/Titanium Works/Umbrite Works) in this
  // town's support ring — see supportedConverterGoldPerMinuteForTown.
  // Excluded for SETTLEMENT-tier towns via the early return below, same gate
  // MINTWORKS_FLAT_GOLD_BONUS_PER_MIN already uses.
  converterGoldPerMinute: number = 0
): number => {
  const incomeMultiplier = player.mods?.income ?? 1;
  const tileKey = `${tile.x},${tile.y}`;
  const isSettlement = town.populationTier === "SETTLEMENT" || !town.populationTier;
  if (isSettlement) return SETTLEMENT_BASE_GOLD_PER_MIN * incomeMultiplier * PASSIVE_INCOME_MULT;
  if (!fedTownKeys.has(tileKey)) return 0;
  const support = supportSummaryForTown(player.id, tile, tiles);
  const supportRatio = support.supportMax <= 0 ? 1 : support.supportCurrent / support.supportMax;
  // mintworks-stacking task: MINTWORKS's gold bonus stacks additively per active
  // Mintworks in the support ring (mintworksGoldProductionMultiplier), not a
  // boolean "any Mintworks" gate — see countSupportedStructures.
  const mintworksCount = countSupportedStructures(player.id, tile, "MINTWORKS", tiles, dormantEconomicStructureKeys);
  // connectedClearingHouseKeys is pre-filtered to ONLY towns with a CH at
  // network-build time. Re-verify defensively — a progression command may
  // have destroyed a CH between build and read — but the candidate set is
  // O(#CH_towns), not O(#connected_towns), so this is O(1) in practice.
  const clearingHouseActive =
    hasSupportedStructure(player.id, tile, "CLEARING_HOUSE", tiles, false, dormantEconomicStructureKeys) ||
    (connectedClearingHouseKeys ?? []).some((key) => {
      const connectedTile = tiles.get(key);
      return connectedTile
        ? hasSupportedStructure(player.id, connectedTile, "CLEARING_HOUSE", tiles, false, dormantEconomicStructureKeys)
        : false;
    });
  const firstThreeTownMult = firstThreeTownKeys.has(tileKey)
    ? firstThreeTownsGoldOutputMultiplierForPlayer(player)
    : 1;
  return (
    TOWN_BASE_GOLD_PER_MIN *
    supportRatio *
    townPopulationMultiplier(town.populationTier) *
    (1 + (town.connectedTownBonus ?? 0)) *
    mintworksGoldProductionMultiplier(mintworksCount, clearingHouseActive) *
    firstThreeTownMult *
    incomeMultiplier *
    PASSIVE_INCOME_MULT
  ) + MINTWORKS_FLAT_GOLD_BONUS_PER_MIN * mintworksCount + converterGoldPerMinute;
};

export { refreshTownEconomyFields } from "./player-update-economy-refresh.js";

export const buildPlayerUpdateEconomySnapshot = (
  player: DomainPlayer,
  summary: PlayerRuntimeSummary,
  tiles: ReadonlyMap<string, DomainTileState>,
  dockContext?: Pick<DockEconomyContext, "dockLinksByDockTileKey">,
  integrityEconMult: number = 1,
  // Reuse a caller-shared network so buildConnectedTownNetworkForPlayer
  // (O(settled_tiles + towns^2)) doesn't rebuild twice per cache-miss cycle.
  prebuiltTownNetwork?: ReadonlyMap<string, ConnectedTownNetworkEntry>,
  // §5.4: which of this player's towns have a dormant FOOD slot right now
  // (Runtime.foodDormantTownKeysForPlayer) — defaults to "nobody's dormant"
  // for callers that don't have Runtime access (dev-assert cross-checks).
  foodDormantTownKeys: ReadonlySet<string> = new Set(),
  // §5.4: dormant economicStructure tile keys for this player
  // (Runtime.dormantEconomicStructureKeysForPlayer) — same default-empty
  // convention as foodDormantTownKeys above.
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set(),
  // Capture resets modeLockedUntil as its shock timer (capture-structures.ts,
  // no separate captureShockUntil field) — EXCHANGE payout is suppressed
  // while mode is locked, from a build, flip, or capture reset alike.
  now: number = Date.now()
): PlayerUpdateEconomySnapshot => {
  const incomeMultiplier = player.mods?.income ?? 1;
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
  // radiusStructureKeysForSettledTiles is a radius scan over every settled
  // tile; compute it once and thread it through both the empire-wide
  // production total and the per-tile Farmstead breakdown below.
  const { waterworksKeys } = radiusStructureKeysForSettledTiles(settledTiles);
  const strategicProductionPerMinute = buildStrategicProductionForSettledTiles(summary, settledTiles, waterworksKeys);

  const fedTownKeys = buildFedTownKeys(player.id, summary, tiles, foodDormantTownKeys);
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
  const addUpkeepSinks = (label: string, upkeep: Partial<Record<EconomyResourceKey, number>>): void => {
    if (upkeep.GOLD) addBucket(goldSinks, label, upkeep.GOLD, { count: 1 });
    if (upkeep.FOOD) addBucket(foodSinks, label, upkeep.FOOD, { count: 1 });
    if (upkeep.CRYSTAL) addBucket(crystalSinks, label, upkeep.CRYSTAL, { count: 1 });
    if (upkeep.TITANIUM) addBucket(titaniumSinks, label, upkeep.TITANIUM, { count: 1 });
    if (upkeep.UMBRITE) addBucket(umbriteSinks, label, upkeep.UMBRITE, { count: 1 });
  };
  const dockEconomyContext = dockContext
    ? { tiles, dockLinksByDockTileKey: dockContext.dockLinksByDockTileKey, dormantEconomicStructureKeys }
    : undefined;
  const townNetwork =
    prebuiltTownNetwork ??
    buildConnectedTownNetworkForPlayer(player, tiles, settledTiles, { maxConnectedTownNames: 0, dormantEconomicStructureKeys });
  const firstThreeTownKeys = firstThreeTownKeysForPlayer(player.id, summary.ownedTownTierByTile.entries());
  // Mintworks-style attribution (§built-like-Mintworks): an EXCHANGE-mode
  // converter in a town's support ring pays its gold through that town's own
  // production instead of as separate empire income — computed once per town
  // here so the main settled-tile loop below can (a) add each town's share
  // into its own goldPerMinute and (b) skip re-adding the same structure's
  // gold as a standalone bucket (townClaimedConverterKeys).
  const converterTownBonusByTileKey = new Map<string, number>();
  const townClaimedConverterKeys = new Set<string>();
  for (const townTile of orderedTownTiles) {
    const bonus = supportedConverterGoldPerMinuteForTown(player.id, townTile, tiles, dormantEconomicStructureKeys, now);
    if (bonus.total > 0) {
      converterTownBonusByTileKey.set(`${townTile.x},${townTile.y}`, bonus.total);
      for (const key of bonus.claimedTileKeys) townClaimedConverterKeys.add(key);
    }
  }
  const townGoldCapMult = multiplicativeEffectForPlayer(player, "townGoldCapMult");
  const dockGoldCapMult = multiplicativeEffectForPlayer(player, "dockGoldCapMult");
  let goldCapIncomePerMinute = 0;

  for (const tile of settledTiles) {
    const resourceKey = strategicResourceForTile(tile.resource);
    const resourceRate = strategicProductionPerMinuteForResource(tile.resource);
    if (resourceKey && resourceRate > 0) {
      const target =
        resourceKey === "FOOD" ? foodSources :
        resourceKey === "TITANIUM" ? titaniumSources :
        resourceKey === "CRYSTAL" ? crystalSources :
        umbriteSources;
      addBucket(
        target,
        tile.resource === "FARM" ? "Grain" :
          tile.resource === "FISH" ? "Fish" :
          tile.resource === "TITANIUM" ? "Titanium" :
          tile.resource === "GEMS" ? "Crystal" :
          "Umbrite",
        resourceRate,
        { count: 1, resourceKey }
      );
    }
    if (tile.town) {
      const tileKey = `${tile.x},${tile.y}`;
      const town = enrichTownWithConnectedNetwork(tile, townNetwork) ?? tile.town;
      const connectedClearingHouseKeys = townNetwork.get(tileKey)?.connectedClearingHouseKeys;
      const goldPerMinute = townGoldPerMinuteForPlayer(
        player,
        tile,
        town,
        tiles,
        fedTownKeys,
        firstThreeTownKeys,
        connectedClearingHouseKeys,
        dormantEconomicStructureKeys,
        converterTownBonusByTileKey.get(tileKey) ?? 0
      );
      if (goldPerMinute > 0) addBucket(goldSources, "Towns", goldPerMinute, { count: 1 });
      addBucket(foodSinks, "Town", townFoodUpkeepPerMinute(town.populationTier), { count: 1 });
      const isSettlement = town.populationTier === "SETTLEMENT" || !town.populationTier;
      goldCapIncomePerMinute += goldPerMinute * (isSettlement ? 1 : townGoldCapMult);
    }
    if (tile.dockId) {
      const dockGoldPerMinute = dockBaseGoldPerMinuteForPlayer(tile, player, dockEconomyContext) * incomeMultiplier * PASSIVE_INCOME_MULT;
      addBucket(goldSources, "Docks", dockGoldPerMinute > 0 ? dockGoldPerMinute : DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT, { count: 1 });
      goldCapIncomePerMinute += dockGoldPerMinute * dockGoldCapMult;
    }
    // Observatory's CRYSTAL slot is still its only upkeep; Fort/Siege Outpost now also drain FOOD + their resource (below).
    const structure = tile.economicStructure;
    if (structure?.ownerId === player.id && structure.status === "active") {
      const mode = converterModeOf(structure);
      addUpkeepSinks(structure.type, structureUpkeepPerMinute(structure.type, mode));
      const output = converterOutputPerMinute(structure.type, mode);
      if (output.TITANIUM) addBucket(titaniumSources, structure.type, output.TITANIUM, { count: 1 });
      if (output.CRYSTAL) addBucket(crystalSources, structure.type, output.CRYSTAL, { count: 1 });
      if (output.UMBRITE) addBucket(umbriteSources, structure.type, output.UMBRITE, { count: 1 });
      // §5.4: a dormant converter (slot supply can't cover its demand) is
      // still "active" in construction terms but pays out nothing — reuse the
      // same dormantEconomicStructureKeys the rest of the economy honors.
      // Also suppressed while mode-locked (build/flip/capture-reset), and
      // routed through incomeMultiplier/PASSIVE_INCOME_MULT like every other
      // passive gold source (§Phase 4 headroom caveat).
      const modeLocked = typeof structure.modeLockedUntil === "number" && structure.modeLockedUntil > now;
      // A converter claimed by a town's support ring (townClaimedConverterKeys)
      // already had its gold folded into that town's own "Towns" bucket above
      // (Mintworks-style attribution) — adding it again here would double-pay it.
      if (output.GOLD && !modeLocked && !dormantEconomicStructureKeys.has(`${tile.x},${tile.y}`) && !townClaimedConverterKeys.has(`${tile.x},${tile.y}`)) {
        addBucket(goldSources, structure.type, output.GOLD * incomeMultiplier * PASSIVE_INCOME_MULT, { count: 1 });
      }
    }
    for (const military of [tile.fort, tile.siegeOutpost]) {
      if (military?.ownerId === player.id && military.status === "active" && military.variant) {
        addUpkeepSinks(military.variant, structureUpkeepPerMinute(military.variant));
      }
    }
  }

  const upkeepPerMinute = {
    food: Number([...foodSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(6)),
    titanium: Number([...titaniumSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(6)),
    umbrite: Number([...umbriteSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(6)),
    crystal: Number([...crystalSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(6)),
    gold: Number([...goldSinks.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(6))
  };
  const rawIncomePerMinute = Number([...goldSources.values()].reduce((sum, bucket) => sum + bucket.amountPerMinute, 0).toFixed(6));
  const foodCoverage =
    upkeepPerMinute.food <= 0
      ? 1
      : Math.max(0, Math.min(1, (((player.strategicResources?.FOOD ?? 0) + strategicProductionPerMinute.FOOD) / upkeepPerMinute.food)));

  // Apply integrity multiplier after the food-gate so intermediate food logic is undisturbed.
  const incomePerMinute = Number((rawIncomePerMinute * integrityEconMult).toFixed(6));

  return {
    incomePerMinute,
    goldCapIncomePerMinute: Number((goldCapIncomePerMinute * integrityEconMult).toFixed(6)),
    strategicProductionPerMinute: {
      FOOD: Number((strategicProductionPerMinute.FOOD * integrityEconMult).toFixed(6)),
      TITANIUM: Number((strategicProductionPerMinute.TITANIUM * integrityEconMult).toFixed(6)),
      CRYSTAL: Number((strategicProductionPerMinute.CRYSTAL * integrityEconMult).toFixed(6)),
      UMBRITE: Number((strategicProductionPerMinute.UMBRITE * integrityEconMult).toFixed(6)),
      SHARD: Number((strategicProductionPerMinute.SHARD * integrityEconMult).toFixed(6))
    },
    upkeepPerMinute,
    upkeepLastTick: {
      foodCoverage: Number(foodCoverage.toFixed(6)),
      gold: { contributors: sortedBuckets(goldSinks) },
      food: { contributors: sortedBuckets(foodSinks) },
      titanium: { contributors: sortedBuckets(titaniumSinks) },
      crystal: { contributors: sortedBuckets(crystalSinks) },
      umbrite: { contributors: sortedBuckets(umbriteSinks) }
    },
    economyBreakdown: {
      GOLD: { sources: sortedBuckets(goldSources), sinks: sortedBuckets(goldSinks) },
      FOOD: { sources: sortedBuckets(foodSources), sinks: sortedBuckets(foodSinks) },
      TITANIUM: { sources: sortedBuckets(titaniumSources), sinks: sortedBuckets(titaniumSinks) },
      CRYSTAL: { sources: sortedBuckets(crystalSources), sinks: sortedBuckets(crystalSinks) },
      UMBRITE: { sources: sortedBuckets(umbriteSources), sinks: sortedBuckets(umbriteSinks) },
      SHARD: { sources: sortedBuckets(shardSources), sinks: [] }
    }
  };
};
