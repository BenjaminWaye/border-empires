import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const DORMANT_FORT_TOWN_SCREEN_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1794088010571, // Date.now() captured once for this entry.
    introducedIn: "2026.11.07",
    title: "Dormant forts are easier to spot",
    why: "A fort with no free Titanium slot showed a warning on the map, but the town screen didn't show the fort, and the tile panel still said it was active.",
    changes: [
      "The town screen shows a building on the town tile itself, such as a fort",
      "A building with no free upkeep slot now shows as Dormant and names the missing resource",
      "A dormant fort says plainly that it gives no defense bonus"
    ]
  }
];
