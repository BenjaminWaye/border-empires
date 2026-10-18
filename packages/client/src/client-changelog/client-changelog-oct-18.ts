import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const CLIENT_CHANGELOG_ENTRIES_OCT_18: ClientChangelogEntry[] = [
  {
    createdAt: 1792274781110, // Date.now() captured once for this release.
    introducedIn: "2026.10.18.1",
    title: "Automatic reconnection keeps trying through server updates",
    why: "Long outages exhausted the retry budget and forced page reloads; a reopened connection could also get stuck before restoring your empire.",
    changes: [
      "Long interruptions keep retrying in place without automatically refreshing the page",
      "A reconnect that makes no progress for a minute automatically starts a fresh connection",
      "Login queue updates and ongoing map downloads extend that timeout so active recovery can finish",
      "Recovery pauses after sign-out; signing back in reopens a closed connection"
    ]
  },
  {
    createdAt: 1792307935274, // Date.now() frozen for this release.
    introducedIn: "2026.10.18.1",
    title: "AFC upgrades are easier to find and compare",
    why: "Upgrade choices were easy to miss, and opening a separate detail screen made comparing them awkward on phones.",
    changes: [
      "AFC Upgrades replaces Sharding in navigation, with installed upgrades and their tiers above the current choices, inline details on phones and comparison cards beside details on desktop",
      "A clickable upgrade-ready badge appears above your active AFCs in both map renderers; the navigation count stays visible when the AFC is offscreen",
      "Owned AFC overviews link directly to upgrades, and availability follows your current resources and prerequisites; existing upgrade costs and rewards stay the same"
    ]
  },
  {
    createdAt: 1792355029512, // Date.now() captured when this entry was written.
    introducedIn: "2026.10.18.1",
    title: "Remembered land now looks fogged",
    why: "Land you saw earlier but can't see now was printed in a tan wash that vanished on sand, so remembered desert looked like land in sight.",
    changes: [
      "Remembered land, trees and mountains are drawn dimmed and greyed instead of tan, on both the 3D and 2D maps",
      "Remembered sea is greyed to match",
      "Land in sight and unexplored storm are unchanged"
    ]
  }
];
