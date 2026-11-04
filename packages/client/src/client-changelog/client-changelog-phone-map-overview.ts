import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PHONE_MAP_OVERVIEW_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1793776677330, // Date.now() captured once for this entry.
    introducedIn: "2026.11.04",
    title: "Phones: the minimap is back, full screen",
    why: "The new phone HUD folded the minimap away behind the round map button with no way to open it.",
    changes: [
      "Tap the round map button (bottom left) to open the whole map full screen",
      "Tap a place on it to jump there; the map closes and you're back where you tapped",
      "The map lenses (Terrain, Diplomacy) sit under the map, so you can switch lens and see it on the map at once",
      "Close it with ✕ or your phone's back gesture"
    ]
  }
];
