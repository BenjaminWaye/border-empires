// The new-account tutorial guide's chapters and steps, as data. Every step is
// taught by doing: it completes when the game state (or a player input
// signal) shows the player did it, never by clicking "Next". Steps complete
// out of order too -- a player who commissions a Manifest before opening the
// manpower gauge gets that step ticked the moment they do it.
//
// Order matters for one rule of the game: no building (other than a Relay
// Beacon) can be built until the player has commissioned a Manifest, so the
// Manifest chapter comes before the Build chapter, and the Build step only
// becomes available once a Manifest is commissioned. The Relay Beacon
// chapter comes right after the foothold, since a beacon is the one building
// a new House can raise before any Manifest.
//
// Copy is deliberately short (about 10 words to do, one line of why) and
// uses canon terms from docs/lore/galactic-lore.md: Manifests are
// *commissioned*, barbarians are *Planetary Defense*, empires are *Houses*.

import type { OnboardingChecklistState } from "../client-onboarding-checklist/client-onboarding-checklist.js";
import { guideTargetAction, type GuideFootholdTargets, type GuideTargetAction } from "./tutorial-guide-foothold-targets.js";

export type GuideAnchorId = "manpower" | "manifest" | "activity" | "diplomacy";

/** The Manifest the guide recommends first: Industrial Tooling Module, which unlocks the Manufactory (tech id "trade"). */
export const RECOMMENDED_FIRST_MANIFEST_ID = "trade";

/** Grain (the FOOD icon, used on FARM tiles) and fish: the two food sources. */
export type GuideLookForIcon = "FOOD" | "FISH";
const FOOD_ICONS: ReadonlyArray<GuideLookForIcon> = ["FOOD", "FISH"];

export type GuideInput = {
  checklist: Pick<
    OnboardingChecklistState,
    "step" | "townFound" | "townExpanded" | "foodFound" | "foodExpanded" | "foodSlotsFound" | "foodSlotsClaimed" | "foodSlotsTarget" | "highlightTiles" | "relayBeaconSite"
  >;
  /** Towns and food tiles to Garrison (own frontier) or Expand To (neutral, in vision): tutorial-guide-foothold-targets.ts. */
  footholdTargets: GuideFootholdTargets;
  /** Input signals (client-map-input.ts): the player dragged / zoomed / selected a tile themselves. */
  panned: boolean;
  zoomed: boolean;
  tileSelected: boolean;
  /** The side panel (desktop) or mobile panel currently open, if any. */
  openPanel: string | null;
  activityDashboardOpen: boolean;
  /** The new desktop HUD is active: the Activity dashboard is its Chronicle. */
  hudV2: boolean;
  /** Manifests the player has commissioned (state.techIds, excluding the tree root). */
  manifestCount: number;
  /** The Industrial Tooling Module has been commissioned (it may still be on its way to the AFC). */
  manufactoryResearched: boolean;
  /** The Industrial Tooling Module is installed on an active AFC, so a Manufactory can be built (hideTechLockedTileAction). */
  manufactoryUnlocked: boolean;
  ownsBuiltStructure: boolean;
  /** The player owns (or is building) a Relay Beacon. */
  ownsRelayBeacon: boolean;
  /** The best tile for a Relay Beacon that adds the most new reach (client-relay-beacon-site.ts), if any. A function: computed only when a step asks. */
  beaconSite: () => { x: number; y: number } | undefined;
  /** The player's garrisoned town tiles: where a Manufactory goes. */
  buildTargetTiles: ReadonlyArray<{ x: number; y: number }>;
  /** The player's AFC tile, for the "tap a tile" step. */
  afcTile: { x: number; y: number } | undefined;
  /** The player has seen another House's territory (not Planetary Defense): client-met-players.ts. */
  rivalHouseMet: boolean;
  /** Diplomacy panel/screen open, or a truce or alliance offered or in force. */
  diplomacyUsed: boolean;
  /** Mustering unlocks on first contact with Planetary Defense or a rival House (client-muster-unlock.ts). */
  musterUnlocked: boolean;
  ownsMusterFlag: boolean;
  musterTargetTiles: ReadonlyArray<{ x: number; y: number }>;
};

export type GuideChapterId = "look" | "foothold" | "reach" | "manpower" | "manifest" | "build" | "contest" | "diplomacy" | "turn";

