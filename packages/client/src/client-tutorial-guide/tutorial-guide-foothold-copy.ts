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
import type { GuideIslandDock, GuideIslandDockAction } from "./tutorial-guide-island-dock.js";

const EXPLORE_TITLE = "tap the marked unexplored ground, then Explore and Go";

// Plain words, one short line each (Playtest Run 4: "frontier", "garrison", "reach" lost first-time players).
// Button names (Explore, Expand To, Garrison, Relay Beacon) stay exact, so the line matches what's on screen.
export const TOWN_STEP: Record<GuideTargetAction, { title: string; why: string }> = {
  explore: { title: `No town nearby: ${EXPLORE_TITLE}`, why: "Your drone shows the towns it flies over." },
  scouting: { title: "Your drone is flying: wait for its report", why: "Then tap a town it found and Expand To it." },
  pending: { title: "Taking the marked town...", why: "Your troops are on their way." },
  // Not "your reach claimed it": a town Expand To claimed can sit outside reach (towns may be garrisoned there anyway).
  garrison: { title: "Tap the marked town, then Garrison", why: "A garrisoned town counts as yours: it grows and earns coin." },
  expand: { title: "Tap the marked town, then Expand To", why: "Expand To takes the land on the way to it." },
  beacon: { title: "No town nearby: build a Relay Beacon", why: "A beacon widens your reach and shows more of the map." }
};

const FOOD_STEP: Record<GuideTargetAction, { title: string; why: string }> = {
  explore: { title: `No food nearby: ${EXPLORE_TITLE}`, why: "Your drone shows the grain and fish it flies over." },
  scouting: { title: "Your drone is flying: wait for its report", why: "Grain and fish it finds stay on your map." },
  pending: { title: "Taking the marked food tile...", why: "Your troops are on their way." },
  garrison: { title: "Tap a marked food tile, then Garrison", why: "Food only counts once garrisoned. Fish counts double." },
  expand: { title: "Tap a marked food tile, then Expand To", why: "Expand To takes the land on the way to it." },
  beacon: { title: "No food nearby: build a Relay Beacon", why: "A beacon widens your reach toward more grain and fish." }
};

// On a fully seen island the towns lie across the sea: the step points at the island's dock instead of
// flying the drone legs out to reveal a town Expand To can't reach (owner playtest, 2026-11-27).
const ISLAND_DOCK_STEP: Record<GuideIslandDockAction, { title: string; why: string }> = {
  expand: { title: "You're on an island: tap the marked dock, then Expand To", why: "Towns lie across the sea. A dock is how your troops cross." },
  garrison: { title: "Tap your marked dock, then Garrison", why: "A garrisoned dock lets your troops Cross the sea." },
  cross: { title: "Tap your marked dock, then Cross the sea", why: "Your troops sail to the dock across the water and land there." }
};

// The nearest town is more than one drone leg away and no dock is known yet: the usual nearby Explore,
// told to look for a dock (owner, 2026-11-27: never fly the drone more than one leg to a town). Not "you're
// on an island": only a fully seen island is sure (QA review of PR #3029).
const DOCK_SEARCH_STEP: Partial<Record<GuideTargetAction, { title: string; why: string }>> = {
  explore: { title: "No town close by: tap the marked ground, then Explore and Go", why: "Look for a dock. On an island, it's how your troops cross the sea." },
  scouting: { title: "Your drone is flying: wait for its report", why: "Look for a dock in what it finds. On an island, it's how your troops cross the sea." }
};

// The dock lead (tutorial-guide-dock-lead.ts): marked like the town lead, and here the guide does say what
// is there, so the player knows what they're looking for.
const DOCK_LEAD_EXPLORE = { title: "Find a dock: tap the mark, then Explore and Go", why: "No town close by. On an island, a dock is how your troops cross the sea." };
/** The free dock on land that isn't a confirmed island. */
const LAND_DOCK_EXPAND = { title: "No town close by: tap the marked dock, then Expand To", why: "On an island, a dock is how your troops cross the sea." };

type DockStep = { title: string; why: string; highlight?: ReadonlyArray<{ x: number; y: number }> };

const noTownToTake = (input: GuideInput): boolean => {
  const town = input.footholdTargets.town;
  return town.pending.length + town.garrison.length + town.expand.length === 0;
};

