import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const MOBILE_UI_CONSISTENCY_CHANGELOG: ClientChangelogEntry[] = [{
  createdAt: 1793941820208, // Date.now() captured once so notes stay read after reload.
  introducedIn: "2026.11.06",
  title: "Consistent resource and tile details",
  why: "Extra screens and outdated labels made mobile resource, garrison and town details confusing.",
  changes: [
    "Tap a resource to open its breakdown directly.",
    "Tile progress stays in the tile panel with Rush and Cancel controls.",
    "The shorter reach tip explains garrison exceptions and no longer interrupts expansion to towns or docks.",
    "Town summaries show their terrain and coastal character with coin and manpower modifiers instead of the old Market/Farming label."
  ]
}];
