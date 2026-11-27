import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const PHONE_OVERLAPS_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.27",
  title: "Fewer things in the way on phones",
  why: "Phone players found floating buttons over tile titles and buttons, taps landing on the wrong thing, and a hidden Confirm.",
  changes: [
    "The House Charges cards hide while a tile sheet, the Build list or a popup is open",
    "A tile's status, such as \"Fogged — showing last known data\", gets its own line under the name",
    "Only \"Victory race ›\" opens Ranks; taps on the rest of the pill reach the map",
    "A tile tap no longer adds a second floating Expand To or Attack button; tap the tile again or use the sheet",
    "A previewed town focus keeps its Confirm button in view above the Build panel",
    "AFC \"upgrade ready\" bubbles hide while you pick tiles, such as during Garrison Many",
    "The AFC offline note hides while a tile sheet is open",
    "Settings and other panels open at the top"
  ]
};
