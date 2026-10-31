import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MAP_LENS_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793258627509, // Date.now() captured once for this entry.
    introducedIn: "2026.10.29.1",
    title: "Map lens button",
    why: "The Diplomacy view toggle was a loose square beside the minimap that looked like the Allies button.",
    changes: [
      "A round lens button on top of the minimap opens Terrain and Diplomacy views.",
      "Diplomacy view colours land You, Ally, Truce or Hostile; barbarians count as Hostile. The legend is gone.",
      "The tile panel tags a foreign owner Ally, Truce with hours left, or Hostile."
    ]
  }
];
