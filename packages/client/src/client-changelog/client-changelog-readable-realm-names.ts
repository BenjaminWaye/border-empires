import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const READABLE_REALM_NAMES_ENTRY: Omit<ClientChangelogEntry, "createdAt"> = {
  introducedIn: "2026.11.11",
  title: "Map names are easier to read",
  why: "Zoomed out, an empire's name could be hard to make out over its territory, especially on remembered land under fog.",
  changes: [
    "Empire names on the map are now drawn in solid ink with a stronger outline",
    "On the 3D map, map names now draw over the fog wash on remembered land, as they already did on the 2D map",
    "Island names get the same stronger outline"
  ]
};
