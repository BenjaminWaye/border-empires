/**
 * Client-side yield derivation.
 *
 * Imports constants from @border-empires/game-domain (shared package) to avoid
 * drift with apps/simulation/src/tile-yield-view.ts. Derives yieldRate and
 * yieldCap from tile data that is already present in the bootstrap payload
 * (townJson, resource, dockId, economicStructure), so they no longer need to
 * be sent as per-tile fields (PR A of bootstrap-payload-shrink).
 */

import {
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  DOCK_INCOME_PER_MIN,
  FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  IRONWORKS_IRON_PER_DAY,
  PASSIVE_INCOME_MULT,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TILE_YIELD_CAP_GOLD,
  TILE_YIELD_CAP_RESOURCE
} from "@border-empires/game-domain";

// Matches apps/simulation/src/tile-yield-view.ts:strategicDailyFromResource
const strategicDailyFromResource = (resource: string | undefined): Record<string, number> => {
  switch (resource) {
    case "FARM":
      return { FOOD: 48 };
    case "FISH":
      return { FOOD: 72 };
    case "IRON":
      return { IRON: 60 };
    case "WOOD":
    case "FUR":
      return { SUPPLY: 60 };
    case "GEMS":
      return { CRYSTAL: 36 };
    default:
      return {};
  }
};

// Matches apps/simulation/src/tile-yield-view.ts:converterDailyOutput
const converterDailyOutput = (structureType: string | undefined): Record<string, number> => {
  // Sim's tile-yield-view.ts:converterDailyOutput currently returns
  // the basic value for ADVANCED_* too. Match that here so the
  // client display equals what the sim produces. If/when the sim is
  // fixed to honor ADVANCED_* constants, update this in lockstep.
  switch (structureType) {
    case "FUR_SYNTHESIZER":
    case "ADVANCED_FUR_SYNTHESIZER":
      return { SUPPLY: FUR_SYNTHESIZER_SUPPLY_PER_DAY };
    case "IRONWORKS":
    case "ADVANCED_IRONWORKS":
      return { IRON: IRONWORKS_IRON_PER_DAY };
    case "CRYSTAL_SYNTHESIZER":
    case "ADVANCED_CRYSTAL_SYNTHESIZER":
      return { CRYSTAL: CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY };
    case "FARMSTEAD":
      return { FOOD: 48 * 0.5 };
    default:
      return {};
  }
};

export type TileYieldRate = { goldPerMinute: number; strategicPerDay: Record<string, number> };
export type TileYieldCap = { gold: number; strategicEach: number };

type YieldInput = {
  town?: { goldPerMinute?: number; cap?: number; populationTier?: string } | null;
  dockId?: string | null;
  resource?: string;
  economicStructure?: { type?: string; status?: string } | null;
  sabotage?: { endsAt: number; outputMultiplier: number } | null;
};

export const deriveTileYieldRate = (
  tile: YieldInput,
  incomeMultiplier = 1.0
): TileYieldRate | undefined => {
  const townGoldPerMinute = (() => {
    if (!tile.town) return 0;
    // Persisted goldPerMinute already includes all sim-computed bonuses
    // (connected towns, population tier, market, bank, income modifier).
    if (typeof tile.town.goldPerMinute === "number" && tile.town.goldPerMinute > 0.0001) {
      return tile.town.goldPerMinute;
    }
    // Fallback for new settlements before their first economy tick populates
    // the field — matches the sim's SETTLEMENT path in buildTileYieldView.
    if (
      !tile.town.populationTier ||
      tile.town.populationTier === "SETTLEMENT"
    ) {
      return SETTLEMENT_BASE_GOLD_PER_MIN * incomeMultiplier * PASSIVE_INCOME_MULT;
    }
    return 0;
  })();
  // Dock income: client lacks dock-link topology and dock-specific tech
  // multipliers, so we apply the closest available proxy (player income
  // modifier). Technically the sim uses dockGoldOutputMultiplierForPlayer
  // which is a different tech effect, but in practice they track closely.
  // The dock chain bonus (+50% per paired dock) cannot be derived without
  // topology data; known limitation.
  const dockGoldPerMinute = tile.dockId
    ? DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT * incomeMultiplier
    : 0;
  const outputMultiplier = tile.sabotage && tile.sabotage.endsAt > Date.now() ? Math.max(0, Math.min(1, tile.sabotage.outputMultiplier)) : 1;
  const goldPerMinute = (townGoldPerMinute + dockGoldPerMinute) * outputMultiplier;

  const strategicPerDay: Record<string, number> = {
    ...strategicDailyFromResource(tile.resource)
  };

  if (tile.economicStructure?.status === "active" && tile.economicStructure.type) {
    const converterOutput = converterDailyOutput(tile.economicStructure.type);
    // FARMSTEAD on a non-FARM tile (e.g. FISH) gets no food bonus — strip it.
    if (tile.economicStructure.type === "FARMSTEAD" && tile.resource !== "FARM") {
      delete converterOutput.FOOD;
    }
    // Additive merge so FARMSTEAD on a FARM tile gives 48+24=72, not 24.
    for (const [key, value] of Object.entries(converterOutput)) {
      strategicPerDay[key] = (strategicPerDay[key] ?? 0) + value;
    }
  }

  for (const key of Object.keys(strategicPerDay)) {
    strategicPerDay[key] = (strategicPerDay[key] ?? 0) * outputMultiplier;
  }

  if (goldPerMinute < 0.0001 && Object.keys(strategicPerDay).length === 0) return undefined;

  return {
    goldPerMinute: roundPositive(goldPerMinute, 4),
    strategicPerDay: Object.fromEntries(
      Object.entries(strategicPerDay)
        .filter(([, value]) => Number(value) > 0.0001)
        .map(([resource, value]) => [resource, roundPositive(Number(value), 4)])
    )
  };
};

export const deriveTileYieldCap = (
  tile: YieldInput,
  yieldRate?: TileYieldRate,
  incomeMultiplier = 1.0
): TileYieldCap | undefined => {
  const rate = yieldRate ?? deriveTileYieldRate(tile, incomeMultiplier);
  if (!rate) return undefined;

  const { goldPerMinute, strategicPerDay } = rate;
  const maxDaily = Math.max(0, ...Object.values(strategicPerDay).map((v) => Number(v) || 0));

  const goldCap =
    typeof tile.town?.cap === "number"
      ? tile.town.cap
      : goldPerMinute > 0.0001
        ? goldPerMinute * 60 * 8
        : TILE_YIELD_CAP_GOLD;

  const strategicEach = maxDaily > 0 ? maxDaily / 3 : TILE_YIELD_CAP_RESOURCE;

  return {
    gold: roundPositive(goldCap, 3),
    strategicEach: roundPositive(strategicEach, 3)
  };
};

/** Derive and attach yieldRate / yieldCap to a tile object if missing. */
export const ensureTileYield = <T extends YieldInput & { yieldRate?: TileYieldRate; yieldCap?: TileYieldCap }>(
  tile: T,
  incomeMultiplier = 1.0
): T => {
  if (!tile.yieldRate) {
    const rate = deriveTileYieldRate(tile, incomeMultiplier);
    if (rate) (tile as Record<string, unknown>).yieldRate = rate;
  }
  if (!tile.yieldCap) {
    const cap = deriveTileYieldCap(tile, tile.yieldRate, incomeMultiplier);
    if (cap) (tile as Record<string, unknown>).yieldCap = cap;
  }
  return tile;
};

const roundPositive = (value: number, digits: number): number => {
  if (!(value > 0.0001)) return 0;
  return Number(value.toFixed(digits));
};
