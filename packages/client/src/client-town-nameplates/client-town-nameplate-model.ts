import { townIdentityForTile } from "../client-town-identity.js";
import { displayTownPopulationTierLabel, shouldShowTownUnfedWarning, shouldShowTownUpgradeReadyBadge, townGrowthBlocker } from "../client-town-growth/client-town-growth.js";
import type { Tile } from "../client-types.js";

export type TownNameplateStatus = "unfed" | "upgrade" | "war" | "captured";

export interface TownNameplate {
  readonly name: string;
  readonly tier: string;
  readonly own: boolean;
  readonly status?: TownNameplateStatus | undefined;
  /** Bigger towns win overlap fights; own towns always outrank rivals. */
  readonly rank: number;
}

/** Below this zoom an own town with a status collapses to a status dot; others hide. */
export const NAMEPLATE_FULL_ZOOM = 30;
/** Rival towns and own settlements only get plates once zoomed this far in. */
export const NAMEPLATE_DETAIL_ZOOM = 44;

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
  return {
    name: identity.name || `Town ${tile.x}, ${tile.y}`,
    tier: displayTownPopulationTierLabel(identity.populationTier),
    own,
    status,
    rank: (own ? 10 : 0) + (status ? 5 : 0) + TIER_RANK[identity.populationTier]
  };
};

export type NameplateMode = "full" | "dot" | "hidden";

export const nameplateModeAt = (plate: TownNameplate, zoom: number, isSettlement: boolean): NameplateMode => {
  const needsDetail = !plate.own || isSettlement;
  if (zoom >= (needsDetail ? NAMEPLATE_DETAIL_ZOOM : NAMEPLATE_FULL_ZOOM)) return "full";
  return plate.status ? "dot" : "hidden";
};
