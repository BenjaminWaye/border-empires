// The tutorial guide's chapters and steps, as data. Every step is
// taught by doing: it completes when the game state (or a player input
// signal) shows the player did it, never by clicking "Next". Steps complete
// out of order too -- a player who commissions a Manifest before opening the
// manpower gauge gets that step ticked the moment they do it.
//
// Exploring comes first: the scout drone is free, flies from the AFC and
// reports towns, food and rivals, so it is how a new House finds what the
// foothold steps ask for. Whenever nothing is known to point at, the foothold
// steps ask for a drone flight before a Relay Beacon
// (tutorial-guide-foothold-targets.ts).
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

import { turnFinishTitle, turnFinishWhy } from "./tutorial-guide-turn-finish.js";
import type { OnboardingChecklistState } from "../client-onboarding-checklist/client-onboarding-checklist.js";
import type { GuideFootholdTargets } from "./tutorial-guide-foothold-targets.js";
import type { GuideScoutStatus } from "./tutorial-guide-explore-target.js";
import { exploreHighlight, foodCopy, foodTitle, needsTownForBuild, targetHighlights, TOWN_STEP, townAction, townBeforeBeacon, townTitle, townWhy } from "./tutorial-guide-foothold-copy.js";

export { guideBeaconSite, needsTownForBuild } from "./tutorial-guide-foothold-copy.js";

export type GuideAnchorId = "manpower" | "manifest" | "afc" | "manufactory" | "muster" | "activity" | "diplomacy";

/** The Manifest the guide recommends first: Industrial Tooling Module, which unlocks the Manufactory (tech id "trade"). */
export const RECOMMENDED_FIRST_MANIFEST_ID = "trade";

/** The AFC upgrade the guide recommends first: Founding Concession (first three towns +50% Coin, 2 fewer FOOD slots each). */
export const RECOMMENDED_FIRST_AFC_UPGRADE_ID = "afc-exchequer-1";

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
  /** Input signals (client-map-input.ts): the player dragged / zoomed the map themselves. */
  panned: boolean;
  zoomed: boolean;
  /** The side panel (desktop) or mobile panel currently open, if any. */
  openPanel: string | null;
  activityDashboardOpen: boolean;
  /** The new desktop HUD is active: the Activity dashboard is its Chronicle. */
  hudV2: boolean;
  /** Manifests the player has commissioned (state.techIds, excluding the tree root). */
  manifestCount: number;
  /**
   * The next Manifest's Coin price (the catalog's, so it matches the Manifests screen) and the player's Coin.
   * Absent before the catalog arrives: the commission step then doesn't wait.
   */
  manifestPrice?: { cost: number; coin: number };
  /** The Industrial Tooling Module has been commissioned (it may still be on its way to the AFC). */
  manufactoryResearched: boolean;
  /** The Industrial Tooling Module is installed on an active AFC, so a Manufactory can be built (hideTechLockedTileAction). */
  manufactoryUnlocked: boolean;
  /** An AFC upgrade is ready to install (a Manifest unlocked a tier and nothing is installed there yet): client-afc-upgrade-ready.ts. */
  afcUpgradeReady: boolean;
  /** The player has installed at least one AFC upgrade. */
  afcUpgradeInstalled: boolean;
  /** At least one FOOD slot is free: the Manufactory needs one (structure-slots.ts). */
  foodSlotFree: boolean;
  ownsBuiltStructure: boolean;
  /** The player owns (or is building) a Relay Beacon. */
  ownsRelayBeacon: boolean;
  /** The best tile for a Relay Beacon that adds the most new reach (client-relay-beacon-site.ts), if any. A function: computed only when a step asks. */
  beaconSite: () => { x: number; y: number } | undefined;
  /** The player's garrisoned town tiles: where a Manufactory goes. */
  buildTargetTiles: ReadonlyArray<{ x: number; y: number }>;
  /** The player has seen another House's territory (not Planetary Defense): client-met-players.ts. */
  rivalHouseMet: boolean;
  /** Diplomacy panel/screen open, or a truce or alliance offered or in force. */
  diplomacyUsed: boolean;
  /** Mustering unlocks on first contact with Planetary Defense or a rival House (client-muster-unlock.ts). */
  musterUnlocked: boolean;
  ownsMusterFlag: boolean;
  musterTargetTiles: ReadonlyArray<{ x: number; y: number }>;
  /** The player's manpower and cap: the last step tells a player at or over the cap to spend, not to wait. */
  manpower?: { current: number; cap: number };
  /** The scout drone: ready to launch, in the air, or no AFC to launch from (tutorial-guide-explore-target.ts). */
  scout: GuideScoutStatus;
  /** Unexplored ground near home to send the drone toward; undefined when all of it has been seen. A function: computed only when a step asks. */
  exploreTarget: () => { x: number; y: number } | undefined;
  /** Distinct drone flights this session (capped at GUIDE_EXPLORE_MAX_FLIGHTS). */
  scoutFlights: number;
  /** The nearest unowned town while the player holds none and it is still in fog (state.guideTownLead). */
  townLead?: { x: number; y: number };
  /** Drone charges still missing to fly the whole way to townLead (0 when enough are ready). */
  townLeadChargesShort?: number;
  /** Home is known and every tile within the search radius has been seen: nothing left for Explore to point at. */
  nothingToExplore: () => boolean;
};

