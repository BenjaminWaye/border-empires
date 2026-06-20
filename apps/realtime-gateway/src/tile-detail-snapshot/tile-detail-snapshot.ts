import { OBSERVATORY_UPKEEP_PER_MIN } from "@border-empires/shared";
import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { buildTileYieldView } from "../../../simulation/src/tile-yield-view/tile-yield-view.js";

import {
  AIRPORT_CRYSTAL_UPKEEP_PER_MIN,
  BANK_FOOD_UPKEEP,
  CAMP_GOLD_UPKEEP,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP,
  CUSTOMS_HOUSE_GOLD_UPKEEP,
  FARMSTEAD_GOLD_UPKEEP,
  FOUNDRY_GOLD_UPKEEP,
  FUR_SYNTHESIZER_GOLD_UPKEEP,
  GARRISON_HALL_GOLD_UPKEEP,
  GOVERNORS_OFFICE_GOLD_UPKEEP,
  GRANARY_GOLD_UPKEEP,
  IRONWORKS_GOLD_UPKEEP,
  LIGHT_OUTPOST_GOLD_UPKEEP,
  MARKET_FOOD_UPKEEP,
  MINE_GOLD_UPKEEP,
  PASSIVE_INCOME_MULT,
  POPULATION_GROWTH_BASE_RATE,
  RADAR_SYSTEM_GOLD_UPKEEP,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TOWN_BASE_GOLD_PER_MIN,
  WOODEN_FORT_GOLD_UPKEEP
} from "@border-empires/game-domain";

type SnapshotTile = PlayerSubscriptionSnapshot["tiles"][number];
type TileUpdate = Record<string, unknown>;
type YieldSourceTile = Parameters<typeof buildTileYieldView>[0];

const keyFor = (x: number, y: number): string => `${x},${y}`;

// Keep this in sync with buildTownSummary's gpm/cap branches in
// apps/simulation/src/live-snapshot-view.ts (around lines 720-770). Used to
// backfill goldPerMinute when the snapshot tile's townJson is missing it —
// without this, the gateway-cached tile-detail path serves
// yieldRate.goldPerMinute=0 for any TOWN-tier town the snapshot didn't fully
// populate, which is the bug we're fixing. firstThreeTownMult and the player
// income multiplier aren't available here; both default to 1.0, so this may
// under-report by tech/first-three bonuses (<= ~25%) until the sim's
// authoritative response lands — vastly better than reporting 0.
const townPopulationMultiplierLocal = (tier: string): number => {
  switch (tier) {
    case "CITY": return 1.5;
    case "GREAT_CITY": return 2.5;
    case "METROPOLIS": return 3.2;
    default: return 1;
  }
};

const fallbackTownGoldPerMinute = (input: {
  isSettlement: boolean;
  isFed: boolean;
  supportCurrent: number;
  supportMax: number;
  populationTier: string;
  connectedTownBonus: number;
  hasMarket: boolean;
  hasBank: boolean;
}): number => {
  if (input.isSettlement) return SETTLEMENT_BASE_GOLD_PER_MIN * PASSIVE_INCOME_MULT;
  if (!input.isFed) return 0;
  const supportRatio = input.supportMax <= 0 ? 1 : input.supportCurrent / input.supportMax;
  return (
    TOWN_BASE_GOLD_PER_MIN *
    supportRatio *
    townPopulationMultiplierLocal(input.populationTier) *
    (1 + input.connectedTownBonus) *
    (input.hasMarket ? 1.5 : 1) *
    (input.hasBank ? 1.5 : 1) *
    PASSIVE_INCOME_MULT
  ) + (input.hasBank ? 1 : 0);
};

const fallbackTownCap = (goldPerMinute: number, isSettlement: boolean, hasMarket: boolean): number =>
  isSettlement ? goldPerMinute * 60 * 8 : goldPerMinute * 60 * 8 * (hasMarket ? 1.5 : 1);

const parseTown = (tile: SnapshotTile): Partial<import("@border-empires/shared").Tile["town"]> | undefined => {
  if (!tile?.townJson) return undefined;
  try {
    return JSON.parse(tile.townJson) as Partial<import("@border-empires/shared").Tile["town"]>;
  } catch {
    return undefined;
  }
};

const parseStructure = <T>(value?: string): T | undefined => {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
};

