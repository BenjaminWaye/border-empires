import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const NOV_09_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794209772303, // Date.now() captured once.
    introducedIn: "2026.11.09",
    title: "See the season scores that were saved",
    why: "A season with one score sample per empire could look like it had no history.",
    changes: ["The Score Graph shows saved scores even without enough samples for a trend", "Report a bug appears next to the missing season record"]
  },
  {
    createdAt: 1794215116027, // Date.now() captured once for this entry.
    introducedIn: "2026.11.09",
    title: "Neutral towns show their names",
    why: "Only owned towns had a name banner, so the unclaimed towns worth capturing were the hard ones to pick out.",
    changes: ["Neutral towns get a name banner above them on both the 2D and 3D maps, in plain colours with no owner line"]
  }
];
