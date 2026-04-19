import type { DomainTileState } from "@border-empires/game-domain";
import {
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  DOCK_INCOME_PER_MIN,
  FUEL_PLANT_OIL_PER_DAY,
  FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  IRONWORKS_IRON_PER_DAY,
  PASSIVE_INCOME_MULT,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TILE_YIELD_CAP_GOLD,
  TILE_YIELD_CAP_RESOURCE
} from "../../../packages/server/src/server-game-constants.js";

type StrategicYieldKey = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL";

export type TileYieldBufferView = {
  gold: number;
  strategic: Partial<Record<StrategicYieldKey, number>>;
};

export type TileYieldRateView = {
  goldPerMinute: number;
  strategicPerDay: Partial<Record<StrategicYieldKey, number>>;
};

export type TileYieldCapView = {
  gold: number;
  strategicEach: number;
};

export type TileYieldView = {
  yield?: TileYieldBufferView;
  yieldRate: TileYieldRateView;
  yieldCap: TileYieldCapView;
};

const strategicDailyFromResource = (resource: DomainTileState["resource"] | undefined): Partial<Record<StrategicYieldKey, number>> => {
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

const converterDailyOutput = (
  structureType: DomainTileState["economicStructure"] extends { type: infer T } ? T : string | undefined
): Partial<Record<StrategicYieldKey, number>> => {
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
    case "FUEL_PLANT":
      return { OIL: FUEL_PLANT_OIL_PER_DAY };
    default:
      return {};
  }
};

const roundPositive = (value: number, digits: number): number => {
  if (!(value > 0.0001)) return 0;
  return Number(value.toFixed(digits));
};

export const buildTileYieldView = (
  tile: DomainTileState,
  lastCollectedAt: number | undefined,
  now: number
): TileYieldView | undefined => {
  if (tile.ownerId === undefined || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") return undefined;

  const townGoldPerMinute =
    tile.town
      ? typeof tile.town.goldPerMinute === "number" && tile.town.goldPerMinute > 0.0001
        ? tile.town.goldPerMinute
        : tile.town.populationTier === "SETTLEMENT"
          ? SETTLEMENT_BASE_GOLD_PER_MIN
          : typeof tile.town.baseGoldPerMinute === "number" && tile.town.baseGoldPerMinute > 0.0001
            ? tile.town.baseGoldPerMinute
            : 0
      : 0;
  const goldPerMinute = townGoldPerMinute + (tile.dockId ? DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT : 0);
  const strategicPerDay = {
    ...strategicDailyFromResource(tile.resource),
    ...converterDailyOutput(tile.economicStructure?.status === "active" ? tile.economicStructure.type : undefined)
  };
  const maxDaily = Math.max(0, ...Object.values(strategicPerDay).map((value) => Number(value) || 0));
  const yieldCap = {
    gold:
      typeof tile.town?.cap === "number"
        ? tile.town.cap
        : goldPerMinute > 0
          ? goldPerMinute * 60 * 8
          : TILE_YIELD_CAP_GOLD,
    strategicEach: maxDaily > 0 ? maxDaily / 3 : TILE_YIELD_CAP_RESOURCE
  };
  const elapsedMinutes = Math.max(0, (now - (lastCollectedAt ?? 0)) / 60_000);
  const strategic: Partial<Record<StrategicYieldKey, number>> = {};
  for (const [resource, daily] of Object.entries(strategicPerDay) as Array<[StrategicYieldKey, number]>) {
    const amount = Math.min(yieldCap.strategicEach, (daily / 1440) * elapsedMinutes);
    if (amount > 0.0001) strategic[resource] = roundPositive(amount, 3);
  }
  const gold = Math.min(yieldCap.gold, goldPerMinute * elapsedMinutes);
  return {
    yieldRate: {
      goldPerMinute: roundPositive(goldPerMinute, 4),
      strategicPerDay: Object.fromEntries(
        Object.entries(strategicPerDay).filter(([, value]) => Number(value) > 0.0001).map(([resource, value]) => [resource, roundPositive(Number(value), 4)])
      ) as Partial<Record<StrategicYieldKey, number>>
    },
    yieldCap: {
      gold: roundPositive(yieldCap.gold, 3),
      strategicEach: roundPositive(yieldCap.strategicEach, 3)
    },
    ...(gold > 0.0001 || Object.keys(strategic).length > 0
      ? {
          yield: {
            gold: roundPositive(gold, 3),
            strategic
          }
        }
      : {})
  };
};
