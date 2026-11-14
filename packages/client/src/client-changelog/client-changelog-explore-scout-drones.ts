import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const EXPLORE_SCOUT_DRONES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.14",
  title: "Explore: send your scout drone into the unknown",
  why: "Seeing what lay past your border meant paying manpower to claim tiles that then faded away, or raising a muster flag to march there.",
  changes: [
    "Tapping an unexplored tile now offers Explore instead of Expand To or March To",
    "Explore is free and launches your scout drone from your AFC. It flies toward the tile at Expand To pace, up to 15 tiles past your land, and back",
    "While it flies you see 3 tiles around it, across land and sea. It claims nothing, and you can have one drone out at a time",
    "A rival's border turns it back, and that rival is told foreign scouts were sighted. It can fly over Planetary Defense land, which wakes while it watches",
    "When it lands, a scout report lists the towns, docks, waystations, resources and empires it found, in your feed and the Activity dashboard"
  ]
};
