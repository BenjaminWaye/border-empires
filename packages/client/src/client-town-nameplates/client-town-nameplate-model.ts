import { townIdentityForTile } from "../client-town-identity.js";
import { shouldShowTownUnfedWarning, shouldShowTownUpgradeReadyBadge, townGrowthBlocker } from "../client-town-growth/client-town-growth.js";
import type { Tile } from "../client-types.js";

export type TownNameplateStatus = "unfed" | "upgrade" | "war" | "captured";

export interface TownNameplate {
  readonly name: string;
  readonly ownerId: string;
  readonly own: boolean;
  readonly status?: TownNameplateStatus | undefined;
  /** Own towns only: population, rounded for display. */
  readonly population?: number | undefined;
  /** Bigger towns win overlap fights; own towns always outrank rivals. */
  readonly rank: number;
}

const TIER_RANK = { SETTLEMENT: 0, TOWN: 1, CITY: 2, GREAT_CITY: 3, METROPOLIS: 4 } as const;

export const STATUS_LABEL: Record<TownNameplateStatus, string> = {
  unfed: "Unfed",
  upgrade: "Upgrade ready",
  war: "Nearby war",
  captured: "Recently captured"
};

// Same gates as the tile menu (shouldShowTownUnfedWarning /
// shouldShowTownUpgradeReadyBadge), so a plate never claims a status the
// town's own menu doesn't. Unfed outranks everything: it costs coin now.
const ownStatus = (tile: Tile, me: string, nowMs: number): TownNameplateStatus | undefined => {
  if (shouldShowTownUnfedWarning(tile, me)) return "unfed";
  const blocker = tile.town ? townGrowthBlocker(tile.town, nowMs) : undefined;
  if (blocker === "Nearby war") return "war";
  if (blocker === "Recently captured") return "captured";
  if (shouldShowTownUpgradeReadyBadge(tile, me)) return "upgrade";
  return undefined;
};

export const townNameplateFor = (tile: Tile | undefined, me: string, nowMs: number): TownNameplate | undefined => {
  const identity = townIdentityForTile(tile);
  if (!tile || !identity || tile.terrain !== "LAND" || !tile.ownerId || tile.fogged) return undefined;
  const own = Boolean(me) && tile.ownerId === me;
  const status = own ? ownStatus(tile, me, nowMs) : undefined;
  const population = own && typeof tile.town?.population === "number" ? Math.round(tile.town.population) : undefined;
  return {
    name: identity.name || `Town ${tile.x}, ${tile.y}`,
    ownerId: tile.ownerId,
    own,
    status,
    population,
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
