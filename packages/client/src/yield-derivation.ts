/**
 * Client-side yield derivation.
 *
 * Ported from apps/simulation/src/tile-yield-view.ts so the client can derive
 * `yieldRate` and `yieldCap` without them being present in the bootstrap
 * payload (PR A of bootstrap-payload-shrink).
 *
 * Constants are direct copies from packages/game-domain/src/server-game-constants.ts.
 * If those constants change upstream, these must be updated in lockstep.
 */

// Statically ported from apps/simulation/src/tile-yield-view.ts

const strategicDailyFromResource = (resource: string | undefined): Record<string, number> => {
  switch (resource) {
    case "FARM":
      return { FOOD: 72 };
    case "FISH":
      return { FOOD: 48 };
    case "IRON":
      return { IRON: 60 };
    case "WOOD":
    case "FUR":
      return { SUPPLY: 60 };
    case "GEMS":
      return { CRYSTAL: 36 };
    case "OIL":
      return { OIL: 48 };
    default:
      return {};
  }
};

const converterDailyOutput = (structureType: string | undefined): Record<string, number> => {
  switch (structureType) {
    case "FUR_SYNTHESIZER":
      return { SUPPLY: 18 };
    case "ADVANCED_FUR_SYNTHESIZER":
      return { SUPPLY: 21.6 };
    case "IRONWORKS":
      return { IRON: 18 };
    case "ADVANCED_IRONWORKS":
      return { IRON: 21.6 };
    case "CRYSTAL_SYNTHESIZER":
      return { CRYSTAL: 12 };
    case "ADVANCED_CRYSTAL_SYNTHESIZER":
      return { CRYSTAL: 14.4 };
    default:
      return {};
  }
};

// Ported from packages/game-domain/src/server-game-constants.ts
export const TILE_YIELD_CAP_GOLD = 24;
export const TILE_YIELD_CAP_RESOURCE = 6;
const DOCK_INCOME_PER_MIN = 0.5;
const PASSIVE_INCOME_MULT = 1.0;

export type TileYieldRate = { goldPerMinute: number; strategicPerDay: Record<string, number> };
export type TileYieldCap = { gold: number; strategicEach: number };

type YieldInput = {
  town?: { goldPerMinute?: number; cap?: number } | null;
  dockId?: string | null;
  resource?: string;
  economicStructure?: { type?: string; status?: string } | null;
};

export const deriveTileYieldRate = (tile: YieldInput): TileYieldRate | undefined => {
  const townGoldPerMinute = tile.town?.goldPerMinute ?? 0;
  const dockGoldPerMinute = tile.dockId ? DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT : 0;
  const goldPerMinute = townGoldPerMinute + dockGoldPerMinute;

  const strategicPerDay: Record<string, number> = {
    ...strategicDailyFromResource(tile.resource)
  };

  if (tile.economicStructure?.status === "active" && tile.economicStructure.type) {
    Object.assign(strategicPerDay, converterDailyOutput(tile.economicStructure.type));
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
  yieldRate?: TileYieldRate
): TileYieldCap | undefined => {
  const rate = yieldRate ?? deriveTileYieldRate(tile);
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
  tile: T
): T => {
  if (!tile.yieldRate) {
    const rate = deriveTileYieldRate(tile);
    if (rate) (tile as Record<string, unknown>).yieldRate = rate;
  }
  if (!tile.yieldCap) {
    const cap = deriveTileYieldCap(tile, tile.yieldRate);
    if (cap) (tile as Record<string, unknown>).yieldCap = cap;
  }
  return tile;
};

const roundPositive = (value: number, digits: number): number => {
  if (!(value > 0.0001)) return 0;
  return Number(value.toFixed(digits));
};
