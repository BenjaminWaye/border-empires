// Older client-changelog entries, split out of client-changelog-data-earlier.ts
// to keep that file under the repo's 500-line cap (see the comment at
// client-changelog-data.ts's top). Same shape and rules apply here:
// unordered, append-only, frozen createdAt literals.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep
// client-changelog-data-earlier.ts under its line cap when the trailing week
// has a lot of entries, not as a permanent archive. Prune entries here once
// they fall outside the trailing week, same as in the other two files.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_2: ClientChangelogEntry[] = [
  {
    createdAt: 1788166365565, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Fixed the season-winner galactic bonus vanishing after a reconnect",
    why: "Last season's Planet winner gets a one-time manpower-regen and vision-radius head start for their next season. That bonus was correctly granted and tracked on the server, but the reconnect/login payload that rebuilds your empire's state on the client never referenced either field at all -- so the bonus silently disappeared from what you saw the moment you reconnected, even though the server kept applying it underneath.",
    changes: [
      "The galactic-wonder manpower-regen and vision-radius bonuses now reliably carry through a reconnect, matching what the server has actually been applying."
    ]
  },
  {
    createdAt: 1788068704420, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.3",
    title: "Fixed Mercantile Charter's \"First 3 towns\" line still not showing up for existing towns",
    why: "The previous fix only stamped the \"First 3 towns\" bonus onto a town the first time it was fully rebuilt. The much more common per-tick refresh path that keeps gold/fed status current between those rebuilds recomputed your gold total correctly but never re-stamped the bonus line itself, so a town that already existed before you picked up Mercantile Charter kept showing no bonus indefinitely.",
    changes: [
      "The tile overview's \"First 3 towns\" line now stays in sync on every economy refresh, not just the rare full town rebuild"
    ]
  },
  {
    createdAt: 1788034981589, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.29.4",
    title: "iPhones now start the 3D map at slightly lower quality to avoid a first-visit crash",
    why: "iOS Safari is reported to enforce a much tighter memory ceiling on WebGL content than desktop or Android, and every previous fix only kicked in after a phone had already crashed once and reloaded -- meaning every iPhone player's very first visit ran at the configuration most likely to crash it, before the app had any evidence to react to.",
    changes: [
      "The 3D map on iPhone (and other iOS browsers) now starts without extra edge-smoothing on its very first attempt, instead of only backing off after a crash",
      "A phone that proves it can run the full-quality 3D map is unaffected -- this only changes the untested first attempt"
    ]
  }
];
