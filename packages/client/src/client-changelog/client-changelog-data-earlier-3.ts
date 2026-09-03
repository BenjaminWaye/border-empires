// Older client-changelog entries, split out of client-changelog-data-earlier-2.ts
// to keep that file under the repo's 500-line cap (see the comment at
// client-changelog-data.ts's top). Same shape and rules apply here:
// unordered, append-only, frozen createdAt literals.
//
// Entries here are still bound by the "latest week only" rule enforced in
// client-changelog.test.ts — this file exists purely to keep the other
// changelog data files under their line cap when the trailing week has a lot
// of entries, not as a permanent archive. Prune entries here once they fall
// outside the trailing week, same as in the other three files.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_3: ClientChangelogEntry[] = [
  {
    createdAt: 1787905670825, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.3",
    title: "Waypoints and queued builds now actually survive a reconnect",
    why: "The login/reconnect message builds its player object as an explicit field-by-field list, and the waypoint queue and build/settle queue were never on that list -- so they were dropped at the very last step before being sent, on every single reconnect. The server had them the whole time and every layer underneath passed them along correctly; they just never made it into the message. This is why a waypoint could keep expanding correctly while you were away and still show up completely gone the moment you logged back in.",
    changes: [
      "Your waypoint queue and build/settle queue are now included in the login/reconnect message, so they reliably come back exactly as the server has them -- flags, planned routes, and mid-route progress included."
    ]
  }
];
