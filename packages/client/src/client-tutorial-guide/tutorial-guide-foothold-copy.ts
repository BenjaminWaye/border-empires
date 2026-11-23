// The foothold steps' copy and map targets (take a town, take food), split out of
// tutorial-guide-steps.ts. Each step says what to do when nothing is in sight:
// Explore with the scout drone for the first few flights, then a Relay Beacon.
// A House with no town is never left without one to find: the simulation names
// the nearest unowned town (state.guideTownLead) and, while it's still in fog, the
// town step marks it and asks for Explore there, however many flights it takes
// (Playtest Run 4: five drone flights in random directions and still no town).

import { guideTargetAction, type GuideTargetAction } from "./tutorial-guide-foothold-targets.js";
import { GUIDE_EXPLORE_MAX_FLIGHTS } from "./tutorial-guide-explore-target.js";
import type { GuideInput } from "./tutorial-guide-steps.js";

const EXPLORE_TITLE = "tap the marked unexplored ground and Explore";

export const TOWN_STEP: Record<GuideTargetAction, { title: string; why: string }> = {
  explore: { title: `No town in sight: ${EXPLORE_TITLE}`, why: "Your scout drone is free and reports the towns it flies over." },
  scouting: { title: "Your scout drone is out: wait for its report", why: "Towns it finds stay on your map. Then Expand To one." },
  pending: { title: "Your claim on the marked town is underway", why: "Once your claim lands, it garrisons itself." },
  // Not "your reach claimed it": a town Expand To claimed can sit outside reach (towns may be garrisoned there anyway).
  garrison: { title: "Tap the marked town and Garrison it", why: "It's your frontier now; a garrison makes it count and grow." },
  expand: { title: "Tap the marked town and Expand To it", why: "It's outside your reach: Expand To claims the land across to it." },
  beacon: { title: "No town in sight: build a Relay Beacon", why: "Its reach and vision push outward until a town comes into view." }
};

const FOOD_STEP: Record<GuideTargetAction, { title: string; why: string }> = {
  explore: { title: `No food in sight: ${EXPLORE_TITLE}`, why: "Your scout drone is free and reports the grain and fish it flies over." },
  scouting: { title: "Your scout drone is out: wait for its report", why: "Grain and fish it finds stay on your map." },
  pending: { title: "Your claim on the marked food tile is underway", why: "Once your claim lands, it garrisons itself." },
  garrison: { title: "Tap a marked food tile and Garrison it", why: "Your reach already claimed it; only garrisoned food counts, and fish is worth two slots." },
  expand: { title: "Tap a marked food tile and Expand To it", why: "It's outside your reach: Expand To claims the land across to it." },
  beacon: { title: "No food in sight: build a Relay Beacon", why: "Its reach and vision push outward to more grain and fish." }
};

/** The town and food steps ask for Explore only for the first few flights: past that, a target the drone can't reach would loop, so they fall back to a beacon. */
const canExplore = (input: GuideInput): boolean =>
  input.scout === "ready" && input.scoutFlights < GUIDE_EXPLORE_MAX_FLIGHTS && input.exploreTarget() !== undefined;
/** The beacon ask when grain or fish is known but only outside reach, where Garrison is refused. */
const FOOD_OUT_OF_REACH = { title: "No food in your reach: build a Relay Beacon", why: "Garrison only works inside your reach. A beacon pushes it out to the grain and fish you've found." };

export const foodCopy = (input: GuideInput): { title: string; why: string } => {
  const action = foodAction(input);
  return action === "beacon" && input.footholdTargets.food.outOfReach > 0 ? FOOD_OUT_OF_REACH : FOOD_STEP[action];
};

/** Steering toward the town lead: no town known at all, the lead still in fog, and a drone to send. */
const followsTownLead = (input: GuideInput): boolean => {
  const town = input.footholdTargets.town;
  const nothingKnown = town.pending.length + town.garrison.length + town.expand.length + town.outOfReach === 0;
  return nothingKnown && input.townLead !== undefined && input.scout !== "none";
};

export const townAction = (input: GuideInput): GuideTargetAction =>
  followsTownLead(input) ? (input.scout === "out" ? "scouting" : "explore") : guideTargetAction(input.footholdTargets.town, input.scout, canExplore(input));