export type GuideStepDef = {
  id: string;
  chapter: GuideChapterId;
  title: (input: GuideInput) => string;
  why: string | ((input: GuideInput) => string);
  isDone: (input: GuideInput) => boolean;
  /** Not yet possible (a prerequisite elsewhere in the game). Defaults to always available. */
  isAvailable?: (input: GuideInput) => boolean;
  /** Shown instead of the title while the step is not available yet. */
  waitingNote?: string;
  highlight?: (input: GuideInput) => ReadonlyArray<{ x: number; y: number }>;
  anchor?: GuideAnchorId;
  /** Resource icons the card shows as "Look for", so the player knows what the target looks like on the map. */
  lookFor?: ReadonlyArray<GuideLookForIcon>;
  /** Completed by pressing the card's Finish button instead of by game state. */
  acknowledge?: boolean;
  /**
   * Added to the guide after players had already progressed past its place:
   * counts as done once any later step is in their saved progress, so an
   * update never sends a player back to an earlier chapter.
   */
  doneIfLaterStepDone?: boolean;
};

export const GUIDE_CHAPTER_TITLES: Record<GuideChapterId, string> = {
  look: "Look around",
  foothold: "A foothold",
  reach: "Your reach",
  manpower: "Manpower",
  manifest: "Manifests",
  build: "Build",
  contest: "Contest",
  diplomacy: "Diplomacy",
  turn: "Your turn"
};

const TOWN_STEP: Record<GuideTargetAction, { title: string; why: string }> = {
  pending: { title: "Your claim on the marked town is underway", why: "Once your claim lands, it garrisons itself." },
  garrison: { title: "Tap the marked town and Garrison it", why: "Your reach already claimed it as frontier; a garrison makes it count and grow." },
  expand: { title: "Tap the marked town and Expand To it", why: "It's outside your reach: Expand To claims the land across to it." },
  beacon: { title: "No town in sight: build a Relay Beacon at the edge of your land", why: "A beacon pushes your reach and vision outward until a town comes into view." }
};

const FOOD_STEP: Record<GuideTargetAction, { title: string; why: string }> = {
  pending: { title: "Your claim on the marked food tile is underway", why: "Once your claim lands, it garrisons itself." },
  garrison: { title: "Tap a marked food tile and Garrison it", why: "Your reach already claimed it; only garrisoned food counts, and fish is worth two slots." },
  expand: { title: "Tap a marked food tile and Expand To it", why: "It's outside your reach: Expand To claims the land across to it." },
  beacon: { title: "No food in sight: build a Relay Beacon at the edge of your land", why: "A beacon pushes your reach and vision out to more food." }
};

const townAction = (input: GuideInput): GuideTargetAction => guideTargetAction(input.footholdTargets.town);
const foodAction = (input: GuideInput): GuideTargetAction => guideTargetAction(input.footholdTargets.food);

/**
 * Before the player owns a town (the foothold's town step was skipped), a town
 * they can take comes before a Relay Beacon: it extends reach by itself, so the
 * Relay Beacon step points at that town first. Once any town is held the step
 * asks for the beacon, so towns coming into view can't keep deferring it.
 */
const townBeforeBeacon = (input: GuideInput): boolean => !input.checklist.townExpanded && townAction(input) !== "beacon";

const targetHighlights =
  (kind: "town" | "food") =>
  (input: GuideInput): ReadonlyArray<{ x: number; y: number }> => {
    const action = guideTargetAction(input.footholdTargets[kind]);
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
  const footholdBeacon = (stepId === "foothold-take-town" && townAction(input) === "beacon") || (stepId === "foothold-take-food" && foodAction(input) === "beacon");
  return footholdBeacon ? input.checklist.relayBeaconSite : undefined;
};

const foodTitle = (input: GuideInput): string => {
  const action = foodAction(input);
  const progress = ` (${input.checklist.foodSlotsClaimed}/${input.checklist.foodSlotsTarget} slots)`;
  return FOOD_STEP[action].title + (action === "beacon" ? "" : progress);
};

/** True while the guide is on a Manifest step: the Manifest screens mark RECOMMENDED_FIRST_MANIFEST_ID as the guide's pick. */
export const guideRecommendsManifest = (stepId: string): boolean => stepId === "manifest-open" || stepId === "manifest-commission";

