import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import {
  ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  ADVANCED_FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  ADVANCED_IRONWORKS_IRON_PER_DAY,
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  DOCK_INCOME_PER_MIN,
  FOUNDRY_OUTPUT_MULT,
  FOUNDRY_RADIUS,
  FUR_SYNTHESIZER_SUPPLY_PER_DAY,
  IRONWORKS_IRON_PER_DAY,
  OFFLINE_YIELD_ACCUM_MAX_MS,
  PASSIVE_INCOME_MULT,
  SETTLEMENT_BASE_GOLD_PER_MIN,
  STRUCTURE_OUTPUT_MULT,
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

const FARMSTEAD_FOOD_BONUS_PER_DAY = 48 * 0.5;

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
      return { SUPPLY: FUR_SYNTHESIZER_SUPPLY_PER_DAY };
    case "ADVANCED_FUR_SYNTHESIZER":
      return { SUPPLY: ADVANCED_FUR_SYNTHESIZER_SUPPLY_PER_DAY };
    case "IRONWORKS":
      return { IRON: IRONWORKS_IRON_PER_DAY };
    case "ADVANCED_IRONWORKS":
      return { IRON: ADVANCED_IRONWORKS_IRON_PER_DAY };
    case "CRYSTAL_SYNTHESIZER":
      return { CRYSTAL: CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY };
    case "ADVANCED_CRYSTAL_SYNTHESIZER":
      return { CRYSTAL: ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY };
    // Farmstead: +50% food only on FARM tiles. FISH gets nothing.
    // (Waterworks is a radius-support building like Foundry — it boosts nearby
    //  Farmsteads rather than producing food itself.)
    case "FARMSTEAD":
      return { FOOD: FARMSTEAD_FOOD_BONUS_PER_DAY };
    default:
      return {};
  }
};

/**
 * Strategic-affecting economic structure types whose yield cannot be
 * correctly re-derived on the client (radius/neighbor bonuses, ADVANCED
 * synth constants, MINE/CAMP output multiplier). Tiles carrying one of
 * these (active) or a dockId must receive server-authoritative
 * `yieldRate`/`yieldCap` on the wire — see docs/plans/2026-07-06-radius-yield-delivery.md.
 */
const STRATEGIC_AFFECTING_STRUCTURE_TYPES: ReadonlySet<string> = new Set([
  "FARMSTEAD",
  "MINE",
  "CAMP",
  "IRONWORKS",
  "ADVANCED_IRONWORKS",
  "FUR_SYNTHESIZER",
  "ADVANCED_FUR_SYNTHESIZER",
  "CRYSTAL_SYNTHESIZER",
  "ADVANCED_CRYSTAL_SYNTHESIZER"
]);

/**
 * Predicate: does this tile need server-authoritative `yieldRate`/`yieldCap`
 * emission because the client cannot re-derive its value locally (radius
 * bonus dependency, dock-topology dependency)? Bare resource tiles and
 * structure-less settled tiles are excluded to preserve the bootstrap
 * payload-shrink savings (see docs/plans/2026-05-30-bootstrap-payload-shrink.md).
 */
export const tileYieldNeedsServerAuthority = (tile: Pick<DomainTileState, "economicStructure" | "dockId">): boolean => {
  if (tile.dockId) return true;
  const structure = tile.economicStructure;
  if (!structure || structure.status !== "active") return false;
  return STRATEGIC_AFFECTING_STRUCTURE_TYPES.has(structure.type);
};

/**
 * Scans a player's settled tiles once and returns the "x,y" tile keys of
 * their active WATERWORKS and FOUNDRY structures — the radius-source
 * lookups `buildTileYieldView` needs for the Farmstead/Mine neighbor boosts.
 * Shared by the live runtime (`tileYieldEconomyContextForPlayer`) and the
 * snapshot-view builders (`live-snapshot-view.ts`) so both paths compute the
 * exact same sets from the exact same predicate.
 */
export const radiusStructureKeysForSettledTiles = (
  settledTiles: Iterable<Pick<DomainTileState, "x" | "y" | "economicStructure">>
): { waterworksKeys: Set<string>; foundryKeys: Set<string> } => {
  const waterworksKeys = new Set<string>();
  const foundryKeys = new Set<string>();
  for (const tile of settledTiles) {
    if (tile.economicStructure?.status !== "active") continue;
    if (tile.economicStructure.type === "WATERWORKS") {
      waterworksKeys.add(`${tile.x},${tile.y}`);
    } else if (tile.economicStructure.type === "FOUNDRY") {
      foundryKeys.add(`${tile.x},${tile.y}`);
    }
  }
  return { waterworksKeys, foundryKeys };
};

const roundPositive = (value: number, digits: number): number => {
  if (!(value > 0.0001)) return 0;
  return Number(value.toFixed(digits));
};

