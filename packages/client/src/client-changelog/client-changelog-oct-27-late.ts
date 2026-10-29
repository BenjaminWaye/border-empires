import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Late Oct 27 entries, moved out of client-changelog-data.ts to keep it under the line cap.
export const CLIENT_CHANGELOG_ENTRIES_OCT_27_LATE: ClientChangelogEntry[] = [
  {
    createdAt: 1793132797501, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.4",
    title: "Coin and Shard sliders in diplomacy",
    why: "Setting a deal's terms meant typing into four bare number boxes.",
    changes: [
      "\"You give\" and \"You ask\" now show Coin and Shards as tiles. Press one to open a slider that runs from 0 to what that side holds, with a box beside it for typing an exact amount.",
      "When asking an AI for coin or Shards, the slider stops at what it can actually pay."
    ]
  },
  {
    createdAt: 1793125924000, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.5",
    title: "Clearer economy resources",
    why: "Unresearched resources cluttered the bar, and slot sources showed as a vague \"Other bonuses\".",
    changes: ["Crystal, Titanium and Umbrite stay off the resource bar and Economy panel until researched, unless you already have slots or users for them.", "Economy slot sources now list every source by name: resource sites, Mines and Refineries, upgrades, Waystations, Siphons, Foundry Heart and relics.", "Slot sources now cover your whole empire, not just the area on screen."]
  },
  {
    createdAt: 1793136357667, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.6",
    title: "Extend a running truce",
    why: "A truce offer to an empire you already had a truce with was refused, so a truce could only lapse and be renegotiated.",
    changes: [
      "While a truce is running, the deal screen offers Extend 12h or Extend 24h. Once accepted, the hours are added to the current truce, which can run at most 48h ahead. Extending a Court armistice makes it an ordinary truce.",
      "AI empires price an extension like a new truce of that length, recent truces included, but never pay you for one."
    ]
  },
  {
    createdAt: 1793140036460, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.7",
    title: "Town surveys remember your dismissal",
    why: "The same survey popup could return every time you reopened the game.",
    changes: ["Got it and View survey now remember dismissed clues in this browser for your player and season. Clues remain in Activity, and new discoveries can still appear."]
  },
  {
    createdAt: 1793140139293, // Date.now() captured once for this entry.
    introducedIn: "2026.10.27.8",
    title: "Manpower batch amounts",
    why: "Manpower arrives in batches, so per-minute labels made building output hard to judge.",
    changes: ["The manpower countdown shows +N in the remaining time, including on mobile.", "Town upgrades, manpower buildings and regeneration modifiers show their output per batch."]
  }
];