export const GUIDE_STEPS: readonly GuideStepDef[] = [
  { id: "look-pan", chapter: "look", title: () => "Drag the map to look around", why: "Scout before you commit: towns, food and rivals are out there.", isDone: (i) => i.panned },
  { id: "look-zoom", chapter: "look", title: () => "Zoom in and out (scroll or pinch)", why: "Zoom out to plan, zoom in to act.", isDone: (i) => i.zoomed },
  // Tapping your own AFC rather than "any tile": on the new desktop HUD a plain
  // tap on neutral land touching your border claims it at once (shouldAutoExpand,
  // client-hud-v2-tile-dock.ts), so "tap a tile" could spend manpower by accident.
  {
    id: "look-select",
    chapter: "look",
    title: () => "Tap your AFC to see what you can do there",
    why: "Every tile shows its owner, resources and what you can do there.",
    isDone: (i) => i.tileSelected,
    highlight: (i) => (i.afcTile ? [i.afcTile] : [])
  },
  { id: "foothold-find-town", chapter: "foothold", title: () => "Find a town", why: "Towns earn Coin and raise your manpower.", isDone: (i) => i.checklist.townFound },
  {
    id: "foothold-take-town",
    chapter: "foothold",
    title: (i) => TOWN_STEP[townAction(i)].title,
    why: (i) => TOWN_STEP[townAction(i)].why,
    isDone: (i) => i.checklist.townExpanded,
    highlight: targetHighlights("town")
  },
  {
    id: "foothold-find-food",
    chapter: "foothold",
    title: (i) => `Find food: grain or fish (${i.checklist.foodSlotsFound}/${i.checklist.foodSlotsTarget})`,
    why: "Food keeps your towns growing.",
    isDone: (i) => i.checklist.foodFound,
    lookFor: FOOD_ICONS
  },
  {
    id: "foothold-take-food",
    chapter: "foothold",
    title: foodTitle,
    why: (i) => FOOD_STEP[foodAction(i)].why,
    isDone: (i) => i.checklist.foodExpanded,
    highlight: targetHighlights("food"),
    lookFor: FOOD_ICONS
  },
  {
    id: "reach-beacon",
    chapter: "reach",
    title: (i) => (townBeforeBeacon(i) ? TOWN_STEP[townAction(i)].title : i.beaconSite() ? "Tap the marked tile and build a Relay Beacon" : "Build a Relay Beacon on a tile at the edge of your land"),
    why: (i) =>
      townBeforeBeacon(i)
        ? "A town pushes your reach out by itself, so take it before spending manpower on a beacon."
        : "A beacon pushes your reach and vision outward, so Expand To can claim land further out. It needs no Manifest; it costs manpower and uses one food slot.",
    isDone: (i) => i.ownsRelayBeacon,
    doneIfLaterStepDone: true,
    highlight: (i) => {
      if (townBeforeBeacon(i)) return targetHighlights("town")(i);
      const site = i.beaconSite();
      return site ? [site] : [];
    }
  },
  {
    id: "manpower-open",
    chapter: "manpower",
    title: () => "Tap your manpower gauge",
    why: "Manpower pays for every claim, garrison and attack. It refills every 4 hours.",
    isDone: (i) => i.openPanel === "manpower",
    anchor: "manpower"
  },
  {
    id: "manifest-open",
    chapter: "manifest",
    title: () => "Open Manifests",
    why: "You can't build anything but Relay Beacons until you commission a Manifest.",
    isDone: (i) => i.openPanel === "tech" || i.manifestCount > 0,
    anchor: "manifest"
  },
  {
    id: "manifest-commission",
    chapter: "manifest",
    title: () => "Commission the Industrial Tooling Module",
    why: "It unlocks the Manufactory, which turns your town's industry into Coin.",
    // Only the recommended Manifest (or already having built something) completes it: another
    // Manifest doesn't unlock the Manufactory the next step asks for.
    isDone: (i) => i.manufactoryResearched || i.ownsBuiltStructure,
    anchor: "manifest"
  },
  {
    id: "build-first",
    chapter: "build",
    title: (i) =>
      i.manufactoryUnlocked
        ? "Tap your marked town and build a Manufactory"
        : "Your Industrial Tooling Module is docking at your AFC: then build a Manufactory on your marked town",
    why: "A Manufactory goes on a garrisoned town or the tiles around it and adds Coin from the town's industry.",
    isDone: (i) => i.ownsBuiltStructure,
    isAvailable: (i) => i.manufactoryResearched,
    waitingNote: "Commission the Industrial Tooling Module to unlock the Manufactory.",
    highlight: (i) => i.buildTargetTiles
  },
  {
    id: "contest-muster",
    chapter: "contest",
    title: () => "Raise a muster flag on a marked border tile",
    why: "Flags gather manpower to attack Planetary Defense or rival Houses.",
    isDone: (i) => i.ownsMusterFlag,
    isAvailable: (i) => i.musterUnlocked,
    waitingNote: "Keep expanding: this starts when you meet Planetary Defense or a rival House.",
    highlight: (i) => i.musterTargetTiles
  },
  {
    id: "diplomacy-truce",
    chapter: "diplomacy",
    title: (i) => `A rival House is near: open ${i.hudV2 ? "Diplomacy" : "Allies"} to offer a truce`,
    why: "A truce keeps a neighbour from attacking you while you grow. AI Houses tell you their price.",
    // Opening the panel before meeting anyone doesn't count: there was no one to offer a truce to.
    isDone: (i) => i.rivalHouseMet && i.diplomacyUsed,
    isAvailable: (i) => i.rivalHouseMet,
    waitingNote: "This starts when you meet a rival House.",
    anchor: "diplomacy"
  },
  {
    id: "turn-activity",
    chapter: "turn",
    title: (i) => (i.hudV2 ? "Open the Chronicle" : "Open the Activity dashboard"),
    why: "It reports what happened while you were away.",
    isDone: (i) => i.activityDashboardOpen,
    anchor: "activity"
  },
  {
    id: "turn-finish",
    chapter: "turn",
    title: () => "That's the basics. Your manpower refills every 4 hours.",
    why: "Come back, spend it on expanding, building and attacking, and check the Activity dashboard for what happened while you were away.",
    isDone: () => false,
    acknowledge: true
  }
];