export const foodAction = (input: GuideInput): GuideTargetAction => guideTargetAction(input.footholdTargets.food, input.scout, canExplore(input));
export const exploreHighlight = (input: GuideInput): ReadonlyArray<{ x: number; y: number }> => {
  const target = input.exploreTarget();
  return target ? [target] : [];
};

/**
 * Before the player owns a town (the foothold's town step was skipped), a town
 * they can take comes before a Relay Beacon: it extends reach by itself, so the
 * Relay Beacon step points at that town first. Once any town is held the step
 * asks for the beacon, so towns coming into view can't keep deferring it.
 */
const TAKEABLE_TOWN_ACTIONS: ReadonlySet<GuideTargetAction> = new Set(["pending", "garrison", "expand"]);
// Only a town the player can take now: "explore" / "scouting" would turn the beacon step into a drone loop.
export const townBeforeBeacon = (input: GuideInput): boolean => !input.checklist.townExpanded && TAKEABLE_TOWN_ACTIONS.has(townAction(input));

export const targetHighlights =
  (kind: "town" | "food") =>
  (input: GuideInput): ReadonlyArray<{ x: number; y: number }> => {
    const action = kind === "town" ? townAction(input) : foodAction(input);
    if (kind === "town" && action === "explore" && followsTownLead(input) && input.townLead) return [input.townLead];
    if (action === "explore") return exploreHighlight(input);
    if (action === "scouting") return [];
    // Only the recommended beacon site: the checklist's other highlights follow
    // its own reach-based goal and could point at a town or food tile instead.
    if (action === "beacon") return input.checklist.relayBeaconSite ? [input.checklist.relayBeaconSite] : [];
    return input.footholdTargets[kind][action];
  };

/**
 * The Relay Beacon site the current step asks the player to build on, if any:
 * the Relay Beacon step's own site, or a foothold step's site when no town or
 * food is in reach. Drives the build menu's Recommended badge.
 */
export const guideBeaconSite = (stepId: string, input: GuideInput): { x: number; y: number } | undefined => {
  if (stepId === "reach-beacon") return townBeforeBeacon(input) ? undefined : input.beaconSite();
  const footholdBeacon =
    ((stepId === "foothold-take-town" || (stepId === "build-first" && needsTownForBuild(input))) && townAction(input) === "beacon") ||
    ((stepId === "foothold-take-food" || stepId === "build-food-slot") && foodAction(input) === "beacon");
  return footholdBeacon ? input.checklist.relayBeaconSite : undefined;
};

/** Where to build the beacon: the marked recommended site when there is one, otherwise any garrisoned border tile. */
const beaconWhere = (input: GuideInput): string =>
  input.checklist.relayBeaconSite ? ": tap the marked tile, then Build" : " on a garrisoned tile at the edge of your land";

/** "No town in sight" is wrong when the drone already found towns across water: say none can be reached. */
const townActionTitle = (input: GuideInput, action: GuideTargetAction): string => {
  const title = TOWN_STEP[action].title;
  return input.footholdTargets.town.unreachable > 0 ? title.replace("No town in sight", "No town you can reach") : title;
};

const TOWN_LEAD_EXPLORE = {
  title: "A town lies this way: tap the marked fog and Explore",
  why: "Your drone reports the towns it flies over. Then Expand To the town."
};

export const townWhy = (input: GuideInput): string =>
  followsTownLead(input) && townAction(input) === "explore" ? TOWN_LEAD_EXPLORE.why : TOWN_STEP[townAction(input)].why;

export const townTitle = (input: GuideInput): string => {
  if (followsTownLead(input) && townAction(input) === "explore") return TOWN_LEAD_EXPLORE.title;
  const action = townAction(input);
  return townActionTitle(input, action) + (action === "beacon" ? beaconWhere(input) : "");
};

export const foodTitle = (input: GuideInput): string => {
  const action = foodAction(input);
  const progress = ` (${input.checklist.foodSlotsClaimed}/${input.checklist.foodSlotsTarget} slots)`;
  return foodCopy(input).title + (action === "beacon" ? beaconWhere(input) : action === "explore" || action === "scouting" ? "" : progress);
};

/** No garrisoned town to build the Manufactory on (the town step was skipped): the build step asks for a town first. */
export const needsTownForBuild = (input: GuideInput): boolean => input.buildTargetTiles.length === 0;
