import {
  LONG_PEACE_GROWTH_MULT,
  LONG_PEACE_MS,
  MINTWORKS_FLAT_GOLD_BONUS_PER_MIN,
  mintworksGoldProductionMultiplier,
  PASSIVE_INCOME_MULT,
  POPULATION_GROWTH_BASE_RATE,
  granaryGrowthMultiplier,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  SETTLEMENT_GROWTH_RATE_MULT,
  TOWN_BASE_GOLD_PER_MIN,
  TOWN_MODIFIER_AGGREGATE_TYPES,
  townModifierTotalsFromCounts
} from "@border-empires/game-domain";
import { nextTownGrowthUpgrade, type Tile } from "@border-empires/shared";
import {
  buildConnectedTownNetworkForPlayer,
  enrichTownWithConnectedNetwork,
  firstThreeTownsGoldOutputMultiplierForPlayer,
  firstThreeTownsPopulationGrowthMultiplierForPlayer,
  type ConnectedTownNetworkEntry
} from "./economy-network/economy-network.js";
import {
  type RuntimeState,
  keyFor,
  parseTown,
  parseStructure,
  toDomainTile,
  snapshotEconomyPlayer
} from "./snapshot-tile-cache.js";
import {
  isCompleteTownSummary,
  resolvedTownPopulation,
  townFoodUpkeepPerMinute,
  townPopulationMultiplier
} from "./snapshot-economy-helpers.js";

export const supportSummaryForTown = (
  tileKey: string,
  ownerId: string,
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>
): { supportCurrent: number; supportMax: number } => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { supportCurrent: 0, supportMax: 0 };
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!tile || tile.terrain !== "LAND") continue;
      if (!supportTileBelongsToTown(tile, x, y, ownerId, tilesByKey)) continue;
      supportMax += 1;
      if (tile.ownerId === ownerId && tile.ownershipState === "SETTLED") supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

export const hasSupportedStructure = (
  tileKey: string,
  ownerId: string,
  structureType: string | readonly string[],
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>,
  // §5.4: dormant economicStructure tile keys ("x,y") for this player — see
  // economy-network.ts's hasSupportedStructure (this is the reconnect-path
  // duplicate, operating on wire-shaped RuntimeState tiles instead of
  // DomainTileState).
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set()
): boolean => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  const allowed = Array.isArray(structureType) ? new Set(structureType) : new Set([structureType as string]);
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!tile || tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
      if (!supportTileBelongsToTown(tile, x, y, ownerId, tilesByKey)) continue;
      const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
      if (
        structure?.status === "active" &&
        structure.type &&
        allowed.has(structure.type) &&
        !dormantEconomicStructureKeys.has(keyFor(tile.x, tile.y))
      ) {
        return true;
      }
    }
  }
  return false;
};

/**
 * Counting sibling of hasSupportedStructure above (same wire-shaped
 * RuntimeState tiles, same support-ring adjacency loop) for structures whose
 * bonus stacks per active instance rather than gating on "any one exists" —
 * mintworks-stacking task: Mintworks's town gold production bonus is additive per
 * active Mintworks in the support ring. Unlike economy-network.ts's
 * countSupportedStructures, this deliberately mirrors THIS file's existing
 * hasSupportedStructure loop exactly (support-ring only, no on-tile check) —
 * that's the pre-existing shape every hasMintworks call site in this file
 * already used, so this keeps the reconnect-path counting logic consistent
 * with itself rather than importing the domain-tile variant's dual-check
 * semantics.
 */
export const countSupportedStructures = (
  tileKey: string,
  ownerId: string,
  structureType: string,
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>,
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set()
): number => {
  const [rawX, rawY] = tileKey.split(",");
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const tile = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!tile || tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED") continue;
      if (!supportTileBelongsToTown(tile, x, y, ownerId, tilesByKey)) continue;
      const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
      if (
        structure?.status === "active" &&
        structure.type === structureType &&
        !dormantEconomicStructureKeys.has(keyFor(tile.x, tile.y))
      ) {
        count += 1;
      }
    }
  }
  return count;
};

