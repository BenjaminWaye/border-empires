// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_37: ClientChangelogEntry[] = [
  {
    createdAt: 1788954892105, // frozen, 1ms after the prior newest entry -- keeps the "latest week" rolling window from shifting past older archived entries
    introducedIn: "2026.09.09.07",
    title: "Great Cities gain a second build ring; every population-tier upgrade's income/manpower bonus is halved; upgrade buttons now show their bonus",
    why: "Great City-tier towns had the same 8-tile build ring as every other tier despite their much larger population, and every population-tier upgrade's income and manpower jump was large enough to make lower tiers feel unrewarding by comparison. The upgrade button also never told you what you'd actually get for your gold.",
    changes: [
      "Reaching Great City (or Metropolis) now doubles a town's build ring outward to a second ring of tiles (24 build tiles total instead of 8), letting more support structures feed it",
      "Every population-tier upgrade's gold income and manpower cap/regen bonus is halved relative to the previous tier -- Town +0%/+75 manpower (unchanged income), City +25% income/+150 manpower, Great City +75% income/+300 manpower, Metropolis +110% income/+600 manpower, each stacking on the previous tier's already-halved value",
      "The \"Upgrade Town\" tile action now spells out the income %, manpower cap, and manpower regen you'll get, plus a note when the upgrade adds a second build ring"
    ]
  }
  // Pruned (aged out of the 6-day rolling window, client-changelog.test.ts
  // "keeps only the latest week of entries"): the "Researching Grand
  // Bazaars... unlocks the Ambaric Transformer Station" entry, the MARCH
  // neutral-ground-claim fix (2026.09.04.5), the Aether Tower description fix,
  // and the captured-structure auto-settle change (both 2026.09.04.12).
];
