// Hydroworks placement gate for the AI economic build planner.
//
// A Hydroworks adds HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS FOOD slots to each
// of its owner's Hydrogardens within HYDROWORKS_RADIUS — once per garden, no
// matter how many Hydroworks reach it (resource-slot-view.ts,
// withinRadiusOfAnyKey). The planner used to score Hydroworks on FOOD need
// alone and drop it on any plain settled tile: on staging season-41, 33 of the
// 34 AI Hydroworks boosted no garden that another Hydroworks didn't already
// boost, and 16 had no garden in range at all.
//
// Built lazily, only when a Hydroworks candidate is actually being weighed:
// one pass over owned tiles, then O(uncovered gardens) per candidate site.
import { WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";
import { HYDROWORKS_RADIUS } from "@border-empires/game-domain";

type Point = { x: number; y: number };
type HydroTile = Point & {
  ownerId?: string | undefined;
  economicStructure?: { ownerId?: string | undefined; type?: string | undefined; status?: string | undefined } | null | undefined;
};

const wrappedChebyshev = (a: Point, b: Point): number => {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return Math.max(Math.min(dx, WORLD_WIDTH - dx), Math.min(dy, WORLD_HEIGHT - dy));
};

// Gardens/works that count: running, or already being built.
const counts = (status: string | undefined): boolean => status === "active" || status === "under_construction";

/** This player's Hydrogardens that no existing or pending Hydroworks reaches yet. */
export const uncoveredHydrogardens = (playerId: string, ownedTiles: readonly HydroTile[]): Point[] => {
  const gardens: Point[] = [];
  const works: Point[] = [];
  for (const tile of ownedTiles) {
    const structure = tile.economicStructure;
    if (!structure || structure.ownerId !== playerId || !counts(structure.status)) continue;
    if (structure.type === "HYDROGARDEN") gardens.push(tile);
    else if (structure.type === "HYDROWORKS") works.push(tile);
  }
  return gardens.filter((garden) => !works.some((work) => wrappedChebyshev(garden, work) <= HYDROWORKS_RADIUS));
};

/** True when a Hydroworks on `site` would boost at least one not-yet-boosted garden. */
export const hydroworksSiteBoostsGardens = (site: Point, uncovered: readonly Point[]): boolean =>
  uncovered.some((garden) => wrappedChebyshev(site, garden) <= HYDROWORKS_RADIUS);