const clearingHouseSourceTownNames = (
  tileKey: string,
  ownerId: string,
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>,
  townNetwork?: ReadonlyMap<string, ConnectedTownNetworkEntry>,
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set()
): string[] =>
  [tileKey, ...(townNetwork?.get(tileKey)?.connectedClearingHouseKeys ?? [])].flatMap((sourceKey) =>
    hasSupportedStructure(sourceKey, ownerId, "CLEARING_HOUSE", tilesByKey, dormantEconomicStructureKeys)
      ? [tilesByKey.get(sourceKey) ? parseTown(tilesByKey.get(sourceKey)!)?.name ?? `town at ${sourceKey}` : `town at ${sourceKey}`]
      : []
  );

export const supportTileBelongsToTown = (
  supportTile: RuntimeState["tiles"][number],
  townX: number,
  townY: number,
  ownerId: string,
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>
): boolean => {
  let assignedTown: RuntimeState["tiles"][number] | undefined;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const candidate = tilesByKey.get(keyFor(supportTile.x + dx, supportTile.y + dy));
      if (!candidate || candidate.ownerId !== ownerId || candidate.ownershipState !== "SETTLED") continue;
      if (!candidate.townType || candidate.townPopulationTier === "SETTLEMENT") continue;
      if (!assignedTown || candidate.x < assignedTown.x || (candidate.x === assignedTown.x && candidate.y < assignedTown.y)) {
        assignedTown = candidate;
      }
    }
  }
  return assignedTown?.x === townX && assignedTown.y === townY;
};

// Unified building modifier display (stage 2, widened): the actual bucketing
// math (which types aggregate, how per-copy counts turn into a stat total)
// lives in game-domain's townModifierTotalsFromCounts — this function's only
// job is deriving this town's own per-type counts from the support ring.
// Do not reimplement the aggregation math here; it used to be duplicated
// between this file and the gateway's tile-detail-snapshot.ts (the separate
// REQUEST_TILE_DETAIL path), and the gateway's copy was simply missing,
// which is exactly why the aggregate never reached the tile popup at all.
const townModifierTotalsForTown = (
  tileKey: string,
  ownerId: string,
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>,
  dormantEconomicStructureKeys: ReadonlySet<string>,
  clearingHouseActive: boolean
): NonNullable<Tile["town"]>["townModifierTotals"] => {
  const countsByType: Partial<Record<(typeof TOWN_MODIFIER_AGGREGATE_TYPES)[number], number>> = {};
  for (const type of TOWN_MODIFIER_AGGREGATE_TYPES) {
    countsByType[type] = countSupportedStructures(tileKey, ownerId, type, tilesByKey, dormantEconomicStructureKeys);
  }
  return townModifierTotalsFromCounts(countsByType, { clearingHouseActive });
};

