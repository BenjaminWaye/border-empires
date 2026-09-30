import type { ClientChangelogEntry } from "./client-changelog-data.js";

// Entries moved out of client-changelog-data.ts (still inside the "keeps only
// the latest week" window, so still rendered) to keep that file under the
// 500-line cap. When they age out, move them to the next
// client-changelog-data-earlier-N.ts -- see the maintenance note atop
// client-changelog-data.ts.
export const CLIENT_CHANGELOG_ENTRIES_RECENT: ClientChangelogEntry[] = [
  {
    createdAt: 1790713309651,
    introducedIn: "2026.09.29.4",
    title: "AI empires can now build Titanium Bastion and Thunder Bastion forts again",
    why: "Fort tiers pay their Titanium cost as a resource-slot occupation, not a stockpile spend, but the AI's build-planner still checked the opponent's Titanium stockpile against the old (already-retired) per-tier cost before proposing a fort -- since Titanium no longer accumulates as a stockpile, that check always failed. AI opponents with Fortified Walls or Steelworking researched could never actually build the fort tier those techs unlock.",
    changes: [
      "AI-controlled empires now build Titanium Bastion and Thunder Bastion forts once they have the researching tech and enough manpower, instead of silently failing every attempt",
      "No change to human players -- fort build costs on the tile-menu and command flow were never affected by this"
    ]
  }
];
