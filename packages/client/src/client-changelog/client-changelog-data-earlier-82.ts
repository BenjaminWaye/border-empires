// Archived older changelog entries, split out of client-changelog-data.ts to
// keep it under the 500-line cap. See that file's header comment.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_82: ClientChangelogEntry[] = [
  {
    createdAt: 1789249191263, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.04",
    title: "AI empires no longer freeze up fighting barbarians",
    why: "A rejected ATTACK command put the entire ATTACK decision class on a 10-second cooldown, regardless of why it was rejected. On a barbarian border -- which can flip dozens of times a day as the barbarian faction expands and multiplies -- the AI's chosen target frequently changed hands between planning the attack and it landing, rejecting the command with \"target must be enemy-controlled land\" and cooling ATTACK down again. That produced a self-sustaining loop that kept some AI empires effectively frozen at their barbarian border, unable to attack, even while every other sign said they were ready and willing to fight.",
    changes: [
      "AI empires now only go on ATTACK cooldown when the rejection means resubmitting the same attack would fail again (e.g. the tile is still locked in combat) -- a rejection caused by the target simply changing hands no longer blocks the AI from immediately picking a new target and attacking again"
    ]
  },
  {
    createdAt: 1789249191264, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.14.05",
    title: "Tile info panel now names the structure built on the tile, with a link to its details",
    why: "Selecting a tile with a Fort, Siege Outpost, Observatory, or any economic structure (Mintworks, Granary, etc.) on it gave no indication anywhere in the panel of what was actually built there.",
    changes: [
      "The tile info panel's overview now shows a \"Built: <structure>\" line naming whichever structure is on the tile",
      "That structure name is a clickable link that opens the same structure detail overlay already used by the Tech Tree and HUD economy panel"
    ]
  }
];
