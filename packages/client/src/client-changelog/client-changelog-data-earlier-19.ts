// Older changelog entries split out of client-changelog-data.ts to keep that
// file under the 500-line cap. Entries are unordered — client-changelog.ts
// sorts the combined list by createdAt.
import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_EARLIER_19: ClientChangelogEntry[] = [
  {
    createdAt: 1788536800696,
    introducedIn: "2026.09.04.1",
    title: "Defenders now see an approaching company for an incoming attack's full travel-time window",
    why: "Muster flags now have real mechanical travel time before an attack lands, but the incoming-attack skirmish animation on the defender's side still only played its normal ~3.4s approach before clashing, regardless of how long the attacker's company actually had left to march. A defender could see troops already fighting on a tile that, mechanically, hadn't been reached yet.",
    changes: [
      "An incoming attack's skirmish animation now holds its \"company approaching\" stance for the attacker's real remaining travel time instead of clashing after a fixed ~3.4s, without ever revealing the attacker's muster flag location — only the general direction was ever shown"
    ]
  },
  {
    createdAt: 1788552891612,
    introducedIn: "2026.09.04.2",
    title: "Fixed Aether Bridge rejecting every target as \"not coastal land\"",
    why: "Worldgen flips any sea tile touching land -- including diagonally -- into LAND, so genuine open sea is never orthogonally adjacent to a land tile, only diagonally. The Aether Bridge's coastal-land check (both the server's validation and the client's targeting/highlight logic) only looked at the 4 orthogonal neighbors, so it could never find a real coastal tile and rejected every target with \"target must be coastal land\".",
    changes: [
      "Aether Bridge targeting and casting now check all 8 neighboring tiles for open sea, so real coastal land is recognized again and the ability can be cast"
    ]
  }
];
