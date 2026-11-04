import { townIdentityForTile } from "../client-town-identity.js";
import { shouldShowTownUnfedWarning, shouldShowTownUpgradeReadyBadge, townGrowthBlocker } from "../client-town-growth/client-town-growth.js";
import type { Tile } from "../client-types.js";

export type TownNameplateStatus = "unfed" | "unruly" | "upgrade" | "war" | "captured";
/** Own towns only: growing, or paused by hunger, a nearby war or a recent capture. Absent when neither (e.g. at the tier cap). */
export type TownNameplateGrowth = "growing" | "paused";

export interface TownNameplate {
  readonly name: string;
  readonly ownerId: string;
  readonly own: boolean;
  readonly status?: TownNameplateStatus | undefined;
  /** Own towns only: population, rounded for display. */
  readonly population?: number | undefined;
  readonly growth?: TownNameplateGrowth | undefined;
  /** Bigger towns win overlap fights; own towns always outrank rivals. */
  readonly rank: number;
}

const GROWTH_EPSILON = 0.001;
const TIER_RANK = { SETTLEMENT: 0, TOWN: 1, CITY: 2, GREAT_CITY: 3, METROPOLIS: 4 } as const;

export const STATUS_LABEL: Record<TownNameplateStatus, string> = {
  unfed: "Unfed",
  unruly: "Unruly: short of luxury biota, giving a smaller town's manpower",
  upgrade: "Upgrade ready",
  war: "Nearby war: growth paused",
  captured: "Recently captured: growth paused"
};

// Same gates as the tile menu (shouldShowTownUnfedWarning /
// shouldShowTownUpgradeReadyBadge), so a plate never claims a status the
// town's own menu doesn't. Unfed outranks everything: it costs coin now.
// Unruly (a large town short of biota) comes next: it costs manpower now.
const ownStatus = (tile: Tile, me: string, nowMs: number, unrulyTownKeys?: ReadonlySet<string>): TownNameplateStatus | undefined => {
  if (shouldShowTownUnfedWarning(tile, me)) return "unfed";
  if (unrulyTownKeys?.has(`${tile.x},${tile.y}`)) return "unruly";
  const blocker = tile.town ? townGrowthBlocker(tile.town, nowMs) : undefined;
  if (blocker === "Nearby war") return "war";
  if (blocker === "Recently captured") return "captured";
  if (shouldShowTownUpgradeReadyBadge(tile, me)) return "upgrade";
  return undefined;
};

/** `unrulyTownKeys`: your towns above Town tier that get less biota than they need (ManpowerBreakdown.biotaTowns). */
export const townNameplateFor = (tile: Tile | undefined, me: string, nowMs: number, unrulyTownKeys?: ReadonlySet<string>): TownNameplate | undefined => {
  const identity = townIdentityForTile(tile);
  if (!tile || !identity || tile.terrain !== "LAND" || !tile.ownerId || tile.fogged) return undefined;
  const own = Boolean(me) && tile.ownerId === me;
  const status = own ? ownStatus(tile, me, nowMs, unrulyTownKeys) : undefined;
  const population = own && typeof tile.town?.population === "number" ? Math.round(tile.town.population) : undefined;
  // The mark rides on the population, so it needs one. Paused also covers an unfed
  // settlement, which has no unfed bubble (shouldShowTownUnfedWarning skips that tier).
  // "Growing" uses the same 0.001 threshold as the tile menu and unfed gate, so a
  // rounded near-zero rate at the cap doesn't read as growth.
  const growth: TownNameplateGrowth | undefined = population === undefined
    ? undefined
    : status === "unfed" || status === "war" || status === "captured" || tile.town?.isFed === false
      ? "paused"
      : (tile.town?.populationGrowthPerMinute ?? 0) > GROWTH_EPSILON ? "growing" : undefined;
  return {
    name: identity.name || `Town ${tile.x}, ${tile.y}`,
    ownerId: tile.ownerId,
    own,
    status,
    population,
    growth,
    rank: (own ? 10 : 0) + (status ? 5 : 0) + TIER_RANK[identity.populationTier]
  };
};

/** 940, 9.8k, 48k, 1.4M: short enough to sit at the end of a plate. */
export const formatPlatePopulation = (population: number): string => {
  if (population < 1_000) return String(population);
  if (population < 10_000) return `${(population / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  if (population < 999_500) return `${Math.round(population / 1_000)}k`;
  return `${(population / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
};
