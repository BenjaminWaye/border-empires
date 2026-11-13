import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TOWN_RING_GARRISON_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.13",
  title: "Garrisoning a town garrisons the tiles around it too",
  why: "Garrison on a town only garrisoned the town tile, so the tiles its reach claims around it each had to be garrisoned by hand.",
  changes: [
    "Garrison on a town now garrisons the town first, then every tile around it as soon as the town's reach claims them. No Expand needed.",
    "The Garrison button shows the full cost: the town plus the tiles around it."
  ]
};
