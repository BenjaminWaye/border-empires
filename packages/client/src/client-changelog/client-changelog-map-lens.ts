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

export const RESOURCE_LENS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Resources map lens",
  why: "Finding resources meant scanning small markers among everyone's territory colours.",
  changes: [
    "The minimap's lens button has a new Resources view.",
    "Every resource tile in sight glows in its resource's colour, on the map and the minimap.",
    "Territory colours and borders are hidden while the view is on; pick Terrain to bring them back."
  ]
};