const supportSummaryForTown = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  ownerId: string,
  x: number,
  y: number
): { supportCurrent: number; supportMax: number } => {
  let supportCurrent = 0;
  let supportMax = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!neighbor || neighbor.terrain !== "LAND" || neighbor.dockId) continue;
      supportMax += 1;
      if (neighbor.ownerId === ownerId && neighbor.ownershipState === "SETTLED") supportCurrent += 1;
    }
  }
  return { supportCurrent, supportMax };
};

const derivedTownSupportStructures = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  ownerId: string,
  x: number,
  y: number
): { hasMarket: boolean; hasGranary: boolean; hasBank: boolean } => {
  let hasMarket = false;
  let hasGranary = false;
  let hasBank = false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!neighbor || neighbor.ownerId !== ownerId || neighbor.ownershipState !== "SETTLED") continue;
      const structure = parseStructure<{ type?: string; status?: string }>(neighbor.economicStructureJson);
      if (!structure || structure.status !== "active") continue;
      if (structure.type === "MARKET") hasMarket = true;
      if (structure.type === "GRANARY") hasGranary = true;
      if (structure.type === "BANK") hasBank = true;
    }
  }
  return { hasMarket, hasGranary, hasBank };
};

const derivedTownIsFed = (
  tilesByKey: ReadonlyMap<string, SnapshotTile>,
  ownerId: string,
  x: number,
  y: number
): boolean => {
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const neighbor = tilesByKey.get(keyFor(x + dx, y + dy));
      if (!neighbor || neighbor.ownerId !== ownerId || neighbor.ownershipState !== "SETTLED") continue;
      if (neighbor.resource === "FARM" || neighbor.resource === "FISH") return true;
    }
  }
  return false;
};

const snapshotFoodCoverage = (snapshot: PlayerSubscriptionSnapshot | undefined): number | undefined => {
  const upkeepLastTick = snapshot?.player?.upkeepLastTick;
  if (!upkeepLastTick || typeof upkeepLastTick !== "object") return undefined;
  const foodCoverage = (upkeepLastTick as { foodCoverage?: unknown }).foodCoverage;
  return typeof foodCoverage === "number" && Number.isFinite(foodCoverage) ? foodCoverage : undefined;
};

const townPopulationGrowthPerMinute = (input: {
  isFed: boolean;
  population: number | undefined;
  maxPopulation: number | undefined;
  populationTier: string;
  hasGranary: boolean;
}): number | undefined => {
  if (!input.isFed) return 0;
  if (typeof input.population !== "number" || typeof input.maxPopulation !== "number") return undefined;
  const logisticFactor = 1 - input.population / Math.max(1, input.maxPopulation);
  if (logisticFactor <= 0) return 0;
  const growth =
    input.population *
    POPULATION_GROWTH_BASE_RATE *
    (input.populationTier === "SETTLEMENT" ? 4 : 1) *
    (input.hasGranary ? 1.15 : 1) *
    logisticFactor;
  return Number(growth.toFixed(4));
};

// Mirrors townFoodUpkeepPerMinute in apps/simulation/src/player-update-economy.ts
// (the authoritative food drain). Kept local so the gateway never depends on
// townJson carrying the field - same backfill philosophy as goldPerMinute/cap.
const townFoodUpkeepForTier = (populationTier: string | undefined): number => {
  switch (populationTier) {
    case "CITY": return 0.3;
    case "GREAT_CITY": return 0.6;
    case "METROPOLIS": return 1;
    case "SETTLEMENT":
    case undefined: return 0;
    default: return 0.1; // TOWN
  }
};

