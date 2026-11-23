import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const START_SITE_PATROLS_ISLANDS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.20",
  title: "Planetary Defense near island landing sites too",
  why: "On island maps about one landing site in five got no Planetary Defense patrol, because there was no land exactly 20 tiles out.",
  changes: [
    "A landing site with no land 20 tiles out now gets its patrol on the nearest land that is, preferring its own island, so island and continent maps both have one at nearly every site",
    "Patrols still never sit close enough to block a landing site"
  ]
};
