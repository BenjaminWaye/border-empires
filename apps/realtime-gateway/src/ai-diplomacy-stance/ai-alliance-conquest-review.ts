// An AI re-weighs an alliance with a weak neighbour (owner rule, Playtest Run 4 follow-up): it allied because the
// neighbour's land wasn't worth taking. Once that neighbour leaves a border town or resource unfortified again
// (ai-conquest-worth.ts), the AI gives the usual 24h notice to leave -- the same test that refuses a new alliance.
import { bordersTouchInTiles } from "./ai-diplomacy-stance-input.js";
import { requesterLandWorthTaking } from "./ai-conquest-worth.js";
import { WEAK_NEIGHBOUR_STRENGTH_RATIO } from "./ai-diplomacy-pricing.js";

type ViewTile = Parameters<typeof requesterLandWorthTaking>[0][number] & Parameters<typeof bordersTouchInTiles>[0][number];

/**
 * Allies of `aiId` it would now rather conquer: neighbours in its own view, at least WEAK_NEIGHBOUR_STRENGTH_RATIO
 * times smaller by tile count, holding a border town or resource no fort covers.
 */
export const weakNeighboursToLeave = (
  aiId: string,
  allies: readonly string[],
  tilesOf: (playerId: string) => number,
  view: readonly ViewTile[]
): string[] =>
  allies.filter((allyId) => {
    const allyTiles = tilesOf(allyId);
    if (!(allyTiles > 0) || tilesOf(aiId) / allyTiles < WEAK_NEIGHBOUR_STRENGTH_RATIO) return false;
    return bordersTouchInTiles(view, aiId, allyId) && requesterLandWorthTaking(view, aiId, allyId);
  });