export type GuideView =
  | { kind: "done" }
  | {
      kind: "step";
      step: GuideStepDef;
      title: string;
      why: string;
      chapterTitle: string;
      chapterIndex: number;
      chapterCount: number;
      completedCount: number;
      totalCount: number;
      /** Steps already finished that the caller should persist. */
      newlyCompleted: string[];
      highlightTiles: ReadonlyArray<{ x: number; y: number }>;
      anchor?: GuideAnchorId;
      lookFor?: ReadonlyArray<GuideLookForIcon>;
      /** True when every remaining step is waiting on something; the card shows the waiting note. */
      waiting: boolean;
    };

const CHAPTER_ORDER = Object.keys(GUIDE_CHAPTER_TITLES) as GuideChapterId[];

/**
 * Picks the step to show: the first incomplete step that is available. When
 * every incomplete step is waiting (e.g. no contact yet for the muster flag),
 * shows the first waiting one with its note. Completion is sticky: a step in
 * `completed` (finished, skipped or acknowledged) stays done even if the
 * state that satisfied it changes later.
 */
export const evaluateGuide = (input: GuideInput, completed: ReadonlySet<string>): GuideView => {
  const laterStepDone = (index: number): boolean => GUIDE_STEPS.slice(index + 1).some((later) => completed.has(later.id));
  const newlyCompleted = GUIDE_STEPS.filter(
    (s, index) => !completed.has(s.id) && !s.acknowledge && (s.isDone(input) || (s.doneIfLaterStepDone === true && laterStepDone(index)))
  ).map((s) => s.id);
  const done = new Set([...completed, ...newlyCompleted]);
  const remaining = GUIDE_STEPS.filter((s) => !done.has(s.id));
  if (remaining.length === 0) return { kind: "done" };
  // An acknowledge step (Finish) is only offered once every other step left is
  // waiting on something the player may never meet (no Planetary Defense or
  // rival House nearby), so the guide can always be finished.
  const isAvailable = (s: GuideStepDef): boolean => s.isAvailable?.(input) ?? true;
  const available = remaining.find((s) => isAvailable(s) && (!s.acknowledge || remaining.every((r) => r === s || !isAvailable(r))));
  const step = available ?? remaining[0]!;
  const waiting = !available;
  return {
    kind: "step",
    step,
    title: waiting ? (step.waitingNote ?? step.title(input)) : step.title(input),
    why: typeof step.why === "string" ? step.why : step.why(input),
    chapterTitle: GUIDE_CHAPTER_TITLES[step.chapter],
    chapterIndex: CHAPTER_ORDER.indexOf(step.chapter),
    chapterCount: CHAPTER_ORDER.length,
    completedCount: GUIDE_STEPS.length - remaining.length,
    totalCount: GUIDE_STEPS.length,
    newlyCompleted,
    waiting,
    highlightTiles: waiting ? [] : (step.highlight?.(input) ?? []),
    ...(step.anchor && !waiting ? { anchor: step.anchor } : {}),
    ...(step.lookFor && !waiting ? { lookFor: step.lookFor } : {})
  };
};