export type GuideChapterId = "look" | "foothold" | "reach" | "manpower" | "manifest" | "afc" | "build" | "contest" | "diplomacy" | "turn";

export type GuideStepDef = {
  id: string;
  chapter: GuideChapterId;
  title: (input: GuideInput) => string;
  why: string | ((input: GuideInput) => string);
  isDone: (input: GuideInput) => boolean;
  /** Not yet possible (a prerequisite elsewhere in the game). Defaults to always available. */
  isAvailable?: (input: GuideInput) => boolean;
  /** Shown instead of the title while the step is not available yet. */
  waitingNote?: string | ((input: GuideInput) => string);
  /** While this step waits, Finish isn't offered: the wait ends by itself (e.g. saving up Coin), unlike meeting a rival. */
  waitBlocksFinish?: boolean;
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
  look: "Explore",
  foothold: "A foothold",
  reach: "More land",
  manpower: "Manpower",
  manifest: "Manifests",
  afc: "AFC upgrade",
  build: "Build",
  contest: "Contest",
  diplomacy: "Diplomacy",
  turn: "Your turn"
};


const buildFirstTitle = (i: GuideInput): string => {
  if (needsTownForBuild(i)) return `A Manufactory needs a town. ${townTitle(i)}`;
  return i.manufactoryUnlocked
    ? "Tap your marked town and build a Manufactory"
    : "Your Industrial Tooling Module is docking at your AFC: then build a Manufactory on your marked town";
};

/** True while the guide is on a Manifest step: the Manifest screens mark RECOMMENDED_FIRST_MANIFEST_ID as the guide's pick. */
export const guideRecommendsManifest = (stepId: string): boolean => stepId === "manifest-open" || stepId === "manifest-commission";

/** True while the guide is on the AFC upgrade step: the AFC Upgrades panel marks RECOMMENDED_FIRST_AFC_UPGRADE_ID as the guide's pick. */
export const guideRecommendsAfcUpgrade = (stepId: string): boolean => stepId === "afc-upgrade";

/** The player commissioned a Manifest, but not the Industrial Tooling Module: the Manufactory steps no longer apply. */
const otherManifestChosen = (i: GuideInput): boolean => i.manifestCount > 0 && !i.manufactoryResearched;