export const buildTownSummary = (
  tile: RuntimeState["tiles"][number],
  player: RuntimeState["players"][number] | undefined,
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>,
  fedTownKeys: ReadonlySet<string>,
  refreshCompleteTownSummary: boolean,
  townNetwork?: ReadonlyMap<string, ConnectedTownNetworkEntry>,
  firstThreeTownKeys?: ReadonlySet<string>,
  nearbyWarTownKeys?: ReadonlySet<string>,
  seedGranaryBuffedTileKeys?: ReadonlySet<string>,
  // §5.4: dormant economicStructure tile keys ("x,y") for this player — a
  // dormant Mintworks/Bank/Caravanary/Clearing House/Granary/Seed Granary
  // stops granting its bonus.
  dormantEconomicStructureKeys: ReadonlySet<string> = new Set()
): Tile["town"] | undefined => {
  const partial = parseTown(tile);
  const townType = partial?.type ?? tile.townType;
  if (!partial && !townType) return undefined;
  const tileKey = keyFor(tile.x, tile.y);
  const populationTier = partial?.populationTier ?? tile.townPopulationTier ?? "SETTLEMENT";
  const authoritativeTown = {
    ...(partial ?? {}),
    ...(tile.townName ? { name: tile.townName } : {}),
    ...(townType ? { type: townType } : {}),
    populationTier
  };
  const networkTown = enrichTownWithConnectedNetwork(toDomainTile(tile, authoritativeTown), townNetwork);
  const townPartial = networkTown ? { ...authoritativeTown, ...networkTown } : authoritativeTown;
  const hasCompleteAuthoritativeTown = isCompleteTownSummary(townPartial);
  const captureShockUntil = typeof townPartial.captureShockUntil === "number" ? townPartial.captureShockUntil : undefined;
  const isInCaptureShock = typeof captureShockUntil === "number" && captureShockUntil > Date.now();
  if (!refreshCompleteTownSummary && hasCompleteAuthoritativeTown && !isInCaptureShock) return townPartial;
  const isSettlement = populationTier === "SETTLEMENT";
  const support = tile.ownerId && tile.ownershipState === "SETTLED" && !isSettlement
    ? supportSummaryForTown(tileKey, tile.ownerId, tilesByKey)
    : { supportCurrent: 0, supportMax: 0 };
  const supportRatio = support.supportMax <= 0 ? 1 : support.supportCurrent / support.supportMax;
  const isFed = tile.ownerId ? fedTownKeys.has(tileKey) : false;
  const mintworksCount = tile.ownerId ? countSupportedStructures(tileKey, tile.ownerId, "MINTWORKS", tilesByKey, dormantEconomicStructureKeys) : 0;
  const hasMintworks = mintworksCount > 0;
  const hasGranary = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "GRANARY", tilesByKey, dormantEconomicStructureKeys));
  const hasSeedGranary = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "SEED_GRANARY", tilesByKey, dormantEconomicStructureKeys));
  const hasAnyGranary = hasGranary || hasSeedGranary;
  const seedGranaryBuffed = hasAnyGranary && Boolean(seedGranaryBuffedTileKeys && tile.ownerId && (() => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nk = keyFor(tile.x + dx, tile.y + dy);
        if (seedGranaryBuffedTileKeys.has(nk)) {
          const nTile = tilesByKey.get(nk);
          if (nTile?.ownerId === tile.ownerId) return true;
        }
      }
    }
    return false;
  })());
  // Incubation Engine (Granary) grants an instant one-time population burst
  // on completion (GRANARY_INSTANT_POPULATION_BURST,
  // runtime-structure-command-handlers.ts) PLUS a flat ongoing growth-rate
  // multiplier (GRANARY_ONGOING_GROWTH_MULT). Seed Granary's own
  // buffed-radius multiplier stacks on top when it applies — see
  // granaryGrowthMultiplier's doc comment in server-game-constants.ts for
  // the full formula and history.
  const granaryGrowthMult = granaryGrowthMultiplier(hasAnyGranary, seedGranaryBuffed);
  const clearingHouseTownNames = tile.ownerId ? clearingHouseSourceTownNames(tileKey, tile.ownerId, tilesByKey, townNetwork, dormantEconomicStructureKeys) : [], clearingHouseActive = clearingHouseTownNames.length > 0;
  const incomeMultiplier = player?.incomeMultiplier ?? 1;
  const economyPlayer = snapshotEconomyPlayer(player);
  const firstThreeTownMult =
    economyPlayer && firstThreeTownKeys?.has(tileKey)
      ? firstThreeTownsGoldOutputMultiplierForPlayer(economyPlayer)
      : 1;
  const firstThreeTownPopGrowthMult =
    economyPlayer && firstThreeTownKeys?.has(tileKey)
      ? firstThreeTownsPopulationGrowthMultiplierForPlayer(economyPlayer)
      : 1;
  const baseGoldPerMinute = isSettlement ? SETTLEMENT_BASE_GOLD_PER_MIN : TOWN_BASE_GOLD_PER_MIN;
  const goldPerMinute =
    !tile.ownerId || tile.ownershipState !== "SETTLED"
      ? 0
      : isSettlement
        ? baseGoldPerMinute * incomeMultiplier * PASSIVE_INCOME_MULT
        : !isFed
          ? 0
          : (
              TOWN_BASE_GOLD_PER_MIN *
              supportRatio *
              townPopulationMultiplier(populationTier) *
              (1 + (townPartial.connectedTownBonus ?? 0)) *
              mintworksGoldProductionMultiplier(mintworksCount, clearingHouseActive) *
              firstThreeTownMult *
              incomeMultiplier *
              PASSIVE_INCOME_MULT
            ) + MINTWORKS_FLAT_GOLD_BONUS_PER_MIN * mintworksCount;
  const populationView = resolvedTownPopulation(townPartial, tile.x, tile.y, populationTier);
  if (!populationView && !hasCompleteAuthoritativeTown) return undefined;
  const population = populationView?.population ?? townPartial.population!;
  const maxPopulation = populationView?.maxPopulation ?? townPartial.maxPopulation!;
  const logisticFactor = 1 - population / Math.max(1, maxPopulation);
  const hasNearbyWar = nearbyWarTownKeys?.has(tileKey) ?? false;
  const hasLongPeace = !hasNearbyWar && (
    !townPartial.nearbyWarLastAt || Date.now() - townPartial.nearbyWarLastAt >= LONG_PEACE_MS
  );
  const naturalGrowth =
    !tile.ownerId || tile.ownershipState !== "SETTLED" || !isFed || logisticFactor <= 0
      ? 0
      : population *
        POPULATION_GROWTH_BASE_RATE *
        (populationTier === "SETTLEMENT" ? SETTLEMENT_GROWTH_RATE_MULT : 1) *
        granaryGrowthMult *
        firstThreeTownPopGrowthMult *
        (hasLongPeace ? LONG_PEACE_GROWTH_MULT : 1) *
        logisticFactor;
  const baseGrowth = isInCaptureShock ? 0 : naturalGrowth;
  // Modifier precedence:
  //   1. Recently captured (capture-shock smoke is active even when growth is
  //      already zero, so surface the blocker explicitly instead of falling
  //      through to stale long-peace copy).
  //   2. Nearby war (negative — 60-min stamped pause from recent nearby combat).
  //   3. Long time peace (positive — 24 h of no nearby combat near this town).
  const growthModifiers = isInCaptureShock
    ? [{ label: "Recently captured" as const, deltaPerMinute: -Number(naturalGrowth.toFixed(4)) }]
    : hasNearbyWar && baseGrowth > 0
      ? [{ label: "Nearby war" as const, deltaPerMinute: -Number(baseGrowth.toFixed(4)) }]
      : hasLongPeace && baseGrowth > 0
        ? [{
            label: "Long time peace" as const,
            deltaPerMinute: Number((baseGrowth * (1 - 1 / LONG_PEACE_GROWTH_MULT)).toFixed(4))
          }]
        : [];
  const cap = isSettlement
    ? goldPerMinute * 60 * 8
    : goldPerMinute * 60 * 8 * mintworksGoldProductionMultiplier(mintworksCount, clearingHouseActive);
  const nextPopulationTierUpgrade = tile.ownerId && tile.ownershipState === "SETTLED"
    ? nextTownGrowthUpgrade(populationTier, population)
    : undefined;
  const townModifierTotals =
    tile.ownerId && tile.ownershipState === "SETTLED" && !isSettlement
      ? townModifierTotalsForTown(tileKey, tile.ownerId, tilesByKey, dormantEconomicStructureKeys, clearingHouseActive)
      : undefined;
  return {
    ...(townPartial.name ? { name: townPartial.name } : {}),
    type: townType!,
    baseGoldPerMinute: Number(baseGoldPerMinute.toFixed(4)),
    supportCurrent: support.supportCurrent,
    supportMax: support.supportMax,
    goldPerMinute: Number(goldPerMinute.toFixed(4)),
    cap: Number(cap.toFixed(4)),
    isFed,
    population,
    maxPopulation,
    populationGrowthPerMinute: Number(baseGrowth.toFixed(4)),
    populationTier,
    connectedTownCount: typeof townPartial.connectedTownCount === "number" ? townPartial.connectedTownCount : 0,
    connectedTownBonus: typeof townPartial.connectedTownBonus === "number" ? townPartial.connectedTownBonus : 0,
    ...(Array.isArray(townPartial.connectedTownNames) ? { connectedTownNames: townPartial.connectedTownNames } : {}),
    hasMintworks,
    mintworksActive: hasMintworks && isFed,
    mintworksCount,
    hasGranary,
    granaryActive: hasGranary,
    ...(hasSeedGranary ? { hasSeedGranary: true, seedGranaryActive: true } : {}),
    ...(seedGranaryBuffed ? { seedGranaryBuffed: true } : {}),
    ...(clearingHouseActive ? { hasClearingHouse: true, clearingHouseActive: true, clearingHouseTownNames } : {}),
    foodUpkeepPerMinute: townFoodUpkeepPerMinute(populationTier),
    ...(typeof captureShockUntil === "number" ? { captureShockUntil } : {}),
    ...(typeof townPartial.populationBeforeCapture === "number" ? { populationBeforeCapture: townPartial.populationBeforeCapture } : {}),
    ...(growthModifiers.length > 0 ? { growthModifiers } : {}),
    ...(nextPopulationTierUpgrade ? { nextPopulationTierUpgrade } : {}),
    ...(townModifierTotals && townModifierTotals.length > 0 ? { townModifierTotals } : {})
  };
};

export { buildConnectedTownNetworkForPlayer };
