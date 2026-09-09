// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_27: ClientChangelogEntry[] = [
  {
    createdAt: 1788463537342, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.03.1",
    title: "Space View follow-ups: one launcher button, real Influence/Production, and a fixed Manage Planet action",
    why: "Early feedback on the first Space View pass found the chrome carried over more of the season HUD than belonged there, and a real bug: Manage Planet appeared to do nothing because the overlay it opens lives inside #hud, which Space View hides via CSS visibility -- and visibility is inherited, so the overlay stayed invisible even once it was no longer [hidden] itself.",
    changes: [
      "Manage Planet now actually opens the planet/christening overlay -- it was rendering correctly all along, just invisible, since #hud's visibility:hidden (used to hide the season HUD behind Space View) was silently inherited by the overlay nested inside it",
      "The Space View launcher is now the single button in both directions: it opens Space View from the season HUD and doubles as the return-to-season action once inside, so there's no separate \"Return to Season\" button anymore",
      "That launcher now sits above the minimap (matching where the old galaxy overlay's launcher used to sit) instead of overlapping its top edge",
      "The top bar now shows the account's real Influence and Production balance (when the gateway's galactic economy is wired up; 0/0 otherwise) instead of the season's Food/Titanium/Crystal/Umbrite/Shard ribbon, which has no meaning at the galactic layer"
    ]
  }
];