/** The island's dock, while the player is on an island and no town on it can be taken. */
export const islandDockLead = (input: GuideInput): GuideIslandDock | undefined => (noTownToTake(input) ? input.islandDock : undefined);

/**
 * The town step's dock ask, when the player is probably on an island and no town can be taken: the dock
 * on their land, else the dock lead, else a nearby Explore to look for one. `highlight` unset: the
 * step's usual Explore highlight.
 */
const dockStep = (input: GuideInput): DockStep | undefined => {
  const dock = islandDockLead(input);
  if (dock) {
    const copy = dock.action === "expand" && !input.islandSealed ? LAND_DOCK_EXPAND : ISLAND_DOCK_STEP[dock.action];
    return { ...copy, highlight: [{ x: dock.x, y: dock.y }] };
  }
  if (!input.townLeadFar || !noTownToTake(input)) return undefined;
  const lead = input.dockLead;
  if (lead && input.scout === "ready") return { ...DOCK_LEAD_EXPLORE, highlight: [{ x: lead.x, y: lead.y }] };
  if (lead && input.scout === "out") return { ...DOCK_SEARCH_STEP.scouting!, highlight: [] };
  return DOCK_SEARCH_STEP[townAction(input)];
};

/** The town and food steps ask for Explore only for the first few flights: past that, a target the drone can't reach would loop, so they fall back to a beacon. */
const canExplore = (input: GuideInput): boolean =>
  input.scout === "ready" && input.scoutFlights < GUIDE_EXPLORE_MAX_FLIGHTS && input.exploreTarget() !== undefined;
/** The beacon ask when grain or fish is known but only outside reach, where Garrison is refused. */
const FOOD_OUT_OF_REACH = { title: "Food is outside your reach: build a Relay Beacon", why: "You can only Garrison inside your reach. A beacon widens it to that food." };

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
    const dock = kind === "town" ? dockStep(input)?.highlight : undefined;
    if (dock) return dock;
    const action = kind === "town" ? townAction(input) : foodAction(input);
    if (kind === "town" && action === "explore" && followsTownLead(input) && input.townLead) return leadNeedsCharges(input) > 0 ? [] : [input.townLead];
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
    ((stepId === "foothold-take-town" || (stepId === "build-first" && needsTownForBuild(input))) && !dockStep(input)?.highlight && townAction(input) === "beacon") ||
    ((stepId === "foothold-take-food" || stepId === "build-food-slot") && foodAction(input) === "beacon");
  return footholdBeacon ? input.checklist.relayBeaconSite : undefined;
};

/** Where to build the beacon: the marked recommended site when there is one, otherwise any garrisoned border tile. */
const beaconWhere = (input: GuideInput): string =>
  input.checklist.relayBeaconSite ? ": tap the marked tile, then Build" : " on garrisoned land at your edge";

/** "No town nearby" is wrong when the drone already found towns across water: say none can be reached. */
const townActionTitle = (input: GuideInput, action: GuideTargetAction): string => {
  const title = TOWN_STEP[action].title;
  return input.footholdTargets.town.unreachable > 0 ? title.replace("No town nearby", "No town you can reach") : title;
};

/** The town is more legs away than charges are ready: flying part-way again would loop, so wait. */
const leadNeedsCharges = (input: GuideInput): number => (followsTownLead(input) && input.scout === "ready" ? (input.townLeadChargesShort ?? 0) : 0);

// The lead steers the drone without saying what it will find (owner, 2026-11-26): the player discovers the town.
const townLeadWait = (short: number) => ({
  title: `Let's explore further: wait for ${short} more drone charge${short === 1 ? "" : "s"}`,
  why: "It's too far for the charges you have. Used charges come back after 4 hours."
});

const TOWN_LEAD_EXPLORE = {
  title: "Let's try exploring some more: tap the mark, then Explore and Go",
  why: "Your drone flies over here and shows what it finds."
};

export const townWhy = (input: GuideInput): string => {
  const dock = dockStep(input);
  if (dock) return dock.why;
  const short = leadNeedsCharges(input);
  if (short > 0) return townLeadWait(short).why;
  return followsTownLead(input) && townAction(input) === "explore" ? TOWN_LEAD_EXPLORE.why : TOWN_STEP[townAction(input)].why;
};

export const townTitle = (input: GuideInput): string => {
  const dock = dockStep(input);
  if (dock) return dock.title;
  const short = leadNeedsCharges(input);
  if (short > 0) return townLeadWait(short).title;
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
