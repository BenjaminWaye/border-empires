// The new-account tutorial guide's chapters and steps, as data. Every step is
// taught by doing: it completes when the game state (or a player input
// signal) shows the player did it, never by clicking "Next". Steps complete
// out of order too -- a player who commissions a Manifest before opening the
// manpower gauge gets that step ticked the moment they do it.
//
// Order matters for one rule of the game: no building (other than a Relay
// Beacon) can be built until the player has commissioned a Manifest, so the
// Manifest chapter comes before the Build chapter, and the Build step only
// becomes available once a Manifest is commissioned.
//
// Copy is deliberately short (about 10 words to do, one line of why) and
// uses canon terms from docs/lore/galactic-lore.md: Manifests are
// *commissioned*, barbarians are *Planetary Defense*, empires are *Houses*.

import type { OnboardingChecklistState } from "../client-onboarding-checklist/client-onboarding-checklist.js";

export type GuideAnchorId = "manpower" | "manifest" | "activity";

export type GuideInput = {
  checklist: Pick<
    OnboardingChecklistState,
    "step" | "townFound" | "townExpanded" | "foodFound" | "foodExpanded" | "foodSlotsFound" | "foodSlotsClaimed" | "foodSlotsTarget" | "highlightTiles" | "relayBeaconSite"
  >;
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
  ownsBuiltStructure: boolean;
  buildTargetTiles: ReadonlyArray<{ x: number; y: number }>;
  /** Mustering unlocks on first contact with Planetary Defense or a rival House (client-muster-unlock.ts). */
  musterUnlocked: boolean;
  ownsMusterFlag: boolean;
  musterTargetTiles: ReadonlyArray<{ x: number; y: number }>;
};

export type GuideChapterId = "look" | "foothold" | "manpower" | "manifest" | "build" | "contest" | "turn";

export type GuideStepDef = {
  id: string;
  chapter: GuideChapterId;
  title: (input: GuideInput) => string;
  why: string;
  isDone: (input: GuideInput) => boolean;
  /** Not yet possible (a prerequisite elsewhere in the game). Defaults to always available. */
  isAvailable?: (input: GuideInput) => boolean;
  /** Shown instead of the title while the step is not available yet. */
  waitingNote?: string;
  highlight?: (input: GuideInput) => ReadonlyArray<{ x: number; y: number }>;
  anchor?: GuideAnchorId;
  /** Completed by pressing the card's Finish button instead of by game state. */
  acknowledge?: boolean;
};

export const GUIDE_CHAPTER_TITLES: Record<GuideChapterId, string> = {
  look: "Look around",
  foothold: "A foothold",
  manpower: "Manpower",
  manifest: "Manifests",
  build: "Build",
  contest: "Contest",
  turn: "Your turn"
};

const checklistHighlights = (input: GuideInput): ReadonlyArray<{ x: number; y: number }> => input.checklist.highlightTiles;

const townTitle = (input: GuideInput): string =>
  input.checklist.step === "EXPAND_RELAY_BEACON" && !input.checklist.townExpanded
    ? "Nothing in reach: build a Relay Beacon on the marked tile"
    : "Tap the marked town and Expand To it";

const foodTitle = (input: GuideInput): string =>
  input.checklist.step === "EXPAND_RELAY_BEACON" && input.checklist.townExpanded
    ? "No food in reach: build a Relay Beacon on the marked tile"
    : `Expand To food tiles (${input.checklist.foodSlotsClaimed}/${input.checklist.foodSlotsTarget} slots)`;

export const GUIDE_STEPS: readonly GuideStepDef[] = [
  { id: "look-pan", chapter: "look", title: () => "Drag the map to look around", why: "Scout before you commit: towns, food and rivals are out there.", isDone: (i) => i.panned },
  { id: "look-zoom", chapter: "look", title: () => "Zoom in and out (scroll or pinch)", why: "Zoom out to plan, zoom in to act.", isDone: (i) => i.zoomed },
  { id: "look-select", chapter: "look", title: () => "Tap a tile to inspect it", why: "Every tile shows its owner, resources and what you can do there.", isDone: (i) => i.tileSelected },
  { id: "foothold-find-town", chapter: "foothold", title: () => "Find a neutral town", why: "Towns earn Coin and raise your manpower.", isDone: (i) => i.checklist.townFound },
  { id: "foothold-take-town", chapter: "foothold", title: townTitle, why: "Expand To claims a tile and garrisons it for you.", isDone: (i) => i.checklist.townExpanded, highlight: checklistHighlights },
  {
    id: "foothold-find-food",
    chapter: "foothold",
    title: (i) => `Find food: grain or fish (${i.checklist.foodSlotsFound}/${i.checklist.foodSlotsTarget})`,
    why: "Food keeps your towns growing.",
    isDone: (i) => i.checklist.foodFound
  },
  { id: "foothold-take-food", chapter: "foothold", title: foodTitle, why: "Only garrisoned food counts; fish is worth two slots.", isDone: (i) => i.checklist.foodExpanded, highlight: checklistHighlights },
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
    title: () => "Commission your first Manifest",
    why: "Manifests bring offworld machinery and crews that unlock buildings and abilities.",
    isDone: (i) => i.manifestCount > 0,
    anchor: "manifest"
  },
  {
    id: "build-first",
    chapter: "build",
    title: () => "Tap a marked resource tile and Build",
    why: "Structures turn your land into Coin, food and materials.",
    isDone: (i) => i.ownsBuiltStructure,
    isAvailable: (i) => i.manifestCount > 0,
    waitingNote: "Commission a Manifest first: it unlocks your first buildings.",
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
    title: () => "Each visit: spend your manpower, then set up your next move",
    why: "Manpower refills while you're away. Come back, act, repeat.",
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
      chapterTitle: string;
      chapterIndex: number;
      chapterCount: number;
      completedCount: number;
      totalCount: number;
      /** Steps already finished that the caller should persist. */
      newlyCompleted: string[];
      highlightTiles: ReadonlyArray<{ x: number; y: number }>;
      anchor?: GuideAnchorId;
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
  const newlyCompleted = GUIDE_STEPS.filter((s) => !completed.has(s.id) && !s.acknowledge && s.isDone(input)).map((s) => s.id);
  const done = new Set([...completed, ...newlyCompleted]);
  const remaining = GUIDE_STEPS.filter((s) => !done.has(s.id));
  if (remaining.length === 0) return { kind: "done" };
  // An acknowledge step (Finish) is only offered once it is the last step left,
  // so Finish never shows while another step (e.g. a waiting Contest) remains.
  const available = remaining.find((s) => (s.isAvailable?.(input) ?? true) && (!s.acknowledge || remaining.length === 1));
  const step = available ?? remaining[0]!;
  const waiting = !available;
  return {
    kind: "step",
    step,
    title: waiting ? (step.waitingNote ?? step.title(input)) : step.title(input),
    chapterTitle: GUIDE_CHAPTER_TITLES[step.chapter],
    chapterIndex: CHAPTER_ORDER.indexOf(step.chapter),
    chapterCount: CHAPTER_ORDER.length,
    completedCount: GUIDE_STEPS.length - remaining.length,
    totalCount: GUIDE_STEPS.length,
    newlyCompleted,
    waiting,
    highlightTiles: waiting ? [] : (step.highlight?.(input) ?? []),
    ...(step.anchor && !waiting ? { anchor: step.anchor } : {})
  };
};