/** True when (x,y) is within `radius` (Chebyshev) of any "x,y" key in `candidateKeys`. */
// World-wrapping Chebyshev distance — matches coordsInChebyshevRadius
// (territory-automation.ts) so a source near one map edge still boosts a
// beneficiary near the opposite edge instead of appearing out of range.
const wrappedAxisDistance = (a: number, b: number, span: number): number => {
  const raw = Math.abs(a - b);
  return Math.min(raw, span - raw);
};

/**
 * Farmstead's empire-wide FOOD contribution (used by the "food detailed
 * production" breakdown / strategicProductionPerMinute in
 * player-update-economy.ts). Mirrors the per-tile logic in
 * `converterDailyOutput`/`buildTileYieldView` below: +50% food, FARM tiles
 * only (FISH gets nothing), doubled again when within WATERWORKS_RADIUS of
 * an active Waterworks. Exported here — rather than duplicated — so both
 * the per-tile yield view and the empire-wide production total can never
 * drift out of sync again.
 */
export const farmsteadFoodBonusPerMinute = (
  // Structural param (not Pick<DomainTileState>) so both live-runtime DomainTiles
  // and snapshot-path tiles carrying a loosely-parsed economicStructure
  // ({ type?, status? } from economicStructureJson) can call this one helper.
  tile: { x: number; y: number; resource?: string | undefined; economicStructure?: { type?: string | undefined; status?: string | undefined } | undefined },
  waterworksKeys: ReadonlySet<string>
): number => {
  if (tile.resource !== "FARM") return 0;
  if (tile.economicStructure?.type !== "FARMSTEAD" || tile.economicStructure.status !== "active") return 0;
  const withinWaterworksRadius = waterworksKeys.size > 0 && withinRadiusOfAnyKey(tile.x, tile.y, waterworksKeys, WATERWORKS_RADIUS);
  const dailyBonus = withinWaterworksRadius ? FARMSTEAD_FOOD_BONUS_PER_DAY * WATERWORKS_OUTPUT_MULT : FARMSTEAD_FOOD_BONUS_PER_DAY;
  return dailyBonus / 1440;
};

const withinRadiusOfAnyKey = (x: number, y: number, candidateKeys: ReadonlySet<string>, radius: number): boolean => {
  for (const candidateKey of candidateKeys) {
    const comma = candidateKey.indexOf(",");
    if (comma < 0) continue;
    const cx = Number(candidateKey.slice(0, comma));
    const cy = Number(candidateKey.slice(comma + 1));
    if (Math.max(wrappedAxisDistance(x, cx, WORLD_WIDTH), wrappedAxisDistance(y, cy, WORLD_HEIGHT)) <= radius) return true;
  }
  return false;
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
    /** Precomputed set of active Foundry positions (tileKey) owned by the tile's player. */
    foundryKeys?: ReadonlySet<string> | undefined;
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
  // MINE/CAMP: active structure multiplies the tile's base resource output by
  // STRUCTURE_OUTPUT_MULT (matches legacy economicStructureOutputMultAt).
  // MINE sits on IRON tiles, CAMP on WOOD/FUR tiles — neither is a converter
  // (no entry in converterDailyOutput), they boost the resource itself.
  if (
    tile.economicStructure?.status === "active" &&
    (tile.economicStructure.type === "MINE" || tile.economicStructure.type === "CAMP")
  ) {
    for (const key of Object.keys(strategicPerDay) as StrategicYieldKey[]) {
      strategicPerDay[key] = (strategicPerDay[key] ?? 0) * STRUCTURE_OUTPUT_MULT;
    }
  }
  // Foundry radius boost: an active MINE within FOUNDRY_RADIUS of an active,
  // owned Foundry gets its IRON/CRYSTAL output multiplied by FOUNDRY_OUTPUT_MULT
  // (applied on top of the MINE's own STRUCTURE_OUTPUT_MULT above).
  if (
    tile.economicStructure?.type === "MINE" &&
    tile.economicStructure.status === "active" &&
    economyContext?.foundryKeys &&
    economyContext.foundryKeys.size > 0 &&
    withinRadiusOfAnyKey(tile.x, tile.y, economyContext.foundryKeys, FOUNDRY_RADIUS)
  ) {
    for (const key of Object.keys(strategicPerDay) as StrategicYieldKey[]) {
      strategicPerDay[key] = (strategicPerDay[key] ?? 0) * FOUNDRY_OUTPUT_MULT;
    }
  }
  // Waterworks radius boost: a FARM tile with an active Farmstead within
  // WATERWORKS_RADIUS of an active Waterworks gets +100% on its total FOOD
  // output (base + farmstead combined).
  if (
    tile.resource === "FARM" &&
    tile.economicStructure?.type === "FARMSTEAD" &&
    tile.economicStructure.status === "active" &&
    typeof strategicPerDay.FOOD === "number" &&
    economyContext?.waterworksKeys &&
    economyContext.waterworksKeys.size > 0 &&
    withinRadiusOfAnyKey(tile.x, tile.y, economyContext.waterworksKeys, WATERWORKS_RADIUS)
  ) {
    strategicPerDay.FOOD *= WATERWORKS_OUTPUT_MULT;
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
