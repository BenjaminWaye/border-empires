import type { DomainTileState } from "@border-empires/game-domain";
import {
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  DOCK_INCOME_PER_MIN,
  FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  IRONWORKS_IRON_PER_DAY,
  OFFLINE_YIELD_ACCUM_MAX_MS,
  PASSIVE_INCOME_MULT,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  TILE_YIELD_CAP_GOLD,
  TILE_YIELD_CAP_RESOURCE,
  WATERWORKS_OUTPUT_MULT,
  WATERWORKS_RADIUS
} from "@border-empires/game-domain";
import { dockBaseGoldPerMinuteForPlayer, type DockEconomyContext, type EconomyPlayer } from "../economy-network/economy-network.js";
import { townGoldPerMinuteForPlayer } from "../player-update-economy/player-update-economy.js";

type StrategicYieldKey = "FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD";

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
    // Farmstead: +50% food only on FARM tiles. FISH gets nothing.
    // (Waterworks is a radius-support building like Foundry — it boosts nearby
    //  Farmsteads rather than producing food itself.)
    case "FARMSTEAD":
      return { FOOD: 48 * 0.5 };
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
  now: number,
  economyContext?: Partial<DockEconomyContext> & {
    player?: EconomyPlayer | undefined;
    fedTownKeys?: ReadonlySet<string> | undefined;
    firstThreeTownKeys?: ReadonlySet<string> | undefined;
    /** Precomputed set of active Waterworks positions (tileKey) owned by the tile's player. */
    waterworksKeys?: ReadonlySet<string> | undefined;
  }
): TileYieldView | undefined => {
  if (tile.ownerId === undefined || tile.ownershipState !== "SETTLED" || tile.terrain !== "LAND") return undefined;
  const economyPlayer = economyContext?.player;
  const incomeMultiplier = economyPlayer?.id === tile.ownerId ? economyPlayer.mods?.income ?? 1 : 1;

  const townGoldPerMinute = (() => {
    if (!tile.town) return 0;
    if (typeof tile.town.goldPerMinute === "number" && tile.town.goldPerMinute > 0.0001) return tile.town.goldPerMinute;
    if (tile.town.populationTier === "SETTLEMENT" || !tile.town.populationTier) {
      return SETTLEMENT_BASE_GOLD_PER_MIN * incomeMultiplier * PASSIVE_INCOME_MULT;
    }
    if (economyPlayer?.id !== tile.ownerId || !economyContext?.tiles || !economyContext.fedTownKeys) return 0;
    return townGoldPerMinuteForPlayer(
      economyPlayer,
      tile,
      tile.town,
      economyContext.tiles,
      economyContext.fedTownKeys,
      economyContext.firstThreeTownKeys
    );
  })();
  const dockContext =
    economyContext?.tiles && economyContext.dockLinksByDockTileKey
      ? { tiles: economyContext.tiles, dockLinksByDockTileKey: economyContext.dockLinksByDockTileKey }
      : undefined;
  const dockGoldPerMinute =
    tile.dockId && economyPlayer?.id === tile.ownerId
      ? dockBaseGoldPerMinuteForPlayer(tile, economyPlayer, dockContext) * incomeMultiplier * PASSIVE_INCOME_MULT
      : tile.dockId ? DOCK_INCOME_PER_MIN * PASSIVE_INCOME_MULT : 0;
  const outputMultiplier = tile.sabotage && tile.sabotage.endsAt > now ? Math.max(0, Math.min(1, tile.sabotage.outputMultiplier)) : 1;
  const goldPerMinute = (townGoldPerMinute + dockGoldPerMinute) * outputMultiplier;
  const resourceDaily = strategicDailyFromResource(tile.resource);
  const converterDaily = converterDailyOutput(tile.economicStructure?.status === "active" ? tile.economicStructure.type : undefined);
  // Farmstead only boosts FARM tiles — strip the structure food bonus on
  // non-FARM tiles (e.g. FISH) but keep the base resource food rate intact.
  if (
    tile.resource !== "FARM" &&
    tile.economicStructure?.status === "active" &&
    tile.economicStructure.type === "FARMSTEAD"
  ) {
    delete converterDaily.FOOD;
  }
  // Merge resource and converter output additively so a farmstead on a
  // FARM tile gives 48 + 24 = 72/day, not 24/day (overwrite).
  const strategicPerDay = { ...resourceDaily };
  for (const [key, value] of Object.entries(converterDaily) as Array<[StrategicYieldKey, number]>) {
    strategicPerDay[key] = (strategicPerDay[key] ?? 0) + value;
  }
  // Waterworks radius boost: a FARM tile with an active Farmstead within
  // WATERWORKS_RADIUS of an active Waterworks gets +50% on its total FOOD
  // output (base + farmstead combined).
  if (
    tile.resource === "FARM" &&
    tile.economicStructure?.type === "FARMSTEAD" &&
    tile.economicStructure.status === "active" &&
    typeof strategicPerDay.FOOD === "number" &&
    economyContext?.waterworksKeys &&
    economyContext.waterworksKeys.size > 0
  ) {
    for (const candidateKey of economyContext.waterworksKeys) {
      const comma = candidateKey.indexOf(",");
      if (comma < 0) continue;
      const cx = Number(candidateKey.slice(0, comma));
      const cy = Number(candidateKey.slice(comma + 1));
      if (Math.max(Math.abs(tile.x - cx), Math.abs(tile.y - cy)) <= WATERWORKS_RADIUS) {
        strategicPerDay.FOOD *= WATERWORKS_OUTPUT_MULT;
        break;
      }
    }
  }
  for (const key of Object.keys(strategicPerDay) as StrategicYieldKey[]) {
    strategicPerDay[key] = (strategicPerDay[key] ?? 0) * outputMultiplier;
  }
  const maxDaily = Math.max(0, ...Object.values(strategicPerDay).map((value) => Number(value) || 0));
  const yieldCap = {
    gold: goldPerMinute > 0 ? goldPerMinute * 60 * 8 : TILE_YIELD_CAP_GOLD,
    strategicEach: tile.resource === "FISH" ? 0 : (maxDaily > 0 ? maxDaily / 3 : TILE_YIELD_CAP_RESOURCE)
  };
  // Clamp at OFFLINE_YIELD_ACCUM_MAX_MS so a missing or stale lastCollectedAt
  // (e.g. recovery edge case, manual DB edit) can never grant more than the
  // intended offline window — defense-in-depth on top of the per-tile cap.
  const elapsedMs = Math.min(OFFLINE_YIELD_ACCUM_MAX_MS, Math.max(0, now - (lastCollectedAt ?? 0)));
  const elapsedMinutes = elapsedMs / 60_000;
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
    // Always emit `yield` for yield-bearing tiles (any positive goldPerMinute
    // or strategic potential), even when the live buffer is zero. Subscribers
    // merge tile deltas into a cached snapshot with `{ ...cached, ...fresh }`,
    // so a missing `yield` field preserves whatever the cache last saw — that
    // strands stale buffer values on the client when an upkeep tick drains
    // the live buffer to zero. Emitting an explicit `{ gold: 0, strategic: {} }`
    // lets fresh responses (e.g. FetchTileDetail) authoritatively clear it.
    ...(goldPerMinute > 0 || maxDaily > 0 || gold > 0.0001 || Object.keys(strategic).length > 0
      ? {
          yield: {
            gold: roundPositive(gold, 3),
            strategic
          }
        }
      : {})
  };
};
