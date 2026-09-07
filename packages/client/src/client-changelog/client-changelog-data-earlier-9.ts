// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_9: ClientChangelogEntry[] = [
  {
    createdAt: 1788292380551, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.09.02.2",
    title: "Added a localhost-only developer login bypass (no player-facing effect)",
    why: "Testing gameplay and visual fixes end-to-end required a real Firebase sign-in even on localhost, which blocked automated/agent-driven testing against a local dev server. This entry exists only because this file gates all packages/client/src changes -- there is no change to how any real player signs in.",
    changes: [
      "On localhost only, opening the client with ?devPlayerId=<id> now authenticates directly as that player id instead of going through Firebase sign-in -- inert everywhere else, including staging and production"
    ]
  },
];
