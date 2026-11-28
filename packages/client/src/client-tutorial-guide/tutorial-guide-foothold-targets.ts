// What the guide's "take a town" and "take food" steps tell the player to do,
// from the state of the towns / food tiles (grain FARM, FISH) they know about:
//
//   1. A target that is already the player's FRONTIER (reach auto-claims every
//      neutral tile inside it, so an in-reach target usually ends up here):
//      "Garrison" it. Its tile menu offers Garrison, not Expand To.
//   2. Otherwise, a neutral target the player has seen -- in vision, or
//      remembered under fog after a scout drone flew over it -- in practice one
//      outside reach: "Expand To" it. Expand To walks the border across to a
//      non-adjacent target through a waypoint chain (expandToAction in
//      client-tile-action-neutral.ts), and fogged tiles offer it too
//      (foggedTileActions). A drone's reveal drops back to fog behind it, so
//      counting only tiles in vision would forget what the drone just found.
//   3. Otherwise (nothing known): send the scout drone (Explore). It is free
//      and reports towns and food (tutorial-guide-explore-target.ts). While it
//      is out, wait for its report.
//   4. With no drone (no AFC) or nothing left unexplored nearby, or food known
//      only outside reach: build a Relay Beacon on the checklist's recommended
//      site to push reach outward.
//
// Garrison is reach-gated (client-tile-action-settle-visibility.ts, mirroring
// the sim): a food tile outside reach shows "Outside your reach" and can never
// be garrisoned, even after Expand To claims it. So a food tile only counts as
// a target while it is inside reach; with none, the step asks for a Relay
// Beacon, which is what brings such a tile into reach. Towns are exempt
// (settleIgnoresReach), so a town outside reach still counts.
//
// A neutral town with no overland route from the player's land (across water
// they have seen; client-only check, tutorial-guide-town-route.ts) is not an
// Expand To target: its menu has no Expand To. The step then falls through to
// Explore, since finding land across the water is what the scout drone is for.
// Only the nearest few towns are checked, to bound the cost.
//
// SETTLEMENT-tier towns are skipped: only a player's own free spawn has that
// tier, and it never counts as the town goal (client-onboarding-checklist.ts).

import type { Tile } from "../client-types.js";
import { settleIgnoresReach } from "@border-empires/shared";
import { townIdentityForTile } from "../client-town-identity.js";
import type { GuideScoutStatus } from "./tutorial-guide-explore-target.js";

export type GuideTargetSet = {
  /** Tiles of this kind with the player's claim or garrison already underway (optimisticPending): nothing to ask for, just wait. */
  pending: Array<{ x: number; y: number }>;
  /** The player's own FRONTIER tiles of this kind, with nothing underway on them. */
  garrison: Array<{ x: number; y: number }>;
  /** Neutral tiles of this kind the player has seen (in vision, or remembered under fog). */
  expand: Array<{ x: number; y: number }>;
  /** Known tiles of this kind that only a Relay Beacon can help with: food outside reach (Garrison is reach-gated). */
  outOfReach: number;
  /** Neutral towns seen but with no overland route (across water): no Expand To in their menu, so the scout drone goes out instead. */
  unreachable: number;
};

export type GuideFootholdTargets = { town: GuideTargetSet; food: GuideTargetSet };

export type GuideTargetAction = "pending" | "garrison" | "expand" | "explore" | "scouting" | "beacon";

const MAX_TARGETS = 3;
/** Nearest neutral towns checked for an overland route per scan. */
export const MAX_TOWN_ROUTE_CHECKS = 8;
/**
 * Known food outside reach asks for a Relay Beacon only this close to home
 * (Manhattan): a beacon reaches 5 tiles and goes near the edge of reach, so food
 * further out is no reason to stop exploring for nearer food.
 */
export const GUIDE_BEACON_FOOD_DISTANCE = 12;
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
  inReach: (x: number, y: number) => boolean,
  hasRoute: (town: { x: number; y: number }) => boolean = () => true,
  queuedTargetKeys: ReadonlySet<string> = new Set()
): GuideFootholdTargets => {
  const result: GuideFootholdTargets = {
    town: { pending: [], garrison: [], expand: [], outOfReach: 0, unreachable: 0 },
    food: { pending: [], garrison: [], expand: [], outOfReach: 0, unreachable: 0 }
  };
  for (const tile of tiles) {
    const kind = isTownTarget(tile) ? result.town : isFoodTarget(tile) ? result.food : undefined;
    if (!kind) continue;
    // Out of reach, Garrison is refused, so neither Garrison nor Expand To would finish the food step.
    if (kind === result.food && !settleIgnoresReach(tile) && !inReach(tile.x, tile.y)) {
      if ((!tile.ownerId || tile.ownerId === me) && byDistance(tile) <= GUIDE_BEACON_FOOD_DISTANCE) kind.outOfReach += 1;
      continue;
    }
    // Expand To marks its target as our pending FRONTIER and garrisons it once the
    // claim lands; asking for a Garrison then would be asking for what is already happening.
    // An Expand To the target is queued for (a waypoint chain: the target turns ours only when the last
    // leg lands) is underway too. First-15 playtest 2026-11-28: the step still read "then Expand To" while
    // the town's menu offered only Cancel Waypoint, so the order looked lost.
    if (tile.ownerId === me && tile.optimisticPending) kind.pending.push({ x: tile.x, y: tile.y });
    else if (!tile.ownerId && queuedTargetKeys.has(`${tile.x},${tile.y}`)) kind.pending.push({ x: tile.x, y: tile.y });
    else if (tile.ownerId === me && tile.ownershipState === "FRONTIER") kind.garrison.push({ x: tile.x, y: tile.y });
    else if (!tile.ownerId) kind.expand.push({ x: tile.x, y: tile.y });
  }
  const nearest = (list: Array<{ x: number; y: number }>) => list.sort((a, b) => byDistance(a) - byDistance(b)).slice(0, MAX_TARGETS);
  for (const set of [result.town, result.food]) {
    set.pending = nearest(set.pending);
    set.garrison = nearest(set.garrison);
  }
  result.food.expand = nearest(result.food.expand);
  const towns = result.town.expand.sort((a, b) => byDistance(a) - byDistance(b));
  const routed: Array<{ x: number; y: number }> = [];
  for (const town of towns.slice(0, MAX_TOWN_ROUTE_CHECKS)) {
    if (routed.length >= MAX_TARGETS) break;
    if (hasRoute(town)) routed.push(town);
    else result.town.unreachable += 1;
  }
  result.town.expand = routed;
  return result;
};

/**
 * What to ask for. `scout` is the drone's status and `canExplore` whether any
 * unexplored ground is near enough to point at. Known food outside reach goes
 * straight to the beacon: exploring more can't bring it into reach.
 */
export const guideTargetAction = (targets: GuideTargetSet, scout: GuideScoutStatus = "none", canExplore = false): GuideTargetAction => {
  if (targets.pending.length > 0) return "pending";
  if (targets.garrison.length > 0) return "garrison";
  if (targets.expand.length > 0) return "expand";
  if (targets.outOfReach > 0) return "beacon";
  if (scout === "out") return "scouting";
  if (scout === "ready" && canExplore) return "explore";
  return "beacon";
};
