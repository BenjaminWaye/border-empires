import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_OCT_26: ClientChangelogEntry[] = [
  {
    createdAt: 1793015570376, // Date.now() captured once for this entry.
    introducedIn: "2026.10.26.1",
    title: "Visible ore survey clues",
    why: "Ownership colours could cover small ground-level resource clues.",
    changes: ["Titanium ore flecks and crystal survey clues stay visible above ownership colours in both the 3D and 2D maps."]
  },
  {
    createdAt: 1793022988700, // Date.now() captured once for this entry.
    introducedIn: "2026.10.26.1",
    title: "No false combat delays on a wrong device clock",
    why: "A device clock running fast made every expansion look overdue, so tiles were rolled back and \"Combat result delayed\" appeared.",
    changes: ["Expansion and attack timers now follow the server's clock, even when your device clock is off."]
  },
  {
    createdAt: 1793044831050, // Date.now() captured once for this entry.
    introducedIn: "2026.10.26.2",
    title: "Respawns start with full manpower",
    why: "A House that was wiped out and respawned came back with only 100 manpower, far below the 720 a starting capital holds, which made a comeback painfully slow.",
    changes: ["After your House is eliminated and respawns, its manpower is topped up to the full 720 a starting capital holds (up from 100)."]
  }
];
