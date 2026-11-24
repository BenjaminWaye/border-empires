// An AI re-weighs an alliance with a weak neighbour (owner rule, Playtest Run 4 follow-up): it allied because the
// neighbour's land wasn't worth taking. Once that neighbour leaves a border town or resource unfortified again
// (ai-conquest-worth.ts), the AI gives the usual 24h notice to leave -- the same test that refuses a new alliance --
// unless the wars it is already fighting leave no army for one more (ai-war-fronts.ts).
import { bordersTouchInTiles, musterManpowerFromTiles } from "./ai-diplomacy-stance-input.js";
import { requesterLandWorthTaking } from "./ai-conquest-worth.js";
import { WEAK_NEIGHBOUR_STRENGTH_RATIO } from "./ai-diplomacy-pricing.js";
import { canOpenAnotherFront, warFrontsInView } from "./ai-war-fronts.js";

type ViewTile = Parameters<typeof bordersTouchInTiles>[0][number];

/** The AI's own view: its tiles and, when present, its army. */
export type AiAllianceView = {
  tiles: readonly ViewTile[];
  player?: { manpower: number; manpowerCap: number } | undefined;
};

/**
 * Allies the AI would now rather fight: much smaller (WEAK_NEIGHBOUR_STRENGTH_RATIO by tile count), touching its
 * border, with land worth taking. Each candidate is checked against the AI's other wars plus the war with it;
 * with no army reading the AI can't vouch it could fight, so it leaves no one.
 */
export const weakNeighboursToLeave = (
  aiId: string,
  allies: readonly string[],
  tilesOf: (playerId: string) => number,
  view: AiAllianceView,
  atWarWith: (playerId: string) => boolean
): string[] => {
  const player = view.player;
  if (!player) return [];
  const fightingStrength = player.manpower + musterManpowerFromTiles(view.tiles, aiId);
  return allies.filter((allyId) => {
    const allyTiles = tilesOf(allyId);
    if (!(allyTiles > 0) || tilesOf(aiId) / allyTiles < WEAK_NEIGHBOUR_STRENGTH_RATIO) return false;
    if (!bordersTouchInTiles(view.tiles, aiId, allyId) || !requesterLandWorthTaking(view.tiles, aiId, allyId)) return false;
    return canOpenAnotherFront(fightingStrength, player.manpowerCap, warFrontsInView(view.tiles, aiId, atWarWith, allyId));
  });
};
