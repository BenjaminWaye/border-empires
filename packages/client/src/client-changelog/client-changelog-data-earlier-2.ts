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
  }
];