const structureUpkeepPerMinute = (structureType: string): Partial<Record<"GOLD" | "FOOD" | "CRYSTAL", number>> => {
  switch (structureType) {
    case "FARMSTEAD": return { GOLD: FARMSTEAD_GOLD_UPKEEP / 10 };
    case "CAMP": return { GOLD: CAMP_GOLD_UPKEEP / 10 };
    case "MINE": return { GOLD: MINE_GOLD_UPKEEP / 10 };
    case "GRANARY": return { GOLD: GRANARY_GOLD_UPKEEP / 10 };
    case "MARKET": return { FOOD: MARKET_FOOD_UPKEEP / 10 };
    case "BANK": return { FOOD: BANK_FOOD_UPKEEP / 10 };
    case "WOODEN_FORT": return { GOLD: WOODEN_FORT_GOLD_UPKEEP / 10 };
    case "LIGHT_OUTPOST": return { GOLD: LIGHT_OUTPOST_GOLD_UPKEEP / 10 };
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

export const buildSnapshotTileDetail = (
  snapshot: PlayerSubscriptionSnapshot | undefined,
  playerId: string,
  x: number,
  y: number
): TileUpdate | undefined => {
  const tile = snapshot?.tiles.find((candidate: PlayerSubscriptionSnapshot["tiles"][number]) => candidate.x === x && candidate.y === y);
  if (!tile) return undefined;
  const update: TileUpdate = { ...tile, detailLevel: "full" };
  if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED") return update;

  const tilesByKey = new Map((snapshot?.tiles ?? []).map((entry: PlayerSubscriptionSnapshot["tiles"][number]) => [keyFor(entry.x, entry.y), entry] as const));

  const upkeepEntries: Array<{ label: string; perMinute: Record<string, number> }> = [];
  const parsedTown = parseTown(tile);
  const supportSummary = supportSummaryForTown(tilesByKey, playerId, x, y);
  const supportStructures = derivedTownSupportStructures(tilesByKey, playerId, x, y);
  const populationTier = parsedTown?.populationTier ?? tile.townPopulationTier ?? "SETTLEMENT";
  const foodCoverage = snapshotFoodCoverage(snapshot);
  const isFed =
    populationTier === "SETTLEMENT" ||
    (typeof foodCoverage === "number" && foodCoverage >= 0.999) ||
    parsedTown?.isFed === true ||
    derivedTownIsFed(tilesByKey, playerId, x, y);
  const baseGoldPerMinute =
    typeof parsedTown?.baseGoldPerMinute === "number" && parsedTown.baseGoldPerMinute > 0.0001
      ? parsedTown.baseGoldPerMinute
      : populationTier === "SETTLEMENT"
        ? 1
        : 2;
  const populationTierIsSettlement = populationTier === "SETTLEMENT";
  // Trust the sim's authoritative goldPerMinute when it's on the snapshot.
  // Fall back to an inline recompute when missing — required because the
  // snapshot path (and re-stitched gateway townJson) sometimes drops the
  // field, and buildTileYieldView with no economyContext returns 0 for
  // TOWN-tier when town.goldPerMinute isn't present.
  const goldPerMinute =
    typeof parsedTown?.goldPerMinute === "number" && Number.isFinite(parsedTown.goldPerMinute)
      ? parsedTown.goldPerMinute
      : fallbackTownGoldPerMinute({
          isSettlement: populationTierIsSettlement,
          isFed,
          supportCurrent: supportSummary.supportCurrent,
          supportMax: supportSummary.supportMax,
          populationTier,
          connectedTownBonus:
            typeof parsedTown?.connectedTownBonus === "number" ? parsedTown.connectedTownBonus : 0,
          hasMarket: supportStructures.hasMarket,
          hasBank: supportStructures.hasBank
        });
  // Only backfill cap when goldPerMinute is positive. For unfed TOWN-tier
  // tiles the live-snapshot formula multiplies through 0, which on the wire
  // would clobber buildTileYieldView's default TILE_YIELD_CAP_GOLD fallback
  // (24) with a hard 0 cap — preserving the existing "undefined → default"
  // behavior for unfed tiles avoids a stored-yield-buffer regression.
  const cap =
    typeof parsedTown?.cap === "number" && Number.isFinite(parsedTown.cap)
      ? parsedTown.cap
      : goldPerMinute > 0
        ? fallbackTownCap(goldPerMinute, populationTierIsSettlement, supportStructures.hasMarket)
        : undefined;
  const populationGrowthPerMinute =
    townPopulationGrowthPerMinute({
      isFed,
      population: parsedTown?.population,
      maxPopulation: parsedTown?.maxPopulation,
      populationTier,
      hasGranary: supportStructures.hasGranary
    }) ?? parsedTown?.populationGrowthPerMinute;
  const growthModifiers =
    parsedTown?.growthModifiers ??
    (typeof populationGrowthPerMinute === "number" && populationGrowthPerMinute > 0
      ? [{ label: "Long time peace" as const, deltaPerMinute: populationGrowthPerMinute }]
      : undefined);
  const hasTown = Boolean(tile.townType || parsedTown);
  const townFoodUpkeep = hasTown ? townFoodUpkeepForTier(populationTier) : 0;
  const town = hasTown
    ? {
        ...(parsedTown ?? {}),
        type: parsedTown?.type ?? tile.townType,
        populationTier,
        supportCurrent: supportSummary.supportCurrent,
        supportMax: supportSummary.supportMax,
        isFed,
        hasMarket: supportStructures.hasMarket,
        marketActive: supportStructures.hasMarket && isFed,
        hasGranary: supportStructures.hasGranary,
        granaryActive: supportStructures.hasGranary,
        hasBank: supportStructures.hasBank,
        bankActive: supportStructures.hasBank,
        baseGoldPerMinute,
        foodUpkeepPerMinute: townFoodUpkeep,
        ...(typeof goldPerMinute === "number" ? { goldPerMinute } : {}),
        ...(typeof cap === "number" ? { cap } : {}),
        ...(typeof populationGrowthPerMinute === "number" ? { populationGrowthPerMinute } : {}),
        ...(growthModifiers ? { growthModifiers } : {})
      }
    : undefined;
  if (town) update.townJson = JSON.stringify(town);
  if (townFoodUpkeep > 0.0001) {
    upkeepEntries.push({ label: "Town", perMinute: { FOOD: Number(townFoodUpkeep.toFixed(4)) } });
  }
  upkeepEntries.push({ label: "Settled land", perMinute: { GOLD: 0.04 } });

  const fort = parseStructure<{ status?: string }>(tile.fortJson);
  if (fort?.status === "active") upkeepEntries.push({ label: "Fort", perMinute: { GOLD: 1, IRON: 0.025 } });
  const siegeOutpost = parseStructure<{ status?: string }>(tile.siegeOutpostJson);
  if (siegeOutpost?.status === "active") upkeepEntries.push({ label: "Siege outpost", perMinute: { GOLD: 1, SUPPLY: 0.025 } });
  const observatory = parseStructure<{ status?: string }>(tile.observatoryJson);
  if (observatory?.status === "active") upkeepEntries.push({ label: "Observatory", perMinute: { CRYSTAL: Number(OBSERVATORY_UPKEEP_PER_MIN.toFixed(4)) } });
  const structure = parseStructure<{ type?: string; status?: string }>(tile.economicStructureJson);
  if (structure?.status === "active" && structure.type) {
    const upkeep = structureUpkeepPerMinute(structure.type);
    const perMinute = {
      ...(upkeep.FOOD ? { FOOD: Number(upkeep.FOOD.toFixed(4)) } : {}),
      ...(upkeep.GOLD ? { GOLD: Number(upkeep.GOLD.toFixed(4)) } : {}),
      ...(upkeep.CRYSTAL ? { CRYSTAL: Number(upkeep.CRYSTAL.toFixed(4)) } : {})
    };
    if (Object.keys(perMinute).length > 0) upkeepEntries.push({ label: structure.type, perMinute });
  }
  if (upkeepEntries.length > 0) update.upkeepEntries = upkeepEntries;

  // Keep tile-detail production metadata consistent with the derived town state.
  // Stored yield buffers come from the authoritative snapshot when present; they
  // cannot be reconstructed accurately here without the last-collected timestamp.
  const domainTile: YieldSourceTile = {
    x: tile.x,
    y: tile.y,
    terrain: tile.terrain ?? "LAND",
    ...(tile.resource ? { resource: tile.resource as YieldSourceTile["resource"] } : {}),
    ...(tile.dockId ? { dockId: tile.dockId } : {}),
    ...(tile.ownerId ? { ownerId: tile.ownerId } : {}),
    ...(tile.ownershipState ? { ownershipState: tile.ownershipState as YieldSourceTile["ownershipState"] } : {}),
    ...(town ? { town: town as YieldSourceTile["town"] } : {}),
    ...(structure ? { economicStructure: structure as YieldSourceTile["economicStructure"] } : {})
  };
  const now = Date.now();
  const fallbackYieldView = buildTileYieldView(domainTile, now, now);
  if (fallbackYieldView?.yieldRate) update.yieldRate = fallbackYieldView.yieldRate;
  if (fallbackYieldView?.yieldCap) update.yieldCap = fallbackYieldView.yieldCap;
  if (!("yield" in update) && fallbackYieldView?.yield) {
    update.yield = fallbackYieldView.yield;
  }

  return update;
};
