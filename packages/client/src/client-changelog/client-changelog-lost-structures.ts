import type { ClientChangelogEntry } from "./client-changelog-data.js";

export const LOST_STRUCTURES_CHANGELOG: ClientChangelogEntry[] = [
  {
    createdAt: 1792702752878, // Date.now() captured once for this entry.
    introducedIn: "2026.10.22.2",
    title: "Activity names the buildings you lost",
    why: "When a rival took a tile with a Palisade, Dock or wonder on it, Activity only said \"2 tiles lost\", so it looked like nothing important had fallen.",
    changes: [
      "The Yours summary lists every structure, dock and wonder you lost or captured in the last 24 hours",
      "Battle, siege and territory rows name what stood on the tiles that changed hands, such as \"incl. your Palisade and Dock\"",
      "Siege rows show the tile's coordinates next to the headline instead of at the end of the line"
    ]
  }
];