export const GUIDE_STEPS: readonly GuideStepDef[] = [
  { id: "look-pan", chapter: "look", title: () => "Drag the map to look around", why: "Towns, food and rivals are out there in the dark.", isDone: (i) => i.panned },
  { id: "look-zoom", chapter: "look", title: () => "Zoom in and out (scroll or pinch)", why: "Zoom out to plan, zoom in to act.", isDone: (i) => i.zoomed },
  {
    id: "look-explore",
    chapter: "look",
    title: (i) => (i.exploreTarget() ? "Tap the marked unexplored ground, then Explore" : "Tap unexplored ground, then Explore"),
    why: "Your drone is free. It shows towns, food and rivals.",
    // A launch completes it (sticky), and so does having nothing left to explore near home.
    isDone: (i) => i.scout === "out" || (i.scout === "ready" && i.nothingToExplore()),
    isAvailable: (i) => i.scout !== "none",
    waitingNote: "Your drone launches from your AFC.",
    doneIfLaterStepDone: true,
    highlight: exploreHighlight
  },
  // No separate "tap a tile" or "find a town / food" steps: tapping is taught by
  // the foothold steps' own objective ("Tap the marked town and ..."), and each
  // foothold step already says what to do when nothing is in sight (Explore, or
  // build a Relay Beacon), which a bare "find" step could not.
  {
    id: "foothold-take-town",
    chapter: "foothold",
    title: townTitle,
    why: townWhy,
    isDone: (i) => i.checklist.townExpanded,
    highlight: targetHighlights("town")
  },
  {
    id: "foothold-take-food",
    chapter: "foothold",
    title: foodTitle,
    why: (i) => foodCopy(i).why,
    isDone: (i) => i.checklist.foodExpanded,
    highlight: targetHighlights("food"),
    lookFor: FOOD_ICONS
  },
  {
    id: "reach-beacon",
    chapter: "reach",
    title: (i) => (townBeforeBeacon(i) ? TOWN_STEP[townAction(i)].title : i.beaconSite() ? "Tap the marked tile and build a Relay Beacon" : "Build a Relay Beacon on garrisoned land at your edge"),
    why: (i) =>
      townBeforeBeacon(i)
        ? "Take this town first: once garrisoned, it widens the land you can take."
        : "A beacon lets you take land further out. It costs manpower, and no Manifest is needed.",
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
    why: "Manpower pays for taking land, garrisoning, building and attacking. It refills every 4 hours.",
    isDone: (i) => i.openPanel === "manpower",
    anchor: "manpower"
  },
  {
    id: "manifest-open",
    chapter: "manifest",
    title: () => "Open Manifests",
    why: "Manifests unlock buildings. Only Relay Beacons work without one.",
    isDone: (i) => i.openPanel === "tech" || i.manifestCount > 0,
    anchor: "manifest"
  },
  {
    id: "manifest-commission",
    chapter: "manifest",
    title: () => "Commission the Industrial Tooling Module",
    why: "It unlocks the Manufactory, which earns coin from your town.",
    // Any Manifest completes it. Choosing another than the recommended one skips the Manufactory
    // steps (otherManifestChosen) rather than waiting for a module that was never commissioned.
    // A Waystation can grant the module itself (not counted in manifestCount): nothing left to commission then.
    isDone: (i) => i.manifestCount > 0 || i.manufactoryResearched || i.ownsBuiltStructure,
    // A Waystation's free Manifest raises the next price (10 -> 40 coin), so a new player may not
    // afford it yet: wait with the price instead of asking for what they can't pay.
    isAvailable: (i) => !i.manifestPrice || i.manifestPrice.coin >= i.manifestPrice.cost,
    waitingNote: (i) => `Save up ${i.manifestPrice?.cost ?? 0} coin for your next Manifest`,
    waitBlocksFinish: true,
    anchor: "manifest"
  },
  {
    id: "afc-upgrade",
    chapter: "afc",
    title: () => "Open AFC and install the Founding Concession",
    why: "Your first three towns earn +50% coin and need 2 fewer food slots each.",
    isDone: (i) => i.afcUpgradeInstalled,
    isAvailable: (i) => i.afcUpgradeReady,
    waitingNote: "Your Manifest is docking at your AFC: then an upgrade unlocks.",
    anchor: "afc"
  },
  {
    id: "build-food-slot",
    chapter: "build",
    title: (i) => `A Manufactory needs a free food slot. ${foodCopy(i).title}`,
    why: (i) => `All your food slots are in use. ${foodCopy(i).why}${needsTownForBuild(i) ? "" : " No food nearby? Build a Farm Plot by your town with manpower."}`,
    // A free slot only counts once the Manufactory is reachable, so a spare slot a Relay Beacon
    // later uses up isn't ticked off early. Skipped when the player chose another Manifest.
    isDone: (i) => (i.manufactoryResearched && i.foodSlotFree) || i.ownsBuiltStructure || otherManifestChosen(i),
    isAvailable: (i) => i.manufactoryResearched,
    waitingNote: "Commission the Industrial Tooling Module to unlock the Manufactory.",
    highlight: targetHighlights("food"),
    lookFor: FOOD_ICONS
  },
  {
    id: "build-first",
    chapter: "build",
    title: buildFirstTitle,
    why: (i) =>
      needsTownForBuild(i)
        ? townWhy(i)
        : "Build it on your town or right next to it. It earns coin.",
    isDone: (i) => i.ownsBuiltStructure || otherManifestChosen(i),
    isAvailable: (i) => i.manufactoryResearched,
    waitingNote: "Commission the Industrial Tooling Module to unlock the Manufactory.",
    highlight: (i) => (needsTownForBuild(i) ? targetHighlights("town")(i) : i.buildTargetTiles)
  },
  {
    id: "contest-muster",
    chapter: "contest",
    title: () => "Raise a muster flag on a marked border tile",
    why: "A flag gathers manpower so you can attack.",
    isDone: (i) => i.ownsMusterFlag,
    isAvailable: (i) => i.musterUnlocked,
    waitingNote: "Explore to find Planetary Defense or a rival House: this starts when you meet one.",
    highlight: (i) => i.musterTargetTiles,
    // The Stage Muster button once a tile is picked, then the first-flag confirm sheet's button.
    anchor: "muster"
  },
  {
    id: "diplomacy-truce",
    chapter: "diplomacy",
    title: (i) => `A rival House is near: open ${i.hudV2 ? "Diplomacy" : "Allies"} to offer a truce`,
    why: "A truce stops a neighbour attacking you while you grow. AI Houses tell you their price.",
    // Opening the panel before meeting anyone doesn't count: there was no one to offer a truce to.
    isDone: (i) => i.rivalHouseMet && i.diplomacyUsed,
    isAvailable: (i) => i.rivalHouseMet,
    waitingNote: "Explore to find a rival House: this starts when you meet one.",
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
    title: () => turnFinishTitle(),
    why: (i) => turnFinishWhy(i.manpower, i.hudV2 ? "Chronicle" : "Activity dashboard"),
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
      /** Chapters before this step that wait on something (a first contact, a docking Manifest): the guide comes back to them. */
      laterChapterTitles: string[];
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
    (s, index) =>
      !completed.has(s.id) &&
      !s.acknowledge &&
      (s.isDone(input) || (s.doneIfLaterStepDone === true && laterStepDone(index)))
  ).map((s) => s.id);
  const done = new Set([...completed, ...newlyCompleted]);
  const remaining = GUIDE_STEPS.filter((s) => !done.has(s.id));
  if (remaining.length === 0) return { kind: "done" };
  // An acknowledge step (Finish) is only offered once every other step left is
  // waiting on something the player may never meet (no Planetary Defense or
  // rival House nearby), so the guide can always be finished.
  const isAvailable = (s: GuideStepDef): boolean => s.isAvailable?.(input) ?? true;
  const finishable = remaining.every((r) => isAvailable(r) || !r.waitBlocksFinish);
  const available = remaining.find((s) => isAvailable(s) && (!s.acknowledge || (finishable && remaining.every((r) => r === s || !isAvailable(r)))));
  const step = available ?? remaining[0]!;
  const waiting = !available;
  const stepIndex = GUIDE_STEPS.indexOf(step);
  const laterChapterTitles = [
    ...new Set(remaining.filter((s) => GUIDE_STEPS.indexOf(s) < stepIndex && !s.acknowledge).map((s) => GUIDE_CHAPTER_TITLES[s.chapter]))
  ];
  return {
    kind: "step",
    step,
    title: !waiting ? step.title(input) : typeof step.waitingNote === "function" ? step.waitingNote(input) : (step.waitingNote ?? step.title(input)),
    why: typeof step.why === "string" ? step.why : step.why(input),
    chapterTitle: GUIDE_CHAPTER_TITLES[step.chapter],
    chapterIndex: CHAPTER_ORDER.indexOf(step.chapter),
    chapterCount: CHAPTER_ORDER.length,
    completedCount: GUIDE_STEPS.length - remaining.length,
    totalCount: GUIDE_STEPS.length,
    newlyCompleted,
    waiting,
    laterChapterTitles,
    highlightTiles: waiting ? [] : (step.highlight?.(input) ?? []),
    ...(step.anchor && !waiting ? { anchor: step.anchor } : {}),
    ...(step.lookFor && !waiting ? { lookFor: step.lookFor } : {})
  };
};
