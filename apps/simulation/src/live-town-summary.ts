import {
  LONG_PEACE_GROWTH_MULT,
  LONG_PEACE_MS,
  PASSIVE_INCOME_MULT,
  POPULATION_GROWTH_BASE_RATE,
  SEED_GRANARY_GROWTH_MULT,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TOWN_BASE_GOLD_PER_MIN
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
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>
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
      if (structure?.status === "active" && structure.type && allowed.has(structure.type)) return true;
    }
  }
  return false;
};

const clearingHouseSourceTownNames = (tileKey: string, ownerId: string, tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>, townNetwork?: ReadonlyMap<string, ConnectedTownNetworkEntry>): string[] => [tileKey, ...(townNetwork?.get(tileKey)?.connectedTownKeys ?? [])].flatMap((sourceKey) => hasSupportedStructure(sourceKey, ownerId, "CLEARING_HOUSE", tilesByKey) ? [tilesByKey.get(sourceKey) ? parseTown(tilesByKey.get(sourceKey)!)?.name ?? `town at ${sourceKey}` : `town at ${sourceKey}`] : []);

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

export const buildTownSummary = (
  tile: RuntimeState["tiles"][number],
  player: RuntimeState["players"][number] | undefined,
  tilesByKey: ReadonlyMap<string, RuntimeState["tiles"][number]>,
  fedTownKeys: ReadonlySet<string>,
  refreshCompleteTownSummary: boolean,
  townNetwork?: ReadonlyMap<string, ConnectedTownNetworkEntry>,
  firstThreeTownKeys?: ReadonlySet<string>,
  nearbyWarTownKeys?: ReadonlySet<string>,
  seedGranaryBuffedTileKeys?: ReadonlySet<string>
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
  const hasMarket = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "MARKET", tilesByKey));
  const hasGranary = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "GRANARY", tilesByKey));
  const hasSeedGranary = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "SEED_GRANARY", tilesByKey));
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
  const granaryGrowthMult = !hasAnyGranary ? 1 : seedGranaryBuffed ? SEED_GRANARY_GROWTH_MULT : 1.15;
  const hasBank = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "BANK", tilesByKey));
  const hasCaravanary = Boolean(tile.ownerId && hasSupportedStructure(tileKey, tile.ownerId, "CARAVANARY", tilesByKey));
  const clearingHouseTownNames = tile.ownerId ? clearingHouseSourceTownNames(tileKey, tile.ownerId, tilesByKey, townNetwork) : [], clearingHouseActive = clearingHouseTownNames.length > 0;
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
              (1 + (townPartial.connectedTownBonus ?? 0) + (hasCaravanary ? 0.25 : 0)) *
              (hasMarket ? (clearingHouseActive ? 1.75 : 1.5) : 1) *
              (hasBank ? (clearingHouseActive ? 1.7 : 1.5) : 1) *
              firstThreeTownMult *
              incomeMultiplier *
              PASSIVE_INCOME_MULT
            ) + (hasBank ? (clearingHouseActive ? 1.5 : 1) : 0);
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
        (populationTier === "SETTLEMENT" ? 4 : 1) *
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
    : goldPerMinute * 60 * 8 * (hasMarket ? 1.5 : 1);
  const nextPopulationTierUpgrade = tile.ownerId && tile.ownershipState === "SETTLED"
    ? nextTownGrowthUpgrade(populationTier, population)
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
    hasMarket,
    marketActive: hasMarket && isFed,
    hasGranary,
    granaryActive: hasGranary,
    ...(hasSeedGranary ? { hasSeedGranary: true, seedGranaryActive: true } : {}),
    ...(seedGranaryBuffed ? { seedGranaryBuffed: true } : {}),
    hasBank, bankActive: hasBank, ...(clearingHouseActive ? { hasClearingHouse: true, clearingHouseActive: true, clearingHouseTownNames } : {}),
    foodUpkeepPerMinute: townFoodUpkeepPerMinute(populationTier),
    ...(typeof captureShockUntil === "number" ? { captureShockUntil } : {}),
    ...(typeof townPartial.populationBeforeCapture === "number" ? { populationBeforeCapture: townPartial.populationBeforeCapture } : {}),
    ...(growthModifiers.length > 0 ? { growthModifiers } : {}),
    ...(nextPopulationTierUpgrade ? { nextPopulationTierUpgrade } : {})
  };
};

export { buildConnectedTownNetworkForPlayer };
