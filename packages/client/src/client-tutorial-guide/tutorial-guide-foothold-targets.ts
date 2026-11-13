// What the guide's "take a town" and "take food" steps tell the player to do,
// from the state of the towns / food tiles (grain FARM, FISH) they know about:
//
//   1. A target that is already the player's FRONTIER (reach auto-claims every
//      neutral tile inside it, so an in-reach target usually ends up here):
//      "Garrison" it. Its tile menu offers Garrison, not Expand To.
//   2. Otherwise, a neutral target in vision (not fogged) -- in practice one
//      outside reach: "Expand To" it. Expand To walks the border across to a
//      non-adjacent target through a waypoint chain (expandToAction in
//      client-tile-action-neutral.ts).
//   3. Otherwise (nothing in vision): build a Relay Beacon on the checklist's
//      recommended site to push reach and vision outward.
//
// Garrison is reach-gated (client-tile-action-settle-visibility.ts, mirroring
// the sim): a food tile outside reach shows "Outside your reach" and can never
// be garrisoned, even after Expand To claims it. So a food tile only counts as
// a target while it is inside reach; with none, the step asks for a Relay
// Beacon, which is what brings such a tile into reach. Towns are exempt
// (settleIgnoresReach), so a town outside reach still counts.
//
// SETTLEMENT-tier towns are skipped: only a player's own free spawn has that
// tier, and it never counts as the town goal (client-onboarding-checklist.ts).

import type { Tile } from "../client-types.js";
import { settleIgnoresReach } from "@border-empires/shared";
import { townIdentityForTile } from "../client-town-identity.js";

export type GuideTargetSet = {
  /** Tiles of this kind with the player's claim or garrison already underway (optimisticPending): nothing to ask for, just wait. */
  pending: Array<{ x: number; y: number }>;
  /** The player's own FRONTIER tiles of this kind, with nothing underway on them. */
  garrison: Array<{ x: number; y: number }>;
  /** Neutral tiles of this kind currently in vision. */
  expand: Array<{ x: number; y: number }>;
};

export type GuideFootholdTargets = { town: GuideTargetSet; food: GuideTargetSet };

export type GuideTargetAction = "pending" | "garrison" | "expand" | "beacon";

const MAX_TARGETS = 3;
const FOOD_RESOURCES: ReadonlySet<string> = new Set(["FARM", "FISH"]);

const isTownTarget = (tile: Tile): boolean => {
  const town = townIdentityForTile(tile);
  return Boolean(town && town.populationTier !== "SETTLEMENT");
};

const isFoodTarget = (tile: Tile): boolean => Boolean(tile.resource && FOOD_RESOURCES.has(tile.resource));

/** One pass over known tiles; callers cache it per tiles revision (tutorial-guide-input.ts). */
export const scanGuideFootholdTargets = (
  tiles: Iterable<Tile>,
  me: string,
  byDistance: (t: { x: number; y: number }) => number,
  inReach: (x: number, y: number) => boolean
): GuideFootholdTargets => {
  const result: GuideFootholdTargets = { town: { pending: [], garrison: [], expand: [] }, food: { pending: [], garrison: [], expand: [] } };
  for (const tile of tiles) {
    const kind = isTownTarget(tile) ? result.town : isFoodTarget(tile) ? result.food : undefined;
    if (!kind) continue;
    // Out of reach, Garrison is refused, so neither Garrison nor Expand To would finish the food step.
    if (kind === result.food && !settleIgnoresReach(tile) && !inReach(tile.x, tile.y)) continue;
    // Expand To marks its target as our pending FRONTIER and garrisons it once the
    // claim lands; asking for a Garrison then would be asking for what is already happening.
    if (tile.ownerId === me && tile.optimisticPending) kind.pending.push({ x: tile.x, y: tile.y });
    else if (tile.ownerId === me && tile.ownershipState === "FRONTIER") kind.garrison.push({ x: tile.x, y: tile.y });
    else if (!tile.ownerId && !tile.fogged) kind.expand.push({ x: tile.x, y: tile.y });
  }
  const nearest = (list: Array<{ x: number; y: number }>) => list.sort((a, b) => byDistance(a) - byDistance(b)).slice(0, MAX_TARGETS);
  for (const set of [result.town, result.food]) {
    set.pending = nearest(set.pending);
    set.garrison = nearest(set.garrison);
    set.expand = nearest(set.expand);
  }
  return result;
};

export const guideTargetAction = (targets: GuideTargetSet): GuideTargetAction =>
  targets.pending.length > 0 ? "pending" : targets.garrison.length > 0 ? "garrison" : targets.expand.length > 0 ? "expand" : "beacon";
