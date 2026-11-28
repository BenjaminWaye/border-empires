// The guide's last chapter, "First battle" (owner decision 2026-11-28). The
// first-15-minutes playtest found minutes 8-15 dead: Explore spent, Coin at 0
// and no one to fight. So the guide ends by sending the scout drone to the
// nearest Insurgent camp (a free flight: the simulation's camp lead,
// apps/simulation scout-drone-camp-lead.ts) and walking the player through
// taking it: a muster flag, the odds, the attack, the win.
//
// The muster and attack steps keep the ids of the old Contest chapter they
// replace, so saved progress carries over. With no camp in sight they still
// teach against whatever borders the player (a rival House), as before.

import type { GuideInput, GuideStepDef } from "./tutorial-guide-steps.js";

const NO_CAMP_NOTE = "Explore to find Insurgents or a rival House: this starts when you meet one.";

/** The chapter's camp is on the map and still standing. */
const campStands = (i: GuideInput): boolean => i.camp.sighted && !i.camp.won;
const campTile = (i: GuideInput): ReadonlyArray<{ x: number; y: number }> => (i.camp.target ? [i.camp.target] : []);

const scoutTitle = (i: GuideInput): string =>
  i.scout === "out" ? "When your drone is back, tap the marked Insurgent camp, then Go" : "An Insurgent camp is near: tap the mark, then Go";

const musterTitle = (i: GuideInput): string => {
  if (!campStands(i)) return "Raise a muster flag on a marked border tile";
  return i.camp.bordersMine ? "Raise a muster flag on a marked tile by the camp" : "Raise a muster flag on your marked land nearest the camp";
};

const attackTitle = (i: GuideInput): string => {
  if (!campStands(i)) return "Tap a marked enemy tile, then Launch Attack";
  return i.camp.bordersMine ? "Tap the camp, then Launch Attack" : "Tap the camp, then March Attack from your flag";
};

export const GUIDE_CAMP_STEPS: readonly GuideStepDef[] = [
  {
    id: "camp-scout",
    chapter: "contest",
    title: scoutTitle,
    why: "This flight is free. Insurgents are your first fight.",
    isDone: (i) => i.camp.sighted,
    isAvailable: (i) => i.camp.inFog && i.scout !== "none",
    waitingNote: NO_CAMP_NOTE,
    // Added after players had raised flags under the old Contest chapter: they are past it.
    doneIfLaterStepDone: true,
    highlight: (i) => (i.camp.inFog ? campTile(i) : [])
  },
  {
    id: "contest-muster",
    chapter: "contest",
    title: musterTitle,
    why: (i) => (campStands(i) ? "A flag gathers manpower near the fight. Its troops march out from it." : "A flag gathers manpower so you can attack."),
    isDone: (i) => i.ownsMusterFlag,
    isAvailable: (i) => i.musterUnlocked,
    waitingNote: NO_CAMP_NOTE,
    highlight: (i) => (campStands(i) ? i.camp.flagTiles : i.musterTargetTiles),
    // The Stage Muster button once a tile is picked, then the first-flag confirm sheet's button.
    anchor: "muster"
  },
  {
    id: "camp-odds",
    chapter: "contest",
    title: () => "Tap the marked camp to see your odds",
    why: "Win chance shows with the attack. More manpower raises it; hills lower it.",
    isDone: (i) => i.camp.selected || i.camp.won || i.attackLaunched,
    isAvailable: campStands,
    waitingNote: NO_CAMP_NOTE,
    doneIfLaterStepDone: true,
    highlight: campTile
  },
  {
    // After the flag, the attack it pays for: raising a flag alone left players waiting for something to happen.
    id: "contest-attack",
    chapter: "contest",
    title: attackTitle,
    why: (i) => (campStands(i) ? "Your flag's manpower pays. Its troops march to the camp and attack." : "Your flag's manpower pays for the attack. Win and the tile is yours."),
    isDone: (i) => i.attackLaunched || i.camp.won,
    // Waits until there is something to attack: a camp on the map, or an enemy tile touching your land
    // (an enemy seen only across neutral land has nothing to attack yet, and would block Finish).
    isAvailable: (i) => i.musterUnlocked && (campStands(i) || i.attackTargetTiles().length > 0),
    waitingNote: "Expand until an enemy tile borders your land: this starts then.",
    highlight: (i) => (campStands(i) ? campTile(i) : i.attackTargetTiles()),
    anchor: "attack"
  },
  {
    id: "camp-win",
    chapter: "contest",
    title: (i) => (i.attackLaunched ? "Your troops are fighting for the camp" : "Attack the marked camp again, with more manpower"),
    why: "Take the camp tile and the rest of its land goes neutral.",
    isDone: (i) => i.camp.won,
    isAvailable: campStands,
    waitingNote: NO_CAMP_NOTE,
    highlight: campTile
  }
];
