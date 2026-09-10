// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_23: ClientChangelogEntry[] = [
  {
    createdAt: 1788563858436, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.04.14",
    title: "The manpower panel's muster flag status now updates live while you're watching it",
    why: "A muster flag's status line (fighting, planning next move with a countdown, waiting on a target) only changed when a server tile delta happened to arrive, so a player who opened the manpower panel to watch a flag work would see the countdown text freeze in place between updates instead of ticking down, even though the flag was actively counting down toward its next action.",
    changes: [
      "The manpower panel's \"Active muster flags\" list now refreshes once a second whenever it's open and you have an Advance or March flag out, so its status text (fighting, countdown, waiting on a target) visibly keeps pace instead of only updating on the next server push"
    ]
  }
  // Pruned: the fogged/unexplored-tile "Expand To" fix (2026.09.02.9), the
  // March-To destination-marker fix (2026.09.02.16), and the muster-flag
  // live-status fix (2026.09.04.12) aged out of the "keeps only the latest
  // week of entries" window (client-changelog.test.ts) as real time advanced.
];
