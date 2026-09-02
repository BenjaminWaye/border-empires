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
    createdAt: 1787898679176, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28",
    title: "Fixed waypoints appearing to vanish on a quick reconnect",
    why: "Setting or cancelling a waypoint only marked the command resolved server-side -- it never pushed a live update of the queue, unlike almost every other player action. Since queuing a waypoint doesn't change any tile ownership, nothing else happened to refresh the gateway's per-connection snapshot cache either. A reconnect soon after (e.g. closing and quickly reopening the browser) could be served that stale, pre-waypoint snapshot, making a waypoint you'd just set look like it had never been placed -- or a cancelled one look like it was still there.",
    changes: [
      "Setting, cancelling, or clearing a waypoint now pushes a live update the same way other actions do, so a reconnect immediately after always sees the current queue instead of a stale one."
    ]
  },
  {
    createdAt: 1787900126768, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28",
    title: "Fixed the build/settle queue (and its held manpower) appearing stale on a quick reconnect",
    why: "Same root cause as the waypoint-vanishing bug fixed just before this: queuing, cancelling, or reordering a build/settle queue entry only marked the command resolved server-side -- it never pushed a live update, so nothing refreshed the gateway's per-connection snapshot cache. This queue also reserves manpower the moment an entry is queued, so a reconnect soon after could show both a stale queue and stale manpower until some unrelated action happened to refresh it.",
    changes: [
      "Queuing, cancelling, or reordering a build/settle queue entry now pushes a live update the same way other actions do, so a reconnect immediately after always shows the current queue and manpower instead of a stale snapshot."
    ]
  },
  {
    createdAt: 1787905670825, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.28.3",
    title: "Waypoints and queued builds now actually survive a reconnect",
    why: "The login/reconnect message builds its player object as an explicit field-by-field list, and the waypoint queue and build/settle queue were never on that list -- so they were dropped at the very last step before being sent, on every single reconnect. The server had them the whole time and every layer underneath passed them along correctly; they just never made it into the message. This is why a waypoint could keep expanding correctly while you were away and still show up completely gone the moment you logged back in.",
    changes: [
      "Your waypoint queue and build/settle queue are now included in the login/reconnect message, so they reliably come back exactly as the server has them -- flags, planned routes, and mid-route progress included."
    ]
  },
  {
    createdAt: 1788071064537, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.30.1",
    title: "An Aether Condenser (or Titanium/Umbrite Works) in Sell Off mode now boosts its own town's gold, like Mintworks",
    why: "Sell Off mode gold used to always pay out as separate empire-wide income with no connection to any town, so building one in a town's support ring -- the same ring Mintworks, Garrison Hall, and Clearing House already boost that town from -- had no visible effect on that town's own gold production or its overview modifier list, which read as the building's income going nowhere.",
    changes: [
      "An active Sell Off (EXCHANGE mode) Aether Condenser, Titanium Works, or Umbrite Works (including Advanced tiers) built in a town's support ring now adds its gold straight into that town's own gold production instead of paying out as separate empire income",
      "The town's overview now shows a \"Sell Off gold\" modifier under a \"<count> <Building>\" heading for these buildings, matching how Mintworks and other support-ring buildings already show their contribution",
      "A converter built outside any town's support ring is unaffected -- its gold still pays out as separate empire income exactly as before"
    ]
  }
];
