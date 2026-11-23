import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const TIP_PINS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.21",
  title: "Tips and survey clues are map pins",
  why: "Tip cards and town-survey cards opened on their own over the map and got in the way of play.",
  changes: [
    "A new tip (first town, first contact, a resource and so on) now puts a small \"!\" pin on the map where it happened. Tap the pin to read it.",
    "Town-survey clues work the same way: a pin marks the clue's area, and tapping it opens the survey card.",
    "Nothing opens on its own any more. Every tip and clue is still kept in your Chronicle."
  ]
};
