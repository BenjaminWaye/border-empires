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
    createdAt: 1787818239063, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27",
    title: "Settling a new town no longer knocks out unrelated Relay Beacons",
    why: "A settled town's FOOD demand was pinned as the oldest (never-goes-dormant) contributor in the FOOD-slot shortfall calculation, while every other FOOD consumer competed newest-built-first. That meant a brand-new town's own added FOOD demand could never itself go unfed -- so a shortfall it caused was silently paid for by disabling whatever unrelated structure (e.g. an existing Relay Beacon) happened to be the newest FOOD consumer instead, even if that structure had been built long before the town and had nothing to do with the shortfall.",
    changes: [
      "A town's FOOD demand now competes on the same newest-first footing as every other FOOD consumer, ranked by when it was settled -- so a freshly settled town that pushes FOOD demand over supply goes unfed itself, instead of an older, unrelated Relay Beacon or other structure losing power to cover it."
    ]
  },
  {
    createdAt: 1787822976132, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.27",
    title: "Build Aether Condenser button no longer falsely disabled, Sell Off gold now shows as a modifier",
    why: "The Build Aether Condenser button still disabled itself with \"Nearby town already has Aether Condenser\" in a town that already had one, even though the server exempts this building family from the usual one-per-town cap entirely. Separately, switching a converter (Aether Condenser, Titanium Works, Umbrite Works) to Sell Off (EXCHANGE) mode always produced real gold, but the Modifiers panel dropped the entry entirely instead of showing it -- the tile's own status line named the behavior (\"selling off its slot and paying out gold\") but never the amount, so there was no way to see the actual gold/day figure anywhere.",
    changes: [
      "Build Aether Condenser now stays enabled in a town that already has one, matching the server's support for stacking multiple.",
      "A converter structure in Sell Off mode now shows a \"Sell Off gold: +N/day\" modifier line matching its real payout, instead of no modifier at all."
    ]
  },
  {
    createdAt: 1788166365565, // frozen from `node -e "console.log(Date.now())"`
    introducedIn: "2026.08.31",
    title: "Fixed the season-winner galactic bonus vanishing after a reconnect",
    why: "Last season's Planet winner gets a one-time manpower-regen and vision-radius head start for their next season. That bonus was correctly granted and tracked on the server, but the reconnect/login payload that rebuilds your empire's state on the client never referenced either field at all -- so the bonus silently disappeared from what you saw the moment you reconnected, even though the server kept applying it underneath.",
    changes: [
      "The galactic-wonder manpower-regen and vision-radius bonuses now reliably carry through a reconnect, matching what the server has actually been applying."
    ]
  },

];
